// app/api/auth/logout/route.ts
import { NextResponse } from "next/server";
import { createSsrSupabase } from "@/lib/supabase/ssr";

/** Clears the auth cookies. Safe to call when already signed out. */
export async function POST() {
  const sb = await createSsrSupabase();
  await sb.auth.signOut();
  return new NextResponse(null, { status: 204 });
}