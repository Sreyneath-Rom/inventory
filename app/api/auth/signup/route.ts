// app/api/auth/signup/route.ts
import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { bootstrapAdminIfFirstUser } from "@/lib/server/db";
import { isHttpError } from "@/lib/server/errors";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Bootstrap-only signup. First-ever account becomes Admin; every subsequent
 * call is rejected with 403 SIGNUP_CLOSED. After that, accounts are created
 * by an admin via POST /api/users.
 *
 * Atomic "first user wins" is enforced by
 * `bootstrap_admin_if_first_user(uuid, text, text)` (advisory-locked).
 *
 * The fast-path `profiles` count below avoids creating a transient auth
 * row for every closed-signup attempt (visible in Supabase audit logs and
 * cheap to prevent). The RPC still enforces "first user only" atomically —
 * the count is an optimisation, not the security boundary.
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
  const name     = typeof body.name     === "string" ? body.name.trim()        : "";

  if (!email || !password || !name) {
    return NextResponse.json(
      { error: "Name, email, and password are required." },
      { status: 422 },
    );
  }
  if (!EMAIL.test(email)) {
    return NextResponse.json({ error: "Please enter a valid email address." }, { status: 422 });
  }
  if (password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters." },
      { status: 422 },
    );
  }

  let admin: ReturnType<typeof createAdminSupabase>;
  try {
    admin = createAdminSupabase();
  } catch {
    // Env vars missing — surface as 500 without leaking the exact var.
    return NextResponse.json({ error: "Server misconfigured." }, { status: 500 });
  }

  // Fast-path reject before creating an auth user. The RPC below would
  // also reject, but by then the auth row already exists and has to be
  // deleted — noisy and slow.
  const { count, error: countErr } = await admin
    .from("profiles")
    .select("*", { count: "exact", head: true });
  if (countErr) {
    return NextResponse.json(
      { error: "Signup check failed. Try again." },
      { status: 500 },
    );
  }
  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { error: "Signup is closed. Ask an admin to create your account." },
      { status: 403 },
    );
  }

  // Auth-user creation can throw on network issues; the SDK returns
  // `{ error }` for logical failures but not for transport.
  let userId: string;
  try {
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name },
    });
    if (createErr || !created?.user) {
      return NextResponse.json(
        { error: createErr?.message ?? "Could not create user." },
        { status: 400 },
      );
    }
    userId = created.user.id;
  } catch {
    return NextResponse.json(
      { error: "Auth service unavailable. Try again." },
      { status: 503 },
    );
  }

  try {
    const role = await bootstrapAdminIfFirstUser({ id: userId, name, email });
    return NextResponse.json({ id: userId, email, name, role }, { status: 201 });
  } catch (e) {
    // Roll back the auth user so we don't leave an orphan that can log in
    // but has no profile (would 403 on every route).
    try {
      const { error: delErr } = await admin.auth.admin.deleteUser(userId);
      if (delErr) {
        console.error(
          `[signup] ORPHANED AUTH USER id=${userId} email=${email} — deleteUser failed: ${delErr.message}`,
        );
      }
    } catch (delE) {
      console.error(
        `[signup] ORPHANED AUTH USER id=${userId} email=${email} — deleteUser threw:`,
        delE,
      );
    }

    const status = isHttpError(e) ? e.status : 500;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Signup failed" },
      { status },
    );
  }
}