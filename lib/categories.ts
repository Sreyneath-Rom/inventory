// lib/categories.ts
/**
 * Typed repository for `public.categories`. Mirrors schema.sql:
 *
 *   id          text PK default gen_random_uuid()::text
 *   name        text UNIQUE, TRIM(name) length > 0
 *   color       text default '#3b82f6', CHECK ~ '^#[0-9A-Fa-f]{6}$'
 *   created_at  timestamptz default now()
 *   updated_at  timestamptz default now()
 *
 * Metadata only — no coordination with the atomic `move_stock` RPC is
 * needed here. Write stock-related logic in `lib/server/db.ts`.
 */
import { bounds, failDb, getDb, value, type Page } from "./shared";
import type { Category } from "./types";

/* ─── Row type (mirrors schema) ─────────────────────────────────────── */

interface CategoryRow {
  id: string;
  name: string;
  color: string;
  created_at: string;
  updated_at: string;
}

const mapRow = (r: CategoryRow): Category => ({
  id: r.id,
  name: r.name,
  color: r.color,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

/* ─── Input / options ────────────────────────────────────────────────── */

export interface CategoryInsert {
  name: string;
  /** Defaults to `#3b82f6` (SQL default). Must match `^#[0-9A-Fa-f]{6}$`. */
  color?: string;
}

export interface CategoryUpdate {
  name?: string;
  color?: string;
}

export interface CategoryListOptions extends Page {
  search?: string;
  ascending?: boolean;
}

/* ─── Writes ─────────────────────────────────────────────────────────── */

export async function createCategory(input: CategoryInsert): Promise<Category> {
  const { data, error } = await getDb()
    .from("categories")
    .insert({
      id: crypto.randomUUID(),
      name: input.name.trim(),
      color: input.color ?? "#3b82f6",
    })
    .select("*")
    .single();
  return mapRow(value(data, error) as CategoryRow);
}

/**
 * Partial update. The payload is built **inline** — not via
 * `Record<string, unknown>` — because a typed client's `.update()`
 * parameter is `RejectExcessProperties<categories.Update, …>`, which
 * rejects `Record<string, unknown>` (an `unknown` value can't be assigned
 * to `string | undefined`). Inline object literal lets TS check each
 * field against the schema's `Update` type.
 *
 * `updated_at` is bumped explicitly — there is no auto-update trigger.
 */
export async function updateCategory(
  id: string,
  patch: CategoryUpdate,
): Promise<Category> {
  const { data, error } = await getDb()
    .from("categories")
    .update({
      updated_at: new Date().toISOString(),
      ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
      ...(patch.color !== undefined ? { color: patch.color } : {}),
    })
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) failDb(error);
  if (!data) throw new Error("Category not found.");
  return mapRow(data as CategoryRow);
}

export async function deleteCategory(id: string): Promise<void> {
  const { error } = await getDb().from("categories").delete().eq("id", id);
  if (error) failDb(error); // 23503 → "still in use" from products FK
}

/* ─── Reads ──────────────────────────────────────────────────────────── */

export async function getCategoryById(id: string): Promise<Category | null> {
  const { data, error } = await getDb()
    .from("categories")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) failDb(error);
  return data ? mapRow(data as CategoryRow) : null;
}

/**
 * Paginated list. Returns `{ items, total }` — this is the correct shape
 * for a repository function that uses `.range()`. Any HTTP route that
 * exposes this (`GET /api/categories`) should return this object verbatim,
 * and any client helper in `lib/api.ts` should be typed to match:
 *
 *   // lib/api.ts
 *   listCategories: (opts?: { page?: number; pageSize?: number; search?: string }) =>
 *     call<{ items: Category[]; total: number }>("/api/categories" + qs);
 *
 * If your route instead returns `items` only, change this function to
 * `return (data as CategoryRow[]).map(mapRow);` and drop the wrapper —
 * but keep the two shapes in sync. A silent mismatch here shows an empty
 * list in the UI with no console error.
 */
export async function listCategories(
  options: CategoryListOptions = {},
): Promise<{ items: Category[]; total: number }> {
  const { start, end } = bounds(options);
  let q = getDb().from("categories").select("*", { count: "exact" });
  if (options.search) q = q.ilike("name", `%${options.search}%`);
  const { data, error, count } = await q
    .order("name", { ascending: options.ascending ?? true })
    .range(start, end);
  if (error) failDb(error);
  return {
    items: (data as CategoryRow[]).map(mapRow),
    total: count ?? 0,
  };
}