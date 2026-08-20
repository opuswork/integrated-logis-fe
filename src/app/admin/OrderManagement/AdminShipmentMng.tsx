"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { apiFetch } from "@/lib/api";
import { getAuthUser } from "@/lib/auth";
import {
  mapShipmentOpsOrder,
  parseApiErrorMessage,
  patchShipmentOps,
  todayIsoDate,
  type ShipmentOpsOrder,
} from "@/lib/shipment-ops";
import { cn } from "@/lib/utils";

function YnBadge({ yes }: { yes: boolean }) {
  return (
    <span
      className={cn(
        "rounded px-1.5 py-0.5 text-[11px] font-bold",
        yes ? "bg-[#E9F8EF] text-[#2F855A]" : "bg-[#F1F3F5] text-[#718096]",
      )}
    >
      {yes ? "Y" : "N"}
    </span>
  );
}

function RegionTag({ label }: { label: string }) {
  return (
    <span className="rounded bg-[#EDF2F7] px-1.5 py-0.5 text-[11px] font-bold text-[#1A365D]">
      {label}
    </span>
  );
}

function CellBtn({
  children,
  disabled,
  onClick,
  variant = "ghost",
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick?: () => void;
  variant?: "ghost" | "confirm";
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "rounded-md px-2.5 py-1 text-[11px] font-bold transition-colors",
        variant === "confirm" &&
          "bg-[#3182CE] text-white hover:bg-[#2B6CB0] disabled:bg-[#CBD5E0]",
        variant === "ghost" &&
          "border border-[#E2E8F0] bg-white text-[#1A202C] hover:bg-[#F5F7FA] disabled:opacity-40",
        disabled && "cursor-not-allowed",
      )}
    >
      {children}
    </button>
  );
}

function isUrgent(row: ShipmentOpsOrder) {
  if (row.finalCompleteDone || row.status === "SHIPPING" || row.status === "RECEIVED") {
    return false;
  }
  if (!row.requestedShipDate) return false;
  const req = new Date(`${row.requestedShipDate}T00:00:00`);
  const limit = new Date();
  limit.setHours(0, 0, 0, 0);
  limit.setDate(limit.getDate() + 3);
  return req.getTime() <= limit.getTime();
}

export function AdminShipmentMng() {
  const auth = getAuthUser();
  const canOperate = auth?.role === "admin" || auth?.role === "factory";
  const [rows, setRows] = useState<ShipmentOpsOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [storeFilter, setStoreFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [workerFilter, setWorkerFilter] = useState("all");

  const load = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true);
      setError("");
    }
    try {
      const res = await apiFetch("/api/orders?readyForShipment=true");
      const data = await res.json();
      if (!res.ok || !Array.isArray(data)) {
        if (!silent) {
          setError("배송관리 목록을 불러오지 못했습니다.");
          setRows([]);
        }
        return;
      }
      setRows(
        data
          .filter((o: { status?: string }) => o.status !== "CANCELLED")
          .map(mapShipmentOpsOrder),
      );
    } catch {
      if (!silent) {
        setError("배송관리 목록을 불러오지 못했습니다.");
        setRows([]);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const t = window.setInterval(() => void load(true), 8000);
    return () => window.clearInterval(t);
  }, [load]);

  const filtered = useMemo(() => {
    return rows.filter((row) => {
      if (storeFilter !== "all" && row.storeLabel !== storeFilter) return false;
      if (workerFilter === "매장" && row.workerLabel !== "매장") return false;
      if (workerFilter === "공장" && row.workerLabel !== "공장") return false;
      if (statusFilter !== "all") {
        if (statusFilter === "접수" && !["접수", "접수완료"].includes(row.statusLabel))
          return false;
        if (statusFilter === "발송대기" && row.statusLabel !== "발송대기")
          return false;
        if (statusFilter === "발송완료" && row.statusLabel !== "발송완료")
          return false;
        if (
          statusFilter === "출력완료" &&
          row.statusLabel !== "출력완료"
        )
          return false;
      }
      return true;
    });
  }, [rows, storeFilter, statusFilter, workerFilter]);

  const urgentCount = filtered.filter(isUrgent).length;

  const runOp = async (
    orderId: number,
    body: Record<string, unknown>,
    key: string,
  ) => {
    setSavingId(key);
    setActionError("");
    try {
      const { response, data } = await patchShipmentOps(orderId, body, apiFetch);
      if (!response.ok) {
        setActionError(parseApiErrorMessage(data));
        return;
      }
      setRows((prev) =>
        prev.map((r) =>
          r.id === orderId ? mapShipmentOpsOrder(data as never) : r,
        ),
      );
    } catch {
      setActionError("처리에 실패했습니다.");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div>
      <div className="mb-[18px]">
        <h3 className="text-[19px] font-bold tracking-tight text-[#1A202C]">
          배송관리
        </h3>
        <p className="mt-1 text-[12.5px] text-[#A0AEC0]">
          현재일 + 3일 ≥ 출고요청일 이고 미출고 상태인 건은 주황색으로 강조됩니다
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E2E8F0] px-3 py-2.5">
          <div className="flex flex-wrap gap-2">
            <select
              value={storeFilter}
              onChange={(e) => setStoreFilter(e.target.value)}
              className="rounded-[7px] border border-[#E2E8F0] px-2.5 py-1.5 text-[12.5px]"
            >
              <option value="all">전체 매장</option>
              <option value="남부">남부</option>
              <option value="중부">중부</option>
              <option value="서부">서부</option>
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-[7px] border border-[#E2E8F0] px-2.5 py-1.5 text-[12.5px]"
            >
              <option value="all">전체 상태</option>
              <option value="접수">접수</option>
              <option value="발송대기">발송대기</option>
              <option value="출력완료">출력완료</option>
              <option value="발송완료">발송완료</option>
            </select>
            <select
              value={workerFilter}
              onChange={(e) => setWorkerFilter(e.target.value)}
              className="rounded-[7px] border border-[#E2E8F0] px-2.5 py-1.5 text-[12.5px]"
            >
              <option value="all">전체 작업자</option>
              <option value="매장">매장</option>
              <option value="공장">공장</option>
            </select>
          </div>
          <div className="flex items-center gap-1.5 text-[11.5px] text-[#A0AEC0]">
            <span className="inline-block size-[9px] rounded-[3px] bg-[#F6AD55]" />
            출고 임박 {urgentCount}건
          </div>
        </div>

        {error ? (
          <p className="p-4 text-sm text-[#E53E3E]">{error}</p>
        ) : loading ? (
          <p className="p-4 text-sm text-[#64748B]">불러오는 중…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1400px] border-collapse text-left text-[12px]">
              <thead className="bg-[#EDF2F7] text-[11px] font-bold text-[#64748B]">
                <tr>
                  <th className="px-2 py-2">작업자</th>
                  <th className="px-2 py-2">주문번호</th>
                  <th className="px-2 py-2">매장</th>
                  <th className="px-2 py-2">중앙</th>
                  <th className="px-2 py-2">이름</th>
                  <th className="px-2 py-2">거래처</th>
                  <th className="px-2 py-2">품목</th>
                  <th className="px-2 py-2">수량</th>
                  <th className="px-2 py-2">출고요청일</th>
                  <th className="px-2 py-2">상차/택배</th>
                  <th className="px-2 py-2">개별/박스</th>
                  <th className="px-2 py-2">출고중 여부</th>
                  <th className="px-2 py-2">결제완료</th>
                  <th className="px-2 py-2">기표지완료</th>
                  <th className="px-2 py-2">출고확인</th>
                  <th className="px-2 py-2">인사장완료</th>
                  <th className="px-2 py-2">상태</th>
                  <th className="px-2 py-2">최종완료</th>
                  <th className="px-2 py-2">최종확인</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => {
                  const urgent = isUrgent(row);
                  const greetingYes =
                    row.greetingCount === 0 ? null : row.greetingDone;
                  const slipYes = row.isParcel ? row.slipDone : null;
                  const finalCompleteEnabled =
                    canOperate && row.releaseDone && !row.finalCompleteDone;
                  return (
                    <tr
                      key={row.id}
                      className={cn(
                        "border-t border-[#E2E8F0]",
                        urgent && "bg-[#FFF7ED]",
                      )}
                    >
                      <td className="px-2 py-2">
                        <span
                          className={cn(
                            "rounded px-1.5 py-0.5 text-[11px] font-bold",
                            row.workerLabel === "—"
                              ? "bg-[#F1F3F5] text-[#718096]"
                              : "bg-[#E9F8EF] text-[#2F855A]",
                          )}
                        >
                          {row.workerLabel}
                        </span>
                      </td>
                      <td className="px-2 py-2 font-semibold text-[#1A365D]">
                        {row.orderNumber}
                      </td>
                      <td className="px-2 py-2">
                        <RegionTag label={row.storeLabel} />
                      </td>
                      <td className="px-2 py-2">{row.churchName}</td>
                      <td className="px-2 py-2">
                        {row.name}
                        {urgent ? (
                          <span className="ml-1 inline-flex items-center gap-0.5 rounded bg-[#FFEDD5] px-1.5 py-0.5 text-[10px] font-bold text-[#9C4221]">
                            <span className="size-1.5 rounded-full bg-[#F6AD55]" />
                            임박
                          </span>
                        ) : null}
                      </td>
                      <td className="px-2 py-2">{row.clientLabel}</td>
                      <td className="px-2 py-2">{row.productSummary}</td>
                      <td className="px-2 py-2">{row.quantity}</td>
                      <td className="px-2 py-2">
                        <input
                          type="date"
                          min={todayIsoDate()}
                          disabled={!canOperate || savingId === `d-${row.id}`}
                          value={row.requestedShipDate ?? ""}
                          onChange={(e) => {
                            const v = e.target.value;
                            if (!v) return;
                            void runOp(
                              row.id,
                              { action: "setShipDate", shipDate: v },
                              `d-${row.id}`,
                            );
                          }}
                          className="rounded border border-[#E2E8F0] px-1.5 py-1 text-[12px] disabled:opacity-50"
                        />
                      </td>
                      <td className="px-2 py-2">{row.loadType}</td>
                      <td className="px-2 py-2">{row.unitType}</td>
                      <td className="px-2 py-2">
                        <span
                          className={cn(
                            "rounded px-1.5 py-0.5 text-[11px] font-bold",
                            row.shipProgressLabel === "완료"
                              ? "bg-[#E9F8EF] text-[#2F855A]"
                              : "bg-[#F1F3F5] text-[#718096]",
                          )}
                        >
                          {row.shipProgressLabel}
                        </span>
                      </td>
                      <td className="px-2 py-2">
                        <YnBadge yes />
                      </td>
                      <td className="px-2 py-2">
                        {slipYes === null ? (
                          <span className="rounded bg-[#F1F3F5] px-1.5 py-0.5 text-[11px] font-bold text-[#718096]">
                            X
                          </span>
                        ) : (
                          <YnBadge yes={slipYes} />
                        )}
                      </td>
                      <td className="px-2 py-2">
                        {row.releaseDoneAt
                          ? row.releaseDoneAt.slice(0, 10).replaceAll("-", ".")
                          : "—"}
                      </td>
                      <td className="px-2 py-2">
                        {greetingYes === null ? (
                          <span className="rounded bg-[#F1F3F5] px-1.5 py-0.5 text-[11px] font-bold text-[#718096]">
                            X
                          </span>
                        ) : (
                          <YnBadge yes={greetingYes} />
                        )}
                      </td>
                      <td className="px-2 py-2">
                        <span className="rounded-full bg-[#EDF2F7] px-2 py-0.5 text-[11px] font-bold text-[#1A365D]">
                          {row.statusLabel}
                        </span>
                      </td>
                      <td className="px-2 py-2">
                        <CellBtn
                          disabled={
                            !finalCompleteEnabled ||
                            savingId === `fc-${row.id}`
                          }
                          onClick={() =>
                            void runOp(
                              row.id,
                              { action: "finalComplete" },
                              `fc-${row.id}`,
                            )
                          }
                        >
                          {row.finalCompleteDone ? "완료됨" : "최종완료"}
                        </CellBtn>
                      </td>
                      <td className="px-2 py-2">
                        {row.isParcel ? (
                          <span
                            className={cn(
                              "rounded px-1.5 py-0.5 text-[11px] font-bold",
                              row.finalConfirmDone
                                ? "bg-[#E9F8EF] text-[#2F855A]"
                                : "bg-[#FDEEEE] text-[#9B2C2C]",
                            )}
                          >
                            {row.finalConfirmDone ? "완료" : "미완료"}
                          </span>
                        ) : (
                          <span className="text-[11px] text-[#A0AEC0]">
                            {row.finalConfirmDone ? "확인됨" : "—"}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filtered.length === 0 ? (
              <p className="py-8 text-center text-sm text-[#64748B]">
                표시할 주문이 없습니다.
              </p>
            ) : null}
          </div>
        )}
      </div>

      {actionError ? (
        <p className="mt-2 text-sm text-[#E53E3E]">{actionError}</p>
      ) : null}

      <p className="mt-3 text-[11px] leading-relaxed text-[#64748B]">
        출고요청일은 오늘 이후 날짜만 선택 가능하며 선택 즉시 저장됩니다.
        출고확인은 출고관리에서 공장 관리자가 출고완료하면 자동 기록됩니다.
        최종완료는 출고완료 후 관리자(매장·공장)가 처리합니다. 택배 건의
        최종확인은 출고관리에서 공장이 처리합니다.
      </p>
    </div>
  );
}

export default AdminShipmentMng;
