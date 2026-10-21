// lib/server/db.ts
/**
 * Canonical row↔domain mapper + all server-side DB operations.
 * `lib/db-map.ts` is kept as a deprecated re-export shim.
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

function mergePermissions(
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

/* ─── Read ──────────────────────────────────────────────────────────── */

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

  // The schema doesn't seed the singleton row; create it on first read.
  let settingsRow = set.data as SettingsRow | null;
  if (!settingsRow) {
    const { data, error } = await sb
      .from("settings")
      .upsert(toSettingsRow(buildSeed().settings), { onConflict: "id" })
      .select("*").single();
    if (error) throw new HttpError(500, error.message);
    settingsRow = data as SettingsRow;
  }

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

/* ─── Replace (full DB) ─────────────────────────────────────────────── */

export async function replaceDb(db: DB): Promise<void> {
  // Guard at the data layer — not just in the route handler.
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

/* ─── Atomic stock movement ─────────────────────────────────────────── */

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

  // NOTE: The `move_stock` SQL function must declare exactly these
  // parameter names. If it uses `p_tx_id`, adjust the call below.
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
    if (msg.includes("INVALID_QTY"))  throw new HttpError(422, "Quantity must be a whole number greater than 0.");
    throw new HttpError(500, msg);
  }

  return mapTransaction(data as TransactionRow);
}

/* ─── Row-level CRUD ────────────────────────────────────────────────── */

export async function deleteCategoryRow(id: string): Promise<void> {
  const sb = createAdminSupabase();
  const { error } = await sb.from("categories").delete().eq("id", id);
  if (error) throw new HttpError(500, error.message);
}
export async function deleteProductRow(id: string): Promise<void> {
  const sb = createAdminSupabase();
  const { error } = await sb.from("products").delete().eq("id", id);
  if (error) throw new HttpError(500, error.message);
}
export async function deleteUserRow(id: string): Promise<void> {
  const sb = createAdminSupabase();
  const { error } = await sb.from("app_users").delete().eq("id", id);
  if (error) throw new HttpError(500, error.message);
}

/**
 * Delete a transaction, reversing its stock effect atomically via the
 * `delete_transaction(p_id)` RPC. Falls back to a plain DELETE if the
 * RPC genuinely isn't installed (stock may drift unless a trigger
 * reverses it — a warning is logged).
 */
export async function deleteTransactionRow(id: string): Promise<void> {
  const sb = createAdminSupabase();

  const { error: rpcErr } = await sb.rpc("delete_transaction", { p_id: id });
  if (!rpcErr) return;

  // Match on PostgREST/SQLSTATE codes, not on message text — a normal
  // `RAISE EXCEPTION 'transaction not found'` also contains "not found".
  const rpcMissing =
    rpcErr.code === "PGRST202" ||                       // schema-cache miss
    rpcErr.code === "42883" ||                          // undefined function
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
    if (m.includes("email")) return new EmployeeError("This email address is already registered.", 409);
    if (m.includes("code"))  return new EmployeeError("This employee ID is already in use.", 409);
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

/* ─── (optional) Bulk upsert helper ─────────────────────────────────── */

/**
 * @deprecated DANGEROUS. Applies an in-memory mutation by upserting **every
 * row in every table** — including rows the callback never touched. It does
 * **not** delete rows that were removed from the callback's snapshot.
 * Prefer the row-level helpers (`createEmployeeRow`, `deleteProductRow`, …)
 * or `replaceDb`. If you need this at all, rename it and double-check the
 * write set first.
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