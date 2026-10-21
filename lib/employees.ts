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

export function normalizeEmployee(raw: EmployeeFormData): EmployeeFormData {
  const s = (v: unknown) => String(v ?? "").trim();
  const salaryRaw = s(raw.salary);
  return {
    employeeCode: s(raw.employeeCode).toUpperCase(),
    firstName: s(raw.firstName),
    lastName: s(raw.lastName),
    email: s(raw.email).toLowerCase(),
    phone: s(raw.phone),
    department: s(raw.department),
    jobTitle: s(raw.jobTitle),
    role: raw.role,
    status: raw.status,
    hireDate: s(raw.hireDate),
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