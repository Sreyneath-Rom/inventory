"use client";

import { useMemo, useState, type FormEvent } from "react";
import {
  BriefcaseBusiness, Download, Mail, Pencil, Phone, Plus, Search, Trash2, UserRound, Users, Wallet,
} from "lucide-react";

import Card from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { Guard } from "@/components/ui/Guard";
import { Modal } from "@/components/ui/Modal";
import { Field } from "@/components/ui/Field";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";

import { useStore } from "@/lib/store";
import { download, toCSV } from "@/lib/csv";
import { money, fmtDate } from "@/lib/utils";
import {
  DEPARTMENTS, EMPLOYEE_ROLES, EMPLOYEE_STATUSES,
  findDuplicate, nextEmployeeCode, normalizeEmployee, validateEmployeeFields,
} from "@/lib/employees";
import type { Employee, EmployeeFormData, EmployeeRole, EmployeeStatus } from "@/lib/types";

/** Salary is kept as text while typing so the field can be cleared. */
type FormState = Omit<EmployeeFormData, "salary"> & { salary: string };

const today = () => new Date().toISOString().slice(0, 10);

const blankForm = (code: string): FormState => ({
  employeeCode: code, firstName: "", lastName: "", email: "", phone: "",
  department: "Inventory", jobTitle: "", role: "Inventory Staff", status: "Active",
  hireDate: today(), salary: "0",
});

const AVATARS = [
  "bg-blue-100 text-blue-600", "bg-emerald-100 text-emerald-600",
  "bg-orange-100 text-orange-600", "bg-violet-100 text-violet-600",
];
const STATUS_TONE = { Active: "green", "On Leave": "orange", Inactive: "slate" } as const;

const initials = (e: Employee) => `${e.firstName[0] ?? ""}${e.lastName[0] ?? ""}`.toUpperCase();

export default function EmployeesPage() {
  const { db, addEmployee, updateEmployee, deleteEmployee } = useStore();
  const toast = useToast();
  const employees = db.employees;
  const currency = db.settings.currency;

  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("All");
  const [status, setStatus] = useState("All");

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [form, setForm] = useState<FormState>(blankForm(""));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const active = employees.filter((e) => e.status === "Active").length;
  const onLeave = employees.filter((e) => e.status === "On Leave").length;
  const payroll = employees.filter((e) => e.status !== "Inactive").reduce((s, e) => s + e.salary, 0);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return employees.filter((e) => {
      const hay = [`${e.firstName} ${e.lastName}`, e.employeeCode, e.email, e.jobTitle, e.phone].join(" ").toLowerCase();
      return (!q || hay.includes(q)) && (department === "All" || e.department === department) && (status === "All" || e.status === status);
    });
  }, [employees, search, department, status]);

  const departmentOptions = useMemo(
    () => [...new Set([...DEPARTMENTS, ...employees.map((e) => e.department), form.department].filter(Boolean))],
    [employees, form.department]
  );

  const set = <K extends keyof FormState>(k: K) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });

  const openCreate = () => {
    setEditing(null); setError("");
    setForm(blankForm(nextEmployeeCode(employees)));
    setOpen(true);
  };

  const openEdit = (emp: Employee) => {
    setEditing(emp); setError("");
    const { id, salary, ...rest } = emp;
    setForm({ ...rest, salary: String(salary) });
    setOpen(true);
  };

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    setError("");

    const data = normalizeEmployee({ ...form, salary: Number(form.salary === "" ? 0 : form.salary) });
    const problem = validateEmployeeFields(data) ?? findDuplicate(data, employees, editing?.id);
    if (problem) return setError(problem);

    setSaving(true);
    const result = editing ? await updateEmployee({ id: editing.id, ...data }) : await addEmployee(data);
    setSaving(false);

    if (!result.ok) return setError(result.error);
    toast(editing ? "Employee updated" : "Employee added");
    setOpen(false);
  };

  const remove = async (emp: Employee) => {
    if (!confirm(`Delete ${emp.firstName} ${emp.lastName} (${emp.employeeCode})? This cannot be undone.`)) return;
    const r = await deleteEmployee(emp.id);
    r.ok ? toast("Employee deleted") : toast(r.error, "err");
  };

  const exportCsv = () =>
    download("employees.csv", "\uFEFF" + toCSV([
      ["Employee ID", "First name", "Last name", "Email", "Phone", "Department", "Job title", "System role", "Status", "Hire date", `Monthly salary (${currency})`],
      ...rows.map((e) => [e.employeeCode, e.firstName, e.lastName, e.email, e.phone, e.department, e.jobTitle, e.role, e.status, e.hireDate, e.salary]),
    ]));

  const Stat = ({ icon, label, value, tone, note }: { icon: React.ReactNode; label: string; value: string | number; tone: string; note: string }) => (
    <Card padding="sm">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">{label}</p>
        <span className={`grid h-10 w-10 place-items-center rounded-xl ${tone}`}>{icon}</span>
      </div>
      <p className="mt-3 wrap-break-word text-2xl font-bold">{value}</p>
      <p className="mt-1 text-[11px] text-slate-400">{note}</p>
    </Card>
  );

  return (
    <Guard feature="employees">
      <PageHeader
        title="Employees"
        subtitle="Manage employee profiles, departments, roles and employment status."
        actions={<>
          <Button variant="ghost" onClick={exportCsv} disabled={!rows.length}><Download size={15} /> Export CSV</Button>
          <Button onClick={openCreate}><Plus size={16} /> Add employee</Button>
        </>}
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={<Users size={19} />} label="Total employees" value={employees.length} tone="bg-blue-100 text-blue-600" note="All registered employees" />
        <Stat icon={<UserRound size={19} />} label="Active" value={active} tone="bg-emerald-100 text-emerald-600" note="Currently working" />
        <Stat icon={<BriefcaseBusiness size={19} />} label="On leave" value={onLeave} tone="bg-orange-100 text-orange-600" note="Temporarily away" />
        <Stat icon={<Wallet size={19} />} label="Monthly payroll" value={money(payroll, currency)} tone="bg-sky-100 text-sky-600" note="Active and on-leave employees" />
      </div>

      <Card padding="none">
        <div className="grid gap-3 border-b border-white/60 p-4 md:grid-cols-[1fr_200px_180px]">
          <div className="neu-inset flex items-center gap-2 rounded-2xl px-4 py-2.5">
            <Search size={16} className="text-slate-400" />
            <input
              value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, ID, email, job title…"
              className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
            />
          </div>
          <select className="field" value={department} onChange={(e) => setDepartment(e.target.value)} aria-label="Filter by department">
            <option value="All">All departments</option>
            {[...new Set([...DEPARTMENTS, ...employees.map((e) => e.department)])].map((d) => <option key={d}>{d}</option>)}
          </select>
          <select className="field" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
            <option value="All">All statuses</option>
            {EMPLOYEE_STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>

        <p className="px-5 py-3 text-xs text-slate-500">Showing {rows.length} of {employees.length} employees</p>

        {rows.length === 0 ? (
          <div className="px-6 pb-14 pt-6 text-center">
            <Users size={30} className="mx-auto text-slate-300" />
            <p className="mt-3 text-sm font-semibold text-slate-600">No employees found</p>
            <p className="mt-1 text-xs text-slate-400">
              {employees.length === 0 ? "Add your first employee to get started." : "Try another search or filter."}
            </p>
            {employees.length === 0 && (
              <div className="mt-5"><Button onClick={openCreate}><Plus size={15} /> Add your first employee</Button></div>
            )}
          </div>
        ) : (
          <div className="mx-4 mb-4 overflow-x-auto rounded-2xl neu-inset">
            <table className="tbl min-w-215">
              <thead>
                <tr><th>Employee</th><th>Department</th><th>Role / Job title</th><th>Status</th><th>Hire date</th><th>Monthly salary</th><th /></tr>
              </thead>
              <tbody>
                {rows.map((e, i) => (
                  <tr key={e.id}>
                    <td>
                      <div className="flex min-w-52.5 items-center gap-3">
                        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl text-xs font-bold ${AVATARS[i % AVATARS.length]}`}>{initials(e)}</span>
                        <div className="min-w-0">
                          <p className="font-semibold">{e.firstName} {e.lastName}</p>
                          <p className="text-[11px] text-slate-400">{e.employeeCode}</p>
                          <p className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-500"><Mail size={11} /><span className="truncate">{e.email}</span></p>
                          {e.phone && <p className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-500"><Phone size={11} />{e.phone}</p>}
                        </div>
                      </div>
                    </td>
                    <td>{e.department}</td>
                    <td><p className="font-medium">{e.jobTitle}</p><p className="text-[11px] text-slate-400">{e.role}</p></td>
                    <td><Badge tone={STATUS_TONE[e.status]}>{e.status}</Badge></td>
                    <td>{fmtDate(e.hireDate)}</td>
                    <td className="font-semibold">{money(e.salary, currency)}</td>
                    <td className="whitespace-nowrap text-right">
                      <button onClick={() => openEdit(e)} aria-label={`Edit ${e.firstName} ${e.lastName}`} className="neu-sm mr-2 rounded-lg p-2"><Pencil size={14} /></button>
                      <button onClick={() => remove(e)} aria-label={`Delete ${e.firstName} ${e.lastName}`} className="neu-sm rounded-lg p-2 text-red-500"><Trash2 size={14} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={open} onClose={() => !saving && setOpen(false)} title={editing ? "Edit employee" : "Add new employee"}>
        <form onSubmit={submit} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Employee ID *"><input className="field" value={form.employeeCode} onChange={set("employeeCode")} required /></Field>
            <Field label="Employment status *">
              <select className="field" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as EmployeeStatus })}>
                {EMPLOYEE_STATUSES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="First name *"><input className="field" value={form.firstName} onChange={set("firstName")} required /></Field>
            <Field label="Last name *"><input className="field" value={form.lastName} onChange={set("lastName")} required /></Field>
            <Field label="Email address *"><input type="email" className="field" value={form.email} onChange={set("email")} placeholder="employee@company.com" required /></Field>
            <Field label="Phone number"><input type="tel" className="field" value={form.phone} onChange={set("phone")} /></Field>
            <Field label="Department *">
              <select className="field" value={form.department} onChange={set("department")}>
                {departmentOptions.map((d) => <option key={d}>{d}</option>)}
              </select>
            </Field>
            <Field label="System role *">
              <select className="field" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as EmployeeRole })}>
                {EMPLOYEE_ROLES.map((r) => <option key={r}>{r}</option>)}
              </select>
            </Field>
            <Field label="Job title *"><input className="field" value={form.jobTitle} onChange={set("jobTitle")} placeholder="e.g. Inventory Officer" required /></Field>
            <Field label="Hire date *"><input type="date" className="field" value={form.hireDate} onChange={set("hireDate")} required /></Field>
            <div className="sm:col-span-2">
              <Field label={`Monthly salary (${currency}) *`}>
                <input type="number" min="0" step="0.01" className="field" value={form.salary} onChange={set("salary")} required />
              </Field>
            </div>
          </div>

          {error && <p role="alert" className="rounded-xl bg-red-100/80 px-3 py-2 text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? "Saving…" : editing ? "Save changes" : "Create employee"}</Button>
          </div>
        </form>
      </Modal>
    </Guard>
  );
}