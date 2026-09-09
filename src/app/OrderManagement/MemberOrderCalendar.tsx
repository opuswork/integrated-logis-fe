"use client";

import dayjs from "dayjs";
import { useState } from "react";
import Calendar from "react-calendar";

import { cn } from "@/lib/utils";

import "react-calendar/dist/Calendar.css";
import "./member-order-calendar.css";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function toIso(date: Date) {
  return dayjs(date).format("YYYY-MM-DD");
}

export function MemberOrderCalendar({
  counts,
  selectedIso,
  onSelectIso,
}: {
  counts: Record<string, number>;
  selectedIso: string | null;
  onSelectIso: (iso: string) => void;
}) {
  const [activeStartDate, setActiveStartDate] = useState(() =>
    dayjs().startOf("month").toDate(),
  );
  const todayIso = dayjs().format("YYYY-MM-DD");

  return (
    <Calendar
      className="member-order-calendar"
      locale="ko-KR"
      calendarType="gregory"
      value={selectedIso ? dayjs(selectedIso).toDate() : null}
      activeStartDate={activeStartDate}
      onActiveStartDateChange={({ activeStartDate: next }) => {
        if (next) setActiveStartDate(next);
      }}
      onChange={(value) => {
        const date = Array.isArray(value) ? value[0] : value;
        if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
          return;
        }
        onSelectIso(toIso(date));
      }}
      formatDay={(_locale, date) => String(date.getDate())}
      formatShortWeekday={(_locale, date) => WEEKDAYS[date.getDay()] ?? ""}
      formatMonthYear={(_locale, date) =>
        `${date.getFullYear()}년 ${date.getMonth() + 1}월`
      }
      next2Label={null}
      prev2Label={null}
      nextLabel="›"
      prevLabel="‹"
      showNeighboringMonth
      tileClassName={({ date, view }) => {
        if (view !== "month") return null;
        const iso = toIso(date);
        return cn(
          iso === todayIso && "member-order-calendar-today",
          (counts[iso] ?? 0) > 0 && "member-order-calendar-has-delivery",
        );
      }}
      tileContent={({ date, view }) => {
        if (view !== "month") return null;
        if (date.getMonth() !== activeStartDate.getMonth()) {
          return <span className="member-order-calendar-badge" />;
        }
        const iso = toIso(date);
        const count = counts[iso] ?? 0;
        const isToday = iso === todayIso;
        return (
          <span className="member-order-calendar-badge">
            {isToday ? <span className="text-[#7c3aed]">오늘</span> : null}
            {count > 0 ? (
              <span className="text-[#e11d48]">
                배달{count > 1 ? count : ""}
              </span>
            ) : null}
          </span>
        );
      }}
    />
  );
}
