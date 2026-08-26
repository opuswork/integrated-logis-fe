"use client";

import { Calendar as CalendarIcon } from "lucide-react";
import dayjs from "dayjs";
import { useEffect, useId, useRef, useState } from "react";
import Calendar from "react-calendar";

import { cn } from "@/lib/utils";

import "react-calendar/dist/Calendar.css";
import "./md-calendar-picker.css";

function toMd(date: Date) {
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${m}-${d}`;
}

function mdToDisplay(md: string | null | undefined) {
  if (!md || md.length < 5) return "";
  const [m, d] = md.split("-");
  if (!m || !d) return "";
  return `${Number(m)}/${Number(d)}`;
}

function isoToMd(iso: string | null | undefined) {
  if (!iso || iso.length < 10) return "";
  return iso.slice(5, 10);
}

function resolveYear(yearHint?: string | null) {
  if (yearHint && /^\d{4}/.test(yearHint)) {
    return Number(yearHint.slice(0, 4));
  }
  return dayjs().year();
}

function parseActiveDate(
  md: string | null | undefined,
  yearHint?: string | null,
): Date {
  if (md && /^\d{2}-\d{2}$/.test(md)) {
    const year = resolveYear(yearHint);
    const d = dayjs(`${year}-${md}`);
    if (d.isValid()) return d.toDate();
  }
  if (yearHint && /^\d{4}-\d{2}-\d{2}/.test(yearHint)) {
    return dayjs(yearHint.slice(0, 10)).toDate();
  }
  return new Date();
}

type MdCalendarPickerProps = {
  valueMd?: string;
  valueIso?: string | null;
  yearHint?: string | null;
  disabled?: boolean;
  placeholder?: string;
  title?: string;
  showIcon?: boolean;
  allowClear?: boolean;
  className?: string;
  inputClassName?: string;
  onChangeIso?: (iso: string) => void;
  onChangeMd?: (md: string) => void;
  onClear?: () => void;
  minIso?: string;
  maxIso?: string;
};

export function MdCalendarPicker({
  valueMd,
  valueIso,
  yearHint,
  disabled,
  placeholder = "m/d",
  title,
  showIcon = true,
  allowClear = false,
  className,
  inputClassName,
  onChangeIso,
  onChangeMd,
  onClear,
  minIso,
  maxIso,
}: MdCalendarPickerProps) {
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  const effectiveMd = valueMd || isoToMd(valueIso) || "";
  const display = mdToDisplay(effectiveMd);
  const [activeStartDate, setActiveStartDate] = useState(() =>
    parseActiveDate(effectiveMd || null, yearHint ?? valueIso),
  );

  useEffect(() => {
    if (!open) return;
    setActiveStartDate(
      parseActiveDate(effectiveMd || null, yearHint ?? valueIso),
    );
  }, [open, effectiveMd, yearHint, valueIso]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const tileDisabled = ({ date, view }: { date: Date; view: string }) => {
    if (view !== "month") return false;
    const iso = dayjs(date).format("YYYY-MM-DD");
    if (minIso && iso < minIso) return true;
    if (maxIso && iso > maxIso) return true;
    return false;
  };

  return (
    <div ref={rootRef} className={cn("relative inline-flex", className)}>
      <button
        type="button"
        disabled={disabled}
        title={title}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          if (!disabled) setOpen((v) => !v);
        }}
        className={cn(
          "inline-flex h-8 items-center gap-1 rounded border border-line bg-white px-1.5 text-[12px] tabular-nums text-ink disabled:cursor-not-allowed disabled:opacity-50",
          inputClassName,
        )}
      >
        <span
          className={cn(
            "min-w-[2.5rem] text-left",
            !display && "text-[#94a3b8]",
          )}
        >
          {display || placeholder}
        </span>
        {showIcon ? (
          <CalendarIcon className="size-3.5 shrink-0 text-[#64748b]" />
        ) : null}
      </button>

      {open && !disabled ? (
        <div
          id={panelId}
          className="absolute left-0 top-[calc(100%+4px)] z-50 rounded-lg border border-line bg-white p-2 shadow-lg"
        >
          <Calendar
            locale="ko-KR"
            calendarType="gregory"
            value={effectiveMd ? parseActiveDate(effectiveMd, yearHint ?? valueIso) : null}
            activeStartDate={activeStartDate}
            onActiveStartDateChange={({ activeStartDate: next }) => {
              if (next) setActiveStartDate(next);
            }}
            onChange={(value) => {
              const date = Array.isArray(value) ? value[0] : value;
              if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
                return;
              }
              const md = toMd(date);
              const pickedIso = dayjs(date).format("YYYY-MM-DD");
              if (minIso && pickedIso < minIso) return;
              if (maxIso && pickedIso > maxIso) return;

              onChangeMd?.(md);
              onChangeIso?.(pickedIso);
              setOpen(false);
            }}
            tileDisabled={tileDisabled}
            next2Label={null}
            prev2Label={null}
            nextLabel="▷"
            prevLabel="◁"
            navigationLabel={({ date }) => dayjs(date).format("M월")}
            formatDay={(_locale, date) => String(date.getDate())}
            formatShortWeekday={(_locale, date) =>
              ["일", "월", "화", "수", "목", "금", "토"][date.getDay()] ?? ""
            }
            className="md-calendar"
          />
          {allowClear || onClear ? (
            <div className="mt-1 flex justify-end border-t border-line pt-1.5">
              <button
                type="button"
                className="rounded px-2 py-1 text-[11px] font-semibold text-[#64748b] hover:bg-[#f1f5f9]"
                onClick={() => {
                  onClear?.();
                  onChangeMd?.("");
                  setOpen(false);
                }}
              >
                지우기
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export { mdToDisplay, isoToMd };
