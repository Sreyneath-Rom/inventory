// lib/api.ts
import type {
  AppUser, Category, DB, Employee, EmployeeFormData, Product, Settings, Transaction, TxType,
} from "./types";

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Fields a client may send to `PUT /api/products/:id`.
 *  - `stock`   → RPC-owned (`move_stock` / `delete_transaction`).
 *  - `createdAt` / `updatedAt` → server-managed; a client-supplied value
 *    would be silently overwritten, so the type rejects it.
 *  - `isActive` is optional so callers that don't archive still type-check.
 */
export type ProductUpdate = Omit<Product, "stock" | "createdAt" | "updatedAt">;

async function call<T>(url: string, init?: RequestInit): Promise<ApiResult<T>> {
  const headers: HeadersInit = {
    ...(init?.body ? { "Content-Type": "application/json" } : {}),
    ...(init?.headers ?? {}),
  };

  try {
    const res = await fetch(url, { ...init, headers });
    if (res.status === 204) return { ok: true, data: undefined as T };

    const text = await res.text();
    let body: unknown = null;
    if (text) {
      try { body = JSON.parse(text); }
      catch { body = { error: text }; }
    }

    if (!res.ok) {
      return {
        ok: false,
        error: (body as { error?: string } | null)?.error ?? res.statusText,
      };
    }
    return { ok: true, data: (body as T) ?? (undefined as T) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Network error" };
  }
}

export const api = {
  loadDb:    () => call<DB>("/api/db"),
  replaceDb: (db: DB) => call<DB>("/api/db", { method: "PUT", body: JSON.stringify(db) }),

  listProducts:  () => call<Product[]>("/api/products"),
  createProduct: (p: Omit<Product, "id" | "createdAt">) =>
    call<Product>("/api/products", { method: "POST", body: JSON.stringify(p) }),
  updateProduct: (p: ProductUpdate) =>
    call<Product>(`/api/products/${p.id}`, { method: "PUT", body: JSON.stringify(p) }),
  deleteProduct: (id: string) =>
    call<void>(`/api/products/${id}`, { method: "DELETE" }),

  listCategories:  () => call<Category[]>("/api/categories"),
  createCategory: (c: Omit<Category, "id" | "createdAt">) =>
    call<Category>("/api/categories", { method: "POST", body: JSON.stringify(c) }),
  updateCategory: (c: Omit<Category, "createdAt">) =>
    call<Category>(`/api/categories/${c.id}`, { method: "PUT", body: JSON.stringify(c) }),
  deleteCategory: (id: string) =>
    call<void>(`/api/categories/${id}`, { method: "DELETE" }),

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

  listEmployees:  () => call<Employee[]>("/api/employees"),
  createEmployee: (e: EmployeeFormData) =>
    call<Employee>("/api/employees", { method: "POST", body: JSON.stringify(e) }),
  updateEmployee: (e: Omit<Employee, "createdAt">) =>
    call<Employee>(`/api/employees/${e.id}`, { method: "PUT", body: JSON.stringify(e) }),
  deleteEmployee: (id: string) =>
    call<void>(`/api/employees/${id}`, { method: "DELETE" }),

  listUsers:  () => call<AppUser[]>("/api/users"),
  createUser: (u: Omit<AppUser, "id" | "createdAt">) =>
    call<AppUser>("/api/users", { method: "POST", body: JSON.stringify(u) }),
  updateUser: (u: Omit<AppUser, "createdAt">) =>
    call<AppUser>(`/api/users/${u.id}`, { method: "PUT", body: JSON.stringify(u) }),
  deleteUser: (id: string) =>
    call<void>(`/api/users/${id}`, { method: "DELETE" }),

  getSettings:   () => call<Settings>("/api/settings"),
  patchSettings: (patch: Partial<Settings> & { role?: string; feature?: string; value?: boolean }) =>
    call<Settings>("/api/settings", { method: "PATCH", body: JSON.stringify(patch) }),
};