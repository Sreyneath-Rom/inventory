// app/api/users/route.ts
import { NextResponse } from "next/server";
import { requireFeature } from "@/lib/auth";
import { appUserEmailExists, insertAppUser, readDb } from "@/lib/server/db";
import { toErrorResponse } from "@/lib/server/errors";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { ROLES, type AppUser, type Role } from "@/lib/types";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** Admin only — exposes every account's email. */
export async function GET() {
  const auth = await requireFeature("settings");
  if (!auth.user) return auth.response;
  try {
    return NextResponse.json((await readDb()).settings.users);
  } catch (e) {
    return toErrorResponse(e);
  }
}

export async function POST(req: Request) {
  const auth = await requireFeature("settings");
  if (!auth.user) return auth.response;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const name = str(body.name);
  const email = str(body.email).toLowerCase();
  const password = typeof body.password === "string" ? body.password : "";
  const role = ((body.role as Role | undefined) ?? "Staff");

  if (!name || !email) {
    return NextResponse.json({ error: "Name and email are required." }, { status: 422 });
  }
  if (!EMAIL.test(email)) {
    return NextResponse.json({ error: "Invalid email." }, { status: 422 });
  }
  if (password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters." },
      { status: 422 },
    );
  }
  if (!ROLES.includes(role)) {
    return NextResponse.json({ error: "Invalid role." }, { status: 422 });
  }

  try {
    if (await appUserEmailExists(email)) {
      return NextResponse.json({ error: "That email already exists." }, { status: 409 });
    }
  } catch (e) {
    return toErrorResponse(e);
  }

  // 1) Create the auth user — without this they can't log in.
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

  // 2) Insert into app_users (readDb reads from there directly).
  const user: AppUser = { id: userId, name, email, role };
  try {
    return NextResponse.json(await insertAppUser(user), { status: 201 });
  } catch (e) {
    const { error: delErr } = await admin.auth.admin.deleteUser(userId);
    if (delErr) {
      console.error(
        `[users] ORPHANED AUTH USER id=${userId} email=${email} — deleteUser failed: ${delErr.message}`,
      );
    }
    return toErrorResponse(e);
  }
}