// app/api/employees/route.ts
import { NextResponse } from "next/server";
import { requireFeature } from "@/lib/auth";
import { createEmployeeRow, readDb } from "@/lib/server/db";
import { toErrorResponse } from "@/lib/server/errors";
import { normalizeEmployee, validateEmployeeFields } from "@/lib/employees";
import type { EmployeeFormData } from "@/lib/types";

/** Employees hold PII (salary, phone) — feature-gated. */
export async function GET() {
  const auth = await requireFeature("employees");
  if (!auth.user) return auth.response;
  try {
    return NextResponse.json((await readDb()).employees);
  } catch (e) {
    return toErrorResponse(e);
  }
}

export async function POST(req: Request) {
  const auth = await requireFeature("employees");
  if (!auth.user) return auth.response;

  let body: EmployeeFormData;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const data = normalizeEmployee(body);
  const problem = validateEmployeeFields(data);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  try {
    return NextResponse.json(await createEmployeeRow(data), { status: 201 });
  } catch (e) {
    return toErrorResponse(e);
  }
}