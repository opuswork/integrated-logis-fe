"use client";

import {
  AlertTriangle,
  ArrowDownLeft,
  Package,
  Plus,
  Upload,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import { Skeleton, TableSkeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";

type StatusMetrics = {
  totalCurrentStock: number;
  trackedCount: number;
  monthAdditionQty: number;
  monthAdditionEvents: number;
  orderDeductQty: number;
  lowStockCount: number;
};

type StatusRow = {
  id: number;
  productName: string;
  initial: number;
  added: number;
  deducted: number;
  current: number;
  threshold: number;
  updatedAt: string;
  isLow: boolean;
};

type HistoryRow = {
  id: number;
  createdAt: string;
  type: "INITIAL" | "ADDITION" | "ORDER_DEDUCT";
  productName: string;
  delta: number;
  actorLabel: string;
  orderId: number | null;
};

type StatusResponse = {
  metrics: StatusMetrics;
  rows: StatusRow[];
  history: HistoryRow[];
};

function formatInt(n: number) {
  return n.toLocaleString("ko-KR");
}

function formatDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}.${m}.${day}`;
}

function formatDateTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${y}.${m}.${day} ${hh}:${mm}`;
}

function typeLabel(type: HistoryRow["type"]) {
  if (type === "INITIAL") return "초기재고";
  if (type === "ADDITION") return "추가재고";
  return "주문차감";
}

export function StockStatusMng({
  onNavigateToCatalog,
}: {
  onNavigateToCatalog?: () => void;
}) {
  const [data, setData] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [keyword, setKeyword] = useState("");
  const [filter, setFilter] = useState<"all" | "low">("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await apiFetch("/api/stock-inventory/status");
      const json = await res.json();
      if (!res.ok || !json?.metrics) {
        throw new Error(
          typeof json?.message === "string"
            ? json.message
            : "재고 현황을 불러오지 못했습니다.",
        );
      }
      setData(json as StatusResponse);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "재고 현황을 불러오지 못했습니다.",
      );
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredRows = useMemo(() => {
    if (!data) return [];
    const q = keyword.trim().toLowerCase();
    return data.rows.filter((row) => {
      if (filter === "low" && !row.isLow) return false;
      if (q && !row.productName.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [data, keyword, filter]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <Skeleton className="h-7 w-28" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <div
              key={index}
              className="rounded-xl border border-[#E2E8F0] bg-white p-4"
            >
              <Skeleton className="mb-3 h-3 w-20" />
              <Skeleton className="mb-2 h-8 w-24" />
              <Skeleton className="h-3 w-32" />
            </div>
          ))}
        </div>
        <section className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white p-4">
          <TableSkeleton rows={8} columns={6} className="border-0" />
        </section>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-[#E53E3E]">{error || "데이터가 없습니다."}</p>
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

  const { metrics } = data;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-[19px] font-bold tracking-tight text-[#1A202C]">
            재고관리
          </h3>
          <p className="mt-1 text-[12.5px] text-[#A0AEC0]">
            현재재고 = 초기재고 + 추가재고 − 주문 차감. 저재고 임계값 이하 품목은
            데이터관리 대시보드에도 자동 반영됩니다
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onNavigateToCatalog?.()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-[12.5px] font-bold text-[#1A202C] hover:bg-[#F5F7FA]"
          >
            <Upload className="size-3.5" strokeWidth={2} />
            초기재고 업로드
          </button>
          <button
            type="button"
            onClick={() => onNavigateToCatalog?.()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#3182CE] px-3 py-2 text-[12.5px] font-bold text-white hover:bg-[#2B6CB0]"
          >
            <Upload className="size-3.5" strokeWidth={2} />
            추가재고 업로드
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="현재재고 합계"
          value={formatInt(metrics.totalCurrentStock)}
          unit="개"
          iconBg="bg-[#EBF4FD] text-[#3182CE]"
          icon={<Package className="size-[15px]" strokeWidth={2} />}
          delta={`전체 ${formatInt(metrics.trackedCount)}개 품목 합산`}
          deltaClass="text-[#64748B]"
        />
        <MetricCard
          label="누적 추가재고"
          value={formatInt(metrics.monthAdditionQty)}
          unit="개"
          iconBg="bg-[#E9F8EF] text-[#2F855A]"
          icon={<Plus className="size-[15px]" strokeWidth={2} />}
          delta={`이번달 업로드 ${formatInt(metrics.monthAdditionEvents)}건`}
          deltaClass="text-[#64748B]"
        />
        <MetricCard
          label="누적 주문 차감"
          value={formatInt(metrics.orderDeductQty)}
          unit="개"
          iconBg="bg-[#FFEDD5] text-[#9C4221]"
          icon={<ArrowDownLeft className="size-[15px]" strokeWidth={2} />}
          delta="주문관리 실시간 연동"
          deltaClass="text-[#64748B]"
        />
        <MetricCard
          label="저재고 품목"
          value={formatInt(metrics.lowStockCount)}
          unit="개"
          iconBg="bg-[#FDEEEE] text-[#E53E3E]"
          icon={<AlertTriangle className="size-[15px]" strokeWidth={2} />}
          delta="임계값 이하"
          deltaClass="text-[#E53E3E]"
        />
      </div>

      <section className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E2E8F0] px-[18px] py-3.5">
          <div className="flex flex-wrap gap-2">
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="품목명 검색"
              className="h-8 w-[180px] rounded-md border border-[#E2E8F0] px-2.5 text-[12.5px] outline-none focus:border-[#3182CE]"
            />
            <select
              value={filter}
              onChange={(e) =>
                setFilter(e.target.value === "low" ? "low" : "all")
              }
              className="h-8 rounded-md border border-[#E2E8F0] bg-white px-2.5 text-[12.5px] outline-none"
            >
              <option value="all">전체 품목</option>
              <option value="low">저재고만 보기</option>
            </select>
          </div>
          <div className="text-[11.5px] text-[#A0AEC0]">
            총 {formatInt(filteredRows.length)}개 품목
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left text-[12.5px]">
            <thead>
              <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-[11.5px] font-bold text-[#64748B]">
                <th className="px-4 py-2.5 font-bold">품목명</th>
                <th className="px-4 py-2.5 font-bold">초기재고</th>
                <th className="px-4 py-2.5 font-bold">누적 추가</th>
                <th className="px-4 py-2.5 font-bold">누적 차감(주문)</th>
                <th className="px-4 py-2.5 font-bold">현재재고</th>
                <th className="px-4 py-2.5 font-bold">임계값</th>
                <th className="px-4 py-2.5 font-bold">최종 업데이트</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-8 text-center text-[#64748B]"
                  >
                    표시할 품목이 없습니다.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => (
                  <tr
                    key={row.id}
                    className={cn(
                      "border-b border-[#EEF1F5]",
                      row.isLow && "bg-[#FDEEEE]",
                    )}
                  >
                    <td
                      className={cn(
                        "px-4 py-2.5 font-semibold text-[#1A202C]",
                        row.isLow && "shadow-[inset_3px_0_0_#E53E3E]",
                      )}
                    >
                      <span className="inline-flex items-center gap-1.5">
                        {row.productName}
                        {row.isLow ? (
                          <span className="rounded bg-[#E53E3E] px-1.5 py-0.5 text-[10px] font-bold text-white">
                            저재고
                          </span>
                        ) : null}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 tabular-nums">
                      {formatInt(row.initial)}
                    </td>
                    <td className="px-4 py-2.5 tabular-nums text-[#2F855A]">
                      {row.added >= 0 ? "+" : ""}
                      {formatInt(row.added)}
                    </td>
                    <td className="px-4 py-2.5 tabular-nums text-[#E53E3E]">
                      -{formatInt(row.deducted)}
                    </td>
                    <td
                      className={cn(
                        "px-4 py-2.5 font-extrabold tabular-nums",
                        row.isLow ? "text-[#C53030]" : "text-[#1A202C]",
                      )}
                    >
                      {formatInt(row.current)}
                    </td>
                    <td className="px-4 py-2.5 tabular-nums">
                      {row.threshold}
                    </td>
                    <td className="px-4 py-2.5 text-[#64748B]">
                      {formatDate(row.updatedAt)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="border-t border-[#E2E8F0] px-[18px] py-3 text-[11.5px] text-[#64748B]">
          <span className="mr-2 inline-block size-2.5 rounded-sm border border-[#E53E3E] bg-[#FDEEEE]" />
          현재재고가 임계값 이하인 품목은 붉은색으로 강조되며, 데이터관리
          대시보드의 &apos;저재고 경고 상품 Top 5&apos;에도 동일하게 반영됩니다
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
        <div className="border-b border-[#E2E8F0] px-[18px] py-3.5 text-[13px] font-bold text-[#1A202C]">
          재고 변동 이력
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left text-[12.5px]">
            <thead>
              <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-[11.5px] font-bold text-[#64748B]">
                <th className="px-4 py-2.5">일시</th>
                <th className="px-4 py-2.5">유형</th>
                <th className="px-4 py-2.5">품목</th>
                <th className="px-4 py-2.5">변동량</th>
                <th className="px-4 py-2.5">담당자</th>
              </tr>
            </thead>
            <tbody>
              {data.history.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-8 text-center text-[#64748B]"
                  >
                    변동 이력이 없습니다.
                  </td>
                </tr>
              ) : (
                data.history.map((row) => (
                  <tr key={row.id} className="border-b border-[#EEF1F5]">
                    <td className="px-4 py-2.5 text-[#64748B] tabular-nums">
                      {formatDateTime(row.createdAt)}
                    </td>
                    <td className="px-4 py-2.5">
                      <TypeBadge type={row.type} />
                    </td>
                    <td className="px-4 py-2.5 font-semibold text-[#1A202C]">
                      {row.productName}
                    </td>
                    <td
                      className={cn(
                        "px-4 py-2.5 font-bold tabular-nums",
                        row.delta < 0 ? "text-[#E53E3E]" : "text-[#2F855A]",
                      )}
                    >
                      {row.delta > 0 ? "+" : ""}
                      {formatInt(row.delta)}
                    </td>
                    <td className="px-4 py-2.5 text-[#64748B]">
                      {row.actorLabel}
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

function TypeBadge({ type }: { type: HistoryRow["type"] }) {
  const label = typeLabel(type);
  if (type === "ORDER_DEDUCT") {
    return (
      <span className="inline-flex rounded bg-[#FDEEEE] px-2 py-0.5 text-[11px] font-bold text-[#C53030]">
        {label}
      </span>
    );
  }
  if (type === "ADDITION") {
    return (
      <span className="inline-flex rounded bg-[#E9F8EF] px-2 py-0.5 text-[11px] font-bold text-[#2F855A]">
        {label}
      </span>
    );
  }
  return (
    <span className="inline-flex rounded bg-[#EBF4FD] px-2 py-0.5 text-[11px] font-bold text-[#3182CE]">
      {label}
    </span>
  );
}

function MetricCard({
  label,
  value,
  unit,
  iconBg,
  icon,
  delta,
  deltaClass,
}: {
  label: string;
  value: string;
  unit: string;
  iconBg: string;
  icon: ReactNode;
  delta: string;
  deltaClass: string;
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
        <small className="ml-0.5 text-[13px] font-bold text-[#A0AEC0]">
          {unit}
        </small>
      </div>
      <div className={cn("text-[11.5px] font-bold", deltaClass)}>{delta}</div>
    </div>
  );
}

export default StockStatusMng;
