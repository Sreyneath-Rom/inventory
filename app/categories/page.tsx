"use client";
import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Guard } from "@/components/ui/Guard";
import { GlassCard } from "@/components/ui/GlassCard";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { useStore } from "@/lib/store";
import type { Category } from "@/lib/types";
import { cn } from "@/lib/utils";

const COLORS = [
  "#3b82f6",
  "#14b8a6",
  "#f59e0b",
  "#ec4899",
  "#8b5cf6",
  "#ef4444",
  "#22c55e",
  "#64748b",
];

export default function CategoriesPage() {
  const { db, addCategory, updateCategory, deleteCategory } = useStore();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [err, setErr] = useState("");

  const openNew = () => {
    setEditing(null);
    setName("");
    setColor(COLORS[0]);
    setErr("");
    setOpen(true);
  };
  const openEdit = (c: Category) => {
    setEditing(c);
    setName(c.name);
    setColor(c.color);
    setErr("");
    setOpen(true);
  };
  const save = () => {
    const n = name.trim();
    if (!n) return setErr("Category name is required.");
    if (
      db.categories.some(
        (c: { name: string; id: string | undefined; }) => c.name.toLowerCase() === n.toLowerCase() && c.id !== editing?.id,
      )
    )
      return setErr("That category already exists.");
    editing
      ? updateCategory({ ...editing, name: n, color })
      : addCategory({ name: n, color });
    toast(editing ? "Category updated" : "Category added");
    setOpen(false);
  };

  return (
    <Guard feature="categories">
      <PageHeader
        title="Categories"
        subtitle="Group your products for faster filtering and reporting"
        actions={
          <Button onClick={openNew}>
            <Plus size={16} /> Add category
          </Button>
        }
      />

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {db.categories.map((c: Category) => {
          const items = db.products.filter((p: { categoryId: string; }) => p.categoryId === c.id);
          return (
            <GlassCard key={c.id}>
              <div className="flex items-start justify-between">
                <span
                  className="grid h-12 w-12 place-items-center rounded-2xl text-xl font-bold text-white shadow-lg"
                  style={{ background: c.color }}
                >
                  {c.name[0]}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => openEdit(c)}
                    className="neu-sm rounded-lg p-2"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => {
                      if (!confirm(`Delete "${c.name}"?`)) return;
                      const r = deleteCategory(c.id);
                      r.ok ? toast("Category deleted") : toast(r.error, "err");
                    }}
                    className="neu-sm rounded-lg p-2 text-red-500"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              <h3 className="mt-4 font-semibold">{c.name}</h3>
              <p className="text-sm text-slate-500">
                {items.length} products ·{" "}
                {items.reduce((s: any, p: { stock: any; }) => s + p.stock, 0)} units
              </p>
            </GlassCard>
          );
        })}
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Edit category" : "Add category"}
      >
        <div className="space-y-4">
          <Field label="Name">
            <input
              className="field"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </Field>
          <Field label="Color">
            <div className="flex flex-wrap gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  style={{ background: c }}
                  className={cn(
                    "h-9 w-9 rounded-full ring-offset-2 ring-offset-white/50",
                    color === c && "ring-2 ring-ink",
                  )}
                />
              ))}
            </div>
          </Field>
        </div>
        {err && (
          <p className="mt-4 rounded-xl bg-red-100/80 px-3 py-2 text-sm text-red-600">
            {err}
          </p>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={save}>Save</Button>
        </div>
      </Modal>
    </Guard>
  );
}
