import { NextResponse } from "next/server";
import { requireRole, requireUser } from "@/lib/auth";
import { mutate, readDb } from "@/lib/server/db";
import { FEATURES, ROLES, type Feature, type Role } from "@/lib/types";

export async function GET() {
  const auth = await requireUser();
  if (!auth.user) return auth.response;
  return NextResponse.json((await readDb()).settings);
}

/**
 * Admin only. Whitelisted fields only — `users` is managed via /api/users and
 * the Admin permission row can never be switched off.
 * Single permission toggle: { role: "Manager", feature: "reports", value: true }
 */
export async function PATCH(req: Request) {
  const auth = await requireRole("Admin");
  if (!auth.user) return auth.response;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object")
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

  const str = (v: unknown) => (typeof v === "string" ? v.trim() : undefined);
  const companyName = str(body.companyName);
  const adminName = str(body.adminName);
  const currency = str(body.currency)?.toUpperCase();

  if (companyName === "" || adminName === "")
    return NextResponse.json({ error: "Names cannot be empty." }, { status: 422 });
  if (currency !== undefined && !/^[A-Z]{3}$/.test(currency))
    return NextResponse.json({ error: "Currency must be a 3-letter code." }, { status: 422 });
  if (body.currentRole !== undefined && !ROLES.includes(body.currentRole))
    return NextResponse.json({ error: "Invalid role." }, { status: 422 });

  const toggling = body.role !== undefined || body.feature !== undefined;
  if (toggling && (!ROLES.includes(body.role) || !FEATURES.some((f) => f.key === body.feature)))
    return NextResponse.json({ error: "Invalid role or feature." }, { status: 422 });

  const updated = await mutate((d) => {
    const s = d.settings;
    if (companyName) s.companyName = companyName;
    if (adminName) s.adminName = adminName;
    if (currency) s.currency = currency;
    if (body.defaultThreshold !== undefined)
      s.defaultThreshold = Math.max(0, Math.floor(Number(body.defaultThreshold) || 0));
    if (body.currentRole !== undefined) s.currentRole = body.currentRole as Role;
    if (toggling && body.role !== "Admin")
      s.permissions[body.role as Role][body.feature as Feature] = !!body.value;
    return s;
  });

  return NextResponse.json(updated);
}

/** PUT is accepted for compatibility but follows the same rules as PATCH. */
export const PUT = PATCH;