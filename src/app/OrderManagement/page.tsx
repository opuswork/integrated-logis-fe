"use client";

import { AuthGuard } from "@/components/auth-guard";
import { MEMBER_IDLE_TIMEOUT_MS } from "@/lib/auth";
import { OrderListInput } from "./OrderListInput";

export default function OrderManagementPage() {
  return (
    <AuthGuard allow="member" idleTimeoutMs={MEMBER_IDLE_TIMEOUT_MS}>
      <main className="min-h-[100dvh] bg-[#e9edf3] p-0 pb-[env(safe-area-inset-bottom)] min-[1040px]:p-6">
        <OrderListInput />
      </main>
    </AuthGuard>
  );
}
