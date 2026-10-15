import { Package } from "lucide-react";
import type { Product } from "@/lib/types";
import { cn } from "@/lib/utils";

export function ProductAvatar({
  product,
  size = 32,
  className,
}: {
  product: Pick<Product, "image" | "name">;
  size?: number;
  className?: string;
}) {
  if (product.image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={product.image}
        alt={product.name}
        width={size}
        height={size}
        loading="lazy"
        className={cn("shrink-0 rounded-lg object-cover ring-1 ring-white/70", className)}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-400",
        className
      )}
      style={{ width: size, height: size }}
      aria-label={`${product.name} (no image)`}
    >
      <Package size={Math.round(size * 0.5)} />
    </span>
  );
}