"use client";

import { AuthGuard } from "@/components/auth-guard";
import { OrderListInput } from "./OrderListInput";

export default function OrderManagementPage() {
  return (
    <AuthGuard allow="member" idleTimeoutMs={60 * 60 * 1000}>
      <main className="min-h-[100dvh] bg-[#e9edf3] px-4 py-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1.25rem,env(safe-area-inset-bottom))] min-[745px]:p-6">
        <OrderListInput />
      </main>
    </AuthGuard>
  );
}
