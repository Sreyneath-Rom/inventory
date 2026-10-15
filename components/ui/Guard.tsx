"use client";
import { Lock } from "lucide-react";
import type { Feature } from "@/lib/types";
import { useStore } from "@/lib/store";
import { GlassCard } from "./GlassCard";

export function Guard({ feature, children }: { feature: Feature; children: React.ReactNode }) {
  const { can, db } = useStore();
  if (can(feature)) return <>{children}</>;
  return (
    <GlassCard className="mx-auto mt-16 max-w-md text-center">
      <Lock className="mx-auto mb-3 text-slate-400" />
      <h2 className="font-semibold">Access restricted</h2>
      <p className="mt-1 text-sm text-slate-500">
        The <b>{db.settings.currentRole}</b> role does not have permission to open this page.
      </p>
    </GlassCard>
  );
}