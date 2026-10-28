"use client";

import { useEffect, useState } from "react";

import { OrderPrintPreviewModal } from "@/app/admin/OrderManagement/OrderPrintPreview";
import { apiFetch } from "@/lib/api";

import { NewOrderV2 } from "./NewOrderV2";
import { OrderCalendarV2, type CalendarFilters } from "./OrderCalendarV2";
import {
  mapMemberOrders,
  todayIso,
  type ApiMemberOrder,
  type V2Order,
} from "./order-v2-shared";

import "./order-v2.css";

/** 주문목록포함버전: 주문 달력 + 새 주문 (시안 fe/장유 주문 7.html) */
export function OrderAppV2({
  onSwitchToClassic,
}: {
  onSwitchToClassic: () => void;
}) {
  const [screen, setScreen] = useState<"calendar" | "new">("calendar");
  const [filters, setFilters] = useState<CalendarFilters>(() => ({
    date: todayIso(),
    status: "전체",
    branch: "전체",
    q: "",
  }));
  const [orders, setOrders] = useState<V2Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadToken, setReloadToken] = useState(0);
  const [newOrderDate, setNewOrderDate] = useState(todayIso);
  const [viewingOrderNumber, setViewingOrderNumber] = useState<string | null>(
    null,
  );

  // 기존 내 주문 현황과 같이 4초마다 조용히 새로고침
  useEffect(() => {
    let cancelled = false;
    const load = async (silent: boolean) => {
      try {
        const response = await apiFetch("/api/orders");
        const data = (await response.json()) as
          | ApiMemberOrder[]
          | { message?: string };
        if (!response.ok || !Array.isArray(data)) {
          throw new Error(
            !Array.isArray(data) && data.message
              ? data.message
              : "주문 목록을 불러오지 못했습니다.",
          );
        }
        if (cancelled) return;
        setOrders(mapMemberOrders(data));
        setError("");
      } catch (err) {
        if (!cancelled && !silent) {
          setError(
            err instanceof Error ? err.message : "주문 목록을 불러오지 못했습니다.",
          );
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    void load(false);
    const timer = window.setInterval(() => void load(true), 4000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [reloadToken]);

  return (
    <div className="jy-v2 -mx-4 -mt-4 -mb-6 min-h-[calc(100dvh-4rem)] min-[1040px]:m-0 min-[1040px]:rounded-xl">
      {screen === "calendar" ? (
        <OrderCalendarV2
          orders={orders}
          isLoading={isLoading}
          error={error}
          filters={filters}
          onFiltersChange={setFilters}
          onSwitchToClassic={onSwitchToClassic}
          onCreateOrder={(iso) => {
            setNewOrderDate(iso);
            setScreen("new");
            window.scrollTo(0, 0);
          }}
          onViewOrder={setViewingOrderNumber}
        />
      ) : (
        <NewOrderV2
          key={newOrderDate}
          initialDate={newOrderDate}
          onBackToList={() => {
            setScreen("calendar");
            window.scrollTo(0, 0);
          }}
          onSubmitted={(date) => {
            setFilters((current) => ({ ...current, date, q: "" }));
            setReloadToken((token) => token + 1);
          }}
        />
      )}

      <OrderPrintPreviewModal
        open={Boolean(viewingOrderNumber)}
        orderNumber={viewingOrderNumber}
        onClose={() => setViewingOrderNumber(null)}
        showAdminDeliveryControls={false}
      />
    </div>
  );
}
