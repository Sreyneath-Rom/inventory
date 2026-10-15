"use client";
import { useState } from "react";
import { Trash2, UserPlus } from "lucide-react";
import { Guard } from "@/components/ui/Guard";
import { CardHeader, GlassCard } from "@/components/ui/GlassCard";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { useStore } from "@/lib/store";
import { download } from "@/lib/csv";
import { FEATURES, ROLES, type AppUser, type Role } from "@/lib/types";
import { cn } from "@/lib/utils";

function Switch({
  on,
  onChange,
  disabled,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={cn(
        "neu-inset relative h-7 w-12 rounded-full transition disabled:opacity-50",
        on && "bg-blue-200!"
      )}
    >
      <span
        className={cn(
          "absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all",
          on ? "left-6 bg-blue-500" : "left-1"
        )}
      />
    </button>
  );
}

export default function SettingsPage() {
  const { db, updateSettings, setPermission, addUser, updateUser, removeUser, resetData } = useStore();
  const s = db.settings;
  const toast = useToast();
  const [g, setG] = useState({
    companyName: s.companyName,
    adminName: s.adminName,
    currency: s.currency,
    defaultThreshold: String(s.defaultThreshold),
  });
  const [u, setU] = useState({ name: "", email: "", role: "Staff" as Role });

  const saveGeneral = () => {
    updateSettings({
      companyName: g.companyName.trim() || s.companyName,
      adminName: g.adminName.trim() || s.adminName,
      currency: g.currency,
      defaultThreshold: Math.max(0, +g.defaultThreshold || 0),
    });
    toast("Preferences saved");
  };

  return (
    <Guard feature="settings">
      <PageHeader title="Settings" subtitle="Preferences, access control and data" />
      <div className="grid gap-5 xl:grid-cols-2">
        <GlassCard>
          <CardHeader icon={<span>⚙️</span>} title="General preferences" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Company name">
              <input
                className="field"
                value={g.companyName}
                onChange={(e) => setG({ ...g, companyName: e.target.value })}
              />
            </Field>
            <Field label="Display name">
              <input
                className="field"
                value={g.adminName}
                onChange={(e) => setG({ ...g, adminName: e.target.value })}
              />
            </Field>
            <Field label="Currency">
              <select
                className="field"
                value={g.currency}
                onChange={(e) => setG({ ...g, currency: e.target.value })}
              >
                {["USD", "EUR", "GBP", "KHR", "THB", "JPY", "SGD"].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Field>
            <Field label="Default low-stock threshold" hint="Used when adding new products">
              <input
                type="number"
                min="0"
                className="field"
                value={g.defaultThreshold}
                onChange={(e) => setG({ ...g, defaultThreshold: e.target.value })}
              />
            </Field>
          </div>
          <div className="mt-5 flex justify-end">
            <Button onClick={saveGeneral}>Save preferences</Button>
          </div>
        </GlassCard>

        <GlassCard>
          <CardHeader icon={<span>🔐</span>} title="Access control" />
          <div className="neu-inset overflow-x-auto rounded-2xl">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Module</th>
                  {ROLES.map((r) => (
                    <th key={r}>{r}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {FEATURES.map((f) => (
                  <tr key={f.key}>
                    <td>{f.label}</td>
                    {ROLES.map((r) => (
                      <td key={r}>
                        <Switch
                          on={s.permissions[r][f.key]}
                          disabled={r === "Admin"}
                          onChange={(v) => setPermission(r, f.key, v)}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Admin always has full access. Use the profile menu (top right) to preview the app as
            another role.
          </p>
        </GlassCard>

        <GlassCard className="xl:col-span-2">
          <CardHeader icon={<UserPlus size={18} />} title="Users" />
          <div className="neu-inset mb-4 overflow-x-auto rounded-2xl">
            <table className="tbl min-w-130">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {s.users.map((x: AppUser) => (
                  <tr key={x.id}>
                    <td className="font-medium">{x.name}</td>
                    <td className="text-slate-500">{x.email}</td>
                    <td>
                      <select
                        className="field w-auto! py-1.5!"
                        value={x.role}
                        onChange={(e) => updateUser({ ...x, role: e.target.value as Role })}
                      >
                        {ROLES.map((r) => (
                          <option key={r}>{r}</option>
                        ))}
                      </select>
                    </td>
                    <td className="text-right">
                      <button
                        onClick={() => removeUser(x.id)}
                        aria-label={`Remove ${x.name}`}
                        className="neu-sm rounded-lg p-2 text-red-500"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <form
            className="grid gap-3 sm:grid-cols-[1fr_1fr_140px_auto]"
            onSubmit={(e) => {
              e.preventDefault();
              if (!u.name.trim() || !u.email.trim())
                return toast("Name and email are required", "err");
              addUser({ ...u, name: u.name.trim(), email: u.email.trim() });
              setU({ name: "", email: "", role: "Staff" });
              toast("User added");
            }}
          >
            <input
              className="field"
              placeholder="Full name"
              value={u.name}
              onChange={(e) => setU({ ...u, name: e.target.value })}
            />
            <input
              className="field"
              type="email"
              placeholder="Email"
              value={u.email}
              onChange={(e) => setU({ ...u, email: e.target.value })}
            />
            <select
              className="field"
              value={u.role}
              onChange={(e) => setU({ ...u, role: e.target.value as Role })}
            >
              {ROLES.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
            <Button type="submit">Add user</Button>
          </form>
        </GlassCard>

        <GlassCard className="xl:col-span-2">
          <CardHeader icon={<span>💾</span>} title="Data" />
          <div className="flex flex-wrap gap-3">
            <Button
              variant="ghost"
              onClick={() =>
                download("inventory-backup.json", JSON.stringify(db, null, 2), "application/json")
              }
            >
              Download backup (JSON)
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (confirm("Reset all data to the demo dataset?")) {
                  resetData();
                  toast("Demo data restored");
                }
              }}
            >
              Reset to demo data
            </Button>
          </div>
        </GlassCard>
      </div>
    </Guard>
  );
}