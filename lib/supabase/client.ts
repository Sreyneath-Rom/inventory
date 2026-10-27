// lib/supabase/client.ts
"use client";
import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser Supabase client (publishable key, RLS enforced).
 *
 * Validates env vars explicitly — passing `undefined` to `createBrowserClient`
 * succeeds but leaves every request unauthenticated, which surfaces as a
 * confusing 401 far from the real cause.
 *
 * Key name note: `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` is the newer
 * Supabase model (`sb_publishable_…`). Projects on the legacy anon-key
 * model set `NEXT_PUBLIC_SUPABASE_ANON_KEY` instead — rename here and in
 * `.env` if that's your setup.
 */
export function createBrowserSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing Supabase env vars. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
    );
  }
  return createBrowserClient(url, key);
}