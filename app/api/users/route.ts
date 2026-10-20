import { NextResponse } from "next/server";
import { requireRole, requireUser } from "@/lib/auth";
import { mutate, readDb } from "@/lib/server/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { ROLES, type AppUser, type Role } from "@/lib/types";

export const dynamic = "force-dynamic";

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export async function GET() {
  const auth = await requireUser();
  if (!auth.user) return auth.response;
  return NextResponse.json((await readDb()).settings.users);
}

export async function POST(req: Request) {
  const auth = await requireRole("Admin");
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
  if (!email.includes("@")) {
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

  const db = await readDb();
  if (db.settings.users.some((u) => u.email.toLowerCase() === email)) {
    return NextResponse.json({ error: "That email already exists." }, { status: 409 });
  }

  // 1) Create the Supabase auth user — without this they can't log in.
  const admin = createServerSupabase();
  const { data: authUser, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name },
  });
  if (createErr) {
    return NextResponse.json({ error: createErr.message }, { status: 400 });
  }

  // 2) Insert into app_users.
  const { error: appUserErr } = await admin.from("app_users").insert({
    id: authUser.user.id,
    name,
    email,
    role,
  });
  if (appUserErr) {
    await admin.auth.admin.deleteUser(authUser.user.id);
    return NextResponse.json({ error: appUserErr.message }, { status: 500 });
  }

  // 3) Mirror into settings.users so existing GET + UI keep working.
  const user: AppUser = { id: authUser.user.id, name, email, role };
  try {
    await mutate((d) => {
      if (!d.settings.users.some((u) => u.id === user.id)) d.settings.users.push(user);
    });
  } catch (e) {
    await admin.from("app_users").delete().eq("id", authUser.user.id);
    await admin.auth.admin.deleteUser(authUser.user.id);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not persist user." },
      { status: 500 },
    );
  }

  return NextResponse.json(user, { status: 201 });
}