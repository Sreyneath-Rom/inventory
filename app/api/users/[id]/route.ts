// app/api/users/[id]/route.ts
import { NextResponse } from "next/server";
import { requireFeature } from "@/lib/auth";
import {
  appUserEmailExists, deleteAppUser, getAppUserById, updateAppUser,
} from "@/lib/server/db";
import { HttpError, toErrorResponse } from "@/lib/server/errors";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { ROLES, type AppUser, type Role } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v.trim() : undefined;
}

export async function GET(_req: Request, ctx: Ctx) {
  const auth = await requireFeature("settings");
  if (!auth.user) return auth.response;

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "Invalid id." }, { status: 400 });

  try {
    const user = await getAppUserById(id);
    return user
      ? NextResponse.json(user)
      : NextResponse.json({ error: "Not found" }, { status: 404 });
  } catch (e) {
    return toErrorResponse(e);
  }
}

export async function PUT(req: Request, ctx: Ctx) {
  const auth = await requireFeature("settings");
  if (!auth.user) return auth.response;

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "Invalid id." }, { status: 400 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const rawName = str(body.name);
  const rawEmail = str(body.email)?.toLowerCase();
  const rawRole = body.role as Role | undefined;

  if (rawName === "") {
    return NextResponse.json({ error: "Name cannot be empty." }, { status: 422 });
  }
  if (rawEmail !== undefined && !rawEmail.includes("@")) {
    return NextResponse.json({ error: "Invalid email." }, { status: 422 });
  }
  if (rawRole !== undefined && !ROLES.includes(rawRole)) {
    return NextResponse.json({ error: "Invalid role." }, { status: 422 });
  }

  try {
    const existing = await getAppUserById(id);
    if (!existing) throw new HttpError(404, "Not found");

    const nextName = rawName ?? existing.name;
    const nextEmail = rawEmail ?? existing.email;
    const nextRole = rawRole ?? existing.role;

    if (nextEmail !== existing.email && (await appUserEmailExists(nextEmail, id))) {
      throw new HttpError(409, "That email already exists.");
    }

    const updated: AppUser = {
      id: existing.id,
      name: nextName,
      email: nextEmail,
      role: nextRole,
    };
    const saved = await updateAppUser(updated);

    // Best-effort: keep Supabase auth in sync so email/name changes don't
    // lock the user out on next login.
    if (nextEmail !== existing.email || nextName !== existing.name) {
      const admin = createAdminSupabase();
      const { error: authErr } = await admin.auth.admin.updateUserById(id, {
        email: nextEmail,
        user_metadata: { name: nextName },
      });
      if (authErr) console.error(`[users] auth sync failed for id=${id}:`, authErr.message);
    }

    return NextResponse.json(saved);
  } catch (e) {
    return toErrorResponse(e);
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const auth = await requireFeature("settings");
  if (!auth.user) return auth.response;

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "Invalid id." }, { status: 400 });

  try {
    await deleteAppUser(id);
  } catch (e) {
    return toErrorResponse(e);
  }

  // Best-effort auth teardown. If this fails the app_users row is gone
  // but the auth user persists — they'll 403 on every route.
  const admin = createAdminSupabase();
  const { error: authErr } = await admin.auth.admin.deleteUser(id);
  if (authErr) {
    console.error(`[users] auth delete failed for id=${id}: ${authErr.message}`);
  }

  return new NextResponse(null, { status: 204 });
}