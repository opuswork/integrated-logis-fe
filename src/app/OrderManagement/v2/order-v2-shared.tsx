import { memberFacingStatusLabel } from "@/lib/order-delivery";
import {
  parseBranchStoreFromNotes,
  parseDeliveryRequestDateFromNotes,
  parseOrderTypeFromNotes,
  parseOrdererFromNotes,
} from "@/lib/order-notes";

export const DOW = ["일", "월", "화", "수", "목", "금", "토"] as const;

/** 회원에게 보이는 주문 상태 (기존 앱과 같은 순서) */
export const V2_STATUSES = [
  "접수",
  "접수완료",
  "발송대기",
  "배송중",
  "배송완료",
] as const;

export const V2_BRANCHES = ["중부", "서부", "남부"] as const;

export type V2Order = {
  id: number;
  orderNumber: string;
  name: string;
  status: string;
  branch: string;
  type: string;
  /** 배달일 / 택배발송일 (YYYY-MM-DD) — 달력 기준 */
  date: string;
  summary: string;
  attachmentCount: number;
};

export type ApiMemberOrder = {
  id: number;
  orderNumber: string;
  status: string;
  createdAt: string;
  notes?: string | null;
  orderConfirmedAt?: string | null;
  items?: Array<{ productName: string; quantity: number }>;
  user?: { fullname?: string | null } | null;
  attachments?: Array<{ id: number }>;
};

const pad = (value: number) => String(value).padStart(2, "0");

export function ymd(year: number, monthIndex: number, day: number) {
  return `${year}-${pad(monthIndex + 1)}-${pad(day)}`;
}

export function todayIso() {
  const now = new Date();
  return ymd(now.getFullYear(), now.getMonth(), now.getDate());
}

/** `10월 28일 (수)` */
export function dateLabel(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return iso;
  const weekday = DOW[new Date(year, month - 1, day).getDay()];
  return `${month}월 ${day}일 (${weekday})`;
}

/** 기존 앱과 같은 회원용 상태 라벨: 접수확인 전 PLACED 는 "접수" */
export function memberStatusLabel(order: {
  status: string;
  orderConfirmedAt?: string | null;
}) {
  return order.orderConfirmedAt || order.status !== "PLACED"
    ? memberFacingStatusLabel(order.status)
    : "접수";
}

export function statusTone(label: string) {
  if (label === "배송완료") return "done";
  if (label === "배송중") return "purple";
  if (label === "발송대기") return "prep";
  return "blue";
}

/** "중부(덕소)" → "중부" */
export function shortBranch(notes: string | null | undefined) {
  const raw = parseBranchStoreFromNotes(notes);
  return V2_BRANCHES.find((name) => raw.includes(name)) ?? "";
}

function buildSummary(
  items: Array<{ productName: string; quantity: number }> | undefined,
) {
  if (!items || items.length === 0) return "-";
  return items.map((item) => `${item.productName} × ${item.quantity}`).join(", ");
}

export function mapMemberOrders(data: ApiMemberOrder[]): V2Order[] {
  return data
    .filter((order) => order.status !== "CANCELLED")
    .map((order) => ({
      id: order.id,
      orderNumber: order.orderNumber,
      name: parseOrdererFromNotes(order.notes) || order.user?.fullname || "-",
      status: memberStatusLabel(order),
      branch: shortBranch(order.notes),
      type: parseOrderTypeFromNotes(order.notes),
      date: parseDeliveryRequestDateFromNotes(order.notes),
      summary: buildSummary(order.items),
      attachmentCount: order.attachments?.length ?? 0,
    }));
}

export function BackIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

export function V2Header({
  title,
  onBack,
}: {
  title: string;
  onBack: () => void;
}) {
  return (
    <header className="jy-bar">
      <button
        type="button"
        className="jy-btn jy-circle"
        aria-label="뒤로가기"
        onClick={onBack}
      >
        <BackIcon />
      </button>
      <h1 style={{ fontSize: 20 }}>{title}</h1>
    </header>
  );
}

export function V2Dock({ children }: { children: React.ReactNode }) {
  return (
    <div className="jy-dock">
      <div className="jy-dock-in">{children}</div>
    </div>
  );
}
