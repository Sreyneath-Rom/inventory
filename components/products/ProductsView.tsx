"use client";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { Guard } from "@/components/ui/Guard";
import { GlassCard } from "@/components/ui/GlassCard";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { ProductAvatar } from "@/components/ui/ProductAvatar";
import { useToast } from "@/components/ui/Toast";
import { useStore } from "@/lib/store";
import type { Product } from "@/lib/types";
import { money, stockStatus } from "@/lib/utils";

const blank = {
  name: "",
  sku: "",
  categoryId: "",
  unit: "pcs",
  cost: "",
  price: "",
  stock: "0",
  threshold: "10",
  image: "",
};

export function ProductsView() {
  const { db, addProduct, updateProduct, deleteProduct } = useStore();
  const toast = useToast();
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get("q") ?? "");
  const [cat, setCat] = useState("ALL");
  const [status, setStatus] = useState(sp.get("filter") === "low" ? "low" : "ALL");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [f, setF] = useState(blank);
  const [err, setErr] = useState("");

  useEffect(() => {
    setQ(sp.get("q") ?? "");
    setStatus(sp.get("filter") === "low" ? "low" : "ALL");
  }, [sp]);

  const catOf = (id: string) => db.categories.find((c) => c.id === id);

  const rows = useMemo(
    () =>
      db.products.filter((p) => {
        const term = q.toLowerCase();
        const matchQ =
          !term ||
          p.name.toLowerCase().includes(term) ||
          p.sku.toLowerCase().includes(term) ||
          (catOf(p.categoryId)?.name ?? "").toLowerCase().includes(term);
        const matchC = cat === "ALL" || p.categoryId === cat;
        const matchS =
          status === "ALL" ||
          (status === "low" ? p.stock <= p.threshold : stockStatus(p) === status);
        return matchQ && matchC && matchS;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [db.products, db.categories, q, cat, status]
  );

  const set =
    (k: keyof typeof blank) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setF({ ...f, [k]: e.target.value });

  const openNew = () => {
    setEditing(null);
    setErr("");
    setF({
      ...blank,
      categoryId: db.categories[0]?.id ?? "",
      threshold: String(db.settings.defaultThreshold),
      sku: `SKU-${String(db.products.length + 1).padStart(3, "0")}`,
    });
    setOpen(true);
  };

  const openEdit = (p: Product) => {
    setEditing(p);
    setErr("");
    setF({
      name: p.name,
      sku: p.sku,
      categoryId: p.categoryId,
      unit: p.unit,
      cost: String(p.cost),
      price: String(p.price),
      stock: String(p.stock),
      threshold: String(p.threshold),
      image: p.image ?? "",
    });
    setOpen(true);
  };

  const save = () => {
    if (!f.name.trim() || !f.sku.trim()) return setErr("Name and SKU are required.");
    if (!f.categoryId)
      return setErr("Please choose a category (create one first if none exist).");
    const data = {
      name: f.name.trim(),
      sku: f.sku.trim(),
      categoryId: f.categoryId,
      unit: f.unit || "pcs",
      cost: +f.cost || 0,
      price: +f.price || 0,
      stock: Math.max(0, Math.floor(+f.stock || 0)),
      threshold: Math.max(0, Math.floor(+f.threshold || 0)),
      image: f.image.trim(),
    };
    if (editing) {
      updateProduct({ ...editing, ...data, stock: editing.stock });
      toast("Product updated");
    } else {
      const r = addProduct(data);
      if (!r.ok) return setErr(r.error);
      toast("Product added");
    }
    setOpen(false);
  };

  return (
    <Guard feature="products">
      <PageHeader
        title="Products"
        subtitle={`${db.products.length} products in your catalog`}
        actions={
          <Button onClick={openNew}>
            <Plus size={16} /> Add product
          </Button>
        }
      />

      <GlassCard>
        <div className="mb-4 grid gap-3 md:grid-cols-[1fr_200px_180px]">
          <div className="neu-inset flex items-center gap-2 rounded-2xl px-4 py-2.5">
            <Search size={16} className="text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name, SKU or category"
              className="w-full bg-transparent text-sm outline-none"
            />
          </div>
          <select className="field" value={cat} onChange={(e) => setCat(e.target.value)}>
            <option value="ALL">All categories</option>
            {db.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select className="field" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="ALL">All status</option>
            <option value="ok">In stock</option>
            <option value="low">Low stock</option>
            <option value="out">Out of stock</option>
          </select>
        </div>

        <div className="neu-inset overflow-x-auto rounded-2xl">
          <table className="tbl min-w-190">
            <thead>
              <tr>
                <th>Product</th>
                <th>SKU</th>
                <th>Category</th>
                <th>Cost</th>
                <th>Price</th>
                <th>Stock</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const s = stockStatus(p);
                const c = catOf(p.categoryId);
                return (
                  <tr key={p.id}>
                    <td>
                      <div className="flex items-center gap-3">
                        <ProductAvatar product={p} size={32} />
                        <b>{p.name}</b>
                      </div>
                    </td>
                    <td className="text-slate-500">{p.sku}</td>
                    <td>
                      {c ? (
                        <span className="inline-flex items-center gap-1.5">
                          <i className="h-2 w-2 rounded-full" style={{ background: c.color }} />
                          {c.name}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>{money(p.cost, db.settings.currency)}</td>
                    <td>{money(p.price, db.settings.currency)}</td>
                    <td>
                      <b>{p.stock}</b> <span className="text-xs text-slate-400">{p.unit}</span>
                    </td>
                    <td>
                      {s === "ok" ? (
                        <Badge tone="green">In stock</Badge>
                      ) : s === "low" ? (
                        <Badge tone="orange">Low stock</Badge>
                      ) : (
                        <Badge tone="red">Out of stock</Badge>
                      )}
                    </td>
                    <td className="whitespace-nowrap text-right">
                      <button
                        onClick={() => openEdit(p)}
                        aria-label={`Edit ${p.name}`}
                        className="neu-sm mr-2 rounded-lg p-2"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Delete "${p.name}"?`)) {
                            deleteProduct(p.id);
                            toast("Product deleted");
                          }
                        }}
                        aria-label={`Delete ${p.name}`}
                        className="neu-sm rounded-lg p-2 text-red-500"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-slate-500">
                    No products found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </GlassCard>

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? "Edit product" : "Add product"}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Product name">
              <input className="field" value={f.name} onChange={set("name")} />
            </Field>
          </div>
          <Field label="SKU / Code">
            <input className="field" value={f.sku} onChange={set("sku")} />
          </Field>
          <Field label="Category">
            <select className="field" value={f.categoryId} onChange={set("categoryId")}>
              <option value="">Select…</option>
              {db.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Cost price">
            <input type="number" min="0" step="0.01" className="field" value={f.cost} onChange={set("cost")} />
          </Field>
          <Field label="Selling price">
            <input type="number" min="0" step="0.01" className="field" value={f.price} onChange={set("price")} />
          </Field>
          <Field
            label="Opening stock"
            hint={editing ? "Use Stock In / Stock Out to change stock." : undefined}
          >
            <input
              type="number"
              min="0"
              className="field"
              value={f.stock}
              onChange={set("stock")}
              disabled={!!editing}
            />
          </Field>
          <Field label="Low-stock threshold">
            <input type="number" min="0" className="field" value={f.threshold} onChange={set("threshold")} />
          </Field>
          <Field label="Unit">
            <input className="field" value={f.unit} onChange={set("unit")} placeholder="pcs, kg, btl…" />
          </Field>

          <div className="sm:col-span-2">
            <Field label="Image URL" hint="Optional. When empty, a placeholder icon is shown.">
              <div className="flex items-center gap-3">
                <input
                  className="field flex-1"
                  value={f.image}
                  onChange={set("image")}
                  placeholder="https://…"
                />
                {f.image && (
                  <button
                    type="button"
                    onClick={() => setF({ ...f, image: "" })}
                    aria-label="Clear image"
                    className="neu-sm grid h-9 w-9 place-items-center rounded-xl"
                  >
                    <X size={14} />
                  </button>
                )}
                <ProductAvatar product={{ image: f.image, name: f.name || "Preview" }} size={40} />
              </div>
            </Field>
          </div>
        </div>

        {err && (
          <p className="mt-4 rounded-xl bg-red-100/80 px-3 py-2 text-sm text-red-600">{err}</p>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={save}>Save product</Button>
        </div>
      </Modal>
    </Guard>
  );
}