"use client";

import { AuthGuard } from "@/components/auth-guard";
import { ADMIN_IDLE_TIMEOUT_MS } from "@/lib/auth";
import { OrderListMng } from "./OrderListMng";

export default function AdminOrderManagementPage() {
  return (
    <AuthGuard
      allow={["admin", "factory"]}
      idleTimeoutMs={ADMIN_IDLE_TIMEOUT_MS}
    >
      <main className="min-h-screen bg-[#F5F7FA]">
        <OrderListMng />
      </main>
    </AuthGuard>
  );
}
