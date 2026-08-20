import {
  memberFacingStatusLabel,
  type DeliveryOrderStatus,
} from "@/lib/order-delivery";
import {
  parseBranchStoreFromNotes,
  parseOrderDateFromNotes,
  parseOrdererFromNotes,
  parseOrderTypeFromNotes,
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
};

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
  greetingForms?: { specialNote?: string | null }[];
  shipment?: { fulfillmentType?: string | null } | null;
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
  const isParcel =
    fulfillmentType === "PARCEL" || typeFromNotes.startsWith("택배");
  const items = order.items ?? [];
  const quantity = items.reduce((sum, item) => sum + (item.quantity ?? 0), 0);
  const productSummary =
    items.length === 0
      ? "—"
      : items.length === 1
        ? (items[0]?.productName ?? "—")
        : `${items[0]?.productName ?? "상품"} 외 ${items.length - 1}`;
  const specialNote =
    order.greetingForms
      ?.map((g) => g.specialNote?.trim())
      .filter(Boolean)
      .join(", ") || "—";
  const storeRegion = order.storeRegion ?? null;
  const storeFromNotes = parseBranchStoreFromNotes(order.notes);
  const releaseDone = order.releaseDone === true;
  const finalCompleteDone = order.finalCompleteDone === true;

  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    statusLabel: memberFacingStatusLabel(order.status),
    createdAt: order.createdAt,
    orderDate:
      parseOrderDateFromNotes(order.notes) || order.createdAt.slice(0, 10),
    storeRegion,
    storeLabel: regionLabel(storeRegion) !== "—"
      ? regionLabel(storeRegion)
      : storeFromNotes || "—",
    churchName: order.user?.church?.name?.trim() || "—",
    name: parseOrdererFromNotes(order.notes) || order.user?.fullname || "—",
    clientLabel: order.user?.church?.name?.trim() || "—",
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
    greetingCount: order.greetingForms?.length ?? 0,
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
  };
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
