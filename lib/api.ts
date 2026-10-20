import type {
  AppUser, Category, DB, Employee, EmployeeFormData, Product, Settings, Transaction, TxType,
} from "./types";

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string };

/** PUT payload for a product — stock is intentionally excluded. */
export type ProductUpdate = Omit<Product, "stock" | "createdAt">;

async function call<T>(url: string, init?: RequestInit): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
    if (res.status === 204) return { ok: true, data: undefined as T };
    const body = await res.json().catch(() => ({}));
    if (!res.ok)
      return { ok: false, error: (body as { error?: string }).error ?? res.statusText };
    return { ok: true, data: body as T };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Network error" };
  }
}

export const api = {
  // Full DB
  loadDb:    () => call<DB>("/api/db"),
  replaceDb: (db: DB) => call<DB>("/api/db", { method: "PUT", body: JSON.stringify(db) }),

  // Products
  listProducts:  () => call<Product[]>("/api/products"),
  createProduct: (p: Omit<Product, "id" | "createdAt">) =>
    call<Product>("/api/products", { method: "POST", body: JSON.stringify(p) }),
  updateProduct: (p: ProductUpdate) =>
    call<Product>(`/api/products/${p.id}`, { method: "PUT", body: JSON.stringify(p) }),
  deleteProduct: (id: string) =>
    call<void>(`/api/products/${id}`, { method: "DELETE" }),

  // Categories
  listCategories:  () => call<Category[]>("/api/categories"),
  createCategory: (c: Omit<Category, "id" | "createdAt">) =>
    call<Category>("/api/categories", { method: "POST", body: JSON.stringify(c) }),
  updateCategory: (c: Omit<Category, "createdAt">) =>
    call<Category>(`/api/categories/${c.id}`, { method: "PUT", body: JSON.stringify(c) }),
  deleteCategory: (id: string) =>
    call<void>(`/api/categories/${id}`, { method: "DELETE" }),

  // Transactions
  listTransactions: (opts?: { type?: TxType; productId?: string; limit?: number }) => {
    const q = new URLSearchParams();
    if (opts?.type)      q.set("type", opts.type);
    if (opts?.productId) q.set("productId", opts.productId);
    if (opts?.limit)     q.set("limit", String(opts.limit));
    const qs = q.toString();
    return call<Transaction[]>(`/api/transactions${qs ? `?${qs}` : ""}`);
  },
  createTransaction: (input: {
    type: TxType; productId: string; qty: number;
    unitPrice?: number; party?: string; note?: string; date?: string;
  }) => call<Transaction>("/api/transactions", { method: "POST", body: JSON.stringify(input) }),
  deleteTransaction: (id: string) =>
    call<void>(`/api/transactions/${id}`, { method: "DELETE" }),

  // Employees
  listEmployees:  () => call<Employee[]>("/api/employees"),
  createEmployee: (e: EmployeeFormData) =>
    call<Employee>("/api/employees", { method: "POST", body: JSON.stringify(e) }),
  updateEmployee: (e: Omit<Employee, "createdAt">) =>
    call<Employee>(`/api/employees/${e.id}`, { method: "PUT", body: JSON.stringify(e) }),
  deleteEmployee: (id: string) =>
    call<void>(`/api/employees/${id}`, { method: "DELETE" }),

  // Users
  listUsers:  () => call<AppUser[]>("/api/users"),
  createUser: (u: Omit<AppUser, "id" | "createdAt">) =>
    call<AppUser>("/api/users", { method: "POST", body: JSON.stringify(u) }),
  updateUser: (u: Omit<AppUser, "createdAt">) =>
    call<AppUser>(`/api/users/${u.id}`, { method: "PUT", body: JSON.stringify(u) }),
  deleteUser: (id: string) =>
    call<void>(`/api/users/${id}`, { method: "DELETE" }),

  // Settings
  getSettings:   () => call<Settings>("/api/settings"),
  patchSettings: (patch: Partial<Settings> & { role?: string; feature?: string; value?: boolean }) =>
    call<Settings>("/api/settings", { method: "PATCH", body: JSON.stringify(patch) }),
};