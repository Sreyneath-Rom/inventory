import type { DB, Product, Category, Transaction, Settings, AppUser, TxType } from "../types";
import { FEATURES, ROLES } from "../types";
import { buildSeed } from "../seed";
import { createServerSupabase } from "../supabase/server";
import { uid } from "../utils";

/* ─── Row ↔ domain mappers ─────────────────────────────────────────── */

type CatRow = { id: string; name: string; color: string };

type ProdRow = {
  id: string;
  sku: string;
  name: string;
  category_id: string;
  unit: string;
  cost: number;
  price: number;
  stock: number;
  threshold: number;
  image: string | null;
};

type TxRow = {
  id: string;
  ref: string;
  type: TxType;
  product_id: string;
  product_name: string;
  qty: number;
  unit_price: number;
  party: string | null;
  note: string | null;
  date: string;
};

type UserRow = {
  id: string;
  name: string;
  email: string;
  role: AppUser["role"];
};

type SetRow = {
  id: number;
  company_name: string;
  admin_name: string;
  currency: string;
  default_threshold: number;
  active_role: Settings["currentRole"];
  permissions: Record<string, Record<string, boolean>>;
};

const toCat = (r: CatRow): Category => ({
  id: r.id,
  name: r.name,
  color: r.color,
});

const toProd = (r: ProdRow): Product => ({
  id: r.id,
  sku: r.sku,
  name: r.name,
  categoryId: r.category_id,
  unit: r.unit,
  cost: Number(r.cost),
  price: Number(r.price),
  stock: r.stock,
  threshold: r.threshold,
  image: r.image ?? "",
});

const toTx = (r: TxRow): Transaction => ({
  id: r.id,
  ref: r.ref,
  type: r.type,
  productId: r.product_id,
  productName: r.product_name,
  qty: r.qty,
  unitPrice: Number(r.unit_price),
  party: r.party ?? undefined,
  note: r.note ?? undefined,
  date: r.date,
});

const toUser = (r: UserRow): AppUser => ({
  id: r.id,
  name: r.name,
  email: r.email,
  role: r.role,
});

/* ─── Read ─────────────────────────────────────────────────────────── */

export async function readDb(): Promise<DB> {
  const sb = createServerSupabase();

  const [cats, prods, txs, users, settings] = await Promise.all([
    sb.from("categories").select("*").order("name"),
    sb.from("products").select("*").order("created_at", { ascending: false }),
    sb.from("transactions").select("*").order("date", { ascending: false }),
    sb.from("app_users").select("*").order("name"),
    sb.from("settings").select("*").eq("id", 1).single(),
  ]);

  // Everything except settings is a hard error if missing.
  for (const r of [cats, prods, txs, users]) {
    if (r.error) throw new Error(`Supabase read failed: ${r.error.message}`);
  }

  // The settings row is created by the schema SQL. If it's missing
  // (fresh project, or manually deleted), insert it rather than failing.
  let s = settings.data as SetRow | null;

  if (settings.error || !s) {
    const seed = buildSeed();
    const { error: insertErr } = await sb.from("settings").upsert({
      id: 1,
      company_name: seed.settings.companyName,
      admin_name: seed.settings.adminName,
      currency: seed.settings.currency,
      default_threshold: seed.settings.defaultThreshold,
      active_role: seed.settings.currentRole,
      permissions: seed.settings.permissions,
    });
    if (insertErr) throw new Error(`Supabase read failed: ${insertErr.message}`);

    s = {
      id: 1,
      company_name: seed.settings.companyName,
      admin_name: seed.settings.adminName,
      currency: seed.settings.currency,
      default_threshold: seed.settings.defaultThreshold,
      active_role: seed.settings.currentRole,
      permissions: seed.settings.permissions,
    };
  }

  const perms = s.permissions ?? {};
  const permissions = Object.fromEntries(
    ROLES.map((role) => [
      role,
      Object.fromEntries(
        FEATURES.map((f) => [f.key, role === "Admin" ? true : !!perms?.[role]?.[f.key]])
      ),
    ])
  ) as Settings["permissions"];

  return {
    categories: (cats.data as CatRow[]).map(toCat),
    products: (prods.data as ProdRow[]).map(toProd),
    transactions: (txs.data as TxRow[]).map(toTx),
    settings: {
      companyName: s.company_name,
      adminName: s.admin_name,
      currency: s.currency,
      defaultThreshold: s.default_threshold,
      currentRole: s.active_role,
      permissions,
      users: (users.data as UserRow[]).map(toUser),
    },
  };
}

/* ─── Mutate ───────────────────────────────────────────────────────── */

export async function mutate<T>(fn: (db: DB) => T | Promise<T>): Promise<T> {
  const db = await readDb();
  const result = await fn(db);
  await persistSnapshot(db);
  return result;
}

async function persistSnapshot(db: DB): Promise<void> {
  const sb = createServerSupabase();

  if (db.categories.length) {
    const { error } = await sb.from("categories").upsert(
      db.categories.map((c) => ({ id: c.id, name: c.name, color: c.color }))
    );
    if (error) throw new Error(error.message);
  }

  if (db.products.length) {
    const { error } = await sb.from("products").upsert(
      db.products.map((p) => ({
        id: p.id,
        sku: p.sku,
        name: p.name,
        category_id: p.categoryId,
        unit: p.unit,
        cost: p.cost,
        price: p.price,
        stock: p.stock,
        threshold: p.threshold,
        image: p.image || null,
      }))
    );
    if (error) throw new Error(error.message);
  }

  if (db.transactions.length) {
    const { error } = await sb.from("transactions").upsert(
      db.transactions.map((t) => ({
        id: t.id,
        ref: t.ref,
        type: t.type,
        product_id: t.productId,
        product_name: t.productName,
        qty: t.qty,
        unit_price: t.unitPrice,
        party: t.party ?? null,
        note: t.note ?? null,
        date: t.date,
      }))
    );
    if (error) throw new Error(error.message);
  }

  if (db.settings.users.length) {
    const { error } = await sb.from("app_users").upsert(
      db.settings.users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
      }))
    );
    if (error) throw new Error(error.message);
  }

  const { error: sErr } = await sb.from("settings").upsert({
    id: 1,
    company_name: db.settings.companyName,
    admin_name: db.settings.adminName,
    currency: db.settings.currency,
    default_threshold: db.settings.defaultThreshold,
    active_role: db.settings.currentRole,
    permissions: db.settings.permissions,
  });
  if (sErr) throw new Error(sErr.message);
}

/* ─── Replace ──────────────────────────────────────────────────────── */

export async function replaceDb(next: DB): Promise<void> {
  const sb = createServerSupabase();

  await sb.from("transactions").delete().neq("id", "");
  await sb.from("products").delete().neq("id", "");
  await sb.from("categories").delete().neq("id", "");
  await sb.from("app_users").delete().neq("id", "");

  if (next.categories.length) {
    const { error } = await sb.from("categories").insert(
      next.categories.map((c) => ({ id: c.id, name: c.name, color: c.color }))
    );
    if (error) throw new Error(error.message);
  }

  if (next.products.length) {
    const { error } = await sb.from("products").insert(
      next.products.map((p) => ({
        id: p.id,
        sku: p.sku,
        name: p.name,
        category_id: p.categoryId,
        unit: p.unit,
        cost: p.cost,
        price: p.price,
        stock: p.stock,
        threshold: p.threshold,
        image: p.image || null,
      }))
    );
    if (error) throw new Error(error.message);
  }

  if (next.transactions.length) {
    const { error } = await sb.from("transactions").insert(
      next.transactions.map((t) => ({
        id: t.id,
        ref: t.ref,
        type: t.type,
        product_id: t.productId,
        product_name: t.productName,
        qty: t.qty,
        unit_price: t.unitPrice,
        party: t.party ?? null,
        note: t.note ?? null,
        date: t.date,
      }))
    );
    if (error) throw new Error(error.message);
  }

  if (next.settings.users.length) {
    const { error } = await sb.from("app_users").insert(
      next.settings.users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
      }))
    );
    if (error) throw new Error(error.message);
  }

  const { error: sErr } = await sb.from("settings").upsert({
    id: 1,
    company_name: next.settings.companyName,
    admin_name: next.settings.adminName,
    currency: next.settings.currency,
    default_threshold: next.settings.defaultThreshold,
    active_role: next.settings.currentRole,
    permissions: next.settings.permissions,
  });
  if (sErr) throw new Error(sErr.message);
}

/* ─── Atomic stock movement ────────────────────────────────────────── */

export async function moveStock(input: {
  type: TxType;
  productId: string;
  qty: number;
  unitPrice: number;
  party?: string;
  note?: string;
  date: string;
}): Promise<Transaction> {
  const sb = createServerSupabase();
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
    p_tx_id: txId,
  });

  if (error) {
    if (error.message.includes("PRODUCT_NOT_FOUND"))
      throw new Error("Product not found.");
    if (error.message.includes("INSUFFICIENT_STOCK")) {
      const [, stock, unit] = error.message.split(":");
      throw new Error(`Insufficient stock. Only ${stock} ${unit} available.`);
    }
    if (error.message.includes("INVALID_TYPE"))
      throw new Error("type must be 'IN' or 'OUT'.");
    if (error.message.includes("INVALID_QTY"))
      throw new Error("Quantity must be a whole number greater than 0.");
    throw new Error(error.message);
  }

  return toTx(data as TxRow);
}

/* ─── Delete helpers ──────────────────────────────────────────────── */

export async function deleteCategoryRow(id: string): Promise<void> {
  const sb = createServerSupabase();
  const { error } = await sb.from("categories").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteProductRow(id: string): Promise<void> {
  const sb = createServerSupabase();
  const { error } = await sb.from("products").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteUserRow(id: string): Promise<void> {
  const sb = createServerSupabase();
  const { error } = await sb.from("app_users").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteTransactionRow(id: string): Promise<void> {
  const sb = createServerSupabase();
  const { error } = await sb.from("transactions").delete().eq("id", id);
  if (error) throw new Error(error.message);
}