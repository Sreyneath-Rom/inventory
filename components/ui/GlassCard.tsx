import { cn } from "@/lib/utils";

export function GlassCard({ className, children, id }: { className?: string; children: React.ReactNode; id?: string }) {
  return <div id={id} className={cn("glass rounded-3xl p-5", className)}>{children}</div>;
}

export function CardHeader({ icon, title, action }: { icon: React.ReactNode; title: string; action?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <span className="neu-sm grid h-10 w-10 place-items-center rounded-xl text-brand">{icon}</span>
        <h3 className="font-semibold">{title}</h3>
      </div>
      {action}
    </div>
  );
}