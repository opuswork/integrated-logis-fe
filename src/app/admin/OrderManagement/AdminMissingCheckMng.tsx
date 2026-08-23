"use client";

import {
  AlertTriangle,
  Check,
  Package,
  ScrollText,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import { Skeleton, TableSkeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api";
import {
  mapShipmentOpsOrder,
  type ShipmentOpsOrder,
} from "@/lib/shipment-ops";
import { cn } from "@/lib/utils";

function formatInt(n: number) {
  return n.toLocaleString("ko-KR");
}

function formatOrderDate(iso: string) {
  return iso.replaceAll("-", ".");
}

function missingReasons(row: ShipmentOpsOrder): string[] {
  const reasons: string[] = [];
  if (!row.requestedShipDate) {
    reasons.push("배송관리/출고요청일 미입력");
  }
  if (!row.packDate) {
    reasons.push("포장관리/포장완료일 미입력");
  }
  const pt = row.packPt?.trim() ?? "";
  if (!pt) {
    reasons.push("포장관리/PT 미입력");
  }
  return reasons;
}

/** 출고관리 「완료」버튼이 데이터상 disabled인 건 (canOperate 무시) */
function isReleaseDisabledIncomplete(row: ShipmentOpsOrder) {
  if (row.releaseDone) return false;
  return !(row.packDone && Boolean(row.requestedShipDate));
}

export function AdminMissingCheckMng() {
  const [totalOrders, setTotalOrders] = useState(0);
  const [opsRows, setOpsRows] = useState<ShipmentOpsOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [allRes, opsRes] = await Promise.all([
        apiFetch("/api/orders"),
        apiFetch("/api/orders?readyForShipment=true"),
      ]);
      const allData = await allRes.json();
      const opsData = await opsRes.json();
      if (!allRes.ok || !Array.isArray(allData)) {
        throw new Error("주문 목록을 불러오지 못했습니다.");
      }
      if (!opsRes.ok || !Array.isArray(opsData)) {
        throw new Error("출고 대상 주문을 불러오지 못했습니다.");
      }
      setTotalOrders(
        (allData as Array<{ status?: string }>).filter(
          (o) => o.status !== "CANCELLED",
        ).length,
      );
      setOpsRows(
        (opsData as Parameters<typeof mapShipmentOpsOrder>[0][]).map(
          mapShipmentOpsOrder,
        ),
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "누락체크를 불러오지 못했습니다.",
      );
      setTotalOrders(0);
      setOpsRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const metrics = useMemo(() => {
    const releaseDone = opsRows.filter((r) => r.releaseDone).length;
    const packDone = opsRows.filter((r) => r.packDone).length;
    const notPacked = opsRows.filter((r) => !r.packDone).length;
    const notReleased = opsRows.filter(isReleaseDisabledIncomplete).length;
    return { releaseDone, packDone, notReleased, notPacked };
  }, [opsRows]);

  const warnings = useMemo(() => {
    return opsRows
      .map((row) => ({ row, reasons: missingReasons(row) }))
      .filter((x) => x.reasons.length > 0);
  }, [opsRows]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <Skeleton className="h-7 w-28" />
          <Skeleton className="h-4 w-64 max-w-full" />
        </div>
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <div
              key={index}
              className="rounded-xl border border-[#E2E8F0] bg-white p-4"
            >
              <Skeleton className="mb-3 h-3 w-20" />
              <Skeleton className="mb-2 h-8 w-24" />
              <Skeleton className="h-3 w-28" />
            </div>
          ))}
        </div>
        <section className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white p-4">
          <Skeleton className="mb-3 h-4 w-48" />
          <TableSkeleton rows={6} columns={5} className="border-0" />
        </section>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-[#E53E3E]">{error}</p>
        <button
          type="button"
          className="rounded-md border border-[#E2E8F0] bg-white px-3 py-1.5 text-sm font-semibold text-[#1A365D]"
          onClick={() => void load()}
        >
          다시 시도
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-[19px] font-bold tracking-tight text-[#1A202C]">
          누락체크
        </h3>
        <p className="mt-1 text-[12.5px] text-[#A0AEC0]">
          출고·포장 공정 누락을 실시간으로 확인합니다
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="총 주문 건수"
          value={formatInt(totalOrders)}
          unit="건"
          iconBg="bg-[#EBF4FD] text-[#3182CE]"
          icon={<ScrollText className="size-[15px]" strokeWidth={2} />}
        />
        <MetricCard
          label="출고완료"
          value={formatInt(metrics.releaseDone)}
          unit="건"
          iconBg="bg-[#E9F8EF] text-[#2F855A]"
          icon={<Check className="size-[15px]" strokeWidth={2.5} />}
        />
        <MetricCard
          label="포장완료"
          value={formatInt(metrics.packDone)}
          unit="건"
          iconBg="bg-[#EBF4FD] text-[#3182CE]"
          icon={<Package className="size-[15px]" strokeWidth={2} />}
        />
        <MetricCard
          label="미출고 · 미포장"
          value={`${formatInt(metrics.notReleased)} / ${formatInt(metrics.notPacked)}`}
          unit=""
          iconBg="bg-[#FDEEEE] text-[#E53E3E]"
          icon={<AlertTriangle className="size-[15px]" strokeWidth={2} />}
        />
      </div>

      <section className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
        <div className="border-b border-[#E2E8F0] px-[18px] py-3.5 text-[13px] font-bold text-[#1A202C]">
          실시간 공정 누락 경고{" "}
          <span className="text-[#E53E3E]">({warnings.length}건)</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left text-[12.5px]">
            <thead>
              <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-[11.5px] font-bold text-[#64748B]">
                <th className="px-4 py-2.5">주문일자</th>
                <th className="px-4 py-2.5">거래처</th>
                <th className="px-4 py-2.5">수량</th>
                <th className="px-4 py-2.5">누락된 확인내용</th>
              </tr>
            </thead>
            <tbody>
              {warnings.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-8 text-center text-[#64748B]"
                  >
                    누락된 공정이 없습니다.
                  </td>
                </tr>
              ) : (
                warnings.map(({ row, reasons }) => (
                  <tr key={row.id} className="border-b border-[#EEF1F5]">
                    <td className="px-4 py-2.5 tabular-nums text-[#64748B]">
                      {formatOrderDate(row.orderDate)}
                    </td>
                    <td className="px-4 py-2.5 font-semibold text-[#1A202C]">
                      {row.clientLabel}
                    </td>
                    <td className="px-4 py-2.5 tabular-nums">
                      {formatInt(row.quantity)}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap gap-1.5">
                        {reasons.map((reason) => (
                          <span
                            key={reason}
                            className="inline-flex rounded bg-[#FDEEEE] px-2 py-0.5 text-[11px] font-bold text-[#C53030]"
                          >
                            {reason}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function MetricCard({
  label,
  value,
  unit,
  iconBg,
  icon,
}: {
  label: string;
  value: string;
  unit: string;
  iconBg: string;
  icon: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-[#E2E8F0] bg-white px-[18px] py-4">
      <div className="flex items-center justify-between">
        <div className="text-[12px] font-bold text-[#64748B]">{label}</div>
        <div
          className={cn(
            "flex size-[30px] items-center justify-center rounded-lg",
            iconBg,
          )}
        >
          {icon}
        </div>
      </div>
      <div className="text-[25px] font-black tracking-tight text-[#1A202C] tabular-nums">
        {value}
        {unit ? (
          <small className="ml-0.5 text-[13px] font-bold text-[#A0AEC0]">
            {unit}
          </small>
        ) : null}
      </div>
    </div>
  );
}

export default AdminMissingCheckMng;
