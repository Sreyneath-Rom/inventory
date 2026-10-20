import { NextResponse } from "next/server";
import { createSsrSupabase } from "./supabase/ssr";
import { createServerSupabase } from "./supabase/server";
import type { Role } from "./types";

/**
 * Returns the current user or a 401 NextResponse.
 *   const auth = await requireUser();
 *   if (!auth.user) return auth.response;
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

/** App role of a signed-in user: app_users matched by auth id, then by email. */
export async function getAppRole(user: { id: string; email?: string | null }): Promise<Role | null> {
  const sb = createServerSupabase();
  const byId = await sb.from("app_users").select("role").eq("id", user.id).maybeSingle();
  if (byId.data) return byId.data.role as Role;
  if (user.email) {
    const byEmail = await sb.from("app_users").select("role").eq("email", user.email.toLowerCase()).maybeSingle();
    if (byEmail.data) return byEmail.data.role as Role;
  }
  return null;
}

/**
 * Like requireUser, but also requires one of the given roles (401 / 403).
 *   const auth = await requireRole("Admin");
 *   if (!auth.user) return auth.response;
 */
export async function requireRole(...allowed: Role[]) {
  const auth = await requireUser();
  if (!auth.user) return auth;
  const role = await getAppRole(auth.user);
  if (!role || !allowed.includes(role)) {
    return {
      user: null,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    } as const;
  }
  return { user: auth.user, role, response: null } as const;
}