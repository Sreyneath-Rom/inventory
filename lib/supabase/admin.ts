// lib/supabase/admin.ts
import { createClient } from "@supabase/supabase-js";

/**
 * Service-role client. **Bypasses RLS.** Only call from code that has
 * already run `requireRole(...)` (or the equivalent). For user-scoped
 * reads/writes, use `createSsrSupabase()` instead.
 */
export function createAdminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing Supabase env vars. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}