// app/api/auth/login/route.ts
import { NextResponse } from "next/server";
import { createSsrSupabase } from "@/lib/supabase/ssr";
import { getAppRoleOrBootstrapFirstAdmin } from "@/lib/auth";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Signs in with email + password. Uses the SSR client so the session is
 * stored in HttpOnly auth cookies on the response — that's what makes
 * `requireUser` / `requireRole` work on subsequent server requests.
 *
 * Returns `{ id, email, name, role }`. Never returns the session tokens
 * (they're in the cookies).
 *
 * Failure cleanup: `signInWithPassword` **writes the session cookie
 * before we know whether the user has a profile**. Every path after that
 * call must either return success or explicitly `signOut()`. Leaving the
 * cookie behind produces a "logged in but every route 403s" state with
 * no obvious recovery.
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
    return NextResponse.json(
      { error: "Please enter a valid email address." },
      { status: 422 },
    );
  }

  const sb = await createSsrSupabase();

  // Network/transport failure surfaces as a thrown error (auth failures
  // come back in `.error` instead). 503 signals "try again" to the client.
  let signIn: Awaited<ReturnType<typeof sb.auth.signInWithPassword>>;
  try {
    signIn = await sb.auth.signInWithPassword({ email, password });
  } catch {
    return NextResponse.json(
      { error: "Sign-in is temporarily unavailable. Please try again." },
      { status: 503 },
    );
  }

  const { data, error } = signIn;
  if (error || !data.user) {
    // Deliberately vague — do not confirm whether the email exists.
    return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
  }

  // The session cookie is now set. Every failure below MUST sign the
  // user out, or they'll hold a live session with no role.
  try {
    const role = await getAppRoleOrBootstrapFirstAdmin(data.user);
    if (!role) {
      await sb.auth.signOut().catch(() => { /* best effort */ });
      return NextResponse.json(
        { error: "Your account is not set up. Ask an admin to grant access." },
        { status: 403 },
      );
    }

    const name =
      (data.user.user_metadata?.name as string | undefined)?.trim() ||
      data.user.email?.split("@")[0] ||
      "";

    return NextResponse.json({
      id: data.user.id,
      email: data.user.email,
      name,
      role,
    });
  } catch (e) {
    // Role lookup blew up (RPC missing, DB unreachable, etc.). Sign out
    // so the client isn't stuck in "authenticated but roleless" state.
    await sb.auth.signOut().catch(() => { /* best effort */ });
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Login failed." },
      { status: 500 },
    );
  }
}