"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { AppUser, Category, DB, Feature, Product, Role, Settings, TxType, Transaction } from "./types";
import { buildSeed } from "./seed";
import { nextRef, uid } from "./utils";

const KEY = "inventory-db-v1";
export type Result = { ok: true } | { ok: false; error: string };

export interface MoveInput {
  productId: string; qty: number; unitPrice: number; party?: string; note?: string; date?: string;
}

interface Store {
  db: DB;
  can: (f: Feature) => boolean;
  addCategory: (c: Omit<Category, "id">) => void;
  updateCategory: (c: Category) => void;
  deleteCategory: (id: string) => Result;
  addProduct: (p: Omit<Product, "id">) => Result;
  updateProduct: (p: Product) => void;
  deleteProduct: (id: string) => void;
  move: (type: TxType, i: MoveInput) => Result;
  updateSettings: (patch: Partial<Settings>) => void;
  setPermission: (r: Role, f: Feature, v: boolean) => void;
  addUser: (u: Omit<AppUser, "id">) => void;
  updateUser: (u: AppUser) => void;
  removeUser: (id: string) => void;
  resetData: () => void;
}

const Ctx = createContext<Store | null>(null);
export const useStore = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("useStore must be used inside <StoreProvider>");
  return c;
};

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [db, setDbState] = useState<DB | null>(null);
  const ref = useRef<DB | null>(null);

  useEffect(() => {
    let initial: DB;
    try {
      const raw = localStorage.getItem(KEY);
      initial = raw ? (JSON.parse(raw) as DB) : buildSeed();
    } catch {
      initial = buildSeed();
    }
    ref.current = initial;
    setDbState(initial);
  }, []);

  useEffect(() => {
    if (db) localStorage.setItem(KEY, JSON.stringify(db));
  }, [db]);

  const commit = useCallback((next: DB) => {
    ref.current = next;
    setDbState(next);
  }, []);

  const patch = useCallback(
    (fn: (d: DB) => DB) => {
      const cur = ref.current;
      if (cur) commit(fn(cur));
    },
    [commit]
  );

  if (!db) {
    return <div className="grid min-h-screen place-items-center text-slate-500">Loading…</div>;
  }

  const store: Store = {
    db,
    can: (f) => db.settings.permissions[db.settings.currentRole][f],

    addCategory: (c) =>
      patch((d) => ({ ...d, categories: [...d.categories, { ...c, id: uid() }] })),
    updateCategory: (c) =>
      patch((d) => ({ ...d, categories: d.categories.map((x) => (x.id === c.id ? c : x)) })),
    deleteCategory: (id) => {
      const cur = ref.current!;
      if (cur.products.some((p) => p.categoryId === id))
        return { ok: false, error: "This category still has products. Move or delete them first." };
      patch((d) => ({ ...d, categories: d.categories.filter((c) => c.id !== id) }));
      return { ok: true };
    },

    addProduct: (p) => {
      const cur = ref.current!;
      if (cur.products.some((x) => x.sku.toLowerCase() === p.sku.toLowerCase()))
        return { ok: false, error: `SKU "${p.sku}" already exists.` };
      patch((d) => ({ ...d, products: [{ ...p, id: uid() }, ...d.products] }));
      return { ok: true };
    },
    updateProduct: (p) =>
      patch((d) => ({ ...d, products: d.products.map((x) => (x.id === p.id ? p : x)) })),
    deleteProduct: (id) =>
      patch((d) => ({ ...d, products: d.products.filter((p) => p.id !== id) })),

    move: (type, i) => {
      const cur = ref.current!;
      const p = cur.products.find((x) => x.id === i.productId);
      if (!p) return { ok: false, error: "Please select a product." };
      if (!Number.isInteger(i.qty) || i.qty <= 0)
        return { ok: false, error: "Quantity must be a whole number greater than 0." };
      if (type === "OUT" && i.qty > p.stock)
        return { ok: false, error: `Insufficient stock. Only ${p.stock} ${p.unit} of ${p.name} available.` };

      const date = i.date ?? new Date().toISOString();
      const tx: Transaction = {
        id: uid(),
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
          x.id === p.id ? { ...x, stock: x.stock + (type === "IN" ? i.qty : -i.qty) } : x
        ),
        transactions: [tx, ...d.transactions],
      }));
      return { ok: true };
    },

    updateSettings: (s) => patch((d) => ({ ...d, settings: { ...d.settings, ...s } })),
    setPermission: (r, f, v) =>
      patch((d) => ({
        ...d,
        settings: {
          ...d.settings,
          permissions: {
            ...d.settings.permissions,
            [r]: { ...d.settings.permissions[r], [f]: v },
          },
        },
      })),
    addUser: (u) =>
      patch((d) => ({
        ...d,
        settings: { ...d.settings, users: [...d.settings.users, { ...u, id: uid() }] },
      })),
    updateUser: (u) =>
      patch((d) => ({
        ...d,
        settings: { ...d.settings, users: d.settings.users.map((x) => (x.id === u.id ? u : x)) },
      })),
    removeUser: (id) =>
      patch((d) => ({
        ...d,
        settings: { ...d.settings, users: d.settings.users.filter((x) => x.id !== id) },
      })),
    resetData: () => commit(buildSeed()),
  };

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}