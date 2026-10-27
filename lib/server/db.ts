// lib/server/db.ts
/**
 * Canonical row↔domain mapper + all server-side DB operations.
 *
 * Schema source of truth is `schema.sql`. Auth-users live in
 * `public.profiles` (FK → `auth.users.id`), **not** `app_users`. Profiles
 * have no `email` column, so `AppUser.email` is enriched from
 * `auth.users` on read (one `admin.listUsers` call). `insertAppUser`
 * requires that the caller has already created the corresponding auth
 * user — the `profiles.user_id` FK will otherwise reject the write.
 *
 * Every write helper here is a single-statement (or single-RPC) operation.
 * Anything that touches stock goes through `moveStock` /
 * `deleteTransactionRow` so the stock update and transaction
 * insert/delete stay atomic.
 *
 * The admin client (`createAdminSupabase`) is typed with
 * `lib/database.types.ts`. If a `.from(...)` / `.rpc(...)` call ever
 * resolves to `never`, the fix is to add the table/RPC to that file —
 * not to cast here.
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

type AdminClient = ReturnType<typeof createAdminSupabase>;

/* ─── Row types (mirror schema.sql) ─────────────────────────────────── */

interface CategoryRow {
  id: string; name: string; color: string;
  created_at: string; updated_at: string;
}
interface ProductRow {
  id: string; sku: string; name: string; category_id: string;
  unit: string; cost: number; price: number; stock: number;
  threshold: number; image: string; is_active: boolean;
  created_at: string; updated_at: string;
}
interface TransactionRow {
  id: string; ref: string; type: TxType;
  product_id: string; product_name: string;
  qty: number; unit_price: number;
  party: string | null; note: string | null;
  date: string;
  reversed_transaction_id: string | null;
  idempotency_key: string | null;
  created_by: string | null;
  created_at: string;
}
interface EmployeeRow {
  id: string; employee_code: string;
  first_name: string; last_name: string;
  email: string; phone: string | null;
  department: string; job_title: string;
  role: string; status: string;
  hire_date: string; salary: number;
  created_at: string; updated_at: string;
}
/** public.profiles row. */
interface AppUserRow {
  user_id: string;
  display_name: string;
  role: "admin" | "manager" | "staff" | "viewer";
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
interface SettingsRow {
  id: number; company_name: string; admin_name: string;
  currency: string; default_threshold: number;
  active_role: "Admin" | "Manager" | "Staff";
  permissions: Record<string, Record<string, boolean>>;
  updated_at: string;
}

/* ─── Role case mapping ─────────────────────────────────────────────── */

/**
 * SQL stores `profiles.role` lowercase (`admin`/`manager`/`staff`/`viewer`);
 * the app's `Role` union is TitleCase. These two functions are the only
 * correct conversion points — never compare the raw strings across layers.
 */
export function toAppRole(profileRole: string): Role {
  switch (profileRole) {
    case "admin":   return "Admin";
    case "manager": return "Manager";
    case "staff":   return "Staff";
    case "viewer":  return "Viewer";
    default:        return "Staff";   // conservative fallback for unknown roles
  }
}

/**
 * Returns the literal union that matches `profiles.role`'s CHECK
 * constraint. A plain `role.toLowerCase()` returns `string`, which a
 * typed client refuses to assign to `profiles.Insert["role"]`.
 */
const toProfileRole = (
  role: Role,
): "admin" | "manager" | "staff" | "viewer" => {
  switch (role) {
    case "Admin":   return "admin";
    case "Manager": return "manager";
    case "Staff":   return "staff";
    case "Viewer":  return "viewer";
  }
};

/* ─── ILIKE escaping ────────────────────────────────────────────────── */

/**
 * Escapes Postgres LIKE/ILIKE metacharacters in user-supplied input.
 * Without this, `%` and `_` in `employeeCode`, `category name`, or
 * `product sku` behave as wildcards and produce false-positive "already
 * exists" hits (e.g. `"EMP%"` matches every code starting with `EMP`).
 * Cannot become a bypass — at worst it's a false reject — but the escape
 * is one line and closes the confusion.
 */
function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, "\\$&");
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
  id: r.id, name: r.name, color: r.color,
  createdAt: r.created_at, updatedAt: r.updated_at,
});
export const mapProduct = (r: ProductRow): Product => ({
  id: r.id, sku: r.sku, name: r.name, categoryId: r.category_id,
  unit: r.unit, cost: Number(r.cost), price: Number(r.price),
  stock: r.stock, threshold: r.threshold,
  image: r.image ?? "", isActive: r.is_active,
  createdAt: r.created_at, updatedAt: r.updated_at,
});
export const mapTransaction = (r: TransactionRow): Transaction => ({
  id: r.id, ref: r.ref, type: r.type,
  productId: r.product_id, productName: r.product_name,
  qty: r.qty, unitPrice: Number(r.unit_price),
  party: r.party ?? undefined, note: r.note ?? undefined,
  date: r.date,
  reversedTransactionId: r.reversed_transaction_id ?? undefined,
  idempotencyKey: r.idempotency_key ?? undefined,
  createdBy: r.created_by ?? undefined,
  createdAt: r.created_at,
});
export const mapEmployee = (r: EmployeeRow): Employee => ({
  id: r.id, employeeCode: r.employee_code,
  firstName: r.first_name, lastName: r.last_name,
  email: r.email, phone: r.phone ?? "",
  department: r.department, jobTitle: r.job_title,
  role: r.role as Employee["role"],
  status: r.status as Employee["status"],
  hireDate: r.hire_date, salary: Number(r.salary),
  createdAt: r.created_at, updatedAt: r.updated_at,
});
/**
 * `email` is not stored in `profiles` — the caller passes it in from
 * `auth.users` (see `fetchAuthUsers`). Empty string when unavailable.
 */
export const mapAppUser = (r: AppUserRow, email = ""): AppUser => ({
  id: r.user_id,
  name: r.display_name,
  email,
  role: toAppRole(r.role),
  isActive: r.is_active,
  createdAt: r.created_at,
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
  is_active: p.isActive ?? true,
});
export const toTransactionRow = (t: Transaction) => ({
  id: t.id, ref: t.ref, type: t.type,
  product_id: t.productId, product_name: t.productName,
  qty: t.qty, unit_price: t.unitPrice,
  party: t.party ?? null, note: t.note ?? null,
  date: t.date,
  // reversed_transaction_id intentionally omitted — see `replaceDb`.
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
 * Emits a `public.profiles` row. `email` is NOT written — it lives in
 * `auth.users`. The caller must have already created the auth user, or
 * the `user_id` FK will reject the insert.
 */
export const toAppUserRow = (u: AppUser) => ({
  user_id: u.id,
  display_name: u.name,
  role: toProfileRole(u.role),
  is_active: u.isActive ?? true,
});
export const toSettingsRow = (s: Settings) => {
  // `Settings.currentRole` is `Role` (it doubles as the effective-role
  // signal from `GET /api/db`, which can be "Viewer"). `settings.active_role`
  // has a CHECK that forbids Viewer, so narrow here at the write boundary.
  // After this throw, TS narrows `s.currentRole` to `PreviewableRole`, so
  // `active_role: s.currentRole` below type-checks without a cast.
  if (s.currentRole === "Viewer") {
    throw new HttpError(422, "The 'Viewer' role cannot be set as the active preview role.");
  }
  return {
    id: 1,
    company_name: s.companyName, admin_name: s.adminName,
    currency: s.currency, default_threshold: s.defaultThreshold,
    active_role: s.currentRole,   // ← narrowed to "Admin" | "Manager" | "Staff"
    permissions: s.permissions,
    updated_at: new Date().toISOString(),
  };
};

/* ─── Auth-user email enrichment ────────────────────────────────────── */

/**
 * One `admin.listUsers` call per read. Returns `Map<userId, email>`.
 * Errors degrade to an empty map so a flaky auth API doesn't break the
 * whole app — profile rows still load, just with empty emails.
 */
async function fetchAuthUsers(sb: AdminClient): Promise<Map<string, string>> {
  try {
    const { data } = await sb.auth.admin.listUsers({ perPage: 1000 });
    return new Map((data?.users ?? []).map((u) => [u.id, u.email ?? ""]));
  } catch {
    return new Map();
  }
}

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
    sb.from("profiles").select("*").order("created_at", { ascending: true }),
    sb.from("settings").select("*").eq("id", 1).maybeSingle(),
  ]);

  const firstErr =
    cat.error ?? prod.error ?? tx.error ?? emp.error ?? usr.error ?? set.error;
  if (firstErr) throw new HttpError(500, `Supabase read failed: ${firstErr.message}`);

  const settingsRow = await ensureSettingsRow(sb, set.data as SettingsRow | null);
  const emailById = await fetchAuthUsers(sb);

  return {
    categories:   (cat.data  as CategoryRow[]).map(mapCategory),
    products:     (prod.data as ProductRow[]).map(mapProduct),
    transactions: (tx.data   as TransactionRow[]).map(mapTransaction),
    employees:    (emp.data  as EmployeeRow[]).map(mapEmployee),
    settings: mapSettings(
      settingsRow,
      (usr.data as AppUserRow[]).map((r) => mapAppUser(r, emailById.get(r.user_id) ?? "")),
    ),
  };
}

/* ─── Settings read ─────────────────────────────────────────────────── */

/**
 * Reads only the settings row + profiles — skips transactions/products/etc.
 * Use this instead of `readDb().settings` when the caller only needs settings.
 */
export async function getSettings(): Promise<Settings> {
  const sb = createAdminSupabase();
  const [set, usr] = await Promise.all([
    sb.from("settings").select("*").eq("id", 1).maybeSingle(),
    sb.from("profiles").select("*").order("created_at", { ascending: true }),
  ]);
  if (set.error) throw new HttpError(500, set.error.message);
  if (usr.error) throw new HttpError(500, usr.error.message);

  const row = await ensureSettingsRow(sb, set.data as SettingsRow | null);
  const emailById = await fetchAuthUsers(sb);

  return mapSettings(
    row,
    (usr.data as AppUserRow[]).map((r) => mapAppUser(r, emailById.get(r.user_id) ?? "")),
  );
}

/**
 * Reads just the `permissions` object, merged with defaults. Used by
 * `requireFeature` — cheaper than `getSettings()` because it skips the
 * `profiles` join.
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

/* ─── Single-table lists ────────────────────────────────────────────── */

/**
 * Returns every category, ordered by name. Used by `GET /api/categories`,
 * which needs a full list but not the rest of the DB — calling `readDb()`
 * would run 5 extra SELECTs plus a `listUsers` API call.
 */
export async function listAllCategories(): Promise<Category[]> {
  const sb = createAdminSupabase();
  const { data, error } = await sb
    .from("categories").select("*").order("name", { ascending: true });
  if (error) throw new HttpError(500, error.message);
  return (data as CategoryRow[]).map(mapCategory);
}

/**
 * Returns every product, ordered by creation date (newest first). Used by
 * `GET /api/products`, which needs only this table — calling `readDb()`
 * would run 5 extra SELECTs plus a `listUsers` auth call.
 */
export async function listAllProducts(): Promise<Product[]> {
  const sb = createAdminSupabase();
  const { data, error } = await sb
    .from("products").select("*").order("created_at", { ascending: false });
  if (error) throw new HttpError(500, error.message);
  return (data as ProductRow[]).map(mapProduct);
}

/**
 * Returns every employee, ordered by last name. Used by
 * `GET /api/employees`, which needs only this table — calling `readDb()`
 * would run 5 extra SELECTs plus a `listUsers` auth call.
 */
export async function listAllEmployees(): Promise<Employee[]> {
  const sb = createAdminSupabase();
  const { data, error } = await sb
    .from("employees").select("*").order("last_name", { ascending: true });
  if (error) throw new HttpError(500, error.message);
  return (data as EmployeeRow[]).map(mapEmployee);
}

/**
 * Returns every profile with `email` enriched from `auth.users`. Used by
 * `GET /api/users` — `readDb().settings.users` would run 5 extra SELECTs
 * plus the same `listUsers` call.
 */
export async function listAppUsers(): Promise<AppUser[]> {
  const sb = createAdminSupabase();
  const { data, error } = await sb
    .from("profiles").select("*").order("created_at", { ascending: true });
  if (error) throw new HttpError(500, error.message);
  const emailById = await fetchAuthUsers(sb);
  return (data as AppUserRow[]).map(
    (r) => mapAppUser(r, emailById.get(r.user_id) ?? ""),
  );
}

/**
 * Returns transactions newest-first, optionally filtered by type / product
 * and capped. Replaces the `readDb().transactions` pattern in
 * `GET /api/transactions` — that loaded every transaction (plus 5 other
 * tables + `listUsers`) and filtered in memory, so `?limit=10` still
 * shipped the whole table over the wire from Supabase.
 *
 * `limit` is capped at 1000 to prevent accidental full-table dumps.
 */
export async function listTransactions(opts: {
  type?: TxType;
  productId?: string;
  limit?: number;
} = {}): Promise<Transaction[]> {
  const sb = createAdminSupabase();
  let q = sb
    .from("transactions")
    .select("*")
    .order("date", { ascending: false })
    .order("created_at", { ascending: false });

  if (opts.type) q = q.eq("type", opts.type);
  if (opts.productId) q = q.eq("product_id", opts.productId);
  if (opts.limit && opts.limit > 0) q = q.limit(Math.min(opts.limit, 1000));

  const { data, error } = await q;
  if (error) throw new HttpError(500, error.message);
  return (data as TransactionRow[]).map(mapTransaction);
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

/**
 * Returns one profile with `email` enriched from `auth.users`.
 *
 * The `email` column does not exist on `profiles` — this helper previously
 * returned `""`, which broke `PUT /api/users/:id`: it compares
 * `nextEmail !== existing.email`, saw `""` every time, and triggered a
 * spurious auth sync on every name-only edit. Enriching here means the
 * route can trust `existing.email`.
 */
export async function getAppUserById(id: string): Promise<AppUser | null> {
  const sb = createAdminSupabase();
  const { data, error } = await sb
    .from("profiles").select("*").eq("user_id", id).maybeSingle();
  if (error) throw new HttpError(500, error.message);
  if (!data) return null;

  try {
    const { data: authData } = await sb.auth.admin.getUserById(id);
    return mapAppUser(data as AppUserRow, authData?.user?.email ?? "");
  } catch {
    // Auth API unreachable — degrade to an empty email rather than fail
    // the read. Callers that need the real email will see the divergence
    // and can surface it themselves.
    return mapAppUser(data as AppUserRow);
  }
}

/* ─── Existence checks (indexed, single lookup) ─────────────────────── */

/**
 * Case-insensitive match on `employee_code`. Escapes LIKE metacharacters
 * so a crafted `"EMP%"` cannot match `EMP-001`, `EMP-002`, etc. and
 * produce a false-positive "already in use".
 *
 * ⚠ The schema has no UNIQUE constraint on either `employee_code` or
 * `email`, so this check is the **only** thing preventing duplicates.
 * `mapEmployeeError`'s 23505 branch in `createEmployeeRow` /
 * `updateEmployeeRow` is dead code until the constraints are added:
 *
 *   ALTER TABLE public.employees
 *     ADD CONSTRAINT employees_employee_code_key UNIQUE (employee_code),
 *     ADD CONSTRAINT employees_email_key UNIQUE (email);
 */
export async function employeeCodeExists(
  code: string,
  excludeId?: string,
): Promise<boolean> {
  const sb = createAdminSupabase();
  let q = sb.from("employees")
    .select("id", { count: "exact", head: true })
    .ilike("employee_code", escapeLike(code));
  if (excludeId) q = q.neq("id", excludeId);
  const { count, error } = await q;
  if (error) throw new HttpError(500, error.message);
  return (count ?? 0) > 0;
}

/** Case-insensitive — `employees.email` is stored lowercase. */
export async function employeeEmailExists(
  email: string,
  excludeId?: string,
): Promise<boolean> {
  const sb = createAdminSupabase();
  let q = sb.from("employees")
    .select("id", { count: "exact", head: true })
    .eq("email", email.trim().toLowerCase());
  if (excludeId) q = q.neq("id", excludeId);
  const { count, error } = await q;
  if (error) throw new HttpError(500, error.message);
  return (count ?? 0) > 0;
}

export async function appUserEmailExists(
  email: string,
  excludeId?: string,
): Promise<boolean> {
  // profiles has no email column — check auth.users via the admin API.
  const sb = createAdminSupabase();
  try {
    const { data } = await sb.auth.admin.listUsers({ perPage: 1000 });
    const needle = email.trim().toLowerCase();
    return (data?.users ?? []).some(
      (u) => u.id !== excludeId && (u.email ?? "").toLowerCase() === needle,
    );
  } catch {
    return false;
  }
}

/** Case-insensitive. Escapes LIKE metacharacters (see `escapeLike`). */
export async function categoryNameExists(
  name: string,
  excludeId?: string,
): Promise<boolean> {
  const sb = createAdminSupabase();
  let q = sb.from("categories")
    .select("id", { count: "exact", head: true })
    .ilike("name", escapeLike(name));
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

/** Case-insensitive. Escapes LIKE metacharacters (see `escapeLike`). */
export async function productSkuExists(
  sku: string,
  excludeId?: string,
): Promise<boolean> {
  const sb = createAdminSupabase();
  let q = sb.from("products")
    .select("id", { count: "exact", head: true })
    .ilike("sku", escapeLike(sku));
  if (excludeId) q = q.neq("id", excludeId);
  const { count, error } = await q;
  if (error) throw new HttpError(500, error.message);
  return (count ?? 0) > 0;
}

/**
 * Uses `transactions_product_id_idx` if present; otherwise a full scan.
 * Add the index if you delete products often:
 *   CREATE INDEX IF NOT EXISTS transactions_product_id_idx
 *     ON public.transactions(product_id);
 */
export async function productHasTransactions(id: string): Promise<boolean> {
  const sb = createAdminSupabase();
  const { count, error } = await sb.from("transactions")
    .select("id", { count: "exact", head: true })
    .eq("product_id", id);
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
    .from("categories")
    .update({ name: c.name, color: c.color, updated_at: new Date().toISOString() })
    .eq("id", c.id).select("*").maybeSingle();
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
  if (error.code === "23503")
    throw new HttpError(409, "This category still has products. Move or delete them first.");
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

/**
 * Updates product metadata. **Never writes `stock`** — that only changes
 * through `moveStock` / `deleteTransactionRow`. `id` is used in the WHERE
 * clause only. Signature matches `ProductUpdate` from `lib/api.ts` (which
 * omits `stock`, `createdAt`, and `updatedAt`). `updated_at` is bumped
 * server-side. `is_active` is forwarded only when the caller supplies it,
 * so a metadata-only edit never toggles archive state.
 */
export async function updateProductRow(
  p: Omit<Product, "stock" | "createdAt" | "updatedAt">,
): Promise<Product> {
  const sb = createAdminSupabase();

  const { data, error } = await sb
    .from("products")
    .update({
      sku: p.sku,
      name: p.name,
      category_id: p.categoryId,
      unit: p.unit,
      cost: p.cost,
      price: p.price,
      threshold: p.threshold,
      image: p.image,
      updated_at: new Date().toISOString(),
      ...(p.isActive !== undefined ? { is_active: p.isActive } : {}),
    })
    .eq("id", p.id)
    .select("*")
    .maybeSingle();

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
  if (error.code === "23503")
    throw new HttpError(409, "This product has transaction history and cannot be deleted.");
  throw new HttpError(500, error.message);
}

/* ─── Atomic stock movement ─────────────────────────────────────────── */

/**
 * Inserts a transaction and updates stock in one Postgres transaction via
 * the `move_stock` RPC. NEVER update `products.stock` from an API route —
 * go through this so concurrent OUTs cannot drive stock negative.
 *
 * The RPC must declare exactly: p_id, p_type, p_product_id, p_qty,
 * p_unit_price, p_party, p_note, p_date. See `supabase/functions.sql`
 * and `lib/database.types.ts → Functions.move_stock`.
 *
 * `p_id` is generated server-side with `crypto.randomUUID()` so the
 * client cannot choose the row ID and collisions are impossible under
 * sustained load.
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
  const txId = crypto.randomUUID();

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
 * Falls back to a plain DELETE only if the RPC is genuinely missing —
 * codes PGRST202 (schema-cache miss) and 42883 (undefined function) are
 * the "RPC not installed" signals.
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
  constructor(message: string, status = 500) { super(status, message); }
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
    return new EmployeeError("The employees table is missing. Run supabase/employees.sql first.", 500);
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
    .update({ ...row, updated_at: new Date().toISOString() })
    .eq("id", id).select("*").maybeSingle();
  if (error) throw mapEmployeeError(error);
  if (!data) throw new EmployeeError("Employee not found.", 404);
  return mapEmployee(data as EmployeeRow);
}

export async function deleteEmployeeRow(id: string): Promise<void> {
  const sb = createAdminSupabase();
  const { error } = await sb.from("employees").delete().eq("id", id);
  if (error) throw mapEmployeeError(error);
}

/* ─── Profile writes (formerly app_users) ──────────────────────────── */

/**
 * Inserts a `profiles` row. The `id` on `u` must be an existing
 * `auth.users.id` — the FK enforces this. The `email` on `u` is echoed
 * back so the caller keeps whatever they passed; it is not persisted.
 */
export async function insertAppUser(u: AppUser): Promise<AppUser> {
  const sb = createAdminSupabase();
  const { data, error } = await sb
    .from("profiles").insert(toAppUserRow(u)).select("*").single();
  if (error) {
    if (error.code === "23505")
      throw new HttpError(409, "That user already has a profile.");
    if (error.code === "23503")
      throw new HttpError(422, "The auth user does not exist. Create it first.");
    throw new HttpError(500, error.message);
  }
  return mapAppUser(data as AppUserRow, u.email);
}

/**
 * Updates a profile. Rejects demoting the last **active** admin.
 *
 * Not perfectly atomic — two concurrent demotes can both pass the count.
 * A `plpgsql` trigger enforcing "≥ 1 active admin" on UPDATE/DELETE would
 * be the correct fix.
 */
export async function updateAppUser(u: AppUser): Promise<AppUser> {
  const sb = createAdminSupabase();

  const current = await sb
    .from("profiles").select("role, is_active").eq("user_id", u.id).maybeSingle();
  if (current.error) throw new HttpError(500, current.error.message);
  if (!current.data) throw new HttpError(404, "User not found.");

  const curRow = current.data as { role: string; is_active: boolean };
  const targetRole = u.role;
  const targetIsActive = u.isActive ?? true;

  const willRemoveActiveAdmin =
    curRow.role === "admin" &&
    curRow.is_active === true &&
    (targetRole !== "Admin" || targetIsActive === false);

  if (willRemoveActiveAdmin) {
    const { count, error } = await sb
      .from("profiles").select("*", { count: "exact", head: true })
      .eq("role", "admin").eq("is_active", true);
    if (error) throw new HttpError(500, error.message);
    if ((count ?? 0) <= 1)
      throw new HttpError(409, "Cannot demote the last active Admin.");
  }

  const { data, error } = await sb
    .from("profiles")
    .update({ ...toAppUserRow(u), updated_at: new Date().toISOString() })
    .eq("user_id", u.id)
    .select("*").maybeSingle();
  if (error) {
    if (error.code === "23505")
      throw new HttpError(409, "That user already has a profile.");
    throw new HttpError(500, error.message);
  }
  if (!data) throw new HttpError(404, "User not found.");
  return mapAppUser(data as AppUserRow, u.email);
}

/** Same atomicity caveat as `updateAppUser`. */
export async function deleteAppUser(id: string): Promise<void> {
  const sb = createAdminSupabase();

  const target = await sb
    .from("profiles").select("role, is_active").eq("user_id", id).maybeSingle();
  if (target.error) throw new HttpError(500, target.error.message);
  if (!target.data) throw new HttpError(404, "User not found.");

  const row = target.data as { role: string; is_active: boolean };
  if (row.role === "admin" && row.is_active) {
    const { count, error } = await sb
      .from("profiles").select("*", { count: "exact", head: true })
      .eq("role", "admin").eq("is_active", true);
    if (error) throw new HttpError(500, error.message);
    if ((count ?? 0) <= 1)
      throw new HttpError(409, "Cannot delete the last active Admin.");
  }

  const { error } = await sb.from("profiles").delete().eq("user_id", id);
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
 * Wipes and re-inserts data tables. Called only by `PUT /api/db` (Admin).
 *
 * `profiles` is intentionally **not cleared** — clearing it would strip
 * the calling Admin's role and lock them out of the app, and deleting
 * profiles with FK children elsewhere would cascade. Instead, we only
 * upsert profiles whose `user_id` matches a real `auth.users` row.
 * Orphaned profiles from prior runs are left alone.
 *
 * NOTE: not atomic across statements (the Supabase JS client cannot issue
 * BEGIN/COMMIT). A crash mid-run leaves the DB with data tables empty.
 *
 * NOTE: `transactions.reversed_transaction_id` is a self-FK. `Transaction`
 * does not currently carry that field, so no ordering constraint applies
 * today. If it is ever added: split the insert into two phases (bulk with
 * NULL, then a follow-up UPDATE to link the reverses).
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

  // Upsert only real auth users — the seed placeholder "u1" is dropped.
  const authEmails = await fetchAuthUsers(sb);
  const profileUpserts = db.settings.users
    .filter((u) => authEmails.has(u.id))
    .map(toAppUserRow);
  if (profileUpserts.length)
    fail("upsert profiles",
      (await sb.from("profiles").upsert(profileUpserts, { onConflict: "user_id" })).error);

  fail("upsert settings",
    (await sb.from("settings").upsert(toSettingsRow(db.settings), { onConflict: "id" })).error);
}

/* ─── Bootstrap signup ──────────────────────────────────────────────── */

/**
 * Creates the `profiles` row for a just-created auth user, but only if
 * `profiles` is empty. Serialised via an advisory lock inside the
 * `bootstrap_admin_if_first_user(p_id, p_name, p_email)` RPC.
 *
 * ⚠ The RPC must be written against `public.profiles` (not `app_users`).
 * If your migration still targets `app_users`, this call fails with a
 * "relation does not exist" error and the RPC needs to be updated in SQL.
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
    if (error.message.includes("SIGNUP_CLOSED"))
      throw new HttpError(403, "Signup is closed. Ask an admin to create your account.");
    if (error.code === "PGRST202")
      throw new HttpError(
        500,
        "First-admin setup is not installed. Apply the bootstrap_admin_if_first_user migration.",
      );
    if (error.code === "23505")
      throw new HttpError(409, "An account with this email already exists.");
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
 * The `table: string` parameter is dynamic, so a typed client cannot infer
 * the correct `Insert` shape. We cast at the `.from` boundary — the table
 * names below are hardcoded constants, so this stays runtime-safe.
 */
export async function mutateEveryRow<T>(
  fn: (db: DB) => T | Promise<T>,
): Promise<T> {
  const db = await readDb();
  const result = await fn(db);
  const sb = createAdminSupabase();

  const upsert = async (step: string, table: string, rows: object[]) => {
    if (!rows.length) return;
    const { error } = await (sb.from as (t: string) => any)(table).upsert(rows);
    if (error) throw new HttpError(500, `${step}: ${error.message}`);
  };

  await upsert("categories",   "categories",   db.categories.map(toCategoryRow));
  await upsert("products",     "products",     db.products.map(toProductRow));
  await upsert("transactions", "transactions", db.transactions.map(toTransactionRow));
  await upsert("employees",    "employees",    db.employees.map(toEmployeeRow));
  await upsert("profiles",     "profiles",     db.settings.users.map(toAppUserRow));

  const { error } = await sb
    .from("settings")
    .upsert(toSettingsRow(db.settings), { onConflict: "id" });
  if (error) throw new HttpError(500, error.message);

  return result;
}