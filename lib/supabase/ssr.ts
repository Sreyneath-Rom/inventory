// lib/supabase/ssr.ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Server-side, cookie-backed Supabase client (publishable key, RLS enforced).
 *
 * This is the *user-scoped* client. It reads the Supabase auth cookies from
 * the incoming request, so `.auth.getUser()` returns whoever is signed in.
 * Do NOT use this for privileged writes — use `createAdminSupabase()` for
 * anything that bypasses RLS.
 *
 * `await cookies()` works on Next.js 14 (returns the store synchronously,
 * `await` on a non-Promise is a no-op) and on 15+ (returns a Promise).
 */
export async function createSsrSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing Supabase env vars. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
    );
  }

  const cookieStore = await cookies();

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Called from a Server Component — safe to ignore.
        }
      },
    },
  });
}