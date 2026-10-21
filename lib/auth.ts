// lib/auth.ts
import { NextResponse } from "next/server";
import { createSsrSupabase } from "./supabase/ssr";
import { createAdminSupabase } from "./supabase/admin";
import { HttpError } from "./server/errors";
import type { Role } from "./types";

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
 * Throws `HttpError` on a DB failure — a broken role lookup must not be
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