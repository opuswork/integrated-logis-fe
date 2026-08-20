"use client";

import { Plus } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { OrderPrintPreviewModal } from "@/app/admin/OrderManagement/OrderPrintPreview";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import {
  canApproveGreetingAction,
  canCreateAdminOrder,
  canWriteOrderChecklist,
  getAuthUser,
  type AdminRegion,
  type AuthUser,
} from "@/lib/auth";
import {
  canEditOrderStatus,
  memberFacingStatusLabel,
  type DeliveryOrderStatus,
} from "@/lib/order-delivery";
import {
  parseBranchStoreFromNotes,
  parseOrderDateFromNotes,
  parseOrdererFromNotes,
  parseOrderTypeFromNotes,
} from "@/lib/order-notes";
import { cn } from "@/lib/utils";

type PackagingWorker = "STORE" | "FACTORY" | null;

type AdminOrderRow = {
  id: number;
  orderNumber: string;
  name: string;
  type: string;
  status: DeliveryOrderStatus;
  statusLabel: string;
  orderDate: string;
  storeRegion: AdminRegion | null;
  packagingWorker: PackagingWorker;
  orderConfirmedAt: string | null;
  orderConfirmedBy: string | null;
  paymentDone: boolean;
  paymentAuthor: string | null;
  greetingDone: boolean;
  greetingCount: number;
  slipDone: boolean;
  slipAuthor: string | null;
  readyForShipment: boolean;
  fulfillmentType: string | null;
};

type DraftState = {
  worker: "STORE" | "FACTORY" | "";
};

function regionFromNotes(notes?: string | null): AdminRegion | null {
  const branch = parseBranchStoreFromNotes(notes);
  if (branch.includes("남부")) return "NAMBU";
  if (branch.includes("중부")) return "JUNGBU";
  if (branch.includes("서부")) return "SEOBU";
  return null;
}

function regionLabel(region: AdminRegion | null) {
  if (region === "NAMBU") return "남부";
  if (region === "JUNGBU") return "중부";
  if (region === "SEOBU") return "서부";
  return "—";
}

function regionClass(region: AdminRegion | null) {
  if (region === "NAMBU") return "bg-[#dbeafe] text-[#1d4ed8]";
  if (region === "JUNGBU") return "bg-[#ede9fe] text-[#6d28d9]";
  if (region === "SEOBU") return "bg-[#dcfce7] text-[#15803d]";
  return "bg-[#f1f5f9] text-[#64748b]";
}

function statusChipClass(status: DeliveryOrderStatus) {
  if (status === "CANCELLED") return "bg-[#fee2e2] text-[#b91c1c]";
  if (status === "PRINTING_COMPLETE") return "bg-[#e0e7ff] text-[#3730a3]";
  if (status === "SHIPPING" || status === "RECEIVED")
    return "bg-[#fce7f3] text-[#9d174d]";
  if (status === "PREPARED" || status === "LOAD_NOTIFIED")
    return "bg-[#fef3c7] text-[#92400e]";
  return "bg-[#f8fafc] text-ink border border-[#cbd5e1]";
}

function isParcelType(type: string, fulfillmentType: string | null) {
  return type.startsWith("택배") || fulfillmentType === "PARCEL";
}

function canMutateRow(user: AuthUser | null, row: AdminOrderRow) {
  return canWriteOrderChecklist(user, row.storeRegion);
}

function Panel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "min-w-0 rounded-lg border border-line bg-panel p-3.5",
        className,
      )}
    >
      {children}
    </section>
  );
}

function CellBtn({
  children,
  disabled,
  onClick,
  variant = "confirm",
}: {
  children: ReactNode;
  disabled?: boolean;
  onClick?: () => void;
  variant?: "confirm" | "ghost";
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors",
        variant === "confirm" &&
          "bg-[#2563eb] text-white hover:bg-[#1d4ed8] disabled:bg-[#cbd5e1] disabled:text-[#64748b]",
        variant === "ghost" &&
          "border border-[#cbd5e1] bg-white text-ink hover:bg-soft disabled:opacity-40",
        disabled && "cursor-not-allowed",
      )}
    >
      {children}
    </button>
  );
}

export function AdminOrderList({
  onNewOrder,
  onEditOrder,
}: {
  onNewOrder: () => void;
  onEditOrder?: (orderNumber: string) => void;
}) {
  const authUser = getAuthUser();
  const canApproveGreeting = canApproveGreetingAction(authUser);
  const canCreateOrder = canCreateAdminOrder(authUser);

  const [orders, setOrders] = useState<AdminOrderRow[]>([]);
  const [drafts, setDrafts] = useState<Record<number, DraftState>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [regionFilter, setRegionFilter] = useState<"all" | AdminRegion>("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [orderDate, setOrderDate] = useState("");
  const [keyword, setKeyword] = useState("");
  const [viewingOrderNumber, setViewingOrderNumber] = useState<string | null>(
    null,
  );

  const mapApiOrder = useCallback(
    (order: {
      id: number;
      orderNumber: string;
      status: DeliveryOrderStatus;
      createdAt: string;
      notes?: string | null;
      storeRegion?: AdminRegion | null;
      packagingWorker?: PackagingWorker;
      orderConfirmedAt?: string | null;
      orderConfirmedBy?: string | null;
      paymentDone?: boolean;
      paymentAuthor?: string | null;
      greetingDone?: boolean;
      slipDone?: boolean;
      slipAuthor?: string | null;
      readyForShipment?: boolean;
      items?: unknown[];
      greetingForms?: unknown[];
      shipment?: { fulfillmentType?: string | null } | null;
      user?: { fullname?: string | null } | null;
    }): AdminOrderRow => {
      const type = parseOrderTypeFromNotes(order.notes);
      return {
        id: order.id,
        orderNumber: order.orderNumber,
        name:
          parseOrdererFromNotes(order.notes) || order.user?.fullname || "-",
        type,
        status: order.status,
        statusLabel:
          order.orderConfirmedAt || order.status !== "PLACED"
            ? memberFacingStatusLabel(order.status)
            : "접수",
        orderDate:
          parseOrderDateFromNotes(order.notes) ||
          order.createdAt.slice(0, 10),
        storeRegion: order.storeRegion ?? regionFromNotes(order.notes),
        packagingWorker: order.packagingWorker ?? null,
        orderConfirmedAt: order.orderConfirmedAt ?? null,
        orderConfirmedBy: order.orderConfirmedBy ?? null,
        paymentDone: order.paymentDone === true,
        paymentAuthor: order.paymentAuthor ?? null,
        greetingDone: order.greetingDone === true,
        greetingCount: order.greetingForms?.length ?? 0,
        slipDone: order.slipDone === true,
        slipAuthor: order.slipAuthor ?? null,
        readyForShipment: order.readyForShipment === true,
        fulfillmentType: order.shipment?.fulfillmentType ?? null,
      };
    },
    [],
  );

  const loadOrders = useCallback(
    async (silent = false) => {
      if (!silent) {
        setIsLoading(true);
        setError("");
      }
      try {
        const response = await apiFetch("/api/orders");
        const data = (await response.json()) as unknown;
        if (!response.ok || !Array.isArray(data)) {
          if (!silent) {
            setError("주문 목록을 불러오지 못했습니다.");
            setOrders([]);
          }
          return;
        }
        const rows = (data as Parameters<typeof mapApiOrder>[0][])
          .filter((order) => order.status !== "CANCELLED")
          .map(mapApiOrder);
        setOrders(rows);
        setDrafts((prev) => {
          const next = { ...prev };
          for (const row of rows) {
            if (!next[row.id]) {
              next[row.id] = {
                worker: row.packagingWorker ?? "",
              };
            }
          }
          return next;
        });
      } catch {
        if (!silent) {
          setError("주문 목록을 불러오지 못했습니다.");
          setOrders([]);
        }
      } finally {
        if (!silent) setIsLoading(false);
      }
    },
    [mapApiOrder],
  );

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  useEffect(() => {
    if (viewingOrderNumber) return;
    const timer = window.setInterval(() => void loadOrders(true), 5000);
    return () => window.clearInterval(timer);
  }, [viewingOrderNumber, loadOrders]);

  const filteredOrders = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    return orders.filter((order) => {
      if (regionFilter !== "all" && order.storeRegion !== regionFilter) {
        return false;
      }
      if (statusFilter !== "all") {
        if (statusFilter === "접수") {
          if (
            !(
              order.status === "PLACED" ||
              order.status === "WAITING_FOR_SHIPMENT"
            )
          ) {
            return false;
          }
        } else if (statusFilter === "발송대기") {
          if (
            !(
              order.status === "PREPARED" || order.status === "LOAD_NOTIFIED"
            )
          ) {
            return false;
          }
        } else if (statusFilter === "출력완료") {
          if (order.status !== "PRINTING_COMPLETE") return false;
        } else if (statusFilter === "발송완료") {
          if (
            !(order.status === "SHIPPING" || order.status === "RECEIVED")
          ) {
            return false;
          }
        } else if (statusFilter === "취소") {
          if (order.status !== "CANCELLED") return false;
        }
      }
      if (orderDate && order.orderDate !== orderDate) return false;
      if (
        q &&
        !order.orderNumber.toLowerCase().includes(q) &&
        !order.name.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [orders, regionFilter, statusFilter, orderDate, keyword]);

  const patchChecklist = async (
    orderId: number,
    body: Record<string, unknown>,
    key: string,
  ) => {
    setSavingId(key);
    setActionError("");
    try {
      const response = await apiFetch(`/api/orders/${orderId}/admin-checklist`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await response.json()) as
        | Parameters<typeof mapApiOrder>[0]
        | { message?: string };
      if (!response.ok) {
        setActionError(
          "message" in data && data.message
            ? data.message
            : "저장에 실패했습니다.",
        );
        return;
      }
      const mapped = mapApiOrder(data as Parameters<typeof mapApiOrder>[0]);
      setOrders((prev) =>
        prev.map((row) => (row.id === orderId ? mapped : row)),
      );
      setDrafts((prev) => ({
        ...prev,
        [orderId]: {
          worker: mapped.packagingWorker ?? "",
        },
      }));
    } catch {
      setActionError("저장에 실패했습니다.");
    } finally {
      setSavingId(null);
    }
  };

  const updateDraft = (id: number, patch: Partial<DraftState>) => {
    setDrafts((prev) => ({
      ...prev,
      [id]: { ...(prev[id] ?? { worker: "" }), ...patch },
    }));
  };

  return (
    <div className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-ink min-[1040px]:text-[22px]">
            주문관리
          </h3>
          <p className="mt-1 text-[13px] text-muted-foreground">
            지역 매장관리자는 자지역 주문만 처리합니다. 인사장완료는
            Factory-G(01029647088)만 확인 가능합니다. 공장관리자는 목록만
            조회합니다.
          </p>
        </div>
        {canCreateOrder ? (
          <Button type="button" onClick={onNewOrder}>
            <Plus className="size-4" />
            신규작성
          </Button>
        ) : null}
      </div>

      <Panel>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={regionFilter}
              onChange={(e) =>
                setRegionFilter(e.target.value as "all" | AdminRegion)
              }
              className="rounded-[7px] border border-line bg-white px-2.5 py-2 text-sm"
            >
              <option value="all">전체 지역</option>
              <option value="NAMBU">남부</option>
              <option value="JUNGBU">중부</option>
              <option value="SEOBU">서부</option>
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-[7px] border border-line bg-white px-2.5 py-2 text-sm"
            >
              <option value="all">전체 상태</option>
              <option value="접수">접수</option>
              <option value="발송대기">발송대기</option>
              <option value="출력완료">출력완료</option>
              <option value="발송완료">발송완료</option>
              <option value="취소">취소</option>
            </select>
            <input
              type="date"
              value={orderDate}
              onChange={(e) => setOrderDate(e.target.value)}
              className="rounded-[7px] border border-line bg-white px-2.5 py-2 text-sm"
            />
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="주문번호 · 성명 검색"
              className="w-[180px] rounded-[7px] border border-line bg-white px-2.5 py-2 text-sm"
            />
          </div>
          <div className="text-[11.5px] text-[#64748b]">
            총 {filteredOrders.length}건
          </div>
        </div>

        {error ? (
          <p className="mb-2 rounded-[7px] border border-red/30 bg-[#fff0ed] px-3 py-2 text-sm text-red">
            {error}
          </p>
        ) : null}
        {actionError ? (
          <p className="mb-2 rounded-[7px] border border-red/30 bg-[#fff0ed] px-3 py-2 text-sm text-red">
            {actionError}
          </p>
        ) : null}

        {isLoading ? (
          <p className="py-8 text-center text-sm text-[#64748b]">불러오는 중…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[1100px] w-full border-collapse text-[12.5px]">
              <thead>
                <tr className="border-b border-line bg-[#f8fafc] text-left text-[12px] text-[#64748b]">
                  <th className="px-2 py-2 font-semibold">작업자</th>
                  <th className="px-2 py-2 font-semibold">주문매장</th>
                  <th className="px-2 py-2 font-semibold">주문번호</th>
                  <th className="px-2 py-2 font-semibold">성명</th>
                  <th className="px-2 py-2 font-semibold">구분</th>
                  <th className="px-2 py-2 font-semibold">주문확인</th>
                  <th className="px-2 py-2 font-semibold">상태</th>
                  <th className="px-2 py-2 font-semibold">결제완료</th>
                  <th className="px-2 py-2 font-semibold">인사장완료</th>
                  <th className="px-2 py-2 font-semibold">기표지완료</th>
                  <th className="px-2 py-2 font-semibold">출력</th>
                  <th className="px-2 py-2 font-semibold">보기</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map((row) => {
                  const mutable = canMutateRow(authUser, row);
                  const locked = !mutable;
                  const draft = drafts[row.id] ?? {
                    worker: row.packagingWorker ?? "",
                  };
                  const parcel = isParcelType(row.type, row.fulfillmentType);
                  const needsGreeting = row.greetingCount > 0;
                  const confirmed = Boolean(row.orderConfirmedAt);

                  return (
                    <tr
                      key={row.id}
                      className={cn(
                        "border-b border-[#eef2f7]",
                        locked && "bg-[#f8fafc]",
                      )}
                    >
                      <td className="px-2 py-2 align-top">
                        {row.packagingWorker && locked ? (
                          <span className="rounded bg-[#dcfce7] px-2 py-0.5 text-[11px] font-semibold text-[#15803d]">
                            {row.packagingWorker === "STORE" ? "매장" : "공장"}
                          </span>
                        ) : (
                          <div className="flex flex-col gap-1">
                            <select
                              disabled={locked || Boolean(row.packagingWorker)}
                              value={draft.worker ?? ""}
                              onChange={(e) =>
                                updateDraft(row.id, {
                                  worker: (e.target.value || "") as
                                    | "STORE"
                                    | "FACTORY"
                                    | "",
                                })
                              }
                              className="rounded border border-line px-1.5 py-1 disabled:opacity-50"
                            >
                              <option value="">선택</option>
                              <option value="STORE">매장</option>
                              <option value="FACTORY">공장</option>
                            </select>
                            {!row.packagingWorker ? (
                              <CellBtn
                                disabled={
                                  locked ||
                                  !draft.worker ||
                                  savingId === `w-${row.id}`
                                }
                                onClick={() =>
                                  void patchChecklist(
                                    row.id,
                                    {
                                      action: "worker",
                                      packagingWorker: draft.worker,
                                    },
                                    `w-${row.id}`,
                                  )
                                }
                              >
                                저장
                              </CellBtn>
                            ) : (
                              <span className="text-[11px] text-[#64748b]">
                                {row.packagingWorker === "STORE"
                                  ? "매장"
                                  : "공장"}
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-2 align-middle">
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                            regionClass(row.storeRegion),
                          )}
                        >
                          {regionLabel(row.storeRegion)}
                        </span>
                      </td>
                      <td className="px-2 py-2 align-middle font-medium">
                        {mutable &&
                        canEditOrderStatus(row.status) &&
                        onEditOrder ? (
                          <button
                            type="button"
                            className="text-left text-brand underline-offset-2 hover:underline"
                            onClick={() => onEditOrder(row.orderNumber)}
                          >
                            {row.orderNumber}
                          </button>
                        ) : (
                          row.orderNumber
                        )}
                      </td>
                      <td className="px-2 py-2 align-middle">{row.name}</td>
                      <td className="px-2 py-2 align-middle">{row.type}</td>
                      <td className="px-2 py-2 align-middle">
                        {confirmed ? (
                          <span className="rounded bg-[#f1f5f9] px-2 py-1 text-[11px] text-[#64748b]">
                            확인
                          </span>
                        ) : (
                          <CellBtn
                            disabled={locked || savingId === `c-${row.id}`}
                            onClick={() =>
                              void patchChecklist(
                                row.id,
                                { action: "confirm" },
                                `c-${row.id}`,
                              )
                            }
                          >
                            확인
                          </CellBtn>
                        )}
                      </td>
                      <td className="px-2 py-2 align-middle">
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                            statusChipClass(row.status),
                          )}
                        >
                          {row.statusLabel}
                        </span>
                      </td>
                      <td className="px-2 py-2 align-top">
                        {row.paymentDone ? (
                          <div className="flex flex-col gap-1">
                            <span className="text-[11px] font-semibold text-[#15803d]">
                              결제자: {row.paymentAuthor || "—"}
                            </span>
                            <CellBtn disabled>확인</CellBtn>
                          </div>
                        ) : (
                          <CellBtn
                            disabled={locked || savingId === `p-${row.id}`}
                            onClick={() =>
                              void patchChecklist(
                                row.id,
                                { action: "payment" },
                                `p-${row.id}`,
                              )
                            }
                          >
                            확인
                          </CellBtn>
                        )}
                      </td>
                      <td className="px-2 py-2 align-top">
                        {!needsGreeting ? (
                          <span className="rounded bg-[#f1f5f9] px-2 py-0.5 text-[11px] font-semibold text-[#64748b]">
                            X
                          </span>
                        ) : row.greetingDone ? (
                          <div className="flex flex-col gap-1">
                            <span className="rounded bg-[#dcfce7] px-2 py-0.5 text-[11px] font-semibold text-[#15803d]">
                              Y
                            </span>
                            <CellBtn disabled>확인</CellBtn>
                          </div>
                        ) : (
                          <CellBtn
                            disabled={
                              !canApproveGreeting ||
                              savingId === `g-${row.id}`
                            }
                            onClick={() =>
                              void patchChecklist(
                                row.id,
                                { action: "greeting" },
                                `g-${row.id}`,
                              )
                            }
                          >
                            확인
                          </CellBtn>
                        )}
                      </td>
                      <td className="px-2 py-2 align-top">
                        {!parcel ? (
                          <span className="rounded bg-[#f1f5f9] px-2 py-0.5 text-[11px] font-semibold text-[#64748b]">
                            X
                          </span>
                        ) : row.slipDone ? (
                          <div className="flex flex-col gap-1">
                            <span className="text-[11px] font-semibold text-[#15803d]">
                              확인: {row.slipAuthor || "—"}
                            </span>
                            <CellBtn disabled>확인</CellBtn>
                          </div>
                        ) : (
                          <CellBtn
                            disabled={locked || savingId === `s-${row.id}`}
                            onClick={() =>
                              void patchChecklist(
                                row.id,
                                { action: "slip" },
                                `s-${row.id}`,
                              )
                            }
                          >
                            확인
                          </CellBtn>
                        )}
                      </td>
                      <td className="px-2 py-2 align-middle">
                        <CellBtn
                          variant="ghost"
                          disabled
                          onClick={() => undefined}
                        >
                          출력
                        </CellBtn>
                      </td>
                      <td className="px-2 py-2 align-middle">
                        <CellBtn
                          variant="ghost"
                          onClick={() => setViewingOrderNumber(row.orderNumber)}
                        >
                          보기
                        </CellBtn>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filteredOrders.length === 0 ? (
              <p className="py-8 text-center text-sm text-[#64748b]">
                표시할 주문이 없습니다.
              </p>
            ) : null}
          </div>
        )}

        <p className="mt-3 text-[11px] leading-relaxed text-[#64748b]">
          지역 매장관리자는 자지역 주문만 작성·수정·확인합니다. 인사장완료는
          Factory-G(01029647088)만 가능합니다. 인사장이 없으면 인사장완료는 X,
          택배가 아니면 기표지완료는 X입니다. 작업자·주문확인·결제·인사장·기표지
          5항목이 모두 충족되면 배송·출고·포장관리에 표시됩니다.
        </p>
      </Panel>

      <OrderPrintPreviewModal
        open={Boolean(viewingOrderNumber)}
        orderNumber={viewingOrderNumber}
        onClose={() => setViewingOrderNumber(null)}
      />
    </div>
  );
}

export default AdminOrderList;
