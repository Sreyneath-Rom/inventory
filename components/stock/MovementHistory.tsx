import { History } from "lucide-react";
import { CardHeader, GlassCard } from "@/components/ui/GlassCard";
import type { Transaction, TxType } from "@/lib/types";
import { fmtDateTime } from "@/lib/utils";

export function MovementHistory({ tx, type }: { tx: Transaction[]; type: TxType }) {
  const rows = tx.filter((t) => t.type === type).slice(0, 8);
  return (
    <GlassCard>
      <CardHeader icon={<History size={18} />} title={type === "IN" ? "Recent receipts" : "Recent issues"} />
      <ul className="space-y-3">
        {rows.map((t) => (
          <li key={t.id} className="flex items-center justify-between gap-3 border-b border-white/60 pb-3 text-sm last:border-0">
            <div className="min-w-0">
              <p className="truncate font-medium">{t.productName}</p>
              <p className="text-xs text-slate-400">{t.ref} · {fmtDateTime(t.date)}</p>
            </div>
            <b className={type === "IN" ? "text-emerald-600" : "text-red-500"}>{type === "IN" ? "+" : "-"}{t.qty}</b>
          </li>
        ))}
        {rows.length === 0 && <li className="text-sm text-slate-500">Nothing yet.</li>}
      </ul>
    </GlassCard>
  );
}