// lib/server/db.ts
/**
 * Canonical row↔domain mapper + all server-side DB operations.
 * `lib/db-map.ts` is a deprecated re-export shim.
 *
 * Every write helper here is a single-statement (or single-RPC) operation.
 * Anything that touches stock MUST go through `moveStock` / `deleteTransactionRow`
 * so the stock update + transaction insert/delete stay atomic under load.
 *
 * Constraint violations (23505 unique, 23503 FK) are mapped to `HttpError`
 * with a user-facing message so callers never see raw Postgres errors.
 */
import {
  FEATURES, ROLES,
  type DB, type Category, type Product, type Transaction,
  type AppUser, type Settings, type TxType,
  type Employee, type EmployeeFormData, type Role,
} from "../types";
import { buildSeed, defaultPermissions } from "../seed";
import { createAdminSupabase } from "../supabase/admin";
import { HttpError } from "./errors";
import { uid } from "../utils";

type AdminClient = ReturnType<typeof createAdminSupabase>;

/* ─── Row types (mirror schema.sql) ─────────────────────────────────── */

interface CategoryRow {
  id: string; name: string; color: string; created_at: string;
}
interface ProductRow {
  id: string; sku: string; name: string; category_id: string;
  unit: string; cost: number; price: number; stock: number;
  threshold: number; image: string; created_at: string;
}
interface TransactionRow {
  id: string; ref: string; type: TxType;
  product_id: string; product_name: string;
  qty: number; unit_price: number;
  party: string | null; note: string | null;
  date: string; created_at: string;
}
interface EmployeeRow {
  id: string; employee_code: string;
  first_name: string; last_name: string;
  email: string; phone: string | null;
  department: string; job_title: string;
  role: string; status: string;
  hire_date: string; salary: number; created_at: string;
}
interface AppUserRow {
  id: string; name: string; email: string; role: string; created_at: string;
}
interface SettingsRow {
  id: number; company_name: string; admin_name: string;
  currency: string; default_threshold: number;
  active_role: Role;
  permissions: Record<string, Record<string, boolean>>;
  updated_at: string;
}

/* ─── Permissions merge ─────────────────────────────────────────────── */

/**
 * Merges stored permission rows with defaults. Admin is always on; features
 * that exist in code but not yet in the stored row fall back to defaults;
 * a feature unknown to both falls back to `false` (never throws).
 *
 * Exported because `lib/auth.ts` (`requireFeature`) needs the same merge
 * to authorise server-side. Keep this as the single source of truth.
 */
export function mergePermissions(
  raw: Record<string, Record<string, boolean>> | null,
): Settings["permissions"] {
  return Object.fromEntries(
    ROLES.map((role) => [
      role,
      Object.fromEntries(
        FEATURES.map((f) => [
          f.key,
          role === "Admin"
            ? true
            : raw?.[role]?.[f.key] ?? defaultPermissions[role]?.[f.key] ?? false,
        ]),
      ),
    ]),
  ) as Settings["permissions"];
}

/* ─── Row → Domain ──────────────────────────────────────────────────── */

export const mapCategory = (r: CategoryRow): Category => ({
  id: r.id, name: r.name, color: r.color, createdAt: r.created_at,
});
export const mapProduct = (r: ProductRow): Product => ({
  id: r.id, sku: r.sku, name: r.name, categoryId: r.category_id,
  unit: r.unit, cost: Number(r.cost), price: Number(r.price),
  stock: r.stock, threshold: r.threshold,
  image: r.image ?? "", createdAt: r.created_at,
});
export const mapTransaction = (r: TransactionRow): Transaction => ({
  id: r.id, ref: r.ref, type: r.type,
  productId: r.product_id, productName: r.product_name,
  qty: r.qty, unitPrice: Number(r.unit_price),
  party: r.party ?? undefined, note: r.note ?? undefined,
  date: r.date, createdAt: r.created_at,
});
export const mapEmployee = (r: EmployeeRow): Employee => ({
  id: r.id, employeeCode: r.employee_code,
  firstName: r.first_name, lastName: r.last_name,
  email: r.email, phone: r.phone ?? "",
  department: r.department, jobTitle: r.job_title,
  role: r.role as Employee["role"],
  status: r.status as Employee["status"],
  hireDate: r.hire_date, salary: Number(r.salary),
  createdAt: r.created_at,
});
export const mapAppUser = (r: AppUserRow): AppUser => ({
  id: r.id, name: r.name, email: r.email,
  role: r.role as AppUser["role"], createdAt: r.created_at,
});
export const mapSettings = (r: SettingsRow, users: AppUser[]): Settings => ({
  companyName: r.company_name, adminName: r.admin_name,
  currency: r.currency, defaultThreshold: r.default_threshold,
  currentRole: r.active_role,
  permissions: mergePermissions(r.permissions),
  users,
});

/* ─── Domain → Row ──────────────────────────────────────────────────── */

export const toCategoryRow = (c: Category) => ({
  id: c.id, name: c.name, color: c.color,
});
export const toProductRow = (p: Product) => ({
  id: p.id, sku: p.sku, name: p.name, category_id: p.categoryId,
  unit: p.unit, cost: p.cost, price: p.price, stock: p.stock,
  threshold: p.threshold, image: p.image,
});
export const toTransactionRow = (t: Transaction) => ({
  id: t.id, ref: t.ref, type: t.type,
  product_id: t.productId, product_name: t.productName,
  qty: t.qty, unit_price: t.unitPrice,
  party: t.party ?? null, note: t.note ?? null,
  date: t.date,
});
export const toEmployeeRow = (e: Employee) => ({
  id: e.id, employee_code: e.employeeCode,
  first_name: e.firstName, last_name: e.lastName,
  email: e.email, phone: e.phone || null,
  department: e.department, job_title: e.jobTitle,
  role: e.role, status: e.status,
  hire_date: e.hireDate, salary: e.salary,
});
/**
 * Email is normalised to lowercase so `getAppRole()` can use an indexed
 * equality match. If you add a new write path for `app_users`, go through
 * this mapper.
 */
export const toAppUserRow = (u: AppUser) => ({
  id: u.id, name: u.name,
  email: u.email.trim().toLowerCase(),
  role: u.role,
});
export const toSettingsRow = (s: Settings) => ({
  id: 1,
  company_name: s.companyName, admin_name: s.adminName,
  currency: s.currency, default_threshold: s.defaultThreshold,
  active_role: s.currentRole, permissions: s.permissions,
  updated_at: new Date().toISOString(),
});

/* ─── Settings row lifecycle ────────────────────────────────────────── */

/**
 * Returns the singleton `settings` row, creating it from the seed if it
 * doesn't exist. Called by `readDb` and `getSettings` so both paths behave
 * identically on a fresh install.
 */
async function ensureSettingsRow(
  sb: AdminClient,
  current: SettingsRow | null,
): Promise<SettingsRow> {
  if (current) return current;
  const { data, error } = await sb
    .from("settings").upsert(toSettingsRow(buildSeed().settings), { onConflict: "id" })
    .select("*").single();
  if (error) throw new HttpError(500, error.message);
  return data as SettingsRow;
}

/* ─── Full read ─────────────────────────────────────────────────────── */

export async function readDb(): Promise<DB> {
  const sb = createAdminSupabase();

  const [cat, prod, tx, emp, usr, set] = await Promise.all([
    sb.from("categories").select("*").order("created_at", { ascending: true }),
    sb.from("products").select("*").order("created_at", { ascending: false }),
    sb.from("transactions").select("*").order("date", { ascending: false }),
    sb.from("employees").select("*").order("created_at", { ascending: false }),
    sb.from("app_users").select("*").order("created_at", { ascending: true }),
    sb.from("settings").select("*").eq("id", 1).maybeSingle(),
  ]);

  const firstErr =
    cat.error ?? prod.error ?? tx.error ?? emp.error ?? usr.error ?? set.error;
  if (firstErr) throw new HttpError(500, `Supabase read failed: ${firstErr.message}`);

  const settingsRow = await ensureSettingsRow(sb, set.data as SettingsRow | null);

  return {
    categories:   (cat.data  as CategoryRow[]).map(mapCategory),
    products:     (prod.data as ProductRow[]).map(mapProduct),
    transactions: (tx.data   as TransactionRow[]).map(mapTransaction),
    employees:    (emp.data  as EmployeeRow[]).map(mapEmployee),
    settings: mapSettings(
      settingsRow,
      (usr.data as AppUserRow[]).map(mapAppUser),
    ),
  };
}

/* ─── Settings read ─────────────────────────────────────────────────── */

/**
 * Reads only the settings row + app_users — skips transactions/products/etc.
 * Use this instead of `readDb().settings` when the caller only needs settings.
 */
export async function getSettings(): Promise<Settings> {
  const sb = createAdminSupabase();
  const [set, usr] = await Promise.all([
    sb.from("settings").select("*").eq("id", 1).maybeSingle(),
    sb.from("app_users").select("*").order("created_at", { ascending: true }),
  ]);
  if (set.error) throw new HttpError(500, set.error.message);
  if (usr.error) throw new HttpError(500, usr.error.message);

  const row = await ensureSettingsRow(sb, set.data as SettingsRow | null);
  return mapSettings(row, (usr.data as AppUserRow[]).map(mapAppUser));
}

/**
 * Reads just the `permissions` object, merged with defaults. Used by
 * `requireFeature` — cheaper than `getSettings()` because it skips the
 * `app_users` join.
 */
export async function getPermissions(): Promise<Settings["permissions"]> {
  const sb = createAdminSupabase();
  const { data, error } = await sb
    .from("settings").select("permissions").eq("id", 1).maybeSingle();
  if (error) throw new HttpError(500, error.message);
  return mergePermissions(
    (data?.permissions as Record<string, Record<string, boolean>> | undefined) ?? null,
  );
}

/* ─── Single-entity reads ───────────────────────────────────────────── */

export async function getCategoryById(id: string): Promise<Category | null> {
  const sb = createAdminSupabase();
  const { data, error } = await sb
    .from("categories").select("*").eq("id", id).maybeSingle();
  if (error) throw new HttpError(500, error.message);
  return data ? mapCategory(data as CategoryRow) : null;
}

export async function getProductById(id: string): Promise<Product | null> {
  const sb = createAdminSupabase();
  const { data, error } = await sb
    .from("products").select("*").eq("id", id).maybeSingle();
  if (error) throw new HttpError(500, error.message);
  return data ? mapProduct(data as ProductRow) : null;
}

export async function getTransactionById(id: string): Promise<Transaction | null> {
  const sb = createAdminSupabase();
  const { data, error } = await sb
    .from("transactions").select("*").eq("id", id).maybeSingle();
  if (error) throw new HttpError(500, error.message);
  return data ? mapTransaction(data as TransactionRow) : null;
}

export async function getEmployeeById(id: string): Promise<Employee | null> {
  const sb = createAdminSupabase();
  const { data, error } = await sb
    .from("employees").select("*").eq("id", id).maybeSingle();
  if (error) throw new HttpError(500, error.message);
  return data ? mapEmployee(data as EmployeeRow) : null;
}

export async function getAppUserById(id: string): Promise<AppUser | null> {
  const sb = createAdminSupabase();
  const { data, error } = await sb
    .from("app_users").select("*").eq("id", id).maybeSingle();
  if (error) throw new HttpError(500, error.message);
  return data ? mapAppUser(data as AppUserRow) : null;
}

/* ─── Existence checks (indexed, single lookup) ─────────────────────── */

/** Case-insensitive (writes always lowercase via `toAppUserRow`). */
export async function appUserEmailExists(
  email: string,
  excludeId?: string,
): Promise<boolean> {
  const sb = createAdminSupabase();
  let q = sb.from("app_users")
    .select("id", { count: "exact", head: true })
    .eq("email", email.trim().toLowerCase());
  if (excludeId) q = q.neq("id", excludeId);
  const { count, error } = await q;
  if (error) throw new HttpError(500, error.message);
  return (count ?? 0) > 0;
}

/** Case-insensitive, uses the `categories_name_lower` unique index. */
export async function categoryNameExists(
  name: string,
  excludeId?: string,
): Promise<boolean> {
  const sb = createAdminSupabase();
  let q = sb.from("categories")
    .select("id", { count: "exact", head: true })
    .ilike("name", name);      // no wildcards → case-insensitive equality
  if (excludeId) q = q.neq("id", excludeId);
  const { count, error } = await q;
  if (error) throw new HttpError(500, error.message);
  return (count ?? 0) > 0;
}

/** Uses `products_category_id_idx`. */
export async function categoryHasProducts(id: string): Promise<boolean> {
  const sb = createAdminSupabase();
  const { count, error } = await sb.from("products")
    .select("id", { count: "exact", head: true })
    .eq("category_id", id);
  if (error) throw new HttpError(500, error.message);
  return (count ?? 0) > 0;
}

/** Case-insensitive, uses the `products_sku_lower` unique index. */
export async function productSkuExists(
  sku: string,
  excludeId?: string,
): Promise<boolean> {
  const sb = createAdminSupabase();
  let q = sb.from("products")
    .select("id", { count: "exact", head: true })
    .ilike("sku", sku);
  if (excludeId) q = q.neq("id", excludeId);
  const { count, error } = await q;
  if (error) throw new HttpError(500, error.message);
  return (count ?? 0) > 0;
}

/* ─── Category writes ───────────────────────────────────────────────── */

export async function insertCategory(c: Category): Promise<Category> {
  const sb = createAdminSupabase();
  const { data, error } = await sb
    .from("categories").insert(toCategoryRow(c)).select("*").single();
  if (error) {
    if (error.code === "23505")
      throw new HttpError(409, "That category already exists.");
    throw new HttpError(500, error.message);
  }
  return mapCategory(data as CategoryRow);
}

export async function updateCategoryRow(c: Category): Promise<Category> {
  const sb = createAdminSupabase();
  const { data, error } = await sb
    .from("categories").update(toCategoryRow(c)).eq("id", c.id)
    .select("*").maybeSingle();
  if (error) {
    if (error.code === "23505")
      throw new HttpError(409, "That category already exists.");
    throw new HttpError(500, error.message);
  }
  if (!data) throw new HttpError(404, "Category not found.");
  return mapCategory(data as CategoryRow);
}

export async function deleteCategoryRow(id: string): Promise<void> {
  const sb = createAdminSupabase();
  const { error } = await sb.from("categories").delete().eq("id", id);
  if (!error) return;

  if (error.code === "23503") {
    throw new HttpError(
      409,
      "This category still has products. Move or delete them first.",
    );
  }
  throw new HttpError(500, error.message);
}

/* ─── Product writes ────────────────────────────────────────────────── */

export async function insertProduct(p: Product): Promise<Product> {
  const sb = createAdminSupabase();
  const { data, error } = await sb
    .from("products").insert(toProductRow(p)).select("*").single();
  if (error) {
    if (error.code === "23505")
      throw new HttpError(409, `SKU "${p.sku}" already exists.`);
    throw new HttpError(500, error.message);
  }
  return mapProduct(data as ProductRow);
}

/** Does not touch `stock` unless the caller explicitly includes it. */
export async function updateProductRow(p: Product): Promise<Product> {
  const sb = createAdminSupabase();
  const { data, error } = await sb
    .from("products").update(toProductRow(p)).eq("id", p.id)
    .select("*").maybeSingle();
  if (error) {
    if (error.code === "23505")
      throw new HttpError(409, `SKU "${p.sku}" already exists.`);
    throw new HttpError(500, error.message);
  }
  if (!data) throw new HttpError(404, "Product not found.");
  return mapProduct(data as ProductRow);
}

export async function deleteProductRow(id: string): Promise<void> {
  const sb = createAdminSupabase();
  const { error } = await sb.from("products").delete().eq("id", id);
  if (!error) return;

  if (error.code === "23503") {
    throw new HttpError(
      409,
      "This product has transaction history and cannot be deleted.",
    );
  }
  throw new HttpError(500, error.message);
}

/* ─── Atomic stock movement ─────────────────────────────────────────── */

/**
 * Inserts a transaction and updates stock in one Postgres transaction via
 * the `move_stock` RPC. NEVER update `products.stock` from an API route —
 * go through this so concurrent OUTs cannot drive stock negative.
 *
 * The RPC must declare exactly: p_id, p_type, p_product_id, p_qty,
 * p_unit_price, p_party, p_note, p_date. See `supabase/functions.sql`.
 */
export async function moveStock(input: {
  type: TxType;
  productId: string;
  qty: number;
  unitPrice: number;
  party?: string;
  note?: string;
  date: string;
}): Promise<Transaction> {
  const sb = createAdminSupabase();
  const txId = uid();

  const { data, error } = await sb.rpc("move_stock", {
    p_id: txId,
    p_type: input.type,
    p_product_id: input.productId,
    p_qty: input.qty,
    p_unit_price: input.unitPrice,
    p_party: input.party ?? null,
    p_note: input.note ?? null,
    p_date: input.date,
  });

  if (error) {
    const msg = error.message;
    if (msg.includes("PRODUCT_NOT_FOUND"))
      throw new HttpError(404, "Product not found.");
    if (msg.includes("INSUFFICIENT_STOCK")) {
      const m = msg.match(/INSUFFICIENT_STOCK:([^:]+):(.+)$/);
      if (m) throw new HttpError(409, `Insufficient stock. Only ${m[1]} ${m[2]} available.`);
      throw new HttpError(409, "Insufficient stock.");
    }
    if (msg.includes("INVALID_TYPE")) throw new HttpError(422, "type must be 'IN' or 'OUT'.");
    if (msg.includes("INVALID_QTY"))
      throw new HttpError(422, "Quantity must be a whole number greater than 0.");
    throw new HttpError(500, msg);
  }

  return mapTransaction(data as TransactionRow);
}

/**
 * Deletes a transaction and reverses its stock impact in one Postgres
 * transaction via the `delete_transaction(p_id)` RPC.
 *
 * Falls back to a plain DELETE only if the RPC is genuinely missing — a
 * normal `RAISE EXCEPTION 'transaction not found'` is *not* treated as
 * "missing". Codes PGRST202 (schema-cache miss) and 42883 (undefined
 * function) are the "RPC not installed" signals.
 *
 * Do not reverse stock manually before calling this — the RPC does it.
 */
export async function deleteTransactionRow(id: string): Promise<void> {
  const sb = createAdminSupabase();

  const { error: rpcErr } = await sb.rpc("delete_transaction", { p_id: id });
  if (!rpcErr) return;

  const rpcMissing =
    rpcErr.code === "PGRST202" ||
    rpcErr.code === "42883" ||
    /function .*does not exist/i.test(rpcErr.message);

  if (!rpcMissing) throw new HttpError(500, rpcErr.message);

  console.warn(
    "[db] delete_transaction RPC missing — falling back to plain delete. " +
      "Stock may be out of sync unless a trigger reverses it.",
  );
  const { error } = await sb.from("transactions").delete().eq("id", id);
  if (error) throw new HttpError(500, error.message);
}

/* ─── Employees ─────────────────────────────────────────────────────── */

export class EmployeeError extends HttpError {
  constructor(message: string, status = 500) {
    super(status, message);
  }
}

function mapEmployeeError(error: { message: string; code?: string }): EmployeeError {
  if (error.code === "23505") {
    const m = error.message.toLowerCase();
    if (m.includes("email"))
      return new EmployeeError("This email address is already registered.", 409);
    if (m.includes("code"))
      return new EmployeeError("This employee ID is already in use.", 409);
    return new EmployeeError("An employee with these details already exists.", 409);
  }
  if (error.code === "42P01")
    return new EmployeeError(
      "The employees table is missing. Run supabase/employees.sql first.",
      500,
    );
  return new EmployeeError(error.message, 500);
}

export async function createEmployeeRow(input: EmployeeFormData): Promise<Employee> {
  const sb = createAdminSupabase();
  const emp: Employee = { id: crypto.randomUUID(), ...input };
  const { data, error } = await sb.from("employees")
    .insert(toEmployeeRow(emp)).select("*").single();
  if (error) throw mapEmployeeError(error);
  return mapEmployee(data as EmployeeRow);
}

export async function updateEmployeeRow(emp: Employee): Promise<Employee> {
  const sb = createAdminSupabase();
  const { id, ...row } = toEmployeeRow(emp);
  const { data, error } = await sb.from("employees")
    .update(row).eq("id", id).select("*").maybeSingle();
  if (error) throw mapEmployeeError(error);
  if (!data) throw new EmployeeError("Employee not found.", 404);
  return mapEmployee(data as EmployeeRow);
}

export async function deleteEmployeeRow(id: string): Promise<void> {
  const sb = createAdminSupabase();
  const { error } = await sb.from("employees").delete().eq("id", id);
  if (error) throw mapEmployeeError(error);
}

/* ─── App-user writes ───────────────────────────────────────────────── */

export async function insertAppUser(u: AppUser): Promise<AppUser> {
  const sb = createAdminSupabase();
  const { data, error } = await sb
    .from("app_users").insert(toAppUserRow(u)).select("*").single();
  if (error) {
    if (error.code === "23505") {
      const m = error.message.toLowerCase();
      if (m.includes("email"))
        throw new HttpError(409, "That email already exists.");
      throw new HttpError(409, "That user already exists.");
    }
    throw new HttpError(500, error.message);
  }
  return mapAppUser(data as AppUserRow);
}

/**
 * Updates a user. Rejects demoting the last Admin.
 *
 * NOT perfectly atomic — two concurrent demotes can both pass the count
 * check. For a hard guarantee, move the guard into a `plpgsql` trigger
 * that enforces `count(*) WHERE role = 'Admin' >= 1` on UPDATE and DELETE.
 */
export async function updateAppUser(u: AppUser): Promise<AppUser> {
  const sb = createAdminSupabase();

  const current = await sb
    .from("app_users").select("role").eq("id", u.id).maybeSingle();
  if (current.error) throw new HttpError(500, current.error.message);
  if (!current.data) throw new HttpError(404, "User not found.");

  if (current.data.role === "Admin" && u.role !== "Admin") {
    const { count, error } = await sb
      .from("app_users").select("*", { count: "exact", head: true })
      .eq("role", "Admin");
    if (error) throw new HttpError(500, error.message);
    if ((count ?? 0) <= 1) throw new HttpError(409, "Cannot demote the last Admin.");
  }

  const { data, error } = await sb
    .from("app_users").update(toAppUserRow(u)).eq("id", u.id)
    .select("*").maybeSingle();
  if (error) {
    if (error.code === "23505") {
      const m = error.message.toLowerCase();
      if (m.includes("email"))
        throw new HttpError(409, "That email already exists.");
      throw new HttpError(409, "A user with these details already exists.");
    }
    throw new HttpError(500, error.message);
  }
  if (!data) throw new HttpError(404, "User not found.");
  return mapAppUser(data as AppUserRow);
}

/** Same atomicity caveat as `updateAppUser` — see note above. */
export async function deleteAppUser(id: string): Promise<void> {
  const sb = createAdminSupabase();

  const target = await sb
    .from("app_users").select("role").eq("id", id).maybeSingle();
  if (target.error) throw new HttpError(500, target.error.message);
  if (!target.data) throw new HttpError(404, "User not found.");

  if (target.data.role === "Admin") {
    const { count, error } = await sb
      .from("app_users").select("*", { count: "exact", head: true })
      .eq("role", "Admin");
    if (error) throw new HttpError(500, error.message);
    if ((count ?? 0) <= 1) throw new HttpError(409, "Cannot delete the last Admin.");
  }

  const { error } = await sb.from("app_users").delete().eq("id", id);
  if (error) throw new HttpError(500, error.message);
}

/* ─── Settings write ────────────────────────────────────────────────── */

export async function saveSettings(s: Settings): Promise<Settings> {
  const sb = createAdminSupabase();
  const { error } = await sb
    .from("settings").upsert(toSettingsRow(s), { onConflict: "id" });
  if (error) throw new HttpError(500, error.message);
  return s;
}

/* ─── Full replace ──────────────────────────────────────────────────── */

/**
 * Wipes and re-inserts every table. Called only by `PUT /api/db` (Admin).
 *
 * The Admin guard here is defence-in-depth: the route already enforces it,
 * but any future caller of this function must not be able to lock everyone
 * out of the app.
 *
 * NOTE: not atomic across statements (the Supabase JS client cannot issue
 * BEGIN/COMMIT). A crash mid-run leaves the DB empty. Consider moving this
 * into a `replace_all_db(jsonb)` RPC if that risk matters to you.
 */
export async function replaceDb(db: DB): Promise<void> {
  if (!db.settings.users.some((u) => u.role === "Admin")) {
    throw new HttpError(422, "Refusing to replace DB: at least one Admin must remain.");
  }

  const sb = createAdminSupabase();
  const fail = (step: string, err: { message: string } | null) => {
    if (err) throw new HttpError(500, `${step}: ${err.message}`);
  };

  fail("delete transactions", (await sb.from("transactions").delete().neq("id", "")).error);
  fail("delete products",     (await sb.from("products").delete().neq("id", "")).error);
  fail("delete categories",   (await sb.from("categories").delete().neq("id", "")).error);
  fail("delete app_users",    (await sb.from("app_users").delete().neq("id", "")).error);
  fail("delete employees",    (await sb.from("employees").delete().neq("id", "")).error);

  if (db.categories.length)
    fail("insert categories",
      (await sb.from("categories").insert(db.categories.map(toCategoryRow))).error);
  if (db.products.length)
    fail("insert products",
      (await sb.from("products").insert(db.products.map(toProductRow))).error);
  if (db.transactions.length)
    fail("insert transactions",
      (await sb.from("transactions").insert(db.transactions.map(toTransactionRow))).error);
  if (db.employees.length)
    fail("insert employees",
      (await sb.from("employees").insert(db.employees.map(toEmployeeRow))).error);
  if (db.settings.users.length)
    fail("insert app_users",
      (await sb.from("app_users").insert(db.settings.users.map(toAppUserRow))).error);

  fail("upsert settings",
    (await sb.from("settings").upsert(toSettingsRow(db.settings), { onConflict: "id" })).error);
}

/* ─── Bootstrap signup ──────────────────────────────────────────────── */

/**
 * Creates the `app_users` row for a just-created auth user, but only if
 * `app_users` is empty. Serialised via an advisory lock inside the
 * `bootstrap_admin_if_first_user(p_id, p_name, p_email)` RPC, so concurrent
 * signups cannot both become Admin.
 *
 * Throws `HttpError(403, "SIGNUP_CLOSED")` if a user already exists — the
 * caller must roll back the auth user in that case.
 */
export async function bootstrapAdminIfFirstUser(input: {
  id: string;
  name: string;
  email: string;
}): Promise<"Admin"> {
  const sb = createAdminSupabase();

  const { data, error } = await sb.rpc("bootstrap_admin_if_first_user", {
    p_id: input.id,
    p_name: input.name,
    p_email: input.email.trim().toLowerCase(),
  });

  if (error) {
    if (error.message.includes("SIGNUP_CLOSED")) {
      throw new HttpError(403, "Signup is closed. Ask an admin to create your account.");
    }
    if (error.code === "23505") {
      throw new HttpError(409, "An account with this email already exists.");
    }
    throw new HttpError(500, error.message);
  }
  return data as "Admin";
}

/* ─── Deprecated: bulk upsert ───────────────────────────────────────── */

/**
 * @deprecated DANGEROUS — upserts **every row in every table**, including
 * rows the callback never touched, and does **not** delete rows that were
 * removed from the callback's snapshot. Use the row-level helpers above
 * (or `replaceDb` for a full replacement).
 *
 * Kept only so legacy imports don't break. If you're reading this and
 * planning to use it, you almost certainly want something else.
 */
export async function mutateEveryRow<T>(
  fn: (db: DB) => T | Promise<T>,
): Promise<T> {
  const db = await readDb();
  const result = await fn(db);
  const sb = createAdminSupabase();

  const upsert = async (step: string, table: string, rows: object[]) => {
    if (!rows.length) return;
    const { error } = await sb.from(table).upsert(rows);
    if (error) throw new HttpError(500, `${step}: ${error.message}`);
  };

  await upsert("categories",   "categories",   db.categories.map(toCategoryRow));
  await upsert("products",     "products",     db.products.map(toProductRow));
  await upsert("transactions", "transactions", db.transactions.map(toTransactionRow));
  await upsert("app_users",    "app_users",    db.settings.users.map(toAppUserRow));
  await upsert("employees",    "employees",    db.employees.map(toEmployeeRow));

  const { error } = await sb.from("settings")
    .upsert(toSettingsRow(db.settings), { onConflict: "id" });
  if (error) throw new HttpError(500, error.message);

  return result;
}