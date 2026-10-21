// app/api/auth/login/route.ts
import { NextResponse } from "next/server";
import { createSsrSupabase } from "@/lib/supabase/ssr";
import { getAppRole } from "@/lib/auth";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Signs in with email + password. Uses the SSR client so the session is
 * stored in HttpOnly auth cookies on the response — that's what makes
 * `requireUser` / `requireRole` work on subsequent server requests.
 *
 * Returns `{ id, email, name, role }`. Never returns the session tokens
 * (they're in the cookies).
 */
export async function POST(req: Request) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const body = (raw ?? {}) as Record<string, unknown>;
  const email    = typeof body.email    === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!email || !password) {
    return NextResponse.json(
      { error: "Email and password are required." },
      { status: 422 },
    );
  }
  if (!EMAIL.test(email)) {
    return NextResponse.json({ error: "Please enter a valid email address." }, { status: 422 });
  }

  // SSR client: `signInWithPassword` triggers the `setAll` cookie handler
  // in ssr.ts, which writes the auth cookies onto the outgoing response.
  const sb = await createSsrSupabase();
  const { data, error } = await sb.auth.signInWithPassword({ email, password });

  if (error || !data.user) {
    // Deliberately vague — do not confirm whether the email exists.
    return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
  }

  // The user is authenticated by Supabase, but we need an app_users row to
  // know their role. If there isn't one, clear the session and reject —
  // otherwise every subsequent route would 403 them with no explanation.
  const role = await getAppRole(data.user);
  if (!role) {
    await sb.auth.signOut();
    return NextResponse.json(
      { error: "Your account is not set up. Ask an admin to grant access." },
      { status: 403 },
    );
  }

  const name =
    (data.user.user_metadata?.name as string | undefined) ??
    data.user.email?.split("@")[0] ??
    "";

  return NextResponse.json({
    id: data.user.id,
    email: data.user.email,
    name,
    role,
  });
}