import {
  isDeliveryOrderType,
  memberFacingStatusLabel,
  type DeliveryOrderStatus,
} from "@/lib/order-delivery";
import {
  parseBranchStoreFromNotes,
  parseChurchFromNotes,
  parseDeliveryCompanyFromNotes,
  parseOrderDateFromNotes,
  parseOrdererFromNotes,
  parseOrderTypeFromNotes,
  parseParcelCompanyFromNotes,
  greetingMaterialFromNotes,
} from "@/lib/order-notes";
import type { AdminRegion } from "@/lib/auth";

export type PackDept = "FACTORY_PACK" | "SOCK_PACK" | null;
export type PackagingWorker = "STORE" | "FACTORY" | null;

export type ShipmentOpsOrder = {
  id: number;
  orderNumber: string;
  status: DeliveryOrderStatus;
  statusLabel: string;
  createdAt: string;
  orderDate: string;
  storeRegion: AdminRegion | null;
  storeLabel: string;
  churchName: string;
  name: string;
  clientLabel: string;
  productSummary: string;
  quantity: number;
  packagingWorker: PackagingWorker;
  workerLabel: string;
  fulfillmentType: "PARCEL" | "PICKUP" | null;
  /** 상차 | 택배 */
  loadType: "상차" | "택배";
  /** 박스 | 개별 */
  unitType: "박스" | "개별";
  isParcel: boolean;
  paymentDone: boolean;
  greetingDone: boolean;
  slipDone: boolean;
  slipAuthor: string | null;
  greetingCount: number;
  /** 주문서 미리보기 인사장소재 */
  greetingMaterial: string;
  /** 주문서 미리보기 인사장위치 */
  greetingLocation: string;
  /** 기표지: 택배=유, 상차=무 */
  slipLabel: "유" | "무";
  requestedShipDate: string | null;
  packDept: PackDept;
  packDate: string | null;
  packPt: string | null;
  storagePlace: string | null;
  packDone: boolean;
  releaseDone: boolean;
  releaseDoneAt: string | null;
  finalCompleteDone: boolean;
  finalConfirmDone: boolean;
  /** 미출고 | 완료 */
  shipProgressLabel: "미출고" | "완료";
  notes: string | null;
  specialNote: string;
  /** Per-line expand (배송관리). Empty if API omitted items. */
  items: { productName: string; quantity: number }[];
};

export type ShipmentLineRow = ShipmentOpsOrder & {
  lineKey: string;
  lineOrderNumber: string;
  lineIndex: number;
};

/** Expand one order row into one display row per product line (ORD-…-1, -2, …). */
export function expandShipmentOpsRows(
  orders: ShipmentOpsOrder[],
): ShipmentLineRow[] {
  const out: ShipmentLineRow[] = [];
  for (const order of orders) {
    const lines =
      order.items.length > 0
        ? order.items
        : [{ productName: order.productSummary || "—", quantity: order.quantity }];
    lines.forEach((item, index) => {
      const lineIndex = index + 1;
      out.push({
        ...order,
        lineKey: `${order.id}-${lineIndex}`,
        lineOrderNumber:
          lines.length === 1
            ? order.orderNumber
            : `${order.orderNumber}-${lineIndex}`,
        lineIndex,
        productSummary: item.productName || "—",
        quantity: item.quantity,
      });
    });
  }
  return out;
}

function toDateOnly(value?: string | null) {
  if (!value) return null;
  return value.slice(0, 10);
}

function regionLabel(region: AdminRegion | null) {
  if (region === "NAMBU") return "남부";
  if (region === "JUNGBU") return "중부";
  if (region === "SEOBU") return "서부";
  return "—";
}

export function mapShipmentOpsOrder(order: {
  id: number;
  orderNumber: string;
  status: DeliveryOrderStatus;
  createdAt: string;
  notes?: string | null;
  storeRegion?: AdminRegion | null;
  packagingWorker?: PackagingWorker;
  paymentDone?: boolean;
  greetingDone?: boolean;
  slipDone?: boolean;
  slipAuthor?: string | null;
  requestedShipDate?: string | null;
  packDept?: PackDept;
  packDate?: string | null;
  packPt?: string | null;
  storagePlace?: string | null;
  packDone?: boolean;
  releaseDone?: boolean;
  releaseDoneAt?: string | null;
  finalCompleteDone?: boolean;
  finalConfirmDone?: boolean;
  items?: { productName?: string; quantity?: number }[];
  greetingForms?: {
    specialNote?: string | null;
    churchName?: string | null;
  }[];
  shipment?: {
    fulfillmentType?: string | null;
    carrier?: string | null;
  } | null;
  user?: {
    fullname?: string | null;
    church?: { name?: string | null } | null;
  } | null;
}): ShipmentOpsOrder {
  const fulfillmentType =
    order.shipment?.fulfillmentType === "PARCEL"
      ? "PARCEL"
      : order.shipment?.fulfillmentType === "PICKUP"
        ? "PICKUP"
        : null;
  const typeFromNotes = parseOrderTypeFromNotes(order.notes);
  // 배달 notes 또는 PICKUP → 상차. (PARCEL만으로 택배로 단정하지 않음)
  const isParcel = !(
    isDeliveryOrderType(typeFromNotes) || fulfillmentType === "PICKUP"
  );
  const items = (order.items ?? []).map((item) => ({
    productName: item.productName?.trim() || "—",
    quantity: item.quantity ?? 0,
  }));
  const quantity = items.reduce((sum, item) => sum + item.quantity, 0);
  const productSummary =
    items.length === 0
      ? "—"
      : items.length === 1
        ? items[0]!.productName
        : `${items[0]!.productName} 외 ${items.length - 1}`;
  const specialNote =
    order.greetingForms
      ?.map((g) => g.specialNote?.trim())
      .filter(Boolean)
      .join(", ") || "—";
  const storeRegion = order.storeRegion ?? null;
  const storeFromNotes = parseBranchStoreFromNotes(order.notes);
  const churchFromNotes = parseChurchFromNotes(order.notes);
  const churchFromGreeting =
    order.greetingForms
      ?.map((g) => g.churchName?.trim())
      .find((name) => Boolean(name)) || "";
  // 중앙 = 주문서 「중앙」(notes) → 인사장 churchName. user.church 폴백 금지.
  const churchName = churchFromNotes || churchFromGreeting || "—";
  // 거래처 = 주문서 「업체명」(배달업체명/택배업체명/carrier). 중앙과 분리.
  const clientLabel =
    parseDeliveryCompanyFromNotes(order.notes) ||
    parseParcelCompanyFromNotes(order.notes) ||
    order.shipment?.carrier?.trim() ||
    "—";
  const releaseDone = order.releaseDone === true;
  const finalCompleteDone = order.finalCompleteDone === true;
  const greetingCount = order.greetingForms?.length ?? 0;
  const greetingMaterialRaw = greetingMaterialFromNotes(order.notes);
  const greetingMaterial =
    greetingCount > 0 && greetingMaterialRaw === "없음"
      ? "최지원"
      : greetingMaterialRaw;
  const greetingLocation =
    greetingMaterial === "없음" ? "—" : "박스외부";
  const slipLabel: "유" | "무" = isParcel ? "유" : "무";

  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    statusLabel: memberFacingStatusLabel(order.status, {
      finalConfirmDone: order.finalConfirmDone === true,
    }),
    createdAt: order.createdAt,
    orderDate:
      parseOrderDateFromNotes(order.notes) || order.createdAt.slice(0, 10),
    storeRegion,
    storeLabel: regionLabel(storeRegion) !== "—"
      ? regionLabel(storeRegion)
      : storeFromNotes || "—",
    churchName,
    name: parseOrdererFromNotes(order.notes) || order.user?.fullname || "—",
    clientLabel,
    productSummary,
    quantity,
    packagingWorker: order.packagingWorker ?? null,
    workerLabel:
      order.packagingWorker === "STORE"
        ? "매장"
        : order.packagingWorker === "FACTORY"
          ? "공장"
          : "—",
    fulfillmentType,
    loadType: isParcel ? "택배" : "상차",
    unitType: isParcel ? "개별" : "박스",
    isParcel,
    paymentDone: order.paymentDone === true,
    greetingDone: order.greetingDone === true,
    slipDone: order.slipDone === true,
    slipAuthor: order.slipAuthor ?? null,
    greetingCount,
    greetingMaterial,
    greetingLocation,
    slipLabel,
    requestedShipDate: toDateOnly(order.requestedShipDate),
    packDept: order.packDept ?? null,
    packDate: toDateOnly(order.packDate),
    packPt: order.packPt ?? null,
    storagePlace: order.storagePlace ?? null,
    packDone: order.packDone === true,
    releaseDone,
    releaseDoneAt: order.releaseDoneAt ?? null,
    finalCompleteDone,
    finalConfirmDone: order.finalConfirmDone === true,
    shipProgressLabel: finalCompleteDone ? "완료" : "미출고",
    notes: order.notes ?? null,
    specialNote,
    items,
  };
}

export function parseApiErrorMessage(
  data: unknown,
  fallback = "처리에 실패했습니다.",
): string {
  if (!data || typeof data !== "object") return fallback;
  const body = data as { message?: unknown; error?: unknown };
  if (typeof body.message === "string" && body.message.trim()) {
    return body.message.trim();
  }
  if (Array.isArray(body.message)) {
    const joined = body.message
      .filter((m): m is string => typeof m === "string" && m.trim().length > 0)
      .join(", ");
    if (joined) return joined;
  }
  if (typeof body.error === "string" && body.error.trim()) {
    return body.error.trim();
  }
  return fallback;
}

export async function patchShipmentOps(
  orderId: number,
  body: Record<string, unknown>,
  apiFetch: (
    input: string,
    init?: RequestInit,
  ) => Promise<Response>,
) {
  const response = await apiFetch(`/api/orders/${orderId}/shipment-ops`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  return { response, data };
}

export function todayIsoDate() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
