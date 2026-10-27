// lib/supabase/admin.ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";

/**
 * Service-role client. **Bypasses RLS.** Only call from code that has
 * already run `requireRole(...)` (or the equivalent). For user-scoped
 * reads/writes, use `createSsrSupabase()` instead.
 *
 * Typed with the `Database` shape so every `.from("categories")` /
 * `.rpc("move_stock")` call is checked against the actual schema. If you
 * add a table or RPC, update `lib/database.types.ts` first — otherwise
 * the call site will resolve to `never` and error out.
 *
 * Singleton: `createClient()` allocates a fetch handler and an in-memory
 * auth store per instance. Sharing is safe because `persistSession: false`
 * means there is no per-user state to leak between requests.
 */
let _client: SupabaseClient<Database> | null = null;

export function createAdminSupabase(): SupabaseClient<Database> {
  if (_client) return _client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing Supabase env vars. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  _client = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _client;
}