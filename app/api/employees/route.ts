// app/api/employees/route.ts
import { NextResponse } from "next/server";
import { requireFeature } from "@/lib/auth";
import {
  createEmployeeRow, employeeCodeExists, employeeEmailExists, listAllEmployees,
} from "@/lib/server/db";
import { toErrorResponse } from "@/lib/server/errors";
import { normalizeEmployee, validateEmployeeFields } from "@/lib/employees";

/**
 * Employees hold PII (salary, phone). Feature-gated by `requireFeature`.
 *
 * GET uses `listAllEmployees()` — one indexed SELECT — instead of
 * `readDb().employees`, which would trigger 5 extra SELECTs and a
 * `auth.admin.listUsers` call for data the caller never asked for.
 */
export async function GET() {
  const auth = await requireFeature("employees");
  if (!auth.user) return auth.response;
  try {
    return NextResponse.json(await listAllEmployees());
  } catch (e) {
    return toErrorResponse(e);
  }
}

export async function POST(req: Request) {
  const auth = await requireFeature("employees");
  if (!auth.user) return auth.response;

  // Parse as `unknown` — the JSON body is untrusted. `normalizeEmployee`
  // string-coerces every field, so a `{"role": 123}` or a null survives
  // to `validateEmployeeFields`, which returns a clean 400. Nothing
  // reaches the DB until both steps pass.
  let raw: unknown;
  try { raw = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 }); }

  const data = normalizeEmployee(raw);
  const problem = validateEmployeeFields(data);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  try {
    // Application-level uniqueness. See the doc comment on
    // `employeeCodeExists` in `lib/server/db.ts` for why this is not
    // DB-enforced (missing UNIQUE constraints in schema.sql).
    if (await employeeCodeExists(data.employeeCode)) {
      return NextResponse.json(
        { error: "This employee ID is already in use." },
        { status: 409 },
      );
    }
    if (await employeeEmailExists(data.email)) {
      return NextResponse.json(
        { error: "This email address is already registered." },
        { status: 409 },
      );
    }

    return NextResponse.json(await createEmployeeRow(data), { status: 201 });
  } catch (e) {
    return toErrorResponse(e);
  }
}