// lib/shared.ts
/**
 * Shared primitives for the typed repository modules (`categories.ts`, …).
 *
 * This file deliberately has no domain imports — it exports only the
 * mechanics: an admin Supabase client, a Postgres-error translator, a
 * `.single()` unwrapper, and pagination bounds. Table-specific modules
 * build on top of these.
 */
import type { PostgrestError } from "@supabase/supabase-js";
import { createAdminSupabase } from "./supabase/admin";

/**
 * Lazy admin-client singleton. `createAdminSupabase()` throws when env vars
 * are missing, so we never call it at module load — tests and SSR builds
 * without env can still `import` this file.
 *
 * ⚠ This client uses the **service-role key** and bypasses RLS. Callers
 * must have already enforced `requireRole(...)` / `requireFeature(...)`.
 */
let _client: ReturnType<typeof createAdminSupabase> | null = null;

export function getDb(): ReturnType<typeof createAdminSupabase> {
  if (!_client) _client = createAdminSupabase();
  return _client;
}

/**
 * Maps a Postgres error code to a user-facing string. Raw `error.message`
 * is intentionally used only as a last resort — it can leak table names,
 * column names, or values.
 */
export function failDb(error: PostgrestError): never {
  const messages: Record<string, string> = {
    "23505": "A record with that unique value already exists.",
    "23503": "The related record does not exist or is still in use.",
    "23514": "The value violates a database rule, or stock is insufficient.",
    "42501": "You are not authorized to perform this operation.",
    "22023": "The request is invalid.",
    "P0002": "The requested record was not found.",
  };
  throw new Error(messages[error.code] ?? error.message);
}

/**
 * Returns `data`, or throws if `error` is set. Use on `.single()` responses
 * where a missing row is a programming error. For `.maybeSingle()` reads
 * (not-found is legitimate), inspect `data` yourself.
 */
export function value<T>(data: T | null, error: PostgrestError | null): T {
  if (error) failDb(error);
  if (data === null) throw new Error("Expected a record, but none was returned.");
  return data;
}

/** Pagination. `page` is 1-based; `pageSize` is clamped to [1, 100]. */
export type Page = { page?: number; pageSize?: number };

export function bounds({ page = 1, pageSize = 25 }: Page) {
  const size = Math.min(Math.max(pageSize, 1), 100);
  const start = (Math.max(page, 1) - 1) * size;
  return { start, end: start + size - 1 };
}