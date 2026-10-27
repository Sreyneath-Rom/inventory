// app/api/auth/logout/route.ts
import { NextResponse } from "next/server";
import { createSsrSupabase } from "@/lib/supabase/ssr";

/**
 * Clears the auth cookies. Safe to call when already signed out, and safe
 * to call when the backend is unreachable: the route always returns 204 so
 * the client can move on (the session cookie will expire on its own).
 *
 * If `signOut()` throws, the cookie-clearing handler on the SSR client may
 * not have run — that's a rare edge (Supabase unreachable from the server).
 * A hard 500 would just confuse the logout button, so we log and 204.
 */
export async function POST() {
  try {
    const sb = await createSsrSupabase();
    await sb.auth.signOut();
  } catch (e) {
    console.warn("[logout] signOut failed:", e);
  }
  return new NextResponse(null, { status: 204 });
}