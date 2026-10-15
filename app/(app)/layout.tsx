export const instant = false;

import { ToastProvider } from "@/components/ui/Toast";
import { StoreProvider, RequireDb } from "@/lib/store";
import { AppShell } from "@/components/layout/AppShell";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <StoreProvider>
        <RequireDb>
          <AppShell>{children}</AppShell>
        </RequireDb>
      </StoreProvider>
    </ToastProvider>
  );
}