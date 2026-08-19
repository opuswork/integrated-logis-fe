"use client";

import { AuthGuard } from "@/components/auth-guard";
import { OrderListMng } from "./OrderListMng";

export default function AdminOrderManagementPage() {
  return (
    <AuthGuard allow="admin">
      <main className="min-h-screen bg-[#F5F7FA]">
        <OrderListMng />
      </main>
    </AuthGuard>
  );
}
