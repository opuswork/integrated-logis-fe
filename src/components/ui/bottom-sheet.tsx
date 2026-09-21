"use client";

import { X } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export interface BottomSheetProps {
  open: boolean;
  title: string;
  /** 제목 아래 작은 안내 문구 */
  subtitle?: ReactNode;
  children: ReactNode;
  /** 스크롤과 무관하게 항상 하단에 고정되는 영역 (버튼 등) */
  footer?: ReactNode;
  onClose: () => void;
  className?: string;
}

/**
 * 화면 하단에서 올라와 좌우를 꽉 채우는 시트. 모바일 개인회원 화면용.
 * 헤더/푸터는 고정, 본문(children)만 스크롤된다.
 */
export function BottomSheet({
  open,
  title,
  subtitle,
  children,
  footer,
  onClose,
  className,
}: BottomSheetProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/50">
      <button
        type="button"
        aria-label="닫기"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="bottom-sheet-title"
        className={cn(
          "relative flex h-[88dvh] max-h-[88dvh] w-full flex-col rounded-t-3xl bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_30px_rgba(15,23,42,0.18)]",
          "animate-in slide-in-from-bottom duration-200",
          className,
        )}
      >
        <div className="flex justify-center pt-3" aria-hidden>
          <span className="h-1.5 w-12 rounded-full bg-[#cbd5e1]" />
        </div>

        <div className="flex items-start justify-between gap-3 px-5 pt-3 pb-3">
          <div className="min-w-0">
            <h2
              id="bottom-sheet-title"
              className="text-[24px] font-bold leading-tight text-[#1e293b]"
            >
              {title}
            </h2>
            {subtitle ? (
              <div className="mt-1 text-[16px] text-[#64748b]">{subtitle}</div>
            ) : null}
          </div>
          <button
            type="button"
            aria-label="닫기"
            className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-[#f1f5f9] text-[#334155] hover:bg-[#e2e8f0]"
            onClick={onClose}
          >
            <X className="size-7" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>

        {footer ? (
          <div className="border-t border-[#e5eaf0] bg-white px-5 py-4">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
