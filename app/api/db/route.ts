import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { readDb, writeDb } from "@/lib/db-map";
import type { DB, Role } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  // Previously: any authenticated user. A full DB dump exposes every
  // user's email and every transaction. Admin only.
  const auth = await requireRole("Admin");
  if (!auth.user) return auth.response;

  const sb = createServerSupabase();
  try {
    return NextResponse.json(await readDb(sb));
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Read failed" },
      { status: 500 },
    );
  }
}

export async function PUT(req: Request) {
  const auth = await requireRole("Admin");
  if (!auth.user) return auth.response;
  const sb = createServerSupabase();

  let body: DB;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const problem = validateDbPayload(body);
  if (problem) return NextResponse.json({ error: problem }, { status: 422 });
  if (!Array.isArray(body.employees)) body.employees = [];

  try {
    // Snapshot before wiping. Best-effort: if the bucket doesn't exist
    // yet, log and proceed rather than refusing the PUT (the previous
    // behaviour was no backup at all).
    try {
      const backup = await readDb(sb);
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

    await writeDb(sb, body);
    console.info(
      `[db] PUT by user=${auth.user.id} role=${auth.user.role ?? "?"} at ${new Date().toISOString()}`,
    );
    return NextResponse.json(await readDb(sb));
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Write failed" },
      { status: 500 },
    );
  }
}

function validateDbPayload(body: unknown): string | null {
  if (!body || typeof body !== "object") return "Body must be an object.";
  const b = body as Record<string, unknown>;

  for (const key of ["categories", "products", "transactions"]) {
    if (!Array.isArray(b[key])) return `"${key}" must be an array.`;
  }
  if (!b.settings || typeof b.settings !== "object") return `"settings" must be an object.`;
  const s = b.settings as Record<string, unknown>;
  if (!Array.isArray(s.users)) return `"settings.users" must be an array.`;

  const checkIds = (arr: unknown[], label: string) => {
    for (const row of arr) {
      if (!row || typeof row !== "object" || typeof (row as { id?: unknown }).id !== "string") {
        return `Each entry in "${label}" must have a string id.`;
      }
    }
    return null;
  };

  for (const key of ["categories", "products", "transactions"]) {
    const err = checkIds(b[key] as unknown[], key);
    if (err) return err;
  }
  const usersErr = checkIds(s.users as unknown[], "settings.users");
  if (usersErr) return usersErr;

  // A full-DB PUT could otherwise wipe every Admin and lock everyone out.
  if (!(s.users as { role?: Role }[]).some((u) => u.role === "Admin")) {
    return "At least one Admin must remain in settings.users.";
  }

  return null;
}