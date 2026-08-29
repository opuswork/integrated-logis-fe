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
    /보내는사람:\s*([^/]+?)\s*\/\s*([^/]+?)\s*\/\s*(.+?)(?=\s*\/\s*(?:받는분주소|주문작업지역|지부매장|인사장종류|인사장번호|\[)|$)/.exec(
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
    /받는분:\s*([^/]+?)\s*\/\s*([^/]+?)\s*\/\s*(.+?)(?=\s*\/\s*(?:택배발송일|보내는사람|주문작업지역|지부매장|인사장종류|\[)|$)/.exec(
      notes,
    );
  if (!match) {
    return {
      name: "",
      phone: "",
      address: parseOrderNoteField(notes, "받는분주소"),
    };
  }
  return {
    name: match[1].trim(),
    phone: match[2].trim(),
    address: match[3].trim(),
  };
}

/**
 * 본주소 끝의 호수/숫자(suite)를 상세주소로 분리.
 * 예: "서울 중구 서소문로 10-3 신송빌라트 77" → address + detail "77"
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
  // 77, 101, 12-3, #77, 77호, 101동 등
  const isSuiteLike =
    /^#?\d+([.-]\d+)?(호|동|실|층)?$/i.test(last) ||
    /^\d+[A-Za-z]?$/i.test(last);
  if (!isSuiteLike) {
    return { address: trimmed, detail: "" };
  }
  return {
    address: parts.slice(0, -1).join(" "),
    detail: last.replace(/^#/, ""),
  };
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
