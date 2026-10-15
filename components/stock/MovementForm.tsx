"use client";
import { useState } from "react";
import { PackageMinus, PackagePlus } from "lucide-react";
import { CardHeader, GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { useStore } from "@/lib/store";
import type { TxType } from "@/lib/types";
import { money } from "@/lib/utils";

const REASONS = ["Sale", "Damaged", "Expired", "Internal use", "Other"];
const today = () => new Date().toISOString().slice(0, 10);

export function MovementForm({ type }: { type: TxType }) {
  const { db, move } = useStore();
  const toast = useToast();
  const isIn = type === "IN";
  const [productId, setProductId] = useState("");
  const [qty, setQty] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [party, setParty] = useState("");
  const [reason, setReason] = useState(REASONS[0]);
  const [note, setNote] = useState("");
  const [date, setDate] = useState(today());
  const [err, setErr] = useState("");

  const product = db.products.find((p) => p.id === productId);
  const n = parseInt(qty, 10) || 0;
  const after = product ? product.stock + (isIn ? n : -n) : 0;

  const pick = (id: string) => {
    setProductId(id);
    setErr("");
    const p = db.products.find((x) => x.id === id);
    if (p) setUnitPrice(String(isIn ? p.cost : p.price));
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const iso =
      date === today()
        ? new Date().toISOString()
        : new Date(`${date}T12:00:00`).toISOString();
    const r = move(type, {
      productId,
      qty: n,
      unitPrice: +unitPrice || 0,
      party: party || undefined,
      date: iso,
      note: [isIn ? "" : reason, note].filter(Boolean).join(" — ") || undefined,
    });
    if (!r.ok) {
      setErr(r.error);
      toast(r.error, "err");
      return;
    }
    toast(isIn ? `Received ${n} × ${product?.name}` : `Issued ${n} × ${product?.name}`);
    setQty("");
    setNote("");
    setErr("");
  };

  return (
    <GlassCard>
      <CardHeader
        icon={isIn ? <PackagePlus size={18} /> : <PackageMinus size={18} />}
        title={isIn ? "Receive stock" : "Issue stock"}
      />
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label="Product">
            <select className="field" value={productId} onChange={(e) => pick(e.target.value)} required>
              <option value="">Select a product…</option>
              {db.products.map((p) => (
                <option key={p.id} value={p.id} disabled={!isIn && p.stock === 0}>
                  {p.name} — {p.stock} {p.unit} in stock
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Quantity">
          <input
            type="number"
            min="1"
            className="field"
            value={qty}
            onChange={(e) => {
              setQty(e.target.value);
              setErr("");
            }}
            required
          />
        </Field>
        <Field label={isIn ? "Unit cost" : "Unit price"}>
          <input
            type="number"
            min="0"
            step="0.01"
            className="field"
            value={unitPrice}
            onChange={(e) => setUnitPrice(e.target.value)}
          />
        </Field>
        <Field label={isIn ? "Supplier" : "Customer"}>
          <input className="field" value={party} onChange={(e) => setParty(e.target.value)} />
        </Field>
        <Field label="Date">
          <input
            type="date"
            className="field"
            value={date}
            max={today()}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>
        {!isIn && (
          <Field label="Reason">
            <select className="field" value={reason} onChange={(e) => setReason(e.target.value)}>
              {REASONS.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </Field>
        )}
        <div className={isIn ? "sm:col-span-2" : ""}>
          <Field label="Note (optional)">
            <input className="field" value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </div>

        {product && (
          <div className="neu-inset grid grid-cols-3 gap-2 rounded-2xl p-4 text-center text-sm sm:col-span-2">
            <div>
              <p className="text-xs text-slate-500">Current</p>
              <b>{product.stock}</b>
            </div>
            <div>
              <p className="text-xs text-slate-500">After</p>
              <b className={after < 0 ? "text-red-500" : isIn ? "text-emerald-600" : "text-orange-600"}>
                {after}
              </b>
            </div>
            <div>
              <p className="text-xs text-slate-500">Total</p>
              <b>{money(n * (+unitPrice || 0), db.settings.currency)}</b>
            </div>
          </div>
        )}
        {err && (
          <p className="rounded-xl bg-red-100/80 px-3 py-2 text-sm text-red-600 sm:col-span-2">
            {err}
          </p>
        )}
        <div className="sm:col-span-2">
          <Button type="submit" variant={isIn ? "success" : "warn"} className="w-full">
            {isIn ? "Confirm stock in" : "Confirm stock out"}
          </Button>
        </div>
      </form>
    </GlassCard>
  );
}