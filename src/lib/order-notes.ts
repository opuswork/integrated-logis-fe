/** Parse a single field from Order.notes (segments separated by " / "). */
export function parseOrderNoteField(
  notes: string | null | undefined,
  field: string,
): string {
  if (!notes) {
    return "";
  }

  const pattern = new RegExp(`${field}:([^/]+)`);
  return pattern.exec(notes)?.[1]?.trim() ?? "";
}

export function parseOrdererFromNotes(notes: string | null | undefined) {
  return parseOrderNoteField(notes, "주문자");
}

export function parseOrdererPhoneFromNotes(notes: string | null | undefined) {
  return parseOrderNoteField(notes, "연락처");
}

export function parseOrderDateFromNotes(notes: string | null | undefined) {
  return parseOrderNoteField(notes, "주문일자");
}

export function parseChurchFromNotes(notes: string | null | undefined) {
  return parseOrderNoteField(notes, "중앙");
}

export function parseDeliveryCompanyFromNotes(notes: string | null | undefined) {
  return parseOrderNoteField(notes, "배달업체명");
}

export function parseParcelCompanyFromNotes(notes: string | null | undefined) {
  return parseOrderNoteField(notes, "택배업체명");
}

export function parseBranchStoreFromNotes(notes: string | null | undefined) {
  return (
    parseOrderNoteField(notes, "주문작업지역") ||
    parseOrderNoteField(notes, "지부매장")
  );
}

export function parseGreetingKindFromNotes(notes: string | null | undefined) {
  return parseOrderNoteField(notes, "인사장종류");
}

export function parseGreetingNumberFromNotes(notes: string | null | undefined) {
  return parseOrderNoteField(notes, "인사장번호");
}

export function parseGreetingSelfFromNotes(notes: string | null | undefined) {
  return parseOrderNoteField(notes, "인사장자체") === "Y";
}

export function parseBusinessCardFromNotes(notes: string | null | undefined) {
  return parseOrderNoteField(notes, "명함동봉") === "Y";
}

export const GREETING_CATALOG_NUMBERS = ["1", "2", "3", "4"] as const;

export function isGreetingCatalogNumber(value: string | null | undefined) {
  return GREETING_CATALOG_NUMBERS.includes(
    String(value ?? "").trim() as (typeof GREETING_CATALOG_NUMBERS)[number],
  );
}

export type GreetingSelection = {
  hasCatalog: boolean;
  includeSelf: boolean;
  includeCard: boolean;
};

/** 인사장번호 1~4 / 자체 / 명함 선택 상태를 폼·notes에서 모읍니다. */
export function resolveGreetingSelection(input: {
  greetingNumber?: string | null;
  includeSelf?: boolean | null;
  businessCard?: string | null;
  notes?: string | null;
} = {}): GreetingSelection {
  const number =
    input.greetingNumber?.trim() ||
    parseGreetingNumberFromNotes(input.notes);
  return {
    hasCatalog: isGreetingCatalogNumber(number),
    includeSelf:
      Boolean(input.includeSelf) || parseGreetingSelfFromNotes(input.notes),
    includeCard:
      input.businessCard === "동봉" || parseBusinessCardFromNotes(input.notes),
  };
}

export function mergeGreetingSelections(
  forms: Array<{
    greetingNumber?: string | null;
    includeSelf?: boolean | null;
    businessCard?: string | null;
  }>,
  notes?: string | null,
): GreetingSelection {
  const fromNotes = resolveGreetingSelection({ notes });
  return forms.reduce<GreetingSelection>(
    (acc, form) => {
      const next = resolveGreetingSelection(form);
      return {
        hasCatalog: acc.hasCatalog || next.hasCatalog,
        includeSelf: acc.includeSelf || next.includeSelf,
        includeCard: acc.includeCard || next.includeCard,
      };
    },
    fromNotes,
  );
}

/** 1~4 없이 자체·명함만 있으면 본사 인사장 완료(확인)가 필요 없습니다. */
export function isSelfOrCardOnlyGreeting(selection: GreetingSelection) {
  return (
    !selection.hasCatalog && (selection.includeSelf || selection.includeCard)
  );
}

export function parseGreetingSpecialNoteFromNotes(
  notes: string | null | undefined,
) {
  return parseOrderNoteField(notes, "인사장특이사항");
}

/** `보내는사람:이름 / 전화 / 주소` embedded in notes. */
export function parseSenderPartsFromNotes(notes: string | null | undefined): {
  name: string;
  phone: string;
  address: string;
} {
  if (!notes) {
    return { name: "", phone: "", address: "" };
  }
  const match =
    /보내는사람:\s*([^/]+?)\s*\/\s*([^/]+?)\s*\/\s*(.+?)(?=\s*\/\s*(?:보내는분상세주소|수취연락|받는분이메일|받는분팩스|받는분주소|주문작업지역|지부매장|인사장종류|인사장번호|배송상세|\[)|$)/.exec(
      notes,
    );
  if (!match) {
    return {
      name: parseOrderNoteField(notes, "보내는사람"),
      phone: "",
      address: "",
    };
  }
  return {
    name: match[1].trim(),
    phone: match[2].trim(),
    address: match[3].trim(),
  };
}

/** `받는분:이름 / 전화 / 주소` embedded in notes. */
export function parseRecipientPartsFromNotes(notes: string | null | undefined): {
  name: string;
  phone: string;
  address: string;
} {
  if (!notes) {
    return { name: "", phone: "", address: "" };
  }
  const match =
    /받는분:\s*([^/]+?)\s*\/\s*([^/]+?)\s*\/\s*(.+?)(?=\s*\/\s*(?:수취연락|받는분이메일|받는분팩스|택배발송일|보내는사람|주문작업지역|지부매장|인사장종류|배송상세|\[)|$)/.exec(
      notes,
    );
  if (!match) {
    return {
      name: "",
      phone: "",
      address: parseOrderNoteField(notes, "받는분주소"),
    };
  }
  const address = match[3].trim();
  return {
    name: match[1].trim(),
    phone: match[2].trim(),
    address: address === "-" ? "" : address,
  };
}

export type ParcelRecipientContactMode = "address" | "email" | "fax";

export const PARCEL_CONTACT_MODE_LABEL: Record<
  ParcelRecipientContactMode,
  string
> = {
  address: "주소",
  email: "이메일",
  fax: "팩스",
};

/** 택배·배달 수취 연락 방식 (구주문은 주소). */
export function parseParcelRecipientContactMode(
  notes: string | null | undefined,
): ParcelRecipientContactMode {
  const tagged = parseOrderNoteField(notes, "수취연락");
  if (tagged === "이메일") return "email";
  if (tagged === "팩스") return "fax";
  if (tagged === "주소") return "address";
  if (parseOrderNoteField(notes, "받는분이메일")) return "email";
  if (parseOrderNoteField(notes, "받는분팩스")) return "fax";
  return "address";
}

export function parseParcelRecipientEmail(notes: string | null | undefined) {
  return parseOrderNoteField(notes, "받는분이메일");
}

export function parseParcelRecipientFax(notes: string | null | undefined) {
  return parseOrderNoteField(notes, "받는분팩스");
}

export function parcelRecipientContactDisplay(
  notes: string | null | undefined,
): { label: string; value: string } {
  const mode = parseParcelRecipientContactMode(notes);
  // 신규 주문은 이메일/팩스 선택만 기록하므로 값이 없으면 선택 방식만 표시
  if (mode === "email") {
    return {
      label: "받는 분 이메일",
      value: parseParcelRecipientEmail(notes) || "이메일",
    };
  }
  if (mode === "fax") {
    return {
      label: "받는 분 팩스",
      value: parseParcelRecipientFax(notes) || "팩스",
    };
  }
  return {
    label: "받는 분 주소",
    value:
      parseRecipientPartsFromNotes(notes).address ||
      parseOrderNoteField(notes, "받는분주소"),
  };
}

/** `받는분상세주소:` 태그 (상세주소를 정확히 복원하기 위해 별도 저장). */
export function parseRecipientAddressDetailFromNotes(
  notes: string | null | undefined,
) {
  return parseOrderNoteField(notes, "받는분상세주소");
}

/** `보내는분상세주소:` 태그. */
export function parseSenderAddressDetailFromNotes(
  notes: string | null | undefined,
) {
  return parseOrderNoteField(notes, "보내는분상세주소");
}

/**
 * 저장된 전체 주소를 본주소/상세주소로 복원.
 * 상세주소 태그가 있으면 그대로 쓰고(전체 주소 끝에서 제거), 없는 구주문은
 * 숫자형 호수 휴리스틱(splitAddressAndDetail)으로 분리.
 */
export function splitSavedAddress(
  full: string,
  savedDetail: string,
): { address: string; detail: string } {
  const trimmed = full.trim();
  const detail = savedDetail.trim();
  if (!detail) {
    return splitAddressAndDetail(trimmed);
  }
  if (trimmed.endsWith(detail)) {
    return {
      address: trimmed.slice(0, trimmed.length - detail.length).trim(),
      detail,
    };
  }
  return { address: trimmed, detail };
}

/** 지번/도로명 마지막 토큰: …로, …길, …리, …동, …가 (읍·면 단독은 번지 앞에 오지 않음) */
const ADDRESS_STREET_SUFFIX = /(로|길|리|동|가)$/;
/** 번지: 290, 10-3, 152 */
const LOT_NUMBER = /^\d+(-\d+)?$/;

/**
 * 본주소 끝의 상세주소를 분리 (상세주소 태그가 없는 구주문용 휴리스틱).
 * 1) 끝 토큰이 호수/숫자면 그것만 상세주소.
 *    "서울 중구 서소문로 10-3 신송빌라트 77" → detail "77"
 * 2) 아니면 마지막 번지("석현리 290", "서소문로 10-3") 뒤 텍스트 전체를 상세주소.
 *    "경기 양주시 장흥면 석현리 290 허경영힐링센타 김옥립" → detail "허경영힐링센타 김옥립"
 */
export function splitAddressAndDetail(full: string): {
  address: string;
  detail: string;
} {
  const trimmed = full.trim();
  if (!trimmed) {
    return { address: "", detail: "" };
  }
  const parts = trimmed.split(/\s+/);
  if (parts.length < 2) {
    return { address: trimmed, detail: "" };
  }
  const last = parts[parts.length - 1] ?? "";
  const beforeLast = parts[parts.length - 2] ?? "";
  // 77, 101, 12-3, #77, 77호, 101동 등
  const isSuiteLike =
    /^#?\d+([.-]\d+)?(호|동|실|층)?$/i.test(last) ||
    /^\d+[A-Za-z]?$/i.test(last);
  // "테헤란로 152", "석현리 290"처럼 도로/리/동 바로 뒤 숫자는 번지이지 호수가 아님
  const isLotNumber =
    LOT_NUMBER.test(last) && ADDRESS_STREET_SUFFIX.test(beforeLast);
  if (isSuiteLike && !isLotNumber) {
    return {
      address: parts.slice(0, -1).join(" "),
      detail: last.replace(/^#/, ""),
    };
  }

  // 마지막 "<도로/리/동> <번지>" 쌍을 찾아 그 뒤를 상세주소로
  for (let i = parts.length - 2; i >= 1; i -= 1) {
    if (
      LOT_NUMBER.test(parts[i] ?? "") &&
      ADDRESS_STREET_SUFFIX.test(parts[i - 1] ?? "")
    ) {
      return {
        address: parts.slice(0, i + 1).join(" "),
        detail: parts.slice(i + 1).join(" "),
      };
    }
  }
  return { address: trimmed, detail: "" };
}

export function parseDeliveryDateTimeFromNotes(
  notes: string | null | undefined,
) {
  return parseOrderNoteField(notes, "배달일");
}

/** 납품요청일: 배달일 우선, 없으면 택배발송일 (YYYY-MM-DD). */
export function parseDeliveryRequestDateFromNotes(
  notes: string | null | undefined,
) {
  const delivery = parseDeliveryDateTimeFromNotes(notes).slice(0, 10);
  if (delivery) return delivery;
  return parseOrderNoteField(notes, "택배발송일").slice(0, 10);
}

/** Map saved greeting kind to 인사장소재 text on the print sheet. */
export function greetingMaterialFromNotes(notes: string | null | undefined) {
  const selection = resolveGreetingSelection({ notes });
  if (selection.hasCatalog) {
    return "최지원";
  }
  if (selection.includeSelf || selection.includeCard) {
    return "주문처제공";
  }
  const kind = parseGreetingKindFromNotes(notes);
  if (kind === "자체") {
    return "주문처제공";
  }
  if (kind === "없음") {
    return "없음";
  }
  if (kind === "본사") {
    return "최지원";
  }
  return "없음";
}

export function parseShipDateFromNotes(notes: string | null | undefined) {
  const parcelShipDate = parseOrderNoteField(notes, "택배발송일");
  if (parcelShipDate) {
    return parcelShipDate.slice(0, 10);
  }

  const deliveryDate = parseOrderNoteField(notes, "배달일");
  if (deliveryDate) {
    return deliveryDate.slice(0, 10);
  }

  return "";
}

export function parseOrderTypeFromNotes(notes: string | null | undefined) {
  if (!notes) {
    return "택배";
  }

  const hasDelivery =
    notes.includes("[배달]") || notes.includes("배달업체명:");
  const hasParcel =
    notes.includes("[택배]") || notes.includes("택배업체명:");

  if (hasDelivery && hasParcel) {
    return "배달/택배";
  }
  if (hasDelivery) {
    return "배달";
  }
  if (hasParcel) {
    return "택배";
  }

  return "택배";
}

/** Extract request-note for a product line from notes segments like `[배달] 명진 1호 300개(개별택배)`. */
export function parseItemNoteFromNotes(
  notes: string | null | undefined,
  productName: string,
  quantity?: number,
): string {
  if (!notes || !productName) {
    return "";
  }

  const segments = notes.split(" / ").map((segment) => segment.trim());
  const escapedName = productName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const qtyPart =
    quantity != null && Number.isFinite(quantity)
      ? String(quantity)
      : "\\d+";
  const pattern = new RegExp(
    `^\\[(배달|택배)\\]\\s+${escapedName}\\s+${qtyPart}개(?:\\((.*)\\))?$`,
  );

  for (const segment of segments) {
    const match = pattern.exec(segment);
    if (match) {
      return match[2]?.trim() ?? "";
    }
  }

  // Fallback: match by product name only (qty may have changed)
  const loosePattern = new RegExp(
    `^\\[(배달|택배)\\]\\s+${escapedName}\\s+\\d+개(?:\\((.*)\\))?$`,
  );
  for (const segment of segments) {
    const match = loosePattern.exec(segment);
    if (match) {
      return match[2]?.trim() ?? "";
    }
  }

  return "";
}

export type DeliveryAmPm = "오전" | "오후";

export function parseClockParts(
  value: string,
): { hour: number; minute: number } | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) {
    return null;
  }
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || minute > 59) {
    return null;
  }
  return { hour, minute };
}

export function formatClock(hour: number, minute: number) {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function isValidTwelveHourClock(value: string) {
  const parts = parseClockParts(value);
  return Boolean(parts && parts.hour >= 1 && parts.hour <= 12);
}

/** 24시간 HH:MM → 12시간 + 오전/오후 */
export function fromTwentyFourHour(hhmm: string): {
  ampm: DeliveryAmPm;
  time: string;
} | null {
  const parts = parseClockParts(hhmm);
  if (!parts || parts.hour > 23) {
    return null;
  }
  const ampm: DeliveryAmPm = parts.hour < 12 ? "오전" : "오후";
  const hour12 = parts.hour % 12 === 0 ? 12 : parts.hour % 12;
  return { ampm, time: formatClock(hour12, parts.minute) };
}

/** 12시간 + 오전/오후 → 24시간 HH:MM */
export function toTwentyFourHour(ampm: DeliveryAmPm, hhmm: string) {
  const parts = parseClockParts(hhmm);
  if (!parts || parts.hour < 1 || parts.hour > 12) {
    return null;
  }
  let hour = parts.hour;
  if (ampm === "오전") {
    if (hour === 12) hour = 0;
  } else if (hour !== 12) {
    hour += 12;
  }
  return formatClock(hour, parts.minute);
}

/** 저장된 배달 시각을 12시간 칸에 맞게 정리 */
export function normalizeDeliveryClock(
  ampm: string,
  time: string,
): { ampm: DeliveryAmPm | ""; time: string } {
  const parts = parseClockParts(time);
  if (!parts) {
    return {
      ampm: ampm === "오전" || ampm === "오후" ? ampm : "",
      time: "",
    };
  }
  if (parts.hour > 12) {
    const converted = fromTwentyFourHour(time);
    return converted ?? { ampm: "", time: "" };
  }
  if (parts.hour === 0) {
    return { ampm: "오전", time: formatClock(12, parts.minute) };
  }
  return {
    ampm: ampm === "오전" || ampm === "오후" ? ampm : "",
    time: formatClock(parts.hour, parts.minute),
  };
}

/* ------------------------------------------------------------------ *
 * 줄별 배송정보 (개인앱 제품주문서)
 *
 * Shipment 테이블은 주문당 1행이라 줄마다 다른 배송지를 담을 수 없다.
 * 기존 세그먼트(배달업체명/받는분/택배발송일/보내는사람…)에는 배송방식별
 * 대표 1벌을 그대로 유지해 관리자·출력·공장 화면을 건드리지 않고,
 * 줄 단위 원본은 `배송상세:<base64url(JSON)>` 세그먼트에 따로 싣는다.
 * parseOrderNoteField 가 `[^/]+` 로 끊으므로 '/' 없는 base64url 을 쓴다.
 * ------------------------------------------------------------------ */

export const LINE_SHIPMENTS_NOTE_FIELD = "배송상세";

export type LineShipKind = "parcel" | "delivery";

export type LineShipInfo = {
  kind: LineShipKind;
  /** 납품업체명 (배달/택배 공통) */
  companyName: string;
  /** 배달 */
  deliveryDate: string;
  deliveryAmPm: "" | DeliveryAmPm;
  deliveryTime: string;
  recipientName: string;
  recipientPhone: string;
  recipientAddress: string;
  recipientAddressDetail: string;
  /** 택배 */
  parcelShipDate: string;
  senderName: string;
  senderPhone: string;
  senderAddress: string;
  senderAddressDetail: string;
  sameAsSenderAddress: boolean;
  contactMode: ParcelRecipientContactMode;
};

export type LineShipment = {
  product: string;
  qty: number;
  /** 같은 상품이 택배/상차로 갈라졌을 때 원래 수량 */
  baseQty: number;
  note: string;
  unitPrice: number;
  lineSection: "box" | "giftUnit";
  /** 배달 전용 상품(선물세트 박스) 여부 — 복원 시 재추론하지 않도록 함께 싣는다 */
  deliveryOnly?: boolean;
  ship: LineShipInfo;
};

export function emptyLineShipInfo(kind: LineShipKind): LineShipInfo {
  return {
    kind,
    companyName: "",
    deliveryDate: "",
    deliveryAmPm: "",
    deliveryTime: "",
    recipientName: "",
    recipientPhone: "",
    recipientAddress: "",
    recipientAddressDetail: "",
    parcelShipDate: "",
    senderName: "",
    senderPhone: "",
    senderAddress: "",
    senderAddressDetail: "",
    sameAsSenderAddress: false,
    contactMode: "address",
  };
}

function toBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    "=",
  );
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

/** 줄별 배송정보를 notes 세그먼트 문자열로. 빈 배열이면 null(세그먼트 생략) */
export function encodeLineShipments(lines: LineShipment[]): string | null {
  if (lines.length === 0) {
    return null;
  }
  try {
    const json = JSON.stringify({ v: 1, lines });
    const encoded = toBase64Url(new TextEncoder().encode(json));
    return `${LINE_SHIPMENTS_NOTE_FIELD}:${encoded}`;
  } catch {
    return null;
  }
}

/** notes 에서 줄별 배송정보 복원. 없거나 깨졌으면 null */
export function parseLineShipmentsFromNotes(
  notes: string | null | undefined,
): LineShipment[] | null {
  const raw = parseOrderNoteField(notes, LINE_SHIPMENTS_NOTE_FIELD);
  if (!raw) {
    return null;
  }
  try {
    const json = new TextDecoder().decode(fromBase64Url(raw.trim()));
    const parsed = JSON.parse(json) as { v?: number; lines?: unknown };
    if (!Array.isArray(parsed.lines)) {
      return null;
    }
    const lines = parsed.lines.filter(
      (line): line is LineShipment =>
        Boolean(line) &&
        typeof line === "object" &&
        typeof (line as LineShipment).product === "string" &&
        typeof (line as LineShipment).qty === "number" &&
        Boolean((line as LineShipment).ship),
    );
    return lines.length > 0 ? lines : null;
  } catch {
    return null;
  }
}
