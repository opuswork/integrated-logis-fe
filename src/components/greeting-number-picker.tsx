"use client";

import { useState } from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";

export const GREETING_CATALOG_NUMBERS = ["1", "2", "3", "4"] as const;

export type GreetingCatalogNumber = (typeof GREETING_CATALOG_NUMBERS)[number];

export const GREETING_PREVIEW_IMAGE: Record<GreetingCatalogNumber, string> = {
  "1": "/assets/greeting_form/images/인사장1번.jpg",
  "2": "/assets/greeting_form/images/인사장2번.jpg",
  "3": "/assets/greeting_form/images/인사장3번.jpg",
  "4": "/assets/greeting_form/images/인사장4번.jpg",
};

/**
 * Screenshot-style chip row: 1 / 2 / 3 / 4 / 자체 / 명함
 * Catalog numbers show hover preview (not file upload).
 */
export function GreetingNumberChipPicker({
  value,
  onChange,
  includeSelf = false,
  onIncludeSelfChange,
  businessCardIncluded = false,
  onBusinessCardIncludedChange,
  name = "greeting-number",
}: {
  value: GreetingCatalogNumber | null;
  onChange: (value: GreetingCatalogNumber | null) => void;
  includeSelf?: boolean;
  onIncludeSelfChange?: (value: boolean) => void;
  /** true = 동봉, false = 미동봉 */
  businessCardIncluded?: boolean;
  onBusinessCardIncludedChange?: (value: boolean) => void;
  name?: string;
}) {
  const [catalogHover, setCatalogHover] = useState<{
    number: GreetingCatalogNumber;
    top: number;
    left: number;
    place: "above" | "below";
  } | null>(null);

  const showCatalogPreview = (
    number: GreetingCatalogNumber,
    anchor: HTMLElement,
  ) => {
    const rect = anchor.getBoundingClientRect();
    const tooltipWidth = 352;
    const tooltipHeight = 400;
    const gap = 8;
    const place: "above" | "below" =
      rect.top - tooltipHeight - gap >= 8 ? "above" : "below";
    let left = rect.left + rect.width / 2;
    left = Math.min(
      Math.max(left, tooltipWidth / 2 + 8),
      window.innerWidth - tooltipWidth / 2 - 8,
    );
    const top = place === "above" ? rect.top - gap : rect.bottom + gap;
    setCatalogHover({ number, top, left, place });
  };

  const hideCatalogPreview = () => {
    setCatalogHover(null);
  };

  const chipClass = (selected: boolean) =>
    cn(
      "flex min-h-10 min-w-0 flex-1 cursor-pointer items-center justify-center rounded-[7px] border px-2 py-2 text-sm font-bold transition-colors",
      selected
        ? "border-brand bg-[#e9f1ff] text-brand"
        : "border-line bg-white text-ink hover:bg-soft",
    );

  return (
    <div className="mt-2.5">
      <p className="mb-1.5 block text-2xl font-bold text-ink">인사장번호 *</p>
      <div
        role="radiogroup"
        aria-label="인사장번호"
        className="flex flex-wrap gap-2"
      >
        {GREETING_CATALOG_NUMBERS.map((number) => {
          const selected = value === number;
          return (
            <label
              key={number}
              className={chipClass(selected)}
              onMouseEnter={(event) => {
                showCatalogPreview(number, event.currentTarget);
              }}
              onMouseLeave={hideCatalogPreview}
              onFocus={(event) => {
                showCatalogPreview(number, event.currentTarget);
              }}
              onBlur={hideCatalogPreview}
            >
              <input
                type="checkbox"
                name={`${name}-${number}`}
                value={number}
                checked={selected}
                onChange={() => onChange(selected ? null : number)}
                className="sr-only"
              />
              {number}
            </label>
          );
        })}

        <button
          type="button"
          className={chipClass(includeSelf)}
          aria-pressed={includeSelf}
          onClick={() => onIncludeSelfChange?.(!includeSelf)}
        >
          자체
        </button>

        <button
          type="button"
          className={chipClass(businessCardIncluded)}
          aria-pressed={businessCardIncluded}
          onClick={() =>
            onBusinessCardIncludedChange?.(!businessCardIncluded)
          }
        >
          명함
        </button>
      </div>

      {catalogHover && typeof document !== "undefined"
        ? createPortal(
            <div
              role="tooltip"
              className={cn(
                "pointer-events-none fixed z-[9999] w-[22rem] -translate-x-1/2 rounded-lg border border-line bg-white p-3 shadow-[0_10px_28px_rgba(15,23,42,0.18)]",
                catalogHover.place === "above" ? "-translate-y-full" : null,
              )}
              style={{ top: catalogHover.top, left: catalogHover.left }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={encodeURI(GREETING_PREVIEW_IMAGE[catalogHover.number])}
                alt={`인사장 ${catalogHover.number}번 미리보기`}
                className="h-80 w-full rounded bg-[#f8fafc] object-contain"
              />
              <p className="mt-1.5 text-center text-sm font-semibold text-ink">
                인사장 {catalogHover.number}번
              </p>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
