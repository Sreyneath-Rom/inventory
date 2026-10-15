import { cn } from "@/lib/utils";

const V = {
  primary: "bg-gradient-to-b from-sky-400 to-blue-600 text-white shadow-[0_8px_18px_rgba(59,130,246,.4),inset_0_1px_0_rgba(255,255,255,.5)]",
  success: "bg-gradient-to-b from-emerald-300 to-emerald-500 text-white shadow-[0_8px_18px_rgba(16,185,129,.35),inset_0_1px_0_rgba(255,255,255,.5)]",
  warn: "bg-gradient-to-b from-orange-300 to-orange-500 text-white shadow-[0_8px_18px_rgba(249,115,22,.35),inset_0_1px_0_rgba(255,255,255,.5)]",
  danger: "bg-gradient-to-b from-rose-400 to-red-500 text-white shadow-[0_8px_18px_rgba(239,68,68,.35),inset_0_1px_0_rgba(255,255,255,.5)]",
  ghost: "neu-sm text-ink",
};

export function Button({
  variant = "primary", className, ...p
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof V }) {
  return (
    <button
      {...p}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold transition active:scale-[.97] disabled:opacity-50",
        V[variant], className
      )}
    />
  );
}