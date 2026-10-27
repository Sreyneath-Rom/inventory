// lib/employees.ts
import type { Employee, EmployeeFormData, EmployeeRole, EmployeeStatus } from "./types";

export const EMPLOYEE_ROLES: EmployeeRole[] = [
  "Admin", "Manager", "Inventory Staff", "Warehouse Staff", "Accountant", "Other",
];
export const EMPLOYEE_STATUSES: EmployeeStatus[] = ["Active", "On Leave", "Inactive"];
export const DEPARTMENTS = [
  "Management", "Inventory", "Warehouse", "Finance",
  "Human Resources", "Sales", "IT", "Other",
];

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Accepts untrusted JSON (`unknown`) and returns a shape whose string fields
 * are guaranteed trim'd, whose email is lowercased, and whose salary is a
 * finite number (NaN for blank). Every value is string-coerced first —
 * `{"name": 123}` becomes `"123"` and `{"salary": null}` becomes `NaN`
 * rather than crashing on `.trim()`.
 *
 * `role`/`status` are cast after coercion; `validateEmployeeFields` rejects
 * anything outside `EMPLOYEE_ROLES` / `EMPLOYEE_STATUSES` before the object
 * reaches the DB, so the cast is honest at runtime.
 */
export function normalizeEmployee(raw: unknown): EmployeeFormData {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const s = (v: unknown) => String(v ?? "").trim();
  const salaryRaw = s(r.salary);
  return {
    employeeCode: s(r.employeeCode).toUpperCase(),
    firstName: s(r.firstName),
    lastName: s(r.lastName),
    email: s(r.email).toLowerCase(),
    phone: s(r.phone),
    department: s(r.department),
    jobTitle: s(r.jobTitle),
    role: s(r.role) as EmployeeRole,
    status: s(r.status) as EmployeeStatus,
    hireDate: s(r.hireDate),
    // `Number("")` is 0 — a silent "valid" salary. Blank must be invalid.
    salary: salaryRaw === "" ? NaN : Number(salaryRaw),
  };
}

export function validateEmployeeFields(e: EmployeeFormData): string | null {
  if (!e.firstName || !e.lastName || !e.employeeCode || !e.email ||
      !e.department || !e.jobTitle || !e.hireDate)
    return "Please complete all required fields.";
  if (!EMAIL.test(e.email)) return "Please enter a valid email address.";
  if (!EMPLOYEE_ROLES.includes(e.role)) return "Invalid system role.";
  if (!EMPLOYEE_STATUSES.includes(e.status)) return "Invalid employment status.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.hireDate) || Number.isNaN(Date.parse(e.hireDate)))
    return "Hire date is not a valid date.";
  if (!Number.isFinite(e.salary) || e.salary < 0)
    return "Salary must be a valid non-negative number.";
  return null;
}

/**
 * @deprecated Superseded by `employeeCodeExists` / `employeeEmailExists` in
 * `lib/server/db.ts`, which query the DB directly (single indexed lookup)
 * instead of fetching the whole list. Kept so no external import breaks.
 */
export function findDuplicate(
  e: EmployeeFormData, list: Employee[], selfId?: string,
): string | null {
  const others = list.filter((x) => x.id !== selfId);
  if (others.some((x) => x.employeeCode.toLowerCase() === e.employeeCode.toLowerCase()))
    return "This employee ID is already in use.";
  if (others.some((x) => x.email.toLowerCase() === e.email.toLowerCase()))
    return "This email address is already registered.";
  return null;
}

export function nextEmployeeCode(list: Employee[]) {
  const nums = list.map((x) => Number(/^EMP-(\d+)$/i.exec(x.employeeCode)?.[1] ?? 0));
  return `EMP-${String(Math.max(0, ...nums) + 1).padStart(3, "0")}`;
}