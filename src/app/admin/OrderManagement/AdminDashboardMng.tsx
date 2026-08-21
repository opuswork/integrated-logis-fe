"use client";

import {
  AlertTriangle,
  Clock3,
  Package,
  ScrollText,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";

type OrderRow = {
  id: number;
  orderNumber: string;
  status: string;
  createdAt: string;
  readyForShipment?: boolean;
  finalCompleteDone?: boolean;
  requestedShipDate?: string | null;
  items?: Array<{ productName?: string; quantity?: number }>;
};

type StockRow = {
  id: number;
  productName: string;
  stock: number | null;
};

const LOW_STOCK_THRESHOLD = 30;
const TOP_PRODUCT_COLORS = [
  "#2B4E86",
  "#3B6BAA",
  "#4E82C4",
  "#6C9BD6",
  "#8FB4E3",
];
const LOW_STOCK_COLORS = [
  "#F6AD55",
  "#ED8936",
  "#DD6B20",
  "#E53E3E",
  "#C53030",
];

function toDateOnly(value: string | null | undefined) {
  if (!value) return null;
  return value.slice(0, 10);
}

function todayIso() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDaysIso(baseIso: string, days: number) {
  const [y, m, d] = baseIso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  const yy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function formatInt(n: number) {
  return n.toLocaleString("ko-KR");
}

/** 배송관리 `isUrgent`와 동일: ready + 미완료 + 요청일 ≤ 오늘+3일(과거 포함) */
function isUrgentShip(order: OrderRow, today: string) {
  if (!order.readyForShipment || order.finalCompleteDone) return false;
  if (order.status === "SHIPPING" || order.status === "RECEIVED") return false;
  const req = toDateOnly(order.requestedShipDate);
  if (!req) return false;
  const limit = addDaysIso(today, 3);
  return req <= limit;
}

export function AdminDashboardMng() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [stocks, setStocks] = useState<StockRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [trendDays, setTrendDays] = useState<7 | 30>(7);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [ordersRes, stockRes] = await Promise.all([
        apiFetch("/api/orders"),
        apiFetch("/api/stock-inventory"),
      ]);
      const ordersData = await ordersRes.json();
      const stockData = await stockRes.json();
      if (!ordersRes.ok || !Array.isArray(ordersData)) {
        throw new Error("주문 데이터를 불러오지 못했습니다.");
      }
      if (!stockRes.ok || !Array.isArray(stockData)) {
        throw new Error("재고 데이터를 불러오지 못했습니다.");
      }
      setOrders(
        (ordersData as OrderRow[]).filter((o) => o.status !== "CANCELLED"),
      );
      setStocks(stockData as StockRow[]);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "대시보드를 불러오지 못했습니다.",
      );
      setOrders([]);
      setStocks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const today = todayIso();
  const yesterday = addDaysIso(today, -1);

  const metrics = useMemo(() => {
    const totalOrders = orders.length;
    const createdToday = orders.filter(
      (o) => toDateOnly(o.createdAt) === today,
    ).length;
    const createdYesterday = orders.filter(
      (o) => toDateOnly(o.createdAt) === yesterday,
    ).length;
    let dayDeltaLabel = "전일 대비 —";
    let dayDeltaClass = "text-[#64748B]";
    if (createdYesterday > 0) {
      const pct =
        ((createdToday - createdYesterday) / createdYesterday) * 100;
      const sign = pct >= 0 ? "▲" : "▼";
      dayDeltaLabel = `${sign} 전일 대비 ${Math.abs(pct).toFixed(1)}%`;
      dayDeltaClass = pct >= 0 ? "text-[#2F855A]" : "text-[#E53E3E]";
    }

    const trackedStock = stocks.filter(
      (s) => s.stock !== null && s.stock !== undefined,
    );
    const totalStock = trackedStock.reduce(
      (sum, s) => sum + (s.stock ?? 0),
      0,
    );
    const urgentCount = orders.filter((o) => isUrgentShip(o, today)).length;

    return {
      totalOrders,
      dayDeltaLabel,
      dayDeltaClass,
      totalStock,
      urgentCount,
      missingProcess: 0,
    };
  }, [orders, stocks, today, yesterday]);

  const lowStockTop5 = useMemo(() => {
    return stocks
      .filter(
        (s) =>
          s.stock !== null &&
          s.stock !== undefined &&
          s.stock <= LOW_STOCK_THRESHOLD,
      )
      .sort((a, b) => (a.stock ?? 0) - (b.stock ?? 0))
      .slice(0, 5)
      .map((s) => ({
        name: s.productName,
        value: s.stock ?? 0,
      }));
  }, [stocks]);

  const topProducts = useMemo(() => {
    const qtyByName = new Map<string, number>();
    for (const order of orders) {
      for (const item of order.items ?? []) {
        const name = item.productName?.trim();
        if (!name) continue;
        qtyByName.set(name, (qtyByName.get(name) ?? 0) + (item.quantity ?? 0));
      }
    }
    return [...qtyByName.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  }, [orders]);

  const trendPoints = useMemo(() => {
    const days = trendDays;
    const counts: number[] = [];
    for (let i = days - 1; i >= 0; i -= 1) {
      const iso = addDaysIso(today, -i);
      counts.push(
        orders.filter((o) => toDateOnly(o.createdAt) === iso).length,
      );
    }
    const labels = counts.map((_, idx) => `${days - idx}일`);
    return { labels, counts };
  }, [orders, today, trendDays]);

  const trendSvg = useMemo(() => {
    const { counts } = trendPoints;
    const w = 620;
    const h = 150;
    const padX = 10;
    const padY = 12;
    const max = Math.max(1, ...counts);
    const n = counts.length;
    const points = counts.map((c, i) => {
      const x =
        n === 1 ? w / 2 : padX + ((w - padX * 2) * i) / (n - 1);
      const y = padY + (h - padY * 2) * (1 - c / max);
      return { x, y };
    });
    const polyline = points.map((p) => `${p.x},${p.y}`).join(" ");
    return { w, h, points, polyline };
  }, [trendPoints]);

  const lowStockMax = Math.max(1, ...lowStockTop5.map((r) => r.value), 30);
  const topProductMax = Math.max(1, ...topProducts.map((r) => r.value));

  if (loading) {
    return (
      <p className="text-sm text-[#64748B]">대시보드를 불러오는 중...</p>
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
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-[19px] font-bold tracking-tight text-[#1A202C]">
            주문현황 대시보드
          </h3>
          <p className="mt-1 text-[12.5px] text-[#A0AEC0]">
            전 지역 실시간 집계 · 자동 갱신
          </p>
        </div>
      </div>

      <div className="mb-1 grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="총 주문수량"
          value={formatInt(metrics.totalOrders)}
          unit="건"
          iconBg="bg-[#EBF4FD] text-[#3182CE]"
          icon={<ScrollText className="size-[15px]" strokeWidth={2} />}
          delta={metrics.dayDeltaLabel}
          deltaClass={metrics.dayDeltaClass}
        />
        <MetricCard
          label="총 재고수량"
          value={formatInt(metrics.totalStock)}
          unit="개"
          iconBg="bg-[#E9F8EF] text-[#2F855A]"
          icon={<Package className="size-[15px]" strokeWidth={2} />}
          delta="3개 매장 합산"
          deltaClass="text-[#64748B]"
        />
        <MetricCard
          label="출고 임박"
          value={formatInt(metrics.urgentCount)}
          unit="건"
          iconBg="bg-[#FFEDD5] text-[#9C4221]"
          icon={<Clock3 className="size-[15px]" strokeWidth={2} />}
          delta="3일 이내 출고 필요"
          deltaClass="text-[#9C4221]"
        />
        <MetricCard
          label="공정 누락"
          value={formatInt(metrics.missingProcess)}
          unit="건"
          iconBg="bg-[#FDEEEE] text-[#E53E3E]"
          icon={<AlertTriangle className="size-[15px]" strokeWidth={2} />}
          delta="누락체크 준비중"
          deltaClass="text-[#E53E3E]"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.4fr_1fr]">
        <section className="rounded-xl border border-[#E2E8F0] bg-white p-[18px] px-5">
          <div className="mb-3.5 flex items-center justify-between">
            <h4 className="text-[13.5px] font-bold text-[#1A202C]">
              일자별 주문 추이
            </h4>
            <div className="flex rounded-md bg-[#F5F7FA] p-0.5 text-[11.5px] font-bold">
              <button
                type="button"
                className={cn(
                  "rounded px-2.5 py-1",
                  trendDays === 7
                    ? "bg-white text-[#1A365D] shadow-sm"
                    : "text-[#64748B]",
                )}
                onClick={() => setTrendDays(7)}
              >
                일주일
              </button>
              <button
                type="button"
                className={cn(
                  "rounded px-2.5 py-1",
                  trendDays === 30
                    ? "bg-white text-[#1A365D] shadow-sm"
                    : "text-[#64748B]",
                )}
                onClick={() => setTrendDays(30)}
              >
                30일
              </button>
            </div>
          </div>
          <div className="relative h-[150px]">
            <svg
              viewBox={`0 0 ${trendSvg.w} ${trendSvg.h}`}
              preserveAspectRatio="none"
              className="h-full w-full overflow-visible"
            >
              <line
                x1="0"
                y1="0"
                x2={trendSvg.w}
                y2="0"
                stroke="#EEF1F5"
                strokeWidth="1"
              />
              <line
                x1="0"
                y1="50"
                x2={trendSvg.w}
                y2="50"
                stroke="#EEF1F5"
                strokeWidth="1"
              />
              <line
                x1="0"
                y1="100"
                x2={trendSvg.w}
                y2="100"
                stroke="#EEF1F5"
                strokeWidth="1"
              />
              <line
                x1="0"
                y1="149"
                x2={trendSvg.w}
                y2="149"
                stroke="#EEF1F5"
                strokeWidth="1"
              />
              <polyline
                fill="none"
                stroke="#3182CE"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={trendSvg.polyline}
              />
              <g fill="#3182CE">
                {trendSvg.points.map((p, i) => (
                  <circle key={i} cx={p.x} cy={p.y} r="3.5" />
                ))}
              </g>
            </svg>
          </div>
          <div className="mt-1.5 flex justify-between text-[10.5px] text-[#A0AEC0]">
            {trendPoints.labels.map((label, idx) => {
              if (
                trendDays === 30 &&
                idx !== 0 &&
                idx !== trendPoints.labels.length - 1 &&
                idx % 5 !== 0
              ) {
                return <span key={`${label}-${idx}`} />;
              }
              return <span key={`${label}-${idx}`}>{label}</span>;
            })}
          </div>
        </section>

        <section className="rounded-xl border border-[#E2E8F0] bg-white p-[18px] px-5">
          <h4 className="mb-3.5 text-[13.5px] font-bold text-[#1A202C]">
            저재고 경고 상품 Top 5
          </h4>
          {lowStockTop5.length === 0 ? (
            <p className="text-sm text-[#64748B]">저재고 상품이 없습니다.</p>
          ) : (
            lowStockTop5.map((row, idx) => (
              <BarRow
                key={row.name}
                name={row.name}
                valueLabel={`${formatInt(row.value)}개`}
                widthPct={Math.max(8, (row.value / lowStockMax) * 100)}
                color={LOW_STOCK_COLORS[idx] ?? "#E53E3E"}
              />
            ))
          )}
        </section>
      </div>

      <section className="rounded-xl border border-[#E2E8F0] bg-white p-[18px] px-5">
        <h4 className="mb-3.5 text-[13.5px] font-bold text-[#1A202C]">
          상품별 주문 상위 5
        </h4>
        {topProducts.length === 0 ? (
          <p className="text-sm text-[#64748B]">주문 상품이 없습니다.</p>
        ) : (
          topProducts.map((row, idx) => (
            <BarRow
              key={row.name}
              name={row.name}
              valueLabel={formatInt(row.value)}
              widthPct={Math.max(8, (row.value / topProductMax) * 100)}
              color={TOP_PRODUCT_COLORS[idx] ?? "#8FB4E3"}
            />
          ))
        )}
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

function BarRow({
  name,
  valueLabel,
  widthPct,
  color,
}: {
  name: string;
  valueLabel: string;
  widthPct: number;
  color: string;
}) {
  return (
    <div className="mb-[11px] grid grid-cols-[88px_1fr_46px] items-center gap-2.5 last:mb-0">
      <div className="truncate text-[12px] font-bold text-[#1A202C]">
        {name}
      </div>
      <div className="h-4 overflow-hidden rounded bg-[#EDF2F7]">
        <div
          className="h-full rounded"
          style={{ width: `${widthPct}%`, background: color }}
        />
      </div>
      <div className="text-right text-[11.5px] font-bold tabular-nums text-[#64748B]">
        {valueLabel}
      </div>
    </div>
  );
}

export default AdminDashboardMng;
