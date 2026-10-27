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
 *
 * Writable fields:
 *   - `companyName`, `adminName`  — non-empty strings
 *   - `currency`                  — 3-letter uppercase code
 *   - `defaultThreshold`          — non-negative integer
 *   - `{ role, feature, value }`  — toggle one permission for a non-Admin role
 *
 * Not writable here:
 *   - `users`       — managed via `/api/users`
 *   - `currentRole` — per-user preview state, not a global setting
 *   - `permissions` as a whole — only single toggles via `{ role, feature, value }`
 *
 * Admin permissions cannot be toggled: `mergePermissions` forces them to
 * `true` unconditionally, so a "disable Admin" request is a silent no-op.
 * Reject explicitly so the client doesn't think it worked.
 */
async function patchSettings(req: Request) {
  const auth = await requireFeature("settings");
  if (!auth.user) return auth.response;

  let raw: unknown;
  try { raw = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const body = raw as Record<string, unknown>;

  if (body.currentRole !== undefined) {
    return NextResponse.json(
      { error: "currentRole is not writable via settings." },
      { status: 422 },
    );
  }

  // ── Text fields ──────────────────────────────────────────────────────
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : undefined);
  const companyName = str(body.companyName);
  const adminName   = str(body.adminName);
  const currency    = str(body.currency)?.toUpperCase();

  if (companyName === "" || adminName === "") {
    return NextResponse.json({ error: "Names cannot be empty." }, { status: 422 });
  }
  if (currency !== undefined && !/^[A-Z]{3}$/.test(currency)) {
    return NextResponse.json({ error: "Currency must be a 3-letter code." }, { status: 422 });
  }

  // ── defaultThreshold ─────────────────────────────────────────────────
  // Accepts a JSON number or a numeric string (some clients send form data
  // as strings). Rejects non-numeric, negative, or fractional values —
  // silent coercion to 0 hides typos.
  let defaultThreshold: number | undefined;
  if (body.defaultThreshold !== undefined) {
    const rawDt = body.defaultThreshold;
    const n =
      typeof rawDt === "number" ? rawDt :
      typeof rawDt === "string" && rawDt.trim() ? Number(rawDt) :
      Number.NaN;
    if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
      return NextResponse.json(
        { error: "defaultThreshold must be a non-negative integer." },
        { status: 422 },
      );
    }
    defaultThreshold = n;
  }

  // ── Permission toggle ────────────────────────────────────────────────
  // All three of {role, feature, value} must be present together, or none.
  const anyToggleField =
    body.role !== undefined || body.feature !== undefined || body.value !== undefined;
  let toggle: { role: Role; feature: Feature; value: boolean } | undefined;
  if (anyToggleField) {
    if (body.role === undefined || body.feature === undefined || body.value === undefined) {
      return NextResponse.json(
        { error: "A permission toggle requires role, feature, and value together." },
        { status: 422 },
      );
    }
    if (typeof body.role !== "string" || !ROLES.includes(body.role as Role)) {
      return NextResponse.json({ error: "Unknown role." }, { status: 422 });
    }
    if (typeof body.feature !== "string" || !FEATURES.some((f) => f.key === body.feature)) {
      return NextResponse.json({ error: "Unknown feature." }, { status: 422 });
    }
    if (typeof body.value !== "boolean") {
      return NextResponse.json(
        { error: "value must be true or false." },
        { status: 422 },
      );
    }
    if (body.role === "Admin") {
      // `mergePermissions` forces all Admin features to `true`; a "disable
      // Admin" write would be silently ignored. Reject instead.
      return NextResponse.json(
        { error: "Admin permissions are always enabled and cannot be toggled." },
        { status: 422 },
      );
    }
    toggle = {
      role: body.role as Role,
      feature: body.feature as Feature,
      value: body.value,
    };
  }

  try {
    const current = await getSettings();
    const next: Settings = { ...current };

    if (companyName) next.companyName = companyName;
    if (adminName)   next.adminName   = adminName;
    if (currency)    next.currency    = currency;
    if (defaultThreshold !== undefined) next.defaultThreshold = defaultThreshold;

    if (toggle) {
      // Deep-copy the branch instead of mutating `current.permissions`
      // through the shared reference from the shallow spread.
      next.permissions = {
        ...current.permissions,
        [toggle.role]: {
          ...current.permissions[toggle.role],
          [toggle.feature]: toggle.value,
        },
      };
    }

    return NextResponse.json(await saveSettings(next));
  } catch (e) {
    return toErrorResponse(e);
  }
}

export const PATCH = patchSettings;
/** PUT is accepted for compatibility but follows the same rules as PATCH. */
export const PUT = patchSettings;