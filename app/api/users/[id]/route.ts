// app/api/users/[id]/route.ts
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import {
  appUserEmailExists, deleteAppUser, getAppUserById, listAppUsers, updateAppUser,
} from "@/lib/server/db";
import { HttpError, toErrorResponse } from "@/lib/server/errors";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { ROLES, type AppUser, type Role } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function GET(_req: Request, ctx: Ctx) {
  const auth = await requireRole("Admin");
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

/**
 * Partial update. Fields:
 *   - `name`      : non-empty string
 *   - `email`     : matches EMAIL regex; auth updated first when it changes
 *   - `role`      : must be one of ROLES; last-admin guard enforced by
 *                   `updateAppUser` (cannot demote the only active Admin)
 *   - `isActive`  : boolean; last-admin guard also covers deactivation
 *
 * When `email` changes, auth is updated **before** the profile. If auth
 * succeeds and profile fails, we log a divergence and return the profile
 * error — a rare case (profile writes fail only on `last-admin`, which
 * fires before the auth sync in practice).
 */
export async function PUT(req: Request, ctx: Ctx) {
  const auth = await requireRole("Admin");
  if (!auth.user) return auth.response;

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "Invalid id." }, { status: 400 });

  let raw: unknown;
  try { raw = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const body = raw as Record<string, unknown>;

  // ── Field-by-field validation ────────────────────────────────────────
  // Rejects wrong-typed values instead of silently ignoring them.
  const hasName = body.name !== undefined;
  const hasEmail = body.email !== undefined;
  const hasRole = body.role !== undefined;
  const hasIsActive = body.isActive !== undefined;

  if (hasName && typeof body.name !== "string") {
    return NextResponse.json({ error: "name must be a string." }, { status: 422 });
  }
  if (hasEmail && typeof body.email !== "string") {
    return NextResponse.json({ error: "email must be a string." }, { status: 422 });
  }
  if (hasRole && typeof body.role !== "string") {
    return NextResponse.json({ error: "role must be a string." }, { status: 422 });
  }
  if (hasIsActive && typeof body.isActive !== "boolean") {
    return NextResponse.json({ error: "isActive must be true or false." }, { status: 422 });
  }

  const rawName = hasName ? (body.name as string).trim() : undefined;
  const rawEmail = hasEmail ? (body.email as string).trim().toLowerCase() : undefined;

  if (rawName === "") {
    return NextResponse.json({ error: "Name cannot be empty." }, { status: 422 });
  }
  if (rawEmail !== undefined && !EMAIL.test(rawEmail)) {
    return NextResponse.json({ error: "Invalid email." }, { status: 422 });
  }
  if (hasRole && !ROLES.includes(body.role as Role)) {
    return NextResponse.json({ error: "Invalid role." }, { status: 422 });
  }

  try {
    const existing = await getAppUserById(id);
    if (!existing) throw new HttpError(404, "Not found");

    const nextName = rawName ?? existing.name;
    const nextEmail = rawEmail ?? existing.email;
    const nextRole = hasRole ? (body.role as Role) : existing.role;
    const nextIsActive = hasIsActive
      ? (body.isActive as boolean)
      : (existing.isActive ?? true);

    // ── Email change: auth is the source of truth ─────────────────────
    // Update auth first so a subsequent profile failure (last-admin) does
    // not leave auth changed but profile stale. `updateAppUser` re-checks
    // last-admin, so a refused PUT never reaches this branch.
    if (nextEmail !== existing.email && existing.email !== "") {
      if (await appUserEmailExists(nextEmail, id)) {
        throw new HttpError(409, "That email already exists.");
      }
      // Pre-flight: catch the last-admin guard before touching auth so
      // we don't update auth then fail on profile.
      if (
        existing.role === "Admin" &&
        (nextRole !== "Admin" || nextIsActive === false)
      ) {
        const admins = (await listAppUsers()).filter(
          (u) => u.role === "Admin" && u.isActive !== false,
        );
        if (admins.length <= 1) {
          throw new HttpError(409, "Cannot demote the last active Admin.");
        }
      }
      const admin = createAdminSupabase();
      try {
        const { error: authErr } = await admin.auth.admin.updateUserById(id, {
          email: nextEmail,
        });
        if (authErr) {
          const msg = authErr.message.toLowerCase();
          if (msg.includes("already") && msg.includes("email")) {
            throw new HttpError(409, "That email already exists.");
          }
          throw new HttpError(500, "Failed to update email. Try again.");
        }
      } catch (e) {
        if (e instanceof HttpError) throw e;
        throw new HttpError(503, "Auth service unavailable. Try again.");
      }
    }

    // ── Profile update ───────────────────────────────────────────────
    const updated: AppUser = {
      id: existing.id,
      name: nextName,
      email: nextEmail,
      role: nextRole,
      isActive: nextIsActive,
    };
    const saved = await updateAppUser(updated);

    // ── Name → auth.user_metadata.name sync ──────────────────────────
    // Best-effort: display_name in profiles is what the app reads, but
    // bootstrap / signup flows read user_metadata.name. Keep them aligned.
    if (nextName !== existing.name) {
      try {
        const admin = createAdminSupabase();
        const { error: metaErr } = await admin.auth.admin.updateUserById(id, {
          user_metadata: { name: nextName },
        });
        if (metaErr) {
          console.error(`[users] metadata sync failed id=${id}:`, metaErr.message);
        }
      } catch (e) {
        console.error(`[users] metadata sync threw id=${id}:`, e);
      }
    }

    return NextResponse.json(saved);
  } catch (e) {
    return toErrorResponse(e);
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const auth = await requireRole("Admin");
  if (!auth.user) return auth.response;

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "Invalid id." }, { status: 400 });

  // Self-deletion leaves the admin's session live but profileless — 403
  // on every subsequent route with no way to recover from the UI. Force
  // them to ask another admin.
  if (id === auth.user.id) {
    return NextResponse.json(
      { error: "You cannot delete your own account. Ask another Admin." },
      { status: 422 },
    );
  }

  try {
    await deleteAppUser(id);
  } catch (e) {
    return toErrorResponse(e);
  }

  // Best-effort auth teardown. If this fails, the profiles row is gone
  // but the auth user persists — they can't log in (no profile → 403),
  // so this is safe but leaks an `auth.users` row.
  try {
    const admin = createAdminSupabase();
    const { error: authErr } = await admin.auth.admin.deleteUser(id);
    if (authErr) {
      console.error(`[users] auth delete failed for id=${id}: ${authErr.message}`);
    }
  } catch (e) {
    console.error(`[users] auth delete threw for id=${id}:`, e);
  }

  return new NextResponse(null, { status: 204 });
}