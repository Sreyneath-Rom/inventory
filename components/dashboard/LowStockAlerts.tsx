import Link from "next/link";
import { AlertTriangle, ArrowRight, PartyPopper } from "lucide-react";
import type { Product } from "@/lib/types";
import { CardHeader, GlassCard } from "@/components/ui/GlassCard";
import { ProductAvatar } from "@/components/ui/ProductAvatar";

export function LowStockAlerts({ items }: { items: Product[] }) {
  return (
    <GlassCard id="alerts">
      <CardHeader
        icon={<AlertTriangle size={18} className="text-red-500" />}
        title="Low Stock Alerts"
        action={
          <Link
            href="/products?filter=low"
            className="flex items-center gap-1 text-xs font-semibold text-brand"
          >
            View all <ArrowRight size={12} />
          </Link>
        }
      />
      {items.length === 0 ? (
        <p className="flex items-center justify-center gap-2 py-6 text-center text-sm text-slate-500">
          <PartyPopper size={16} className="text-emerald-500" />
          All products are well stocked
        </p>
      ) : (
        <div className="neu-inset rounded-2xl p-2">
          <table className="tbl">
            <thead>
              <tr>
                <th>Product</th>
                <th>Current</th>
                <th>Threshold</th>
              </tr>
            </thead>
            <tbody>
              {items.slice(0, 5).map((p) => (
                <tr key={p.id}>
                  <td>
                    <div className="flex items-center gap-2">
                      <ProductAvatar product={p} size={24} />
                      <span>{p.name}</span>
                    </div>
                  </td>
                  <td>
                    <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-600">
                      {p.stock}
                    </span>
                  </td>
                  <td>
                    <span className="rounded-full bg-white/70 px-3 py-1 text-xs font-semibold">
                      {p.threshold}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </GlassCard>
  );
}