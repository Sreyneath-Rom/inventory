// app/api/db/route.ts
import { NextResponse } from "next/server";
import { getAppRole, requireRole, requireUser } from "@/lib/auth";
import { readDb, replaceDb } from "@/lib/server/db";
import { isHttpError } from "@/lib/server/errors";
import { createAdminSupabase } from "@/lib/supabase/admin";
import type { DB, Role } from "@/lib/types";

/** 5 MB. Well above any legitimate snapshot (real deployments are < 1 MB). */
const MAX_BODY_BYTES = 5_000_000;

/**
 * Returns the DB snapshot the caller is allowed to see:
 *   - `settings.users` is stripped for non-Admin callers (PII).
 *   - `settings.currentRole` is overwritten with the caller's **real** role,
 *     so the client's `can()` check matches what the server will enforce.
 *
 * Uses `getAppRole` — **not** `getAppRoleOrBootstrapFirstAdmin`. This is a
 * hot path (every page load calls `store.tsx → api.loadDb()`), so it must
 * never bootstrap: if `profiles` were ever emptied, any session holder
 * would silently become Admin. Bootstrap belongs on `/login` and `/signup`.
 *
 * Reading is `requireUser`; only the PUT (full snapshot replace) is Admin.
 */
export async function GET() {
  const auth = await requireUser();
  if (!auth.user) return auth.response;

  try {
    const role = await getAppRole(auth.user);
    if (!role) {
      return NextResponse.json(
        { error: "Your account is not set up. Ask an admin to grant access." },
        { status: 403 },
      );
    }

    const db = await readDb();
    if (role !== "Admin") db.settings.users = [];
    db.settings.currentRole = role;

    return NextResponse.json(db);
  } catch (e) {
    const status = isHttpError(e) ? e.status : 500;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Read failed" },
      { status },
    );
  }
}

/**
 * Full snapshot replace. Admin only — this wipes every data table.
 *
 * ⚠ Non-atomic: `replaceDb` issues DELETE then INSERT per table via the
 * Supabase JS client, which cannot `BEGIN`/`COMMIT`. A crash mid-run
 * leaves the DB empty. The pre-flight backup (below) is our only safety
 * net — restoring from it is manual. That's why validation rejects any
 * payload that would obviously fail at insert time (missing FKs, missing
 * required fields, invalid role enum) **before** the wipe starts.
 */
export async function PUT(req: Request) {
  const auth = await requireRole("Admin");
  if (!auth.user) return auth.response;

  // Reject oversized bodies before parsing — `replaceDb` cannot recover
  // from a mid-run OOM.
  const lenHeader = req.headers.get("content-length");
  if (lenHeader && Number(lenHeader) > MAX_BODY_BYTES) {
    return NextResponse.json(
      { error: `Payload too large (max ${MAX_BODY_BYTES / 1_000_000} MB).` },
      { status: 413 },
    );
  }

  let body: DB;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const problem = validateDbPayload(body);
  if (problem) return NextResponse.json({ error: problem }, { status: 422 });

  // Normalise: `employees` is optional in payloads for backward compat
  // with older seeds. `replaceDb` expects an array; default to empty.
  if (!Array.isArray(body.employees)) body.employees = [];

  // Pre-flight backup. Best-effort — if the upload fails we log and
  // continue, because refusing the PUT on backup failure would prevent
  // legitimate operations during a storage outage. The restore path is
  // manual, so operators still need object-level access to the bucket.
  //
  // ⚠ `db-backups` MUST be a **private** bucket. The payload includes
  // `settings.users[].email` (PII). A public bucket is a data breach.
  // Set a retention policy (Supabase → Storage → Policies); without one,
  // every PUT accumulates a forever-growing backup.
  try {
    const sb = createAdminSupabase();
    const backup = await readDb();
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const { error: bkErr } = await sb.storage
      .from("db-backups")
      .upload(`db-${stamp}.json`, JSON.stringify(backup), {
        contentType: "application/json",
        upsert: false,
      });
    if (bkErr) console.warn("[db] backup upload failed:", bkErr.message);
  } catch (bkErr) {
    console.warn("[db] backup read/upload failed:", bkErr);
  }

  try {
    await replaceDb(body);
    return NextResponse.json(await readDb());
  } catch (e) {
    const status = isHttpError(e) ? e.status : 500;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Write failed" },
      { status },
    );
  }
}

/* ─── Validation ─────────────────────────────────────────────────────── */

function isObj(x: unknown): x is Record<string, unknown> {
  return !!x && typeof x === "object" && !Array.isArray(x);
}

/**
 * Rejects any payload that would 500 (or half-wipe) inside `replaceDb`.
 *
 * The critical checks are the FK validations: `replaceDb` deletes
 * categories **before** inserting products, so a product with a missing
 * category would leave the DB with no categories *and* no products.
 * Catching that here means a bad payload is rejected before anything is
 * deleted.
 *
 * Intentionally does **not** re-check values the DB will enforce anyway
 * (email regex, numeric ranges). Those failures are recoverable — the
 * backup restores cleanly — and enforcing them here would duplicate the
 * schema. Only structural issues that trigger a mid-wipe crash are caught.
 */
function validateDbPayload(body: unknown): string | null {
  if (!isObj(body)) return "Body must be an object.";

  // Array-or-missing. `employees` is optional for legacy clients; the
  // route fills in `[]` if absent, so `undefined` here is fine.
  for (const key of ["categories", "products", "transactions", "employees"] as const) {
    const v = body[key];
    if (v !== undefined && !Array.isArray(v))
      return `"${key}" must be an array if provided.`;
  }
  if (!isObj(body.settings)) return `"settings" must be an object.`;
  const s = body.settings;
  if (!Array.isArray(s.users)) return `"settings.users" must be an array.`;

  // ── categories ──
  const cats = (body.categories as unknown[] | undefined) ?? [];
  for (const row of cats) {
    if (!isObj(row)) return "Each category must be an object.";
    if (typeof row.id !== "string" || !row.id)
      return "Category id must be a non-empty string.";
    if (typeof row.name !== "string" || !row.name.trim())
      return "Category name must be a non-empty string.";
    if (typeof row.color !== "string" || !/^#[0-9A-Fa-f]{6}$/.test(row.color))
      return "Category color must be a 6-digit hex code.";
  }
  const categoryIds = new Set(cats.map((c) => (c as { id: string }).id));

  // ── products (FK → categories) ──
  const prods = (body.products as unknown[] | undefined) ?? [];
  for (const row of prods) {
    if (!isObj(row)) return "Each product must be an object.";
    if (typeof row.id !== "string" || !row.id)
      return "Product id must be a non-empty string.";
    if (typeof row.sku !== "string" || !row.sku.trim())
      return "Product sku must be a non-empty string.";
    if (typeof row.name !== "string" || !row.name.trim())
      return "Product name must be a non-empty string.";
    if (typeof row.categoryId !== "string" || !row.categoryId)
      return "Product categoryId is required.";
    if (!categoryIds.has(row.categoryId))
      return `Product "${row.sku}" references unknown categoryId "${row.categoryId}".`;
    if (typeof row.unit !== "string" || !row.unit.trim())
      return "Product unit is required.";
    for (const f of ["cost", "price", "stock", "threshold"] as const) {
      const v = row[f];
      if (typeof v !== "number" || !Number.isFinite(v) || v < 0)
        return `Product ${f} must be a non-negative number.`;
    }
  }
  const productIds = new Set(prods.map((p) => (p as { id: string }).id));

  // ── transactions (FK → products) ──
  const txs = (body.transactions as unknown[] | undefined) ?? [];
  for (const row of txs) {
    if (!isObj(row)) return "Each transaction must be an object.";
    if (typeof row.id !== "string" || !row.id)
      return "Transaction id must be a non-empty string.";
    if (typeof row.ref !== "string" || !row.ref.trim())
      return "Transaction ref must be a non-empty string.";
    if (row.type !== "IN" && row.type !== "OUT")
      return `Transaction type must be "IN" or "OUT".`;
    if (typeof row.productId !== "string" || !productIds.has(row.productId))
      return `Transaction "${row.ref}" references unknown productId "${row.productId}".`;
    if (typeof row.productName !== "string" || !row.productName.trim())
      return "Transaction productName is required.";
    if (typeof row.qty !== "number" || !Number.isInteger(row.qty) || row.qty <= 0)
      return "Transaction qty must be a positive integer.";
    if (typeof row.date !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(row.date))
      return "Transaction date must be ISO-8601 (YYYY-MM-DD).";
  }

  // ── employees ──
  const emps = (body.employees as unknown[] | undefined) ?? [];
  for (const row of emps) {
    if (!isObj(row)) return "Each employee must be an object.";
    if (typeof row.id !== "string" || !row.id)
      return "Employee id must be a non-empty string.";
    for (const f of [
      "employeeCode", "firstName", "lastName", "email",
      "department", "jobTitle", "role", "status", "hireDate",
    ] as const) {
      const v = row[f];
      if (typeof v !== "string" || !v.trim())
        return `Employee ${f} is required.`;
    }
    if (typeof row.salary !== "number" || !Number.isFinite(row.salary) || row.salary < 0)
      return "Employee salary must be a non-negative number.";
  }

  // ── settings.users ──
  const users = s.users as unknown[];
  for (const row of users) {
    if (!isObj(row)) return "Each settings.users entry must be an object.";
    if (typeof row.id !== "string" || !row.id)
      return "User id must be a non-empty string.";
    if (typeof row.name !== "string")
      return "User name must be a string.";
    if (typeof row.email !== "string")
      return "User email must be a string.";
    if (row.role !== "Admin" && row.role !== "Manager" && row.role !== "Staff" && row.role !== "Viewer")
      return `User role must be one of Admin, Manager, Staff, Viewer.`;
  }

  // ── settings.currentRole ──
  // `toSettingsRow` throws on "Viewer" (schema CHECK excludes it). Catch
  // that here rather than after `replaceDb` has already wiped data tables.
  if (s.currentRole !== undefined && s.currentRole !== "Admin"
      && s.currentRole !== "Manager" && s.currentRole !== "Staff") {
    return `"settings.currentRole" must be Admin, Manager, or Staff.`;
  }

  // ── last-admin guard ──
  if (!(users as { role?: Role }[]).some((u) => u.role === "Admin"))
    return "At least one Admin must remain in settings.users.";

  return null;
}