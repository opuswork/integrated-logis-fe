import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export type SkeletonProps = HTMLAttributes<HTMLDivElement>;

/** Pulse placeholder block. Inherits size via className. */
export function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-[#E2E8F0]", className)}
      {...props}
    />
  );
}

export type TableSkeletonProps = {
  rows?: number;
  columns?: number;
  className?: string;
};

/** Table-shaped loading placeholder for admin list screens. */
export function TableSkeleton({
  rows = 8,
  columns = 6,
  className,
}: TableSkeletonProps) {
  return (
    <div
      className={cn("w-full overflow-hidden rounded-lg border border-[#E2E8F0]", className)}
      role="status"
      aria-label="목록 불러오는 중"
      aria-busy="true"
    >
      <div className="flex gap-3 border-b border-[#E2E8F0] bg-[#F8FAFC] px-3 py-3">
        {Array.from({ length: columns }, (_, index) => (
          <Skeleton
            key={`h-${index}`}
            className={cn("h-3 flex-1", index === 0 && "max-w-[72px]")}
          />
        ))}
      </div>
      <div className="divide-y divide-[#E2E8F0] bg-white">
        {Array.from({ length: rows }, (_, rowIndex) => (
          <div key={`r-${rowIndex}`} className="flex gap-3 px-3 py-3.5">
            {Array.from({ length: columns }, (_, colIndex) => (
              <Skeleton
                key={`c-${rowIndex}-${colIndex}`}
                className={cn(
                  "h-3.5 flex-1",
                  colIndex === 0 && "max-w-[64px]",
                  colIndex === columns - 1 && "max-w-[80px]",
                )}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
