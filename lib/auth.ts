import { NextResponse } from "next/server";
import { createSsrSupabase } from "./supabase/ssr";

/**
 * Returns the current user or a 401 NextResponse.
 * Usage:
 *   const auth = await requireUser();
 *   if (!auth.user) return auth.response;
 */
export async function requireUser() {
  const sb = await createSsrSupabase();
  const {
    data: { user },
  } = await sb.auth.getUser();

  if (!user) {
    return {
      user: null,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    } as const;
  }
  return { user, response: null } as const;
}