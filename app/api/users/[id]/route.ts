import { NextResponse } from "next/server";
import { requireRole, requireUser } from "@/lib/auth";
import { mutate, readDb } from "@/lib/server/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { HttpError, toErrorResponse } from "@/lib/server/errors";
import { ROLES, type Role } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v.trim() : undefined;
}

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: Ctx) {
  const auth = await requireUser();
  if (!auth.user) return auth.response;
  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "Invalid id." }, { status: 400 });
  const user = (await readDb()).settings.users.find((u) => u.id === id);
  return user
    ? NextResponse.json(user)
    : NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function PUT(req: Request, ctx: Ctx) {
  const auth = await requireRole("Admin");
  if (!auth.user) return auth.response;
  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "Invalid id." }, { status: 400 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const rawName = str(body.name);
  const rawEmail = str(body.email)?.toLowerCase();
  const rawRole = body.role;

  if (rawName === "") {
    return NextResponse.json({ error: "Name cannot be empty." }, { status: 422 });
  }
  if (rawEmail !== undefined && (!rawEmail || !rawEmail.includes("@"))) {
    return NextResponse.json({ error: "Invalid email." }, { status: 422 });
  }
  if (rawRole !== undefined && !ROLES.includes(rawRole as Role)) {
    return NextResponse.json({ error: "Invalid role." }, { status: 422 });
  }

  try {
    const updated = await mutate((d) => {
      const existing = d.settings.users.find((u) => u.id === id);
      if (!existing) throw new HttpError(404, "Not found");

      const nextName = rawName ?? existing.name;
      const nextEmail = rawEmail ?? existing.email;
      const nextRole = (rawRole as Role | undefined) ?? existing.role;

      if (
        d.settings.users.some(
          (u) => u.id !== id && u.email.toLowerCase() === nextEmail,
        )
      ) {
        throw new HttpError(409, "That email already exists.");
      }
      if (existing.role === "Admin" && nextRole !== "Admin") {
        const admins = d.settings.users.filter((u) => u.role === "Admin").length;
        if (admins <= 1) throw new HttpError(409, "At least one Admin is required.");
      }

      existing.name = nextName;
      existing.email = nextEmail;
      existing.role = nextRole;
      return { ...existing };
    });

    // Best-effort mirror into app_users. settings.users stays authoritative.
    const admin = createServerSupabase();
    const { error: syncErr } = await admin
      .from("app_users")
      .update({ name: updated.name, email: updated.email, role: updated.role })
      .eq("id", id);
    if (syncErr) console.error("[users] app_users sync failed:", syncErr);

    return NextResponse.json(updated);
  } catch (e) {
    return toErrorResponse(e);
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const auth = await requireRole("Admin");
  if (!auth.user) return auth.response;
  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "Invalid id." }, { status: 400 });

  try {
    await mutate((d) => {
      const target = d.settings.users.find((u) => u.id === id);
      if (!target) throw new HttpError(404, "Not found");
      if (target.role === "Admin") {
        const admins = d.settings.users.filter((u) => u.role === "Admin").length;
        if (admins <= 1) throw new HttpError(409, "At least one Admin is required.");
      }
      d.settings.users = d.settings.users.filter((u) => u.id !== id);
    });
  } catch (e) {
    return toErrorResponse(e);
  }

  // Tear down auth + app_users. If these fail the account stays usable —
  // log loudly so the operator can clean up out-of-band.
  const admin = createServerSupabase();
  const { error: appErr } = await admin.from("app_users").delete().eq("id", id);
  if (appErr) console.error("[users] app_users delete failed:", appErr);
  const { error: authErr } = await admin.auth.admin.deleteUser(id);
  if (authErr) console.error("[users] auth delete failed:", authErr);

  return new NextResponse(null, { status: 204 });
}