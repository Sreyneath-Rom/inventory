// app/api/settings/route.ts
import { NextResponse } from "next/server";
import { requireFeature, requireUser } from "@/lib/auth";
import { getSettings, saveSettings } from "@/lib/server/db";
import { toErrorResponse } from "@/lib/server/errors";
import { FEATURES, ROLES, type Feature, type Role, type Settings } from "@/lib/types";

export async function GET() {
  const auth = await requireUser();
  if (!auth.user) return auth.response;
  try {
    return NextResponse.json(await getSettings());
  } catch (e) {
    return toErrorResponse(e);
  }
}

/**
 * Admin-only (via the `settings` feature — Admin is always on).
 * Whitelisted fields only. `users` is managed via /api/users.
 * `currentRole` is per-user display state, not a global setting, so it's
 * not writable here.
 */
async function patchSettings(req: Request) {
  const auth = await requireFeature("settings");
  if (!auth.user) return auth.response;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (body.currentRole !== undefined) {
    return NextResponse.json(
      { error: "currentRole is not writable via settings." },
      { status: 422 },
    );
  }

  const str = (v: unknown) => (typeof v === "string" ? v.trim() : undefined);
  const companyName = str(body.companyName);
  const adminName = str(body.adminName);
  const currency = str(body.currency)?.toUpperCase();

  if (companyName === "" || adminName === "") {
    return NextResponse.json({ error: "Names cannot be empty." }, { status: 422 });
  }
  if (currency !== undefined && !/^[A-Z]{3}$/.test(currency)) {
    return NextResponse.json({ error: "Currency must be a 3-letter code." }, { status: 422 });
  }

  const toggling = body.role !== undefined || body.feature !== undefined;
  if (
    toggling &&
    (!ROLES.includes(body.role as Role) || !FEATURES.some((f) => f.key === body.feature))
  ) {
    return NextResponse.json({ error: "Invalid role or feature." }, { status: 422 });
  }

  try {
    const current = await getSettings();
    const next: Settings = { ...current };

    if (companyName) next.companyName = companyName;
    if (adminName) next.adminName = adminName;
    if (currency) next.currency = currency;
    if (body.defaultThreshold !== undefined) {
      next.defaultThreshold = Math.max(0, Math.floor(Number(body.defaultThreshold) || 0));
    }
    if (toggling && body.role !== "Admin") {
      next.permissions[body.role as Role][body.feature as Feature] = !!body.value;
    }

    return NextResponse.json(await saveSettings(next));
  } catch (e) {
    return toErrorResponse(e);
  }
}

export const PATCH = patchSettings;
/** PUT is accepted for compatibility but follows the same rules as PATCH. */
export const PUT = patchSettings;