"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { TableSkeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api";
import { canWriteShipmentOps, getAuthUser } from "@/lib/auth";
import {
  mapShipmentOpsOrder,
  parseApiErrorMessage,
  patchShipmentOps,
  todayIsoDate,
  type ShipmentOpsOrder,
} from "@/lib/shipment-ops";
import { cn } from "@/lib/utils";

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

function shiftDate(iso: string, delta: number) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
}

export function AdminReleaseMng() {
  const auth = getAuthUser();
  const canOperate = canWriteShipmentOps(auth);
  const [rows, setRows] = useState<ShipmentOpsOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [dateFilter, setDateFilter] = useState(todayIsoDate());
  const [showAll, setShowAll] = useState(false);
  const [storeFilter, setStoreFilter] = useState("");
  const [packFilter, setPackFilter] = useState("");
  const [shipFilter, setShipFilter] = useState("");

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
          setError("출고관리 목록을 불러오지 못했습니다.");
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
        setError("출고관리 목록을 불러오지 못했습니다.");
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
      if (!showAll) {
        if (
          row.requestedShipDate &&
          row.requestedShipDate !== dateFilter
        ) {
          return false;
        }
      }
      if (storeFilter && row.storeLabel !== storeFilter) return false;
      if (packFilter === "완료" && !row.packDone) return false;
      if (packFilter === "미완료" && row.packDone) return false;
      if (shipFilter === "완료" && !row.releaseDone) return false;
      if (shipFilter === "미완료" && row.releaseDone) return false;
      return true;
    });
  }, [rows, showAll, dateFilter, storeFilter, packFilter, shipFilter]);

  const packDoneCount = filtered.filter((r) => r.packDone).length;

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
          출고관리
        </h3>
        <p className="mt-1 text-[12.5px] text-[#A0AEC0]">
          실제 운영 시트 구조(출고전용)를 반영한 화면입니다
        </p>
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              className="rounded border border-[#E2E8F0] px-2 py-1 text-sm"
              onClick={() => {
                setShowAll(false);
                setDateFilter((d) => shiftDate(d, -1));
              }}
            >
              ‹
            </button>
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => {
                setShowAll(false);
                setDateFilter(e.target.value);
              }}
              className="rounded border border-[#E2E8F0] px-2 py-1 text-[13.5px] font-bold text-[#1A365D]"
            />
            <button
              type="button"
              className="rounded border border-[#E2E8F0] px-2 py-1 text-sm"
              onClick={() => {
                setShowAll(false);
                setDateFilter((d) => shiftDate(d, 1));
              }}
            >
              ›
            </button>
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className={cn(
                "rounded-[7px] border px-3 py-1.5 text-[12.5px] font-bold",
                showAll
                  ? "border-[#3182CE] bg-[#EBF4FD] text-[#1A365D]"
                  : "border-[#E2E8F0] bg-white",
              )}
            >
              전체보기
            </button>
          </div>
          <select
            value={storeFilter}
            onChange={(e) => setStoreFilter(e.target.value)}
            className="rounded-[7px] border border-[#E2E8F0] px-2.5 py-1.5 text-[12.5px]"
          >
            <option value="">전체 매장</option>
            <option value="남부">남부</option>
            <option value="중부">중부</option>
            <option value="서부">서부</option>
          </select>
          <select
            value={packFilter}
            onChange={(e) => setPackFilter(e.target.value)}
            className="rounded-[7px] border border-[#E2E8F0] px-2.5 py-1.5 text-[12.5px]"
          >
            <option value="">전체 포장완료</option>
            <option value="완료">완료</option>
            <option value="미완료">미완료</option>
          </select>
          <select
            value={shipFilter}
            onChange={(e) => setShipFilter(e.target.value)}
            className="rounded-[7px] border border-[#E2E8F0] px-2.5 py-1.5 text-[12.5px]"
          >
            <option value="">전체 출고완료</option>
            <option value="완료">완료</option>
            <option value="미완료">미완료</option>
          </select>
        </div>
        <div className="flex flex-wrap gap-2 text-[12px]">
          <span className="rounded-full bg-[#EDF2F7] px-2.5 py-1">
            총 <b>{filtered.length}</b>건
          </span>
          <span className="rounded-full bg-[#EDF2F7] px-2.5 py-1">
            포장완료 <b>{packDoneCount}</b>/{filtered.length}건
          </span>
          <span className="rounded-full bg-[#FFEDD5] px-2.5 py-1 text-[#9C4221]">
            미완료 <b>{filtered.length - packDoneCount}</b>건
          </span>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
        {error ? (
          <p className="p-4 text-sm text-[#E53E3E]">{error}</p>
        ) : loading ? (
          <div className="p-4">
            <TableSkeleton rows={8} columns={8} className="border-0" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1300px] border-collapse text-left text-[12px]">
              <thead className="bg-[#EDF2F7] text-[11px] font-bold text-[#64748B]">
                <tr>
                  <th className="px-2 py-2">No</th>
                  <th className="px-2 py-2">주문일자</th>
                  <th className="px-2 py-2">매장</th>
                  <th className="px-2 py-2">중앙</th>
                  <th className="px-2 py-2">이름</th>
                  <th className="px-2 py-2">거래처</th>
                  <th className="px-2 py-2">품목</th>
                  <th className="px-2 py-2">수량</th>
                  <th className="px-2 py-2">출고요청일</th>
                  <th className="px-2 py-2">상차/택배</th>
                  <th className="px-2 py-2">개별/박스</th>
                  <th className="px-2 py-2">특이사항</th>
                  <th className="px-2 py-2">포장일자</th>
                  <th className="px-2 py-2">PT</th>
                  <th className="px-2 py-2">보관장소</th>
                  <th className="px-2 py-2">포장완료</th>
                  <th className="px-2 py-2">출고완료</th>
                  <th className="px-2 py-2">최종확인</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row, idx) => {
                  const releaseEnabled =
                    canOperate &&
                    row.packDone &&
                    !row.releaseDone &&
                    Boolean(row.requestedShipDate);
                  const confirmEnabled =
                    canOperate &&
                    row.finalCompleteDone &&
                    !row.finalConfirmDone;
                  return (
                    <tr key={row.id} className="border-t border-[#E2E8F0]">
                      <td className="px-2 py-2">{idx + 1}</td>
                      <td className="px-2 py-2">
                        {row.orderDate.replaceAll("-", ".")}
                      </td>
                      <td className="px-2 py-2">{row.storeLabel}</td>
                      <td className="px-2 py-2">{row.churchName}</td>
                      <td className="px-2 py-2 font-semibold">{row.name}</td>
                      <td className="px-2 py-2">{row.clientLabel}</td>
                      <td className="px-2 py-2">{row.productSummary}</td>
                      <td className="px-2 py-2">{row.quantity}</td>
                      <td className="px-2 py-2">
                        {row.requestedShipDate
                          ? row.requestedShipDate.replaceAll("-", ".")
                          : "—"}
                      </td>
                      <td className="px-2 py-2">{row.loadType}</td>
                      <td className="px-2 py-2">{row.unitType}</td>
                      <td className="px-2 py-2">{row.specialNote}</td>
                      <td className="px-2 py-2">
                        {row.packDate
                          ? row.packDate.replaceAll("-", ".")
                          : "—"}
                      </td>
                      <td className="px-2 py-2">
                        {row.packPt ? (
                          <span className="font-bold text-[#3182CE]">
                            {row.packPt}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-2 py-2">
                        {row.storagePlace ? (
                          <span className="rounded bg-[#E9F8EF] px-1.5 py-0.5 text-[11px] font-bold text-[#2F855A]">
                            {row.storagePlace}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-2 py-2">
                        <span
                          className={cn(
                            "rounded px-1.5 py-0.5 text-[11px] font-bold",
                            row.packDone
                              ? "bg-[#E9F8EF] text-[#2F855A]"
                              : "bg-[#FDEEEE] text-[#9B2C2C]",
                          )}
                        >
                          {row.packDone ? "완료" : "—"}
                        </span>
                      </td>
                      <td className="px-2 py-2">
                        <CellBtn
                          variant={releaseEnabled ? "confirm" : "ghost"}
                          disabled={
                            !releaseEnabled || savingId === `r-${row.id}`
                          }
                          onClick={() =>
                            void runOp(
                              row.id,
                              { action: "completeRelease" },
                              `r-${row.id}`,
                            )
                          }
                        >
                          {row.releaseDone ? "출고완료됨" : "완료"}
                        </CellBtn>
                      </td>
                      <td className="px-2 py-2">
                        {row.finalConfirmDone ? (
                          <CellBtn disabled>확인됨</CellBtn>
                        ) : (
                          <CellBtn
                            variant={confirmEnabled ? "confirm" : "ghost"}
                            disabled={
                              !confirmEnabled || savingId === `cf-${row.id}`
                            }
                            onClick={() =>
                              void runOp(
                                row.id,
                                { action: "finalConfirm" },
                                `cf-${row.id}`,
                              )
                            }
                          >
                            최종확인
                          </CellBtn>
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
        <div className="space-y-1 border-t border-[#E2E8F0] px-3 py-2 text-[11px] text-[#64748B]">
          <p>
            포장일자·PT·보관장소·포장완료는 포장관리에서 입력된 값이 자동
            반영됩니다.
          </p>
          <p>
            출고완료는 포장완료·출고요청일 입력 후 공장(또는 최고관리자)이
            처리합니다. 출고요청일이 없으면 완료 버튼이 비활성입니다. 최종확인은
            배송관리 최종완료 후 공장 계정이 처리합니다.
          </p>
        </div>
      </div>

      {actionError ? (
        <p className="mt-2 text-sm text-[#E53E3E]">{actionError}</p>
      ) : null}
    </div>
  );
}

export default AdminReleaseMng;
