import { NextResponse } from "next/server";
import { mutate, readDb } from "@/lib/server/db";
import { FEATURES, ROLES, type Feature, type Role } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json((await readDb()).settings);
}

export async function PATCH(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

  const updated = await mutate((d) => {
    const s = d.settings;

    if (typeof body.companyName === "string") s.companyName = body.companyName;
    if (typeof body.adminName === "string") s.adminName = body.adminName;
    if (typeof body.currency === "string") s.currency = body.currency;
    if (body.defaultThreshold !== undefined) {
      s.defaultThreshold = Math.max(0, Math.floor(Number(body.defaultThreshold) || 0));
    }
    if (ROLES.includes(body.currentRole)) s.currentRole = body.currentRole as Role;

    // Single permission toggle: { role: "Manager", feature: "reports", value: true }
    if (body.role && body.feature) {
      const r = body.role as Role;
      const f = body.feature as Feature;
      if (ROLES.includes(r) && FEATURES.some((x) => x.key === f) && r !== "Admin") {
        s.permissions[r][f] = !!body.value;
      }
    }
    return s;
  });

  return NextResponse.json(updated);
}

/** PUT accepts a full settings object and replaces it. */
export async function PUT(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  const updated = await mutate((d) => {
    d.settings = { ...d.settings, ...body };
    return d.settings;
  });
  return NextResponse.json(updated);
}