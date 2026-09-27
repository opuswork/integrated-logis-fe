"use client";

import { AuthGuard } from "@/components/auth-guard";
import { ADMIN_IDLE_TIMEOUT_MS } from "@/lib/auth";
import { FactoryShipmentMng } from "./FactoryShipmentMng";

export default function FactoryShipmentManagementPage() {
  return (
    <AuthGuard allow="factory" idleTimeoutMs={ADMIN_IDLE_TIMEOUT_MS}>
      <main className="min-h-screen bg-[#e9edf3] p-4 min-[745px]:p-6">
        <FactoryShipmentMng />
      </main>
    </AuthGuard>
  );
}
