export type DeliveryOrderStatus =
  | "PLACED"
  | "WAITING_FOR_SHIPMENT"
  | "PREPARED"
  | "LOAD_NOTIFIED"
  | "SHIPPING"
  | "RECEIVED"
  | "PRINTING_COMPLETE"
  | "CANCELLED";

export type DeliveryAction =
  | "ADMIN_APPROVE"
  | "ADMIN_CANCEL_APPROVE"
  | "FACTORY_PREPARE"
  | "LOADING_NOTICE"
  | "FACTORY_SHIP"
  | "DELIVERY_COMPLETE"
  | "PRINT_COMPLETE"
  | "MEMBER_RECEIVE"
  | "CANCEL_ORDER";

/** 주문·배송 알림 칩 (개인/관리자/공장 공통) */
export const MEMBER_STATUS_STEPS = [
  {
    key: "PLACED",
    label: "접수완료",
    activeClass: "bg-white border-[#cbd5e1] text-ink",
  },
  {
    key: "PREPARED",
    label: "발송대기",
    activeClass: "bg-[#fef3c7] border-[#d97706] text-[#92400e]",
  },
  {
    key: "SHIPPING",
    label: "배송중",
    activeClass: "bg-[#c4b5fd] border-[#7c3aed] text-[#4c1d95]",
  },
  {
    key: "RECEIVED",
    label: "배송완료",
    activeClass: "bg-[#fbcfe8] border-[#db2777] text-[#9d174d]",
  },
] as const;

/** @deprecated use MEMBER_STATUS_STEPS */
export const MEMBER_DELIVERY_STEPS = MEMBER_STATUS_STEPS;

export const ORDER_STATUS_LABEL: Record<string, string> = {
  PLACED: "접수완료",
  WAITING_FOR_SHIPMENT: "접수완료",
  PREPARED: "발송대기",
  LOAD_NOTIFIED: "발송대기",
  SHIPPING: "배송중",
  RECEIVED: "배송완료",
  PRINTING_COMPLETE: "출력완료",
  CANCELLED: "취소",
};

/** 목록용 회원 상태 라벨 (출력완료도 배송완료로 표시) */
export function memberFacingStatusLabel(
  status: string,
  opts?: { finalConfirmDone?: boolean },
) {
  if (opts?.finalConfirmDone === true && status === "SHIPPING") {
    return "배송완료";
  }
  if (status === "PRINTING_COMPLETE") {
    return "배송완료";
  }
  return ORDER_STATUS_LABEL[status] ?? status;
}

/** 관리자승인 후~상차완료 전 */
export function isWaitingFactoryLoadStatus(status: string) {
  return status === "WAITING_FOR_SHIPMENT";
}

/** 상차완료 후~배송시작 전 (발송대기) */
export function isDispatchWaitingStatus(status: string) {
  return status === "PREPARED" || status === "LOAD_NOTIFIED";
}

/** @deprecated use isWaitingFactoryLoadStatus / isDispatchWaitingStatus */
export function isMemberPrepareStatus(status: string) {
  return (
    isWaitingFactoryLoadStatus(status) || isDispatchWaitingStatus(status)
  );
}

/** 배송중 */
export function isMemberShippingStatus(status: string) {
  return status === "SHIPPING";
}

/** 배송중 이전: 주문 수정 가능 */
export function canEditOrderStatus(status: string) {
  return (
    status === "PLACED" ||
    status === "WAITING_FOR_SHIPMENT" ||
    status === "PREPARED" ||
    status === "LOAD_NOTIFIED"
  );
}

/** 배송중 이전: 주문서 취소 가능 (수정 가능 구간과 동일) */
export function canCancelOrderStatus(status: string) {
  return canEditOrderStatus(status);
}

export function isDeliveryOrderType(type: string | null | undefined) {
  return Boolean(type && (type === "배달" || type.startsWith("배달")));
}

export function memberDeliveryStepIndex(status: string | null | undefined) {
  if (!status || status === "DRAFT" || status === "CANCELLED") {
    return -1;
  }
  if (status === "PRINTING_COMPLETE" || status === "RECEIVED") {
    return 3;
  }
  if (status === "SHIPPING") {
    return 2;
  }
  if (status === "PREPARED" || status === "LOAD_NOTIFIED") {
    return 1;
  }
  // PLACED / WAITING_FOR_SHIPMENT → 접수완료
  return 0;
}

export function deliveryStatusLabelKo(status: string | null | undefined) {
  if (!status) {
    return "-";
  }
  if (status === "PRINTING_COMPLETE") {
    return "배송완료";
  }
  return ORDER_STATUS_LABEL[status] ?? status;
}

/**
 * 관리자 상태관리 목록 라벨
 * 관리자승인 → 인수증수령 → 출력완료
 */
export function resolveAdminDeliveryManageLabel({
  status,
  deliveredAt,
}: {
  status: string;
  deliveredAt?: string | null;
}) {
  if (status === "CANCELLED") {
    return "-";
  }
  if (status === "PRINTING_COMPLETE") {
    return "출력완료";
  }
  if (status === "RECEIVED" && deliveredAt) {
    return "인수증수령";
  }
  if (status === "SHIPPING" || status === "RECEIVED") {
    return "관리자승인";
  }
  if (
    status === "WAITING_FOR_SHIPMENT" ||
    status === "PREPARED" ||
    status === "LOAD_NOTIFIED"
  ) {
    return "관리자승인";
  }
  return "-";
}

/** @deprecated alias */
export function adminManageStatusLabelKo(
  status: string | null | undefined,
  opts?: { deliveredAt?: string | null },
) {
  return resolveAdminDeliveryManageLabel({
    status: status ?? "",
    deliveredAt: opts?.deliveredAt,
  });
}

export function isDeliveryConfirmed(order: {
  status: string;
  shipment?: { deliveredAt?: string | null } | null;
}) {
  return Boolean(
    order.shipment?.deliveredAt || order.status === "PRINTING_COMPLETE",
  );
}

export const FACTORY_CHANGE_ALERT_MESSAGE = "주문서 변경요청발생!";

/** @deprecated 레거시 통합 메시지 — heal/클리어 호환용 */
export const ASSIGNMENT_CHANGE_ALERT = "작업자·주문매장 변경";

/** 작업자 초기화 시 공장 모달·○수정 */
export const WORKER_CHANGE_ALERT = "'작업자'변경 경고입니다.";

/** 주문매장 초기화 시 공장 모달·○수정 */
export const STORE_REGION_CHANGE_ALERT = "'주문매장'변경 경고입니다.:";

export function isAssignmentFactoryAlert(message?: string | null) {
  const m = message?.trim();
  return (
    m === ASSIGNMENT_CHANGE_ALERT ||
    m === WORKER_CHANGE_ALERT ||
    m === STORE_REGION_CHANGE_ALERT
  );
}