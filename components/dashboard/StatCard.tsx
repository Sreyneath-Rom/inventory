import { GlassCard } from "@/components/ui/GlassCard";

const TONES = {
  blue: "from-sky-400 to-blue-600 shadow-blue-500/40",
  green: "from-emerald-300 to-emerald-500 shadow-emerald-500/40",
  orange: "from-amber-300 to-orange-500 shadow-orange-500/40",
  purple: "from-violet-400 to-indigo-600 shadow-indigo-500/40",
};

export function StatCard({ tone, icon, label, value, footer }: {
  tone: keyof typeof TONES; icon: React.ReactNode; label: string; value: string | number; footer: React.ReactNode;
}) {
  return (
    <GlassCard className="p-4">
      <div className="flex items-center gap-4">
        <span className={`grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-linear-to-br text-white shadow-lg ${TONES[tone]}`}>{icon}</span>
        <div>
          <p className="text-sm text-slate-500">{label}</p>
          <p className="text-3xl font-bold">{value}</p>
        </div>
      </div>
      <div className="mt-3 text-xs text-slate-500">{footer}</div>
    </GlassCard>
  );
}

export const Delta = ({ pct }: { pct: number }) => (
  <span><b className={pct >= 0 ? "text-emerald-600" : "text-red-500"}>{pct >= 0 ? "↑" : "↓"} {Math.abs(pct)}%</b> vs. last 30 days</span>
);