/** Display helpers for month/day-centric UI (no year emphasis). */

function toDate(value: string | Date | null | undefined): Date | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const trimmed = value.trim();
  if (!trimmed) return null;
  // Prefer date-only local parse for YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    const d = new Date(`${trimmed.slice(0, 10)}T00:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(trimmed);
  return Number.isNaN(d.getTime()) ? null : d;
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
