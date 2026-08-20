"use client";

import { AuthGuard } from "@/components/auth-guard";
import { OrderListInput } from "./OrderListInput";

export default function OrderManagementPage() {
  return (
    <AuthGuard allow="member" idleTimeoutMs={60 * 60 * 1000}>
      <main className="min-h-screen bg-[#e9edf3] p-4 min-[745px]:p-6">
        <OrderListInput />
      </main>
    </AuthGuard>
  );
}
