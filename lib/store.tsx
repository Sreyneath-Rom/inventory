"use client";
import {
  createContext, useCallback, useContext, useEffect, useRef, useState,
} from "react";
import type {
  AppUser, Category, DB, Employee, EmployeeFormData, Feature,
  Product, Role, Settings, TxType, Transaction,
} from "./types";
import { buildSeed } from "./seed";
import { nextRef, uid } from "./utils";
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
  const { db } = useStoreMaybe();
  if (!db) {
    return <div className="grid min-h-screen place-items-center text-slate-500">Loading…</div>;
  }
  return <>{children}</>;
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [db, setDbState] = useState<DB | null>(null);
  const ref = useRef<DB | null>(null);

  /* Hydration */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await api.loadDb();
      if (cancelled) return;
      let initial: DB;
      if (res.ok) {
        initial = normalize(res.data);
      } else {
        let cached: DB | null = null;
        try {
          const raw = localStorage.getItem(KEY);
          cached = raw ? normalize(JSON.parse(raw) as DB) : null;
        } catch { cached = null; }
        // Do NOT push this back with api.replaceDb(): a failed load (401, 500,
        // network blip) would wipe every table on the server. Run read-only
        // from cache/seed; later writes sync normally or trigger a resync.
        console.warn("Could not load DB from server:", res.error);
        initial = cached ?? buildSeed();
      }
      ref.current = initial;
      setDbState(initial);
    })();
    return () => { cancelled = true; };
  }, []);

  /* Persist */
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

  const store: StoreMaybe = {
    db,

    can: (f) => !!db && db.settings.permissions[db.settings.currentRole][f],

    /* ── Categories ──────────────────────────────────────────────── */
    addCategory: (c) => {
      const cur = ref.current!;
      if (cur.categories.some((x) => x.name.toLowerCase() === c.name.toLowerCase())) {
        return { ok: false, error: `Category "${c.name}" already exists.` };
      }
      const tempId = uid();
      const optimistic: Category = { ...c, id: tempId };
      patch((d) => ({ ...d, categories: [...d.categories, optimistic] }));
      void api.createCategory(c).then((r) => {
        if (!r.ok) void resync();
        else {
          const real = r.data;
          patch((d) => ({
            ...d,
            categories: d.categories.map((x) => (x.id === tempId ? real : x)),
          }));
        }
      });
      return { ok: true };
    },

    updateCategory: (c) => {
      patch((d) => ({
        ...d,
        categories: d.categories.map((x) => (x.id === c.id ? c : x)),
      }));
      void api.updateCategory(c).then((r) => { if (!r.ok) void resync(); });
    },

    deleteCategory: (id) => {
      const cur = ref.current!;
      if (cur.products.some((p) => p.categoryId === id)) {
        return { ok: false, error: "This category still has products. Move or delete them first." };
      }
      patch((d) => ({ ...d, categories: d.categories.filter((c) => c.id !== id) }));
      void api.deleteCategory(id).then((r) => { if (!r.ok) void resync(); });
      return { ok: true };
    },

    /* ── Products ────────────────────────────────────────────────── */
    addProduct: (p) => {
      const cur = ref.current!;
      if (cur.products.some((x) => x.sku.toLowerCase() === p.sku.toLowerCase())) {
        return { ok: false, error: `SKU "${p.sku}" already exists.` };
      }
      const tempId = uid();
      const optimistic: Product = { ...p, id: tempId };
      patch((d) => ({ ...d, products: [optimistic, ...d.products] }));
      void api.createProduct(p).then((r) => {
        if (!r.ok) void resync();
        else {
          const real = r.data;
          patch((d) => ({
            ...d,
            products: d.products.map((x) => (x.id === tempId ? real : x)),
          }));
        }
      });
      return { ok: true };
    },

    updateProduct: (p) => {
      const cur = ref.current!;
      const existing = cur.products.find((x) => x.id === p.id);
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
      };
      void api.updateProduct(payload).then((r) => { if (!r.ok) void resync(); });
    },

    deleteProduct: (id) => {
      const cur = ref.current!;
      if (cur.transactions.some((t) => t.productId === id)) {
        return {
          ok: false,
          error: "This product has transaction history and cannot be deleted. Archive it instead.",
        };
      }
      patch((d) => ({ ...d, products: d.products.filter((p) => p.id !== id) }));
      void api.deleteProduct(id).then((r) => { if (!r.ok) void resync(); });
      return { ok: true };
    },

    /* ── Stock movement ──────────────────────────────────────────── */
    move: (type, i) => {
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

      const date = i.date ?? new Date().toISOString();
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

      // If the SQL trigger `trg_transactions_stock` is installed, remove the
      // stock mutation below — the trigger handles it server-side.
      patch((d) => ({
        ...d,
        products: d.products.map((x) =>
          x.id === p.id
            ? { ...x, stock: x.stock + (type === "IN" ? i.qty : -i.qty) }
            : x
        ),
        transactions: [optimistic, ...d.transactions],
      }));

      void api.createTransaction({
        type, productId: i.productId, qty: i.qty,
        unitPrice: i.unitPrice, party: i.party, note: i.note, date,
      }).then((r) => {
        if (!r.ok) void resync();
        else {
          const real = r.data;
          patch((d) => ({
            ...d,
            transactions: d.transactions.map((t) => (t.id === tempId ? real : t)),
          }));
        }
      });
      return { ok: true };
    },

    deleteTransaction: (id) => {
      const cur = ref.current!;
      const tx = cur.transactions.find((t) => t.id === id);
      if (!tx) return { ok: false, error: "Transaction not found." };

      const product = cur.products.find((x) => x.id === tx.productId);
      if (product) {
        const delta = tx.type === "IN" ? -tx.qty : tx.qty;
        if (product.stock + delta < 0) {
          return {
            ok: false,
            error: `Cannot delete: only ${product.stock} ${product.unit} in stock, but this IN added ${tx.qty}.`,
          };
        }
        // Trigger note applies here too — skip the stock delta if the SQL
        // trigger is active.
        patch((d) => ({
          ...d,
          products: d.products.map((x) =>
            x.id === product.id ? { ...x, stock: x.stock + delta } : x
          ),
          transactions: d.transactions.filter((t) => t.id !== id),
        }));
      } else {
        patch((d) => ({ ...d, transactions: d.transactions.filter((t) => t.id !== id) }));
      }

      void api.deleteTransaction(id).then((r) => { if (!r.ok) void resync(); });
      return { ok: true };
    },

    /* ── Settings ────────────────────────────────────────────────── */
    updateSettings: (s) => {
      const cur = ref.current!;
      patch((d) => ({ ...d, settings: { ...cur.settings, ...s } }));
      void api.patchSettings(s).then((r) => { if (!r.ok) void resync(); });
    },

    setPermission: (r, f, v) => {
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
      void api.patchSettings({ role: r, feature: f, value: v }).then((res) => {
        if (!res.ok) void resync();
      });
    },

    /* ── Users ──────────────────────────────────────────────────── */
    addUser: (u) => {
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
        if (!r.ok) void resync();
        else {
          const real = r.data;
          patch((d) => ({
            ...d,
            settings: {
              ...d.settings,
              users: d.settings.users.map((x) => (x.id === tempId ? real : x)),
            },
          }));
        }
      });
      return { ok: true };
    },

    updateUser: (u) => {
      patch((d) => ({
        ...d,
        settings: {
          ...d.settings,
          users: d.settings.users.map((x) => (x.id === u.id ? u : x)),
        },
      }));
      void api.updateUser(u).then((r) => { if (!r.ok) void resync(); });
    },

    removeUser: (id) => {
      patch((d) => ({
        ...d,
        settings: {
          ...d.settings,
          users: d.settings.users.filter((x) => x.id !== id),
        },
      }));
      void api.deleteUser(id).then((r) => { if (!r.ok) void resync(); });
    },

    /* ── Employees ──────────────────────────────────────────────── */
    addEmployee: async (e) => {
      const r = await api.createEmployee(e);
      if (!r.ok) return { ok: false, error: r.error };
      patch((d) => ({ ...d, employees: [r.data, ...d.employees] }));
      return { ok: true };
    },
    updateEmployee: async (e) => {
      const r = await api.updateEmployee(e);
      if (!r.ok) return { ok: false, error: r.error };
      patch((d) => ({
        ...d,
        employees: d.employees.map((x) => (x.id === e.id ? r.data : x)),
      }));
      return { ok: true };
    },
    deleteEmployee: async (id) => {
      const r = await api.deleteEmployee(id);
      if (!r.ok) return { ok: false, error: r.error };
      patch((d) => ({ ...d, employees: d.employees.filter((x) => x.id !== id) }));
      return { ok: true };
    },

    /* ── Reset ──────────────────────────────────────────────────── */
    resetData: () => {
      const seed = buildSeed();
      commit(seed);
      void api.replaceDb(seed).then((r) => { if (!r.ok) void resync(); });
    },
  };

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}