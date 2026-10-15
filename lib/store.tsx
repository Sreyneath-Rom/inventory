"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type {
  AppUser,
  Category,
  DB,
  Feature,
  Product,
  Role,
  Settings,
  TxType,
  Transaction,
} from "./types";
import { buildSeed } from "./seed";
import { nextRef, uid } from "./utils";
import { api } from "./api";

const KEY = "inventory-db-v1";

export type Result = { ok: true } | { ok: false; error: string };

export interface MoveInput {
  productId: string;
  qty: number;
  unitPrice: number;
  party?: string;
  note?: string;
  date?: string;
}

/** Public shape of the store — `db` is always present once mounted. */
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

/** What the context actually holds — `db` may be null during hydration. */
type StoreMaybe = Omit<Store, "db"> & { db: DB | null };

const Ctx = createContext<StoreMaybe | null>(null);

/**
 * Typed accessor used by all app components. Guarantees a non-null DB,
 * which in practice means: only call this from inside `<RequireDb>`.
 */
export function useStore(): Store {
  const c = useContext(Ctx);
  if (!c) throw new Error("useStore must be used inside <StoreProvider>");
  if (!c.db) throw new Error("DB not ready — wrap this subtree in <RequireDb>.");
  return c as Store;
}

/** Raw accessor used only by `RequireDb` — allows db to be null. */
function useStoreMaybe(): StoreMaybe {
  const c = useContext(Ctx);
  if (!c) throw new Error("useStore must be used inside <StoreProvider>");
  return c;
}

/**
 * Renders `children` once the DB has hydrated. Shows a loading state
 * until then. Every component below this gate is guaranteed a non-null DB.
 */
export function RequireDb({ children }: { children: React.ReactNode }) {
  const { db } = useStoreMaybe();
  if (!db) {
    return (
      <div className="grid min-h-screen place-items-center text-slate-500">
        Loading…
      </div>
    );
  }
  return <>{children}</>;
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [db, setDbState] = useState<DB | null>(null);
  const ref = useRef<DB | null>(null);

  /* ─── Hydration ────────────────────────────────────────────────── */

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const res = await api.loadDb();
      if (cancelled) return;

      let initial: DB;

      if (res.ok) {
        initial = res.data;
      } else {
        // Fall back to localStorage so the app still boots offline.
        let cached: DB | null = null;
        try {
          const raw = localStorage.getItem(KEY);
          cached = raw ? (JSON.parse(raw) as DB) : null;
        } catch {
          cached = null;
        }
        initial = cached ?? buildSeed();

        // Push whatever we have back to the server.
        void api.replaceDb(initial);
      }

      ref.current = initial;
      setDbState(initial);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  /* ─── Persistence safety net ───────────────────────────────────── */

  useEffect(() => {
    if (db) {
      try {
        localStorage.setItem(KEY, JSON.stringify(db));
      } catch {
        /* quota errors are non-fatal */
      }
    }
  }, [db]);

  /* ─── State helpers ────────────────────────────────────────────── */

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

  /** Refetch from the server. Used to roll back failed optimistic writes. */
  const resync = useCallback(async () => {
    const res = await api.loadDb();
    if (res.ok) commit(res.data);
  }, [commit]);

  /* ─── Store value ──────────────────────────────────────────────── */

  const store: StoreMaybe = {
    db, // may be null — consumers only see it after RequireDb passes

    can: (f) => {
      if (!db) return false;
      return db.settings.permissions[db.settings.currentRole][f];
    },

    /* ── Categories ──────────────────────────────────────────────── */

    addCategory: (c) => {
      const tempId = uid();
      const optimistic: Category = { ...c, id: tempId };
      patch((d) => ({ ...d, categories: [...d.categories, optimistic] }));

      void api.createCategory(c).then((r) => {
        if (!r.ok) {
          void resync();
        } else {
          const real = r.data;
          patch((d) => ({
            ...d,
            categories: d.categories.map((x) => (x.id === tempId ? real : x)),
          }));
        }
      });
    },

    updateCategory: (c) => {
      patch((d) => ({
        ...d,
        categories: d.categories.map((x) => (x.id === c.id ? c : x)),
      }));

      void api.updateCategory(c).then((r) => {
        if (!r.ok) void resync();
      });
    },

    deleteCategory: (id) => {
      const cur = ref.current!;
      if (cur.products.some((p) => p.categoryId === id)) {
        return {
          ok: false,
          error: "This category still has products. Move or delete them first.",
        };
      }

      patch((d) => ({
        ...d,
        categories: d.categories.filter((c) => c.id !== id),
      }));

      void api.deleteCategory(id).then((r) => {
        if (!r.ok) void resync();
      });
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
        if (!r.ok) {
          void resync();
        } else {
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
      // Preserve existing stock — it's only changed via /api/transactions.
      const cur = ref.current!;
      const existing = cur.products.find((x) => x.id === p.id);
      const merged: Product = existing ? { ...p, stock: existing.stock } : p;

      patch((d) => ({
        ...d,
        products: d.products.map((x) => (x.id === p.id ? merged : x)),
      }));

      void api.updateProduct(merged).then((r) => {
        if (!r.ok) void resync();
      });
    },

    deleteProduct: (id) => {
      patch((d) => ({
        ...d,
        products: d.products.filter((p) => p.id !== id),
      }));

      void api.deleteProduct(id).then((r) => {
        if (!r.ok) void resync();
      });
    },

    /* ── Stock movement ──────────────────────────────────────────── */

    move: (type, i) => {
      const cur = ref.current!;
      const p = cur.products.find((x) => x.id === i.productId);

      if (!p) return { ok: false, error: "Please select a product." };
      if (!Number.isInteger(i.qty) || i.qty <= 0) {
        return {
          ok: false,
          error: "Quantity must be a whole number greater than 0.",
        };
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

      patch((d) => ({
        ...d,
        products: d.products.map((x) =>
          x.id === p.id
            ? { ...x, stock: x.stock + (type === "IN" ? i.qty : -i.qty) }
            : x
        ),
        transactions: [optimistic, ...d.transactions],
      }));

      void api
        .createTransaction({
          type,
          productId: i.productId,
          qty: i.qty,
          unitPrice: i.unitPrice,
          party: i.party,
          note: i.note,
          date,
        })
        .then((r) => {
          if (!r.ok) {
            void resync();
          } else {
            const real = r.data;
            patch((d) => ({
              ...d,
              transactions: d.transactions.map((t) =>
                t.id === tempId ? real : t
              ),
            }));
          }
        });

      return { ok: true };
    },

    /* ── Settings ────────────────────────────────────────────────── */

    updateSettings: (s) => {
      const cur = ref.current!;
      const next = { ...cur.settings, ...s };
      patch((d) => ({ ...d, settings: next }));

      void api.patchSettings(s).then((r) => {
        if (!r.ok) void resync();
      });
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

    /* ── Users ───────────────────────────────────────────────────── */

    addUser: (u) => {
      const tempId = uid();
      const optimistic: AppUser = { ...u, id: tempId };
      patch((d) => ({
        ...d,
        settings: { ...d.settings, users: [...d.settings.users, optimistic] },
      }));

      void api.createUser(u).then((r) => {
        if (!r.ok) {
          void resync();
        } else {
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
    },

    updateUser: (u) => {
      patch((d) => ({
        ...d,
        settings: {
          ...d.settings,
          users: d.settings.users.map((x) => (x.id === u.id ? u : x)),
        },
      }));

      void api.updateUser(u).then((r) => {
        if (!r.ok) void resync();
      });
    },

    removeUser: (id) => {
      patch((d) => ({
        ...d,
        settings: {
          ...d.settings,
          users: d.settings.users.filter((x) => x.id !== id),
        },
      }));

      void api.deleteUser(id).then((r) => {
        if (!r.ok) void resync();
      });
    },

    /* ── Reset ───────────────────────────────────────────────────── */

    resetData: () => {
      const seed = buildSeed();
      commit(seed);
      void api.replaceDb(seed).then((r) => {
        if (!r.ok) void resync();
      });
    },
  };

  // NOTE: always render children. `db` may be null here — that's fine,
  // `<RequireDb>` (or any consumer of `useStore()`) handles the gate.
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}