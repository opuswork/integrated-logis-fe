"use client";

import { useMemo, useState } from "react";

import { isSundayIso } from "@/lib/date-format";

import {
  BackIcon,
  DOW,
  V2_BRANCHES,
  V2_STATUSES,
  V2Dock,
  dateLabel,
  statusTone,
  todayIso,
  ymd,
  type V2Order,
} from "./order-v2-shared";

export type CalendarFilters = {
  date: string;
  status: string;
  branch: string;
  q: string;
};

function matchesFilters(order: V2Order, branch: string, status: string) {
  return (
    (branch === "전체" || order.branch === branch) &&
    (status === "전체" || order.status === status)
  );
}

function displayType(type: string) {
  return type === "택배" ? "개별택배" : type;
}

export function OrderCalendarV2({
  orders,
  isLoading,
  error,
  filters,
  onFiltersChange,
  onSwitchToClassic,
  onCreateOrder,
  onViewOrder,
}: {
  orders: V2Order[];
  isLoading: boolean;
  error: string;
  filters: CalendarFilters;
  onFiltersChange: (next: CalendarFilters) => void;
  onSwitchToClassic: () => void;
  onCreateOrder: (iso: string) => void;
  onViewOrder: (orderNumber: string) => void;
}) {
  const [month, setMonth] = useState(() => {
    const [year, mon] = filters.date.split("-").map(Number);
    return { y: year, m: mon - 1 };
  });
  const today = todayIso();
  const query = filters.q.trim();

  const { branch, status, date } = filters;

  // 검색어가 있으면 전체 날짜에서, 없으면 고른 날짜에서
  const list = useMemo(
    () =>
      orders.filter(
        (order) =>
          matchesFilters(order, branch, status) &&
          (query
            ? order.orderNumber.includes(query) || order.name.includes(query)
            : order.date === date),
      ),
    [orders, branch, status, date, query],
  );

  const byDay = useMemo(() => {
    const map: Record<string, V2Order[]> = {};
    for (const order of orders) {
      if (!matchesFilters(order, branch, status) || !order.date) continue;
      (map[order.date] ??= []).push(order);
    }
    return map;
  }, [orders, branch, status]);

  const dayOrders = orders.filter((order) => order.date === filters.date);
  const dayInProgress = dayOrders.filter(
    (order) => order.status !== "배송완료",
  ).length;
  const dayDone = dayOrders.length - dayInProgress;

  const { y, m } = month;
  const firstWeekday = new Date(y, m, 1).getDay();
  const lastDay = new Date(y, m + 1, 0).getDate();

  const moveMonth = (delta: number) => {
    const next = new Date(y, m + delta, 1);
    setMonth({ y: next.getFullYear(), m: next.getMonth() });
  };

  const canCreate = filters.date >= today && !isSundayIso(filters.date);
  const createBlockedReason = isSundayIso(filters.date)
    ? "일요일에는 주문을 등록할 수 없어요."
    : filters.date < today
      ? "지난 날짜에는 주문을 등록할 수 없어요."
      : "";

  return (
    <div className="jy-wrap">
      <header className="jy-bar">
        <div className="jy-sp">
          <div className="jy-eyebrow">장유 · 지점 주문</div>
          <h1>주문 달력</h1>
        </div>
        <button type="button" className="jy-btn jy-link" onClick={onSwitchToClassic}>
          기본 버전
        </button>
      </header>

      <section className="jy-card">
        <div className="jy-cal-head">
          <button
            type="button"
            className="jy-btn jy-circle"
            aria-label="이전 달"
            onClick={() => moveMonth(-1)}
          >
            <BackIcon />
          </button>
          <span className="jy-ym">
            {y}년 {m + 1}월
          </span>
          <div className="jy-nav">
            <button
              type="button"
              className="jy-btn jy-today-btn"
              onClick={() => {
                const now = new Date();
                setMonth({ y: now.getFullYear(), m: now.getMonth() });
                onFiltersChange({ ...filters, date: today, q: "" });
              }}
            >
              오늘
            </button>
            <button
              type="button"
              className="jy-btn jy-circle"
              aria-label="다음 달"
              style={{ transform: "scaleX(-1)" }}
              onClick={() => moveMonth(1)}
            >
              <BackIcon />
            </button>
          </div>
        </div>

        <div className="jy-cal-grid">
          {DOW.map((weekday, index) => (
            <div
              key={weekday}
              className={`jy-dow${index === 0 ? " jy-sun" : index === 6 ? " jy-sat" : ""}`}
            >
              {weekday}
            </div>
          ))}
          {Array.from({ length: firstWeekday }, (_, index) => (
            <div key={`blank-${index}`} className="jy-day jy-blank" />
          ))}
          {Array.from({ length: lastDay }, (_, index) => {
            const day = index + 1;
            const iso = ymd(y, m, day);
            const weekday = (firstWeekday + index) % 7;
            const dayList = byDay[iso] ?? [];
            const allDone =
              dayList.length > 0 &&
              dayList.every((order) => order.status === "배송완료");
            return (
              <button
                key={iso}
                type="button"
                className={[
                  "jy-day",
                  weekday === 0 ? "jy-sun" : weekday === 6 ? "jy-sat" : "",
                  iso === today ? "jy-is-today" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                aria-pressed={iso === filters.date}
                aria-label={`${dateLabel(iso)}${dayList.length ? ` 주문 ${dayList.length}건` : ""}`}
                onClick={() => onFiltersChange({ ...filters, date: iso, q: "" })}
              >
                <span className="jy-d">{day}</span>
                {dayList.length ? (
                  <span className={`jy-cnt${allDone ? " jy-all-done" : ""}`}>
                    {dayList.length}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        <div className="jy-legend">
          <span>
            <i style={{ background: "var(--jy-prep-bg)" }} />
            진행 중 있음
          </span>
          <span>
            <i style={{ background: "var(--jy-done-bg)" }} />
            모두 배송완료
          </span>
          <span>숫자 = 주문 건수</span>
        </div>
      </section>

      <label className="jy-search" htmlFor="jy-q">
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-4-4" />
        </svg>
        <input
          id="jy-q"
          type="search"
          placeholder="주문번호 또는 성명으로 검색 (전체 날짜)"
          value={filters.q}
          onChange={(event) =>
            onFiltersChange({ ...filters, q: event.target.value })
          }
        />
      </label>

      <div>
        <span className="jy-label">상태</span>
        <div className="jy-chips jy-scroll">
          {["전체", ...V2_STATUSES].map((value) => (
            <button
              key={value}
              type="button"
              className="jy-btn jy-chip"
              aria-pressed={value === filters.status}
              onClick={() => onFiltersChange({ ...filters, status: value })}
            >
              {value}
            </button>
          ))}
        </div>
      </div>

      <div>
        <span className="jy-label">매장</span>
        <div className="jy-chips">
          {["전체", ...V2_BRANCHES].map((value) => (
            <button
              key={value}
              type="button"
              className="jy-btn jy-chip"
              aria-pressed={value === filters.branch}
              onClick={() => onFiltersChange({ ...filters, branch: value })}
            >
              {value}
            </button>
          ))}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <h2>
          {query ? "검색 결과" : `${dateLabel(filters.date)} 주문`}{" "}
          <span className="jy-meta">{list.length}건</span>
        </h2>
        {query ? null : (
          <span className="jy-meta">
            진행 중 {dayInProgress} · 배송완료 {dayDone}
          </span>
        )}
      </div>

      <section className="jy-stack">
        {isLoading ? (
          <div className="jy-empty">주문을 불러오는 중이에요…</div>
        ) : error ? (
          <div className="jy-empty jy-err">{error}</div>
        ) : list.length ? (
          list.map((order) => (
            <button
              key={order.id}
              type="button"
              className="jy-order"
              onClick={() => onViewOrder(order.orderNumber)}
            >
              <div className="jy-top">
                <strong>
                  {order.name} <span className="jy-meta">{order.orderNumber}</span>
                </strong>
                <span className="jy-badge" data-tone={statusTone(order.status)}>
                  {order.status}
                </span>
              </div>
              <div className="jy-meta">
                {[
                  order.date || "-",
                  order.branch,
                  displayType(order.type),
                  order.attachmentCount ? `📎 사진 ${order.attachmentCount}장` : "",
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
              <div className="jy-items">{order.summary}</div>
            </button>
          ))
        ) : (
          <div className="jy-empty">
            {query ? "검색 결과가 없어요." : "이 날짜에 주문이 없어요."}
          </div>
        )}
      </section>

      <V2Dock>
        <button
          type="button"
          className="jy-btn jy-primary jy-big"
          disabled={!canCreate}
          onClick={() => onCreateOrder(filters.date)}
        >
          + {dateLabel(filters.date)} 주문 등록
        </button>
        {createBlockedReason ? (
          <p className="jy-hint" style={{ textAlign: "center", marginTop: 6 }}>
            {createBlockedReason}
          </p>
        ) : null}
      </V2Dock>
    </div>
  );
}
