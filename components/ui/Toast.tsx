"use client";
import { createContext, useCallback, useContext, useState } from "react";
import { cn } from "@/lib/utils";

type Push = (msg: string, kind?: "ok" | "err") => void;
const Ctx = createContext<Push>(() => {});
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<{ id: number; msg: string; kind: string }[]>([]);
  const push = useCallback<Push>((msg, kind = "ok") => {
    const id = Date.now() + Math.random();
    setItems((i) => [...i, { id, msg, kind }]);
    setTimeout(() => setItems((i) => i.filter((x) => x.id !== id)), 3000);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="fixed bottom-5 right-5 z-60 space-y-2">
        {items.map((t) => (
          <div key={t.id} className={cn("glass rounded-2xl px-4 py-3 text-sm font-medium", t.kind === "err" ? "text-red-600" : "text-emerald-700")}>
            {t.msg}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}