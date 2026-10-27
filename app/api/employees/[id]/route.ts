// app/api/employees/[id]/route.ts
import { NextResponse } from "next/server";
import { requireFeature } from "@/lib/auth";
import {
  deleteEmployeeRow, employeeCodeExists, employeeEmailExists,
  getEmployeeById, updateEmployeeRow,
} from "@/lib/server/db";
import { toErrorResponse } from "@/lib/server/errors";
import { normalizeEmployee, validateEmployeeFields } from "@/lib/employees";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const auth = await requireFeature("employees");
  if (!auth.user) return auth.response;

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "Invalid id." }, { status: 400 });

  try {
    const emp = await getEmployeeById(id);
    return emp
      ? NextResponse.json(emp)
      : NextResponse.json({ error: "Not found" }, { status: 404 });
  } catch (e) {
    return toErrorResponse(e);
  }
}

export async function PUT(req: Request, ctx: Ctx) {
  const auth = await requireFeature("employees");
  if (!auth.user) return auth.response;

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "Invalid id." }, { status: 400 });

  let raw: unknown;
  try { raw = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 }); }

  const data = normalizeEmployee(raw);
  const problem = validateEmployeeFields(data);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  try {
    // Exclude this record from the uniqueness check so editing an
    // unchanged employee_code / email doesn't 409 against itself.
    if (await employeeCodeExists(data.employeeCode, id)) {
      return NextResponse.json(
        { error: "This employee ID is already in use." },
        { status: 409 },
      );
    }
    if (await employeeEmailExists(data.email, id)) {
      return NextResponse.json(
        { error: "This email address is already registered." },
        { status: 409 },
      );
    }

    return NextResponse.json(await updateEmployeeRow({ id, ...data }));
  } catch (e) {
    return toErrorResponse(e);
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const auth = await requireFeature("employees");
  if (!auth.user) return auth.response;

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "Invalid id." }, { status: 400 });

  try {
    // Idempotent by REST convention: no 404 on missing id. `deleteEmployeeRow`
    // issues a plain DELETE; zero rows affected is fine.
    await deleteEmployeeRow(id);
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    return toErrorResponse(e);
  }
}