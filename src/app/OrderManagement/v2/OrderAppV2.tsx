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
  const [rawOrders, setRawOrders] = useState<ApiMemberOrder[]>([]);
  const [orders, setOrders] = useState<V2Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadToken, setReloadToken] = useState(0);
  const [newOrderDate, setNewOrderDate] = useState(todayIso);
  /** 수정 중인 주문 (없으면 새 주문) */
  const [editingOrder, setEditingOrder] = useState<ApiMemberOrder | null>(null);
  const [viewingOrderNumber, setViewingOrderNumber] = useState<string | null>(
    null,
  );
  const [deletingOrder, setDeletingOrder] = useState<V2Order | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

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
        setRawOrders(data);
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

  const backToCalendar = () => {
    setScreen("calendar");
    setEditingOrder(null);
    window.scrollTo(0, 0);
  };

  const closeDeleteConfirm = () => {
    if (isDeleting) return;
    setDeletingOrder(null);
    setDeleteError("");
  };

  /** 삭제 = 주문 취소(CANCEL_ORDER). 회원 화면·관리자 목록에서 빠지고 재고가 되돌아간다 */
  const confirmDelete = async () => {
    if (!deletingOrder || isDeleting) return;
    setIsDeleting(true);
    setDeleteError("");
    try {
      const response = await apiFetch(
        `/api/orders/${deletingOrder.id}/delivery-action`,
        {
          method: "PATCH",
          body: JSON.stringify({ action: "CANCEL_ORDER" }),
        },
      );
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          message?: string | string[];
        } | null;
        const raw = data?.message;
        throw new Error(
          (Array.isArray(raw) ? raw[0] : raw) || "주문을 삭제하지 못했습니다.",
        );
      }
      setDeletingOrder(null);
      setReloadToken((token) => token + 1);
    } catch (err) {
      setDeleteError(
        err instanceof Error ? err.message : "주문을 삭제하지 못했습니다.",
      );
    } finally {
      setIsDeleting(false);
    }
  };

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
            setEditingOrder(null);
            setNewOrderDate(iso);
            setScreen("new");
            window.scrollTo(0, 0);
          }}
          onViewOrder={setViewingOrderNumber}
          onEditOrder={(order) => {
            const raw = rawOrders.find((row) => row.id === order.id);
            if (!raw) return;
            setEditingOrder(raw);
            setScreen("new");
            window.scrollTo(0, 0);
          }}
          onDeleteOrder={(order) => {
            setDeleteError("");
            setDeletingOrder(order);
          }}
        />
      ) : (
        <NewOrderV2
          key={editingOrder ? `edit-${editingOrder.id}` : newOrderDate}
          initialDate={newOrderDate}
          editOrder={editingOrder}
          onBackToList={backToCalendar}
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

      {deletingOrder ? (
        <div className="jy-confirm-backdrop" onClick={closeDeleteConfirm}>
          <div
            className="jy-confirm"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="jy-delete-title"
            onClick={(event) => event.stopPropagation()}
          >
            <p id="jy-delete-title">삭제하면 되돌릴수 없습니다. 진행하시겠습니까?</p>
            <span className="jy-meta">
              {deletingOrder.orderNumber} · {deletingOrder.summary}
            </span>
            {deleteError ? <div className="jy-err">{deleteError}</div> : null}
            <div className="jy-two">
              <button
                type="button"
                className="jy-btn jy-big"
                style={{ flex: 1 }}
                disabled={isDeleting}
                onClick={closeDeleteConfirm}
              >
                취소
              </button>
              <button
                type="button"
                className="jy-btn jy-primary jy-big"
                style={{ flex: 1 }}
                disabled={isDeleting}
                aria-busy={isDeleting}
                onClick={() => void confirmDelete()}
              >
                {isDeleting ? "삭제 중…" : "확인"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
