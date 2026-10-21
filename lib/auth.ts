// lib/auth.ts
import { NextResponse } from "next/server";
import { createSsrSupabase } from "./supabase/ssr";
import { createAdminSupabase } from "./supabase/admin";
import { HttpError } from "./server/errors";
import { getPermissions } from "./server/db";
import type { Feature, Role, Settings } from "./types";

/**
 * Reads the current Supabase auth user from cookies.
 * Returns `{ user, response: null }` on success, `{ user: null, response }`
 * with a 401 on failure.
 */
export async function requireUser() {
  const sb = await createSsrSupabase();
  const { data: { user } } = await sb.auth.getUser();

  if (!user) {
    return {
      user: null,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    } as const;
  }
  return { user, response: null } as const;
}

/**
 * App role: `app_users` matched by auth id, then by email (case-insensitive).
 * Writes always go through `toAppUserRow`, which lower-cases email, so `eq`
 * on the lower-cased input is correct and uses the index.
 *
 * Throws `HttpError(500)` on a DB failure — a broken role lookup must not be
 * reported as a 403 (which would hide an infra problem as an auth problem).
 */
export async function getAppRole(
  user: { id: string; email?: string | null },
): Promise<Role | null> {
  const sb = createAdminSupabase();

  const byId = await sb
    .from("app_users").select("role").eq("id", user.id).maybeSingle();
  if (byId.error) throw new HttpError(500, `Role lookup failed: ${byId.error.message}`);
  if (byId.data) return byId.data.role as Role;

  if (user.email) {
    const byEmail = await sb
      .from("app_users").select("role")
      .eq("email", user.email.trim().toLowerCase())
      .maybeSingle();
    if (byEmail.error) throw new HttpError(500, `Role lookup failed: ${byEmail.error.message}`);
    if (byEmail.data) return byEmail.data.role as Role;
  }
  return null;
}

/**
 * Like `requireUser`, but also requires one of the given roles.
 * Returns 401 (no session), 403 (wrong role), or 500 (lookup failed).
 */
export async function requireRole(...allowed: Role[]) {
  const auth = await requireUser();
  if (!auth.user) return auth;

  let role: Role | null;
  try {
    role = await getAppRole(auth.user);
  } catch (e) {
    return {
      user: null,
      response: NextResponse.json(
        { error: e instanceof Error ? e.message : "Auth unavailable" },
        { status: 500 },
      ),
    } as const;
  }

  if (!role || !allowed.includes(role)) {
    return {
      user: null,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    } as const;
  }
  return { user: auth.user, role, response: null } as const;
}

/**
 * Requires that the signed-in user's role is granted **at least one** of
 * the given features (per `settings.permissions`, merged with defaults).
 *
 * Status codes:
 *   - 401  no session
 *   - 403  no `app_users` row, or none of the features enabled
 *   - 500  DB failure while resolving role or permissions
 *          (not 403 — infra problems must not look like auth problems)
 *
 * Admin is always allowed (permissions.Admin is forced on in
 * `mergePermissions`), so the settings read is skipped for Admin.
 *
 * This is the server-authoritative counterpart to the client's `can()`.
 */
export async function requireFeature(...features: Feature[]) {
  const auth = await requireUser();
  if (!auth.user) return auth;

  let role: Role | null;
  try {
    role = await getAppRole(auth.user);
  } catch (e) {
    return {
      user: null,
      response: NextResponse.json(
        { error: e instanceof Error ? e.message : "Auth unavailable" },
        { status: 500 },
      ),
    } as const;
  }

  if (!role) {
    return {
      user: null,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    } as const;
  }

  // Admin is always on. Skip the settings read entirely.
  if (role === "Admin") {
    return { user: auth.user, role, response: null } as const;
  }

  let effective: Settings["permissions"];
  try {
    effective = await getPermissions();
  } catch {
    return {
      user: null,
      response: NextResponse.json({ error: "Auth unavailable" }, { status: 500 }),
    } as const;
  }

  const rolePerms = effective[role] ?? {};
  const allowed = features.some((f) => rolePerms[f] === true);

  if (!allowed) {
    return {
      user: null,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    } as const;
  }
  return { user: auth.user, role, response: null } as const;
}