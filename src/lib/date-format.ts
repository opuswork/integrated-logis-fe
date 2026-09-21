/** Display helpers for month/day-centric UI (no year emphasis). */

function toDate(value: string | Date | null | undefined): Date | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const trimmed = value.trim();
  if (!trimmed) return null;
  // Pure YYYY-MM-DD is a calendar date: parse as local midnight.
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const d = new Date(`${trimmed}T00:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  // Anything with a time part (e.g. "...T22:37:12.000Z") is an instant:
  // parse as-is so month/day reflect the browser's local timezone.
  const d = new Date(trimmed);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Local-timezone `YYYY-MM-DD` for a timestamp such as `createdAt`
 * (`"2026-09-21T22:37:12.000Z"` → `"2026-09-22"` in KST).
 * Use this instead of `value.slice(0, 10)`, which yields the UTC date.
 */
export function toLocalIsoDate(
  value: string | Date | null | undefined,
): string | null {
  const date = toDate(value);
  if (!date) return null;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** `8/27` from YYYY-MM-DD or Date */
export function formatMonthDay(value: string | Date | null | undefined): string {
  const date = toDate(value);
  if (!date) {
    if (typeof value === "string" && value.length >= 10) {
      const [, m, d] = value.slice(0, 10).split("-");
      if (m && d) return `${Number(m)}/${Number(d)}`;
    }
    return "—";
  }
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

/** `8.25 20:35` for 등록일시-style values */
export function formatMonthDayTime(
  value: string | Date | null | undefined,
): string {
  const date = toDate(value);
  if (!date) return typeof value === "string" && value ? value : "—";
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${m}.${d} ${hh}:${mm}`;
}
