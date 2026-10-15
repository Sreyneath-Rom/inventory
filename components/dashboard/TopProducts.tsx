import Link from "next/link";
import { ArrowRight, Package } from "lucide-react";
import type { Product } from "@/lib/types";
import { CardHeader, GlassCard } from "@/components/ui/GlassCard";
import { ProductAvatar } from "@/components/ui/ProductAvatar";

export function TopProducts({ items }: { items: { product: Product; qty: number }[] }) {
  return (
    <GlassCard>
      <CardHeader
        icon={<Package size={18} />}
        title="Top Products"
        action={
          <Link
            href="/products"
            className="flex items-center gap-1 text-xs font-semibold text-brand"
          >
            View all <ArrowRight size={12} />
          </Link>
        }
      />
      {items.length === 0 && (
        <p className="text-sm text-slate-500">No sales in the last 30 days.</p>
      )}
      <ul className="space-y-2">
        {items.map(({ product, qty }) => (
          <li
            key={product.id}
            className="flex items-center gap-3 border-b border-white/60 pb-2 text-sm last:border-0"
          >
            <ProductAvatar product={product} size={40} />
            <span className="flex-1">{product.name}</span>
            <b>{qty}</b>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-slate-400">
        Units sold (stock out) in the last 30 days
      </p>
    </GlassCard>
  );
}