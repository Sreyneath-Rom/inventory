// lib/store.tsx
"use client";
import {
  createContext, useCallback, useContext, useEffect, useRef, useState,
} from "react";
import type {
  AppUser, Category, DB, Employee, EmployeeFormData, Feature,
  Product, Role, Settings, TxType, Transaction,
} from "./types";
import { buildSeed } from "./seed";
import { dayKey, nextRef, uid } from "./utils";
import { api, type ProductUpdate } from "./api";

const KEY = "inventory-db-v1";

const normalize = (d: DB): DB => ({ ...d, employees: d.employees ?? [] });

export type Result = { ok: true } | { ok: false; error: string };

export interface MoveInput {
  productId: string;
  qty: number;
  unitPrice: number;
  party?: string;
  note?: string;
  date?: string;
}

interface Store {
  db: DB;
  can: (f: Feature) => boolean;
  lastError: string | null;
  clearError: () => void;

  addCategory: (c: Omit<Category, "id">) => Result;
  updateCategory: (c: Category) => void;
  deleteCategory: (id: string) => Result;

  addProduct: (p: Omit<Product, "id">) => Result;
  updateProduct: (p: Product) => void;
  deleteProduct: (id: string) => Result;

  move: (type: TxType, i: MoveInput) => Result;
  deleteTransaction: (id: string) => Result;

  updateSettings: (patch: Partial<Settings>) => void;
  setPermission: (r: Role, f: Feature, v: boolean) => void;

  addUser: (u: Omit<AppUser, "id">) => Result;
  updateUser: (u: AppUser) => void;
  removeUser: (id: string) => void;

  addEmployee: (e: EmployeeFormData) => Promise<Result>;
  updateEmployee: (e: Employee) => Promise<Result>;
  deleteEmployee: (id: string) => Promise<Result>;

  resetData: () => void;
}

type StoreMaybe = Omit<Store, "db"> & { db: DB | null };

const Ctx = createContext<StoreMaybe | null>(null);

export function useStore(): Store {
  const c = useContext(Ctx);
  if (!c) throw new Error("useStore must be used inside <StoreProvider>");
  if (!c.db) throw new Error("DB not ready — wrap this subtree in <RequireDb>.");
  return c as Store;
}

function useStoreMaybe(): StoreMaybe {
  const c = useContext(Ctx);
  if (!c) throw new Error("useStore must be used inside <StoreProvider>");
  return c;
}

export function RequireDb({ children }: { children: React.ReactNode }) {
  const { db, lastError } = useStoreMaybe();

  if (!db) {
    if (lastError) {
      return (
        <div className="grid min-h-screen place-items-center p-6 text-center">
          <div className="max-w-md space-y-2">
            <p className="text-sm font-semibold text-red-600">{lastError}</p>
            <p className="text-xs text-slate-500">
              If you believe this is a mistake, ask an admin to provision your account.
            </p>
          </div>
        </div>
      );
    }
    return <div className="grid min-h-screen place-items-center text-slate-500">Loading…</div>;
  }
  return <>{children}</>;
}

const NO_PERMISSION = "You do not have permission for this action.";

/**
 * An "active admin" is exactly what the server's last-admin guard checks:
 * `role = 'admin' AND is_active = true`. Counting inactive admins here
 * would make the client optimistically allow an operation the server will
 * reject — and, worse, allow demoting the only *active* admin because an
 * inactive one exists.
 */
const isActiveAdmin = (u: AppUser): boolean =>
  u.role === "Admin" && u.isActive !== false;

const activeAdminCount = (users: AppUser[]): number =>
  users.filter(isActiveAdmin).length;

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [db, setDbState] = useState<DB | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const ref = useRef<DB | null>(null);

  /* Hydration */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await api.loadDb();
      if (cancelled) return;

      if (res.ok) {
        ref.current = normalize(res.data);
        setDbState(ref.current);
        return;
      }

      // 401/403 → the server refused us. Do **not** fall back to seed
      // (that's how phantom-Admin happened). Show a permanent error state.
      const isAuthFailure = /unauthori[sz]ed|forbidden|not set up/i.test(res.error);
      if (isAuthFailure) {
        console.warn("Auth failure loading DB:", res.error);
        setDbState(null);
        setLastError(
          /not set up/i.test(res.error)
            ? "Your account is not set up. Ask an admin to grant access."
            : "You are signed out. Please sign in again.",
        );
        return;
      }

      // Network / 5xx → offline-friendly fallback (cache, then seed).
      let cached: DB | null = null;
      try {
        const raw = localStorage.getItem(KEY);
        cached = raw ? normalize(JSON.parse(raw) as DB) : null;
      } catch { cached = null; }
      console.warn("Could not load DB from server:", res.error);
      ref.current = cached ?? buildSeed();
      setDbState(ref.current);
    })();
    return () => { cancelled = true; };
  }, []);

  /* Persist cache */
  useEffect(() => {
    if (db) {
      try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* quota */ }
    }
  }, [db]);

  const commit = useCallback((next: DB) => { ref.current = next; setDbState(next); }, []);

  const patch = useCallback((fn: (d: DB) => DB) => {
    const cur = ref.current;
    if (cur) commit(fn(cur));
  }, [commit]);

  const resync = useCallback(async () => {
    const res = await api.loadDb();
    if (res.ok) commit(normalize(res.data));
  }, [commit]);

  const clearError = useCallback(() => setLastError(null), []);

  const handleFailure = useCallback((error: string) => {
    setLastError(error);
    void resync();
  }, [resync]);

  const canCurrent = useCallback((f: Feature): boolean => {
    const d = ref.current;
    if (!d) return false;
    return d.settings.permissions[d.settings.currentRole]?.[f] ?? false;
  }, []);

  const store: StoreMaybe = {
    db,
    lastError,
    clearError,
    can: canCurrent,

    /* ── Categories ──────────────────────────────────────────────── */
    addCategory: (c) => {
      if (!canCurrent("categories")) return { ok: false, error: NO_PERMISSION };
      const cur = ref.current!;
      if (cur.categories.some((x) => x.name.toLowerCase() === c.name.toLowerCase())) {
        return { ok: false, error: `Category "${c.name}" already exists.` };
      }
      const tempId = uid();
      const optimistic: Category = { ...c, id: tempId };
      patch((d) => ({ ...d, categories: [...d.categories, optimistic] }));
      void api.createCategory(c).then((r) => {
        if (!r.ok) return handleFailure(r.error);
        patch((d) => ({
          ...d,
          categories: d.categories.map((x) => (x.id === tempId ? r.data : x)),
        }));
      });
      return { ok: true };
    },

    updateCategory: (c) => {
      if (!canCurrent("categories")) { setLastError(NO_PERMISSION); return; }
      patch((d) => ({
        ...d,
        categories: d.categories.map((x) => (x.id === c.id ? c : x)),
      }));
      void api.updateCategory(c).then((r) => {
        if (!r.ok) return handleFailure(r.error);
        patch((d) => ({
          ...d,
          categories: d.categories.map((x) => (x.id === r.data.id ? r.data : x)),
        }));
      });
    },

    deleteCategory: (id) => {
      if (!canCurrent("categories")) return { ok: false, error: NO_PERMISSION };
      const cur = ref.current!;
      if (cur.products.some((p) => p.categoryId === id)) {
        return { ok: false, error: "This category still has products. Move or delete them first." };
      }
      patch((d) => ({ ...d, categories: d.categories.filter((c) => c.id !== id) }));
      void api.deleteCategory(id).then((r) => { if (!r.ok) handleFailure(r.error); });
      return { ok: true };
    },

    /* ── Products ────────────────────────────────────────────────── */
    addProduct: (p) => {
      if (!canCurrent("products")) return { ok: false, error: NO_PERMISSION };
      const cur = ref.current!;
      if (cur.products.some((x) => x.sku.toLowerCase() === p.sku.toLowerCase())) {
        return { ok: false, error: `SKU "${p.sku}" already exists.` };
      }
      const tempId = uid();
      const optimistic: Product = { ...p, id: tempId };
      patch((d) => ({ ...d, products: [optimistic, ...d.products] }));
      void api.createProduct(p).then((r) => {
        if (!r.ok) return handleFailure(r.error);
        patch((d) => ({
          ...d,
          products: d.products.map((x) => (x.id === tempId ? r.data : x)),
        }));
      });
      return { ok: true };
    },

    updateProduct: (p) => {
      if (!canCurrent("products")) { setLastError(NO_PERMISSION); return; }
      const cur = ref.current!;
      const existing = cur.products.find((x) => x.id === p.id);
      // Preserve `stock` — it's owned by the RPC, never the client.
      const merged: Product = existing ? { ...p, stock: existing.stock } : p;

      patch((d) => ({
        ...d,
        products: d.products.map((x) => (x.id === p.id ? merged : x)),
      }));

      const payload: ProductUpdate = {
        id: merged.id, sku: merged.sku, name: merged.name,
        categoryId: merged.categoryId, unit: merged.unit,
        cost: merged.cost, price: merged.price,
        threshold: merged.threshold, image: merged.image,
        // `isActive` is optional; forward it when the caller supplies it.
        ...(merged.isActive !== undefined ? { isActive: merged.isActive } : {}),
      };
      void api.updateProduct(payload).then((r) => {
        if (!r.ok) return handleFailure(r.error);
        patch((d) => ({
          ...d,
          products: d.products.map((x) => (x.id === r.data.id ? r.data : x)),
        }));
      });
    },

    deleteProduct: (id) => {
      if (!canCurrent("products")) return { ok: false, error: NO_PERMISSION };
      const cur = ref.current!;
      if (cur.transactions.some((t) => t.productId === id)) {
        return {
          ok: false,
          error: "This product has transaction history and cannot be deleted. Archive it instead.",
        };
      }
      patch((d) => ({ ...d, products: d.products.filter((p) => p.id !== id) }));
      void api.deleteProduct(id).then((r) => { if (!r.ok) handleFailure(r.error); });
      return { ok: true };
    },

    /* ── Stock movement ──────────────────────────────────────────── */
    move: (type, i) => {
      const perm: Feature = type === "IN" ? "stockIn" : "stockOut";
      if (!canCurrent(perm)) return { ok: false, error: NO_PERMISSION };

      const cur = ref.current!;
      const p = cur.products.find((x) => x.id === i.productId);
      if (!p) return { ok: false, error: "Please select a product." };
      if (!Number.isInteger(i.qty) || i.qty <= 0) {
        return { ok: false, error: "Quantity must be a whole number greater than 0." };
      }
      if (type === "OUT" && i.qty > p.stock) {
        return {
          ok: false,
          error: `Insufficient stock. Only ${p.stock} ${p.unit} of ${p.name} available.`,
        };
      }

      // `transactions.date` is a `date` column. Sending a full ISO timestamp
      // routes the insert through the session timezone and can shift the
      // stored day for users west of UTC. Always default to a local
      // YYYY-MM-DD here.
      const date = i.date ?? dayKey(new Date());
      const tempId = uid();
      const optimistic: Transaction = {
        id: tempId,
        ref: nextRef(type, cur.transactions, date),
        type,
        productId: p.id,
        productName: p.name,
        qty: i.qty,
        unitPrice: i.unitPrice,
        party: i.party,
        note: i.note,
        date,
      };

      patch((d) => ({
        ...d,
        products: d.products.map((x) =>
          x.id === p.id
            ? { ...x, stock: x.stock + (type === "IN" ? i.qty : -i.qty) }
            : x,
        ),
        transactions: [optimistic, ...d.transactions],
      }));

      void api.createTransaction({
        type, productId: i.productId, qty: i.qty,
        unitPrice: i.unitPrice, party: i.party, note: i.note, date,
      }).then((r) => {
        if (!r.ok) return handleFailure(r.error);
        patch((d) => ({
          ...d,
          transactions: d.transactions.map((t) => (t.id === tempId ? r.data : t)),
        }));
      });
      return { ok: true };
    },

    deleteTransaction: (id) => {
      if (!canCurrent("stockIn") && !canCurrent("stockOut")) {
        return { ok: false, error: NO_PERMISSION };
      }
      const cur = ref.current!;
      const tx = cur.transactions.find((t) => t.id === id);
      if (!tx) return { ok: false, error: "Transaction not found." };

      const product = cur.products.find((x) => x.id === tx.productId);
      if (product) {
        const delta = tx.type === "IN" ? -tx.qty : tx.qty;
        if (product.stock + delta < 0) {
          return {
            ok: false,
            error:
              `Cannot delete: only ${product.stock} ${product.unit} in stock, ` +
              `but this IN added ${tx.qty}.`,
          };
        }
        patch((d) => ({
          ...d,
          products: d.products.map((x) =>
            x.id === product.id ? { ...x, stock: x.stock + delta } : x,
          ),
          transactions: d.transactions.filter((t) => t.id !== id),
        }));
      } else {
        patch((d) => ({ ...d, transactions: d.transactions.filter((t) => t.id !== id) }));
      }

      void api.deleteTransaction(id).then((r) => {
        if (!r.ok) return handleFailure(r.error);
        void resync();
      });
      return { ok: true };
    },

    /* ── Settings ────────────────────────────────────────────────── */
    /**
     * `currentRole` is per-user display state ("preview as role"). It is
     * applied locally only — the server rejects it on `/api/settings`
     * because it would be an authz bypass if it were global.
     */
    updateSettings: (s) => {
      if (!canCurrent("settings")) { setLastError(NO_PERMISSION); return; }
      const { currentRole, ...rest } = s;

      if (currentRole) {
        patch((d) => ({ ...d, settings: { ...d.settings, currentRole } }));
      }
      if (Object.keys(rest).length > 0) {
        // Merge against `d.settings` (the fresh state inside the patch),
        // not a captured `ref.current`. Otherwise a concurrent patch that
        // lands between capture and callback is clobbered.
        patch((d) => ({ ...d, settings: { ...d.settings, ...rest } }));
        void api.patchSettings(rest).then((r) => {
          if (!r.ok) handleFailure(r.error);
        });
      }
    },

    setPermission: (r, f, v) => {
      if (!canCurrent("settings")) { setLastError(NO_PERMISSION); return; }
      patch((d) => ({
        ...d,
        settings: {
          ...d.settings,
          permissions: {
            ...d.settings.permissions,
            [r]: { ...d.settings.permissions[r], [f]: v },
          },
        },
      }));
      void api.patchSettings({ role: r, feature: f, value: v })
        .then((res) => { if (!res.ok) handleFailure(res.error); });
    },

    /* ── Users ───────────────────────────────────────────────────── */
    addUser: (u) => {
      if (!canCurrent("settings")) return { ok: false, error: NO_PERMISSION };
      const cur = ref.current!;
      if (cur.settings.users.some((x) => x.email.toLowerCase() === u.email.toLowerCase())) {
        return { ok: false, error: `Email "${u.email}" is already registered.` };
      }
      const tempId = uid();
      const optimistic: AppUser = { ...u, id: tempId };
      patch((d) => ({
        ...d,
        settings: { ...d.settings, users: [...d.settings.users, optimistic] },
      }));
      void api.createUser(u).then((r) => {
        if (!r.ok) return handleFailure(r.error);
        patch((d) => ({
          ...d,
          settings: {
            ...d.settings,
            users: d.settings.users.map((x) => (x.id === tempId ? r.data : x)),
          },
        }));
      });
      return { ok: true };
    },

    updateUser: (u) => {
      if (!canCurrent("settings")) { setLastError(NO_PERMISSION); return; }
      const cur = ref.current!;
      const before = cur.settings.users.find((x) => x.id === u.id);

      // Mirror the server's last-admin guard: only count ACTIVE admins, and
      // catch both demotions (role change) and deactivations (isActive=false).
      // An inactive admin does not protect against losing the last active one.
      const wasActiveAdmin = before ? isActiveAdmin(before) : false;
      const willBeActiveAdmin = isActiveAdmin(u);
      if (wasActiveAdmin && !willBeActiveAdmin && activeAdminCount(cur.settings.users) <= 1) {
        setLastError("Cannot demote the last active Admin.");
        return;
      }

      patch((d) => ({
        ...d,
        settings: {
          ...d.settings,
          users: d.settings.users.map((x) => (x.id === u.id ? u : x)),
        },
      }));
      void api.updateUser(u).then((r) => {
        if (!r.ok) return handleFailure(r.error);
        patch((d) => ({
          ...d,
          settings: {
            ...d.settings,
            users: d.settings.users.map((x) => (x.id === r.data.id ? r.data : x)),
          },
        }));
      });
    },

    removeUser: (id) => {
      if (!canCurrent("settings")) { setLastError(NO_PERMISSION); return; }
      const cur = ref.current!;
      const target = cur.settings.users.find((u) => u.id === id);

      const wasActiveAdmin = target ? isActiveAdmin(target) : false;
      if (wasActiveAdmin && activeAdminCount(cur.settings.users) <= 1) {
        setLastError("Cannot remove the last active Admin.");
        return;
      }

      patch((d) => ({
        ...d,
        settings: {
          ...d.settings,
          users: d.settings.users.filter((x) => x.id !== id),
        },
      }));
      void api.deleteUser(id).then((r) => { if (!r.ok) handleFailure(r.error); });
    },

    /* ── Employees ───────────────────────────────────────────────── */
    addEmployee: async (e) => {
      if (!canCurrent("employees")) return { ok: false, error: NO_PERMISSION };
      const r = await api.createEmployee(e);
      if (!r.ok) return { ok: false, error: r.error };
      patch((d) => ({ ...d, employees: [r.data, ...d.employees] }));
      return { ok: true };
    },
    updateEmployee: async (e) => {
      if (!canCurrent("employees")) return { ok: false, error: NO_PERMISSION };
      const r = await api.updateEmployee(e);
      if (!r.ok) return { ok: false, error: r.error };
      patch((d) => ({
        ...d,
        employees: d.employees.map((x) => (x.id === e.id ? r.data : x)),
      }));
      return { ok: true };
    },
    deleteEmployee: async (id) => {
      if (!canCurrent("employees")) return { ok: false, error: NO_PERMISSION };
      const r = await api.deleteEmployee(id);
      if (!r.ok) return { ok: false, error: r.error };
      patch((d) => ({ ...d, employees: d.employees.filter((x) => x.id !== id) }));
      return { ok: true };
    },

    /* ── Reset ───────────────────────────────────────────────────── */
    resetData: () => {
      if (!canCurrent("settings")) { setLastError(NO_PERMISSION); return; }
      const seed = buildSeed();
      commit(seed);
      void api.replaceDb(seed).then((r) => { if (!r.ok) handleFailure(r.error); });
    },
  };

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}