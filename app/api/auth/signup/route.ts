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

  const admin = createAdminSupabase();

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

  const userId = created.user.id;

  try {
    const role = await bootstrapAdminIfFirstUser({ id: userId, name, email });
    return NextResponse.json({ id: userId, email, name, role }, { status: 201 });
  } catch (e) {
    // Roll back the auth user so we don't leave an orphan that can log in
    // but has no app_users row (would 403 on every route).
    const { error: delErr } = await admin.auth.admin.deleteUser(userId);
    if (delErr) {
      console.error(
        `[signup] ORPHANED AUTH USER id=${userId} email=${email} — deleteUser failed: ${delErr.message}`,
      );
    }

    const status = isHttpError(e) ? e.status : 500;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Signup failed" },
      { status },
    );
  }
}