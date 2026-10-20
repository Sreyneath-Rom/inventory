/**
 * Maps between Postgres rows (snake_case) and the app's domain types
 * (camelCase). Every API route must go through this module; nothing else
 * should touch the raw row shapes.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { FEATURES, ROLES } from "./types";
import { buildSeed, defaultPermissions } from "./seed";
import type {
  AppUser, Category, DB, Employee, Product, Settings, Transaction,
} from "./types";

/* ─── Row types (mirror schema.sql exactly) ──────────────────────────── */
interface CategoryRow {
  id: string; name: string; color: string; created_at: string;
}
interface ProductRow {
  id: string; sku: string; name: string; category_id: string;
  unit: string; cost: number; price: number; stock: number;
  threshold: number; image: string; created_at: string;
}
interface TransactionRow {
  id: string; ref: string; type: "IN" | "OUT";
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
  active_role: "Admin" | "Manager" | "Staff";
  permissions: Record<string, Record<string, boolean>>;
  updated_at: string;
}

/** Admin is always on; features added later fall back to the defaults. */
function mergePermissions(raw: Record<string, Record<string, boolean>> | null): Settings["permissions"] {
  return Object.fromEntries(
    ROLES.map((role) => [
      role,
      Object.fromEntries(
        FEATURES.map((f) => [
          f.key,
          role === "Admin" ? true : raw?.[role]?.[f.key] ?? defaultPermissions[role][f.key],
        ]),
      ),
    ]),
  ) as Settings["permissions"];
}

/* ─── Row → Domain ───────────────────────────────────────────────────── */
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

/* ─── Domain → Row ───────────────────────────────────────────────────── */
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
  id: u.id, name: u.name, email: u.email, role: u.role,
});

export const toSettingsRow = (s: Settings) => ({
  id: 1,
  company_name: s.companyName, admin_name: s.adminName,
  currency: s.currency, default_threshold: s.defaultThreshold,
  active_role: s.currentRole, permissions: s.permissions,
  updated_at: new Date().toISOString(),
});

/* ─── Full DB read ───────────────────────────────────────────────────── */
export async function readDb(sb: SupabaseClient): Promise<DB> {
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
  if (firstErr) throw new Error(firstErr.message);

  // The schema doesn't insert the singleton row; create it on first read.
  let settingsRow = set.data as SettingsRow | null;
  if (!settingsRow) {
    const { data, error } = await sb
      .from("settings")
      .upsert(toSettingsRow(buildSeed().settings), { onConflict: "id" })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
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

/* ─── Full DB replace ────────────────────────────────────────────────── */
/**
 * NOTE: The Supabase JS client can't issue BEGIN/COMMIT. For true atomicity
 * define a Postgres function `replace_db(...)` and call it via `sb.rpc(...)`.
 * This fallback preserves the correct FK order (wipe → reinsert) but a
 * mid-run crash leaves the DB empty.
 */
export async function writeDb(sb: SupabaseClient, db: DB): Promise<void> {
  const fail = (step: string, err: { message: string } | null) => {
    if (err) throw new Error(`${step}: ${err.message}`);
  };

  // Wipe in reverse-FK order
  fail("delete transactions", (await sb.from("transactions").delete().neq("id", "")).error);
  fail("delete products",     (await sb.from("products").delete().neq("id", "")).error);
  fail("delete categories",   (await sb.from("categories").delete().neq("id", "")).error);
  fail("delete app_users",    (await sb.from("app_users").delete().neq("id", "")).error);
  fail("delete employees",    (await sb.from("employees").delete().neq("id", "")).error);

  // Insert in FK order
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