/**
 * Stock badge next to product names in pickers.
 * - stock null → no badge (unlimited / no data)
 * - stock === 0 → red "재고 없음"
 * - stock > 0 → "남은 수량/누적 총 입고량" (e.g. 12/13)
 *   분모 = stockMax(최초 등록 + 이후 입고의 합), 없으면 현재 수량
 */
export function formatProductStockLabel(
  stock: number | null | undefined,
  stockMax?: number | null,
): { kind: "none" } | { kind: "out" } | { kind: "qty"; text: string } {
  if (stock === null || stock === undefined) {
    return { kind: "none" };
  }

  if (stock <= 0) {
    return { kind: "out" };
  }

  const capacity =
    stockMax !== null && stockMax !== undefined && stockMax > 0
      ? stockMax
      : stock;

  return {
    kind: "qty",
    text: `${stock.toLocaleString("ko-KR")}/${capacity.toLocaleString("ko-KR")}`,
  };
}
