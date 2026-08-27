import { PaginationButton } from "./pagination-button";

export interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange?: (page: number) => void;
}

/** Visible page numbers with optional ellipsis gaps (screenshot-style window). */
export function getVisiblePages(
  page: number,
  totalPages: number,
): Array<number | "ellipsis"> {
  if (totalPages <= 0) return [];
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const current = Math.min(Math.max(1, page), totalPages);
  const pages = new Set<number>();
  pages.add(1);
  pages.add(totalPages);
  for (let p = current - 1; p <= current + 1; p++) {
    if (p >= 1 && p <= totalPages) pages.add(p);
  }
  // Keep first/last clusters denser when near edges (e.g. 1 2 3 … 8 9 10)
  if (current <= 3) {
    pages.add(2);
    pages.add(3);
  }
  if (current >= totalPages - 2) {
    pages.add(totalPages - 1);
    pages.add(totalPages - 2);
  }

  const sorted = Array.from(pages).sort((a, b) => a - b);
  const result: Array<number | "ellipsis"> = [];
  for (let i = 0; i < sorted.length; i++) {
    const n = sorted[i]!;
    if (i > 0) {
      const prev = sorted[i - 1]!;
      if (n - prev > 1) result.push("ellipsis");
    }
    result.push(n);
  }
  return result;
}

export function Pagination({ page, totalPages, onPageChange }: PaginationProps) {
  if (totalPages < 1) return null;

  const visible = getVisiblePages(page, totalPages);

  return (
    <nav aria-label="Pagination" className="inline-flex items-center gap-1.5">
      <PaginationButton
        aria-label="Previous page"
        disabled={page <= 1}
        onClick={() => onPageChange?.(page - 1)}
      >
        ‹
      </PaginationButton>
      {visible.map((item, index) =>
        item === "ellipsis" ? (
          <span
            key={`ellipsis-${index}`}
            className="inline-flex min-h-8 min-w-8 items-center justify-center px-1 text-sm text-[#64748b]"
            aria-hidden
          >
            …
          </span>
        ) : (
          <PaginationButton
            key={item}
            active={item === page}
            onClick={() => onPageChange?.(item)}
          >
            {item}
          </PaginationButton>
        ),
      )}
      <PaginationButton
        aria-label="Next page"
        disabled={page >= totalPages}
        onClick={() => onPageChange?.(page + 1)}
      >
        ›
      </PaginationButton>
    </nav>
  );
}
