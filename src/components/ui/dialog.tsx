'use client';

import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

export interface DialogProps {
  open: boolean;
  title: string;
  /** 제목 바로 위에 표시하는 작은 안내 문구 */
  eyebrow?: string;
  children: ReactNode;
  onClose?: () => void;
  className?: string;
}

export function Dialog({ open, title, eyebrow, children, onClose, className }: DialogProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        className={cn(
          'w-full max-w-md rounded-xl border border-line bg-panel p-5 shadow-[0_14px_34px_rgba(18,38,63,0.08)]',
          className,
        )}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            {eyebrow ? (
              <p className="mb-1 text-[12px] font-bold tracking-wide text-[#C05621]">
                {eyebrow}
              </p>
            ) : null}
            <h2 id="dialog-title" className="text-lg font-semibold text-ink">
              {title}
            </h2>
          </div>
          {onClose ? (
            <button
              type="button"
              aria-label="Close dialog"
              className="shrink-0 rounded-[7px] border border-[#cbd5e1] bg-white px-2.5 py-1 text-sm text-[#64748b] hover:bg-[#f6f8fb] hover:text-[#475569]"
              onClick={onClose}
            >
              닫기
            </button>
          ) : null}
        </div>
        {children}
      </div>
    </div>
  );
}
