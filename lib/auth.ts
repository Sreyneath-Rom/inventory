// lib/auth.ts
import { NextResponse } from "next/server";
import { createSsrSupabase } from "./supabase/ssr";
import { createAdminSupabase } from "./supabase/admin";
import { HttpError, isHttpError } from "./server/errors";
import { bootstrapAdminIfFirstUser, getPermissions, toAppRole } from "./server/db";
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
 * Reads the app role from `public.profiles` — the table named `app_users`
 * in earlier drafts does **not** exist in schema.sql. `profiles.user_id`
 * is a strict FK to `auth.users.id`, so a single indexed lookup is enough.
 *
 * `is_active = false` resolves to `null` — a deactivated profile has no app
 * permissions (same effect as "no profile"), which keeps `requireRole` /
 * `requireFeature` returning 403 without needing a second query.
 *
 * Throws `HttpError(500)` on a DB failure — a broken role lookup must not be
 * reported as a 403 (which would hide an infra problem as an auth problem).
 */
export async function getAppRole(
  user: { id: string },
): Promise<Role | null> {
  const sb = createAdminSupabase();

  const { data, error } = await sb
    .from("profiles").select("role, is_active")
    .eq("user_id", user.id).maybeSingle();
  if (error) throw new HttpError(500, `Role lookup failed: ${error.message}`);
  if (!data) return null;

  const row = data as { role: string; is_active: boolean };
  if (row.is_active === false) return null;
  return toAppRole(row.role);
}

/**
 * Resolves an existing role or bootstraps this authenticated user as the
 * first Admin when `profiles` is empty. The DB RPC serialises concurrent
 * attempts and refuses bootstrap once any profile exists.
 *
 * ⚠ The RPC must be written against `public.profiles`, not `app_users`.
 */
export async function getAppRoleOrBootstrapFirstAdmin(
  user: {
    id: string;
    email?: string | null;
    user_metadata?: { name?: unknown };
  },
): Promise<Role | null> {
  const role = await getAppRole(user);
  if (role) return role;
  if (!user.email) return null;

  const name =
    (typeof user.user_metadata?.name === "string" && user.user_metadata.name.trim()) ||
    user.email.split("@")[0];

  try {
    return await bootstrapAdminIfFirstUser({
      id: user.id,
      name,
      email: user.email,
    });
  } catch (e) {
    if (isHttpError(e) && e.status === 403 && e.message.includes("Signup is closed")) {
      return null;
    }
    throw e;
  }
}

/**
 * Like `requireUser`, but also requires one of the given roles.
 * Returns 401 (no session), 403 (wrong role / no profile / inactive),
 * or 500 (lookup failed).
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
 *   - 403  no active profile, or none of the features enabled
 *   - 500  DB failure while resolving role or permissions
 *
 * Admin is always allowed (`mergePermissions` forces Admin features on), so
 * the settings read is skipped for Admin. Server-authoritative counterpart
 * to the client's `can()`.
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