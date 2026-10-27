// app/api/users/route.ts
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import {
  appUserEmailExists, insertAppUser, listAppUsers,
} from "@/lib/server/db";
import { toErrorResponse } from "@/lib/server/errors";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { ROLES, type AppUser, type Role } from "@/lib/types";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Lists every profile. Admin-only.
 *
 * `requireRole("Admin")`, not `requireFeature("settings")`: user
 * management can create Admin accounts, which makes the feature gate
 * a privilege-escalation path the day `settings` is granted to Manager.
 * Settings patches (`PATCH /api/settings`) stay feature-gated — that's
 * the safe level for non-admins.
 */
export async function GET() {
  const auth = await requireRole("Admin");
  if (!auth.user) return auth.response;
  try {
    return NextResponse.json(await listAppUsers());
  } catch (e) {
    return toErrorResponse(e);
  }
}

export async function POST(req: Request) {
  const auth = await requireRole("Admin");
  if (!auth.user) return auth.response;

  let raw: unknown;
  try { raw = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const body = raw as Record<string, unknown>;

  const name     = typeof body.name     === "string" ? body.name.trim()         : "";
  const email    = typeof body.email    === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password             : "";

  // `role` defaults to Staff when absent, but any explicitly-provided
  // value must be a string from ROLES — not silently cast.
  let role: Role = "Staff";
  if (body.role !== undefined) {
    if (typeof body.role !== "string" || !ROLES.includes(body.role as Role)) {
      return NextResponse.json({ error: "Invalid role." }, { status: 422 });
    }
    role = body.role as Role;
  }

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

  // Fast-path duplicate check. `createUser` below enforces email
  // uniqueness again at the auth layer, so a race here loses a nicer
  // error message but not correctness.
  try {
    if (await appUserEmailExists(email)) {
      return NextResponse.json({ error: "That email already exists." }, { status: 409 });
    }
  } catch (e) {
    return toErrorResponse(e);
  }

  // 1) Create the auth user (without this, no login).
  let admin: ReturnType<typeof createAdminSupabase>;
  try {
    admin = createAdminSupabase();
  } catch {
    return NextResponse.json({ error: "Server misconfigured." }, { status: 500 });
  }

  let userId: string;
  try {
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name },
    });
    if (createErr || !created?.user) {
      // Map the "already exists" case to 409 instead of leaking the raw
      // auth-service message (which can include internal API details).
      const msg = (createErr?.message ?? "").toLowerCase();
      if (msg.includes("already") && msg.includes("email")) {
        return NextResponse.json({ error: "That email already exists." }, { status: 409 });
      }
      return NextResponse.json(
        { error: "Could not create the account. Check the email and password." },
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

  // 2) Insert the profiles row. Roll back the auth user if this fails,
  //    or we leave an account that can log in but 403s on every route.
  const user: AppUser = { id: userId, name, email, role };
  try {
    return NextResponse.json(await insertAppUser(user), { status: 201 });
  } catch (e) {
    try {
      const { error: delErr } = await admin.auth.admin.deleteUser(userId);
      if (delErr) {
        console.error(
          `[users] ORPHANED AUTH USER id=${userId} email=${email} — deleteUser failed: ${delErr.message}`,
        );
      }
    } catch (delE) {
      console.error(
        `[users] ORPHANED AUTH USER id=${userId} email=${email} — deleteUser threw:`,
        delE,
      );
    }
    return toErrorResponse(e);
  }
}