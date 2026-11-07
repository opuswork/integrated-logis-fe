import { useSyncExternalStore } from "react";

import { memberFacingStatusLabel } from "@/lib/order-delivery";
import {
  parseBranchStoreFromNotes,
  parseDeliveryRequestDateFromNotes,
  parseGreetingKindFromNotes,
  parseLineShipmentsFromNotes,
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
  /** 회원이 삭제(취소)할 수 있는지 */
  canDelete: boolean;
  /** 삭제 가능하고, 이 주문서 화면으로 내용을 되살릴 수 있는지 */
  canEdit: boolean;
};

export type ApiMemberOrder = {
  id: number;
  orderNumber: string;
  /** 분할 형제가 같이 쓰는 키 (구 번호 주문은 없을 수 있음) */
  orderGroupKey?: string | null;
  splitIndex?: number | null;
  status: string;
  createdAt: string;
  notes?: string | null;
  orderConfirmedAt?: string | null;
  items?: Array<{ productName: string; quantity: number; price?: number }>;
  user?: { fullname?: string | null } | null;
  attachments?: Array<{ id: number }>;
  packagingWorker?: "STORE" | "FACTORY" | null;
  packDept?: "FACTORY_PACK" | "SOCK_PACK" | null;
  finalConfirmDone?: boolean | null;
};

/**
 * 회원이 주문을 수정·삭제할 수 있는지 (BE order-edit-guard 의 describeMemberOrderLock 과 같은 규칙).
 * - 접수·접수완료 상태에서만
 * - 작업자 매장: 배송관리 '발송완료' 전까지 / 작업자 공장: 포장관리 '포장 전' 동안
 */
export function canMemberChangeOrder(order: ApiMemberOrder) {
  if (order.status !== "PLACED" && order.status !== "WAITING_FOR_SHIPMENT") {
    return false;
  }
  if (order.packagingWorker === "STORE" && order.finalConfirmDone) return false;
  if (order.packagingWorker === "FACTORY" && order.packDept) return false;
  return true;
}

/**
 * 이 화면(새 주문)으로 접수한 모양인지: 상품 한 줄 + 줄별 배송정보 한 줄 + 인사장 없음.
 * 기본 버전 주문서로 만든 여러 줄·인사장 주문은 여기서 고치면 내용이 빠지므로 수정 버튼을 숨긴다.
 */
export function isV2EditableOrder(order: ApiMemberOrder) {
  if ((order.items?.length ?? 0) !== 1) return false;
  if (parseLineShipmentsFromNotes(order.notes)?.length !== 1) return false;
  const greeting = parseGreetingKindFromNotes(order.notes);
  return !greeting || greeting === "없음";
}

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
      canDelete: canMemberChangeOrder(order),
      canEdit: canMemberChangeOrder(order) && isV2EditableOrder(order),
    }));
}

/** 59000 → "59,000원" */
export function formatWon(value: number) {
  return `${Math.round(value).toLocaleString("ko-KR")}원`;
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

/** 화면 크기 단계. 가운데(1)가 기본 = 1.5배 글씨 화면 그대로 */
export const TEXT_SCALES = [0.67, 0.85, 1, 1.15, 1.3] as const;
const DEFAULT_SCALE_INDEX = 2;
/**
 * 글씨 단계는 이번 방문(탭) 동안만 기억한다 (sessionStorage).
 * 앱을 새로 열면 항상 100% 로 시작 — 예전에 줄여 둔 값(67% 등) 때문에
 * 글씨+/- 버튼이 없는 주문 달력이 작게 열리던 문제 방지.
 */
const TEXT_SCALE_KEY = "jy-v2-text-scale";
const TEXT_SCALE_EVENT = "jy-v2-text-scale-change";

/** 예전 버전이 기기에 영구 저장한 값은 지운다 */
if (typeof window !== "undefined") {
  try {
    window.localStorage.removeItem(TEXT_SCALE_KEY);
  } catch {
    // 저장소가 막힌 브라우저
  }
}

function readTextScaleIndex() {
  try {
    const raw = window.sessionStorage.getItem(TEXT_SCALE_KEY);
    const saved = raw === null ? NaN : Number(raw);
    return Number.isInteger(saved) && saved >= 0 && saved < TEXT_SCALES.length
      ? saved
      : DEFAULT_SCALE_INDEX;
  } catch {
    return DEFAULT_SCALE_INDEX;
  }
}

function subscribeTextScale(onChange: () => void) {
  window.addEventListener(TEXT_SCALE_EVENT, onChange);
  return () => window.removeEventListener(TEXT_SCALE_EVENT, onChange);
}

/** 글씨+/글씨- 단계 (이번 방문 동안 유지, 새로 열면 100%) */
export function useTextScaleIndex() {
  return useSyncExternalStore(
    subscribeTextScale,
    readTextScaleIndex,
    () => DEFAULT_SCALE_INDEX,
  );
}

function setTextScaleIndex(index: number) {
  try {
    window.sessionStorage.setItem(TEXT_SCALE_KEY, String(index));
  } catch {
    // 저장이 막힌 브라우저: 이번 화면에서만 바뀐다 (아래 이벤트도 저장값을 읽으므로 그대로)
  }
  window.dispatchEvent(new Event(TEXT_SCALE_EVENT));
}

function TextScaleControls() {
  const index = useTextScaleIndex();
  return (
    <div className="jy-text-scale">
      <button
        type="button"
        className="jy-btn"
        aria-label="글씨 작게"
        disabled={index <= 0}
        onClick={() => setTextScaleIndex(index - 1)}
      >
        글씨-
      </button>
      <span className="jy-num" aria-live="polite">
        {Math.round(TEXT_SCALES[index] * 100)}%
      </span>
      <button
        type="button"
        className="jy-btn"
        aria-label="글씨 크게"
        disabled={index >= TEXT_SCALES.length - 1}
        onClick={() => setTextScaleIndex(index + 1)}
      >
        글씨+
      </button>
    </div>
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
      <h1 style={{ fontSize: 20, flex: 1, minWidth: 0 }}>{title}</h1>
      <TextScaleControls />
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
