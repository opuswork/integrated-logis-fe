"use client";

import { Menu, Plus, Trash2, X } from "lucide-react";
import {
  useRef,
  useState,
  useEffect,
  useMemo,
  useCallback,
  type ReactNode,
} from "react";

import { OrderPrintPreviewModal } from "@/app/admin/OrderManagement/OrderPrintPreview";
import { MemberGreetingMng } from "@/app/OrderManagement/MemberGreetingMng";
import { LogoutButton } from "@/components/auth-guard";
import {
  GreetingNumberChipPicker,
  GREETING_PREVIEW_IMAGE,
} from "@/components/greeting-number-picker";
import { ProductNameWithStock } from "@/components/product-name-with-stock";
import { Button } from "@/components/ui/button";
import { Chip, type ChipVariant } from "@/components/ui/chip";
import { Dialog } from "@/components/ui/dialog";
import { Dropdown } from "@/components/ui/dropdown";
import { Input } from "@/components/ui/input";
import { Table, type TableColumn } from "@/components/ui/table";
import { apiFetch } from "@/lib/api";
import { getAccessToken, getAuthUser } from "@/lib/auth";
import { openDaumPostcode } from "@/lib/daum-postcode";
import { API_BASE_URL } from "@/lib/env";
import {
  parseBranchStoreFromNotes,
  parseChurchFromNotes,
  parseDeliveryCompanyFromNotes,
  parseDeliveryDateTimeFromNotes,
  parseGreetingKindFromNotes,
  parseItemNoteFromNotes,
  parseOrderDateFromNotes,
  parseOrdererFromNotes,
  parseOrdererPhoneFromNotes,
  parseOrderTypeFromNotes,
  parseParcelCompanyFromNotes,
  parseRecipientPartsFromNotes,
  parseSenderPartsFromNotes,
  parseShipDateFromNotes,
} from "@/lib/order-notes";
import {
  canEditOrderStatus,
} from "@/lib/order-delivery";
import { cn } from "@/lib/utils";

const MEMBER_NAV = ["새 주문서 작성", "인사장관리", "내 주문 현황"] as const;
const GREETING_NUMBERS = ["1", "2", "3", "4"] as const;
const GREETING_SIZES = ["8칸", "6칸", "4칸", "자체"] as const;
const GREETING_RECEIVE_PLACES = [
  "공장작업",
  "소사매장",
  "덕소매장",
  "남부매장",
  "방문",
] as const;
const ORDER_TYPES = [
  { value: "delivery", label: "배달" },
  { value: "parcel", label: "택배" },
] as const;

type OrderType = (typeof ORDER_TYPES)[number]["value"];

type ChurchOption = {
  id: number;
  name: string;
  region: string;
  branchCode: string | null;
  assigner: string;
};

const BRANCH_STORES = [
  {
    id: "nambu" as const,
    name: "남부(기장)",
    shortLabel: "남부매장",
    phones: "051-720-7254-5\n010-4403-7706(임찬)",
    fax: "051-721-1448",
    email: "zionsauce@naver.com",
  },
  {
    id: "jungbu" as const,
    name: "중부(덕소)",
    shortLabel: "중부매장",
    phones: "070-4490-8456\n010-7564-1576",
    fax: "031-521-1469",
    email: "dud386@naver.com",
  },
  {
    id: "seobu" as const,
    name: "서부(소사)",
    shortLabel: "서부매장",
    phones: "015-720-7254-5\n010-2330-1449(김은실)",
    fax: "051-721-1448",
    email: "sanc7020@naver.com",
  },
] as const;

type BranchStoreId = (typeof BRANCH_STORES)[number]["id"];

function todayDateValue() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isDateOnOrAfterToday(value: string) {
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return false;
  }
  return trimmed >= todayDateValue();
}

/** Force contact input into 000-0000-0000 (3-4-4 digits only). */
function formatPhoneInput(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);

  if (digits.length <= 3) {
    return digits;
  }
  if (digits.length <= 7) {
    return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  }
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

type MemberNav = (typeof MEMBER_NAV)[number];

interface ProductLineItem {
  [key: string]: string | number | boolean;
  product: string;
  orderKind: OrderType;
  qty: number;
  note: string;
  greeting: string;
  unitPrice: number;
  deliveryOnly: boolean;
}

function orderKindLabel(kind: OrderType) {
  return kind === "delivery" ? "배달" : "택배";
}

/** 선물세트 + 품명에 '박스' 포함 → 배달 전용 */
function isDeliveryOnlyProduct(category: string, productName: string) {
  const normalizedCategory = category.replace(/\s+/g, "");
  const isGiftSet =
    normalizedCategory === "선물세트" || normalizedCategory === "선물셋트";
  return isGiftSet && productName.includes("박스");
}

interface OrderRow {
  [key: string]: string | number | boolean;
  id: number;
  orderNumber: string;
  name: string;
  type: string;
  greeting: string;
  status: string;
  statusCode: string;
  productName: string;
  total: number;
  orderDate: string;
  canConfirmReceive: boolean;
}

const ORDER_STATUS_LABEL: Record<string, string> = {
  PLACED: "접수완료",
  WAITING_FOR_SHIPMENT: "접수완료",
  PREPARED: "발송대기",
  LOAD_NOTIFIED: "발송대기",
  SHIPPING: "배송중",
  RECEIVED: "배송완료",
  PRINTING_COMPLETE: "출력완료",
  CANCELLED: "취소",
};

function buildMemberOrderSummary(
  items: Array<{ productName: string; quantity: number }> | undefined,
) {
  if (!items || items.length === 0) {
    return "-";
  }
  const [first, ...rest] = items;
  const head = `${first.productName} ${first.quantity}개`;
  return rest.length > 0 ? `${head} 외 ${rest.length}건` : head;
}

function formatMemberOrderDate(value: string) {
  return value.slice(0, 10);
}

const PAGE_META: Record<
  MemberNav,
  { title: string; description: string }
> = {
  "새 주문서 작성": {
    title: "새 주문서 작성",
    description: "상품별 주문수량과 인사장 연계 여부를 작성합니다.",
  },
  인사장관리: {
    title: "인사장관리",
    description: "저장된 인사장 / 인사장만 의뢰 목록을 확인합니다.",
  },
  "내 주문 현황": {
    title: "내 주문 현황",
    description: "접수한 주문과 인사장 작업 상태를 확인합니다.",
  },
};

const STATUS_VARIANT: Record<string, ChipVariant> = {
  접수중: "blue",
  접수: "blue",
  접수완료: "blue",
  상품준비: "yellow",
  발송대기: "yellow",
  발송중: "purple",
  배송중: "purple",
  상품수령: "green",
  배송완료: "green",
  "관리자 확인중": "yellow",
  보완요청: "red",
  "공장 공유완료": "purple",
  제작중: "purple",
  "인사장 접수": "blue",
  제작대기: "yellow",
  시안확인: "purple",
  제작완료: "green",
  출고완료: "green",
  출력완료: "purple",
  취소: "red",
  취소됨: "red",
};

function useMinWidth(minWidth: number) {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia(`(min-width: ${minWidth}px)`);
    const update = () => setMatches(mediaQuery.matches);

    update();
    mediaQuery.addEventListener("change", update);
    return () => mediaQuery.removeEventListener("change", update);
  }, [minWidth]);

  return matches;
}

function StatusChip({ status }: { status: string }) {
  return <Chip variant={STATUS_VARIANT[status] ?? "blue"}>{status}</Chip>;
}


function OrderTypePicker({
  value,
  locked,
  onSelect,
  onReset,
}: {
  value: OrderType | null;
  locked: boolean;
  onSelect: (value: OrderType) => void;
  onReset: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {ORDER_TYPES.map((option) => {
        const selected = value === option.value;
        const disabled = locked && !selected;
        return (
          <button
            key={option.value}
            type="button"
            disabled={disabled}
            onClick={() => {
              if (!locked) {
                onSelect(option.value);
              }
            }}
            className={cn(
              "inline-flex min-h-10 min-w-[104px] items-center justify-center rounded-[7px] px-6 text-sm font-semibold transition-colors",
              selected
                ? "bg-[#1f2937] text-white"
                : disabled
                  ? "cursor-not-allowed border border-line bg-[#f1f5f9] text-[#94a3b8]"
                  : "border border-line bg-white text-ink hover:bg-soft",
            )}
          >
            {option.label}
          </button>
        );
      })}
      {locked ? (
        <Button type="button" variant="outline" size="sm" onClick={onReset}>
          폼초기화
        </Button>
      ) : null}
    </div>
  );
}

function ChoiceGrid<T extends string>({
  label,
  items,
  value,
  onChange,
  columns = items.length,
}: {
  label: string;
  items: readonly T[];
  value: T | "";
  onChange: (value: T) => void;
  columns?: number;
}) {
  return (
    <div className="mt-2.5">
      <label className="mb-1.5 block text-2xl font-bold text-ink">{label}</label>
      <div
        className="grid overflow-hidden rounded-[7px] border border-line"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {items.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => onChange(item)}
            className={cn(
              "border-r border-line px-1 py-2 text-center text-xs font-bold last:border-r-0",
              value === item ? "bg-[#e9f1ff] text-brand" : "bg-white text-ink hover:bg-soft",
            )}
          >
            {item}
          </button>
        ))}
      </div>
    </div>
  );
}

function Panel({
  title,
  children,
  className,
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("min-w-0 rounded-lg border border-line bg-panel p-3.5", className)}>
      {title ? <h4 className="mb-2.5 text-base font-semibold text-ink">{title}</h4> : null}
      {children}
    </section>
  );
}

function MemberNavList({
  activeMenu,
  onMenuChange,
}: {
  activeMenu: MemberNav;
  onMenuChange: (menu: MemberNav) => void;
}) {
  return (
    <nav className="space-y-1.5">
      {MEMBER_NAV.map((item) => (
        <button
          key={item}
          type="button"
          onClick={() => onMenuChange(item)}
          className={cn(
            "block w-full rounded-[7px] px-2.5 py-2.5 text-left text-[13px] transition-colors",
            activeMenu === item
              ? "bg-[#334155] font-bold text-white"
              : "text-[#cbd5e1] hover:bg-[#2b3648]",
          )}
        >
          {item}
        </button>
      ))}
    </nav>
  );
}

function MemberSidebar({
  activeMenu,
  onMenuChange,
  churchName,
  memberName,
}: {
  activeMenu: MemberNav;
  onMenuChange: (menu: MemberNav) => void;
  churchName?: string;
  memberName?: string;
}) {
  return (
    <aside className="hidden bg-[#1f2937] px-3.5 py-4 text-[#e5edf7] min-[1040px]:flex min-[1040px]:flex-col">
      <strong className="block text-base">개인회원</strong>
      {churchName || memberName ? (
        <p className="mt-1 mb-4 text-[12px] leading-5 text-[#94a3b8]">
          {[churchName, memberName ? `${memberName}님` : ""]
            .filter(Boolean)
            .join(", ")}
        </p>
      ) : (
        <div className="mb-4" />
      )}
      <div className="flex-1">
        <MemberNavList activeMenu={activeMenu} onMenuChange={onMenuChange} />
      </div>
      <LogoutButton className="mt-4 w-full rounded-[7px] px-2.5 py-2 text-left text-[13px] text-[#cbd5e1] hover:bg-[#2b3648]" />
    </aside>
  );
}

function MobileMemberHeader({
  activeMenu,
  isOpen,
  onToggle,
  onMenuChange,
  churchName,
  memberName,
}: {
  activeMenu: MemberNav;
  isOpen: boolean;
  onToggle: () => void;
  onMenuChange: (menu: MemberNav) => void;
  churchName?: string;
  memberName?: string;
}) {
  const profileLine = [churchName, memberName ? `${memberName}님` : ""]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="relative mb-3.5 min-[1040px]:hidden">
      <div className="flex items-center justify-between rounded-lg bg-[#1f2937] px-4 py-3 text-[#e5edf7]">
        <div className="min-w-0">
          <strong className="block text-base">개인회원</strong>
          {profileLine ? (
            <p className="mt-0.5 truncate text-[12px] text-[#94a3b8]">
              {profileLine}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          aria-label={isOpen ? "메뉴 닫기" : "메뉴 열기"}
          aria-expanded={isOpen}
          onClick={onToggle}
          className="rounded-[7px] p-2 text-[#e5edf7] transition-colors hover:bg-[#334155]"
        >
          {isOpen ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>

      {isOpen ? (
        <>
          <button
            type="button"
            aria-label="메뉴 닫기"
            className="fixed inset-0 z-40 bg-black/40"
            onClick={onToggle}
          />
          <div className="absolute top-full right-0 left-0 z-50 mt-2 rounded-lg border border-[#334155] bg-[#1f2937] p-3.5 shadow-lg">
            <MemberNavList
              activeMenu={activeMenu}
              onMenuChange={(menu) => {
                onMenuChange(menu);
                onToggle();
              }}
            />
            <LogoutButton className="mt-3 w-full rounded-[7px] px-2.5 py-2.5 text-left text-[13px] text-[#cbd5e1] hover:bg-[#2b3648]" />
          </div>
        </>
      ) : null}
    </div>
  );
}

type GreetingDraft = {
  id?: number;
  greetingNumber: (typeof GREETING_NUMBERS)[number];
  includeSelf: boolean;
  businessCard: string;
  greetingSize: (typeof GREETING_SIZES)[number];
  greetingContent: string;
  quantity: string;
  productName: string;
  receivePlace: string;
  specialNote: string;
  imageNumbers: Array<(typeof GREETING_NUMBERS)[number]>;
  /** Saved image URL for the selected 인사장번호 (local blob or server URL). */
  imageUrl?: string;
};

const GREETING_RECEIVE_PLACE_PLACEHOLDER = "선택하세요";
const BUSINESS_CARD_DEFAULT = "선택하세요";
const BUSINESS_CARD_INCLUDED = "동봉";
const BUSINESS_CARD_EXCLUDED = "미동봉";

function formatGreetingDraftNotes(draft: GreetingDraft) {
  return [
    `인사장번호:${draft.greetingNumber}`,
    draft.includeSelf ? "인사장자체:Y" : null,
    draft.businessCard === BUSINESS_CARD_INCLUDED ? "명함동봉:Y" : null,
    `인사장크기:${draft.greetingSize}`,
    draft.greetingContent.trim()
      ? `인사장내용:${draft.greetingContent.trim()}`
      : null,
    draft.quantity.trim() ? `인사장수량:${draft.quantity.trim()}` : null,
    draft.productName.trim()
      ? `인사장제품:${draft.productName.trim()}`
      : null,
    `인사장받을곳:${draft.receivePlace}`,
    draft.specialNote.trim()
      ? `인사장특이사항:${draft.specialNote.trim()}`
      : null,
    draft.imageNumbers.length > 0
      ? `인사장이미지:${draft.imageNumbers.join(",")}`
      : null,
  ]
    .filter(Boolean)
    .join(" / ");
}

function greetingDraftFromApi(form: {
  id: number;
  greetingNumber: string;
  includeSelf: boolean;
  businessCard?: string | null;
  specialNote?: string | null;
  imageUrl?: string | null;
  content?: string | null;
  quantity?: number | null;
  size?: string | null;
  productName?: string | null;
  receivePlace?: string | null;
}): GreetingDraft | null {
  const greetingNumber = GREETING_NUMBERS.find(
    (value) => value === String(form.greetingNumber).trim(),
  );
  const greetingSize = GREETING_SIZES.find(
    (value) => value === String(form.size ?? "").trim(),
  );
  if (!greetingNumber || !greetingSize) {
    return null;
  }

  const businessCard =
    form.businessCard === BUSINESS_CARD_INCLUDED ||
    form.businessCard === BUSINESS_CARD_EXCLUDED
      ? form.businessCard
      : BUSINESS_CARD_DEFAULT;

  return {
    id: form.id,
    greetingNumber,
    includeSelf: Boolean(form.includeSelf),
    businessCard,
    greetingSize,
    greetingContent: form.content?.trim() ?? "",
    quantity: form.quantity != null ? String(form.quantity) : "",
    productName: form.productName?.trim() ?? "",
    receivePlace: form.receivePlace?.trim() || GREETING_RECEIVE_PLACE_PLACEHOLDER,
    specialNote: form.specialNote?.trim() ?? "",
    imageNumbers: [greetingNumber],
    imageUrl: form.imageUrl?.trim() || undefined,
  };
}

function validateGreetingForm({
  greetingContent,
  quantity,
  greetingSize,
  receivePlace,
  businessCard,
}: {
  greetingContent: string;
  quantity: string;
  greetingSize: string;
  receivePlace: string;
  businessCard: string;
}) {
  if (
    !businessCard ||
    businessCard === BUSINESS_CARD_DEFAULT ||
    (businessCard !== BUSINESS_CARD_INCLUDED &&
      businessCard !== BUSINESS_CARD_EXCLUDED)
  ) {
    return "명함 동봉 여부를 선택해 주세요.";
  }
  if (!greetingContent.trim()) {
    return "인사장내용을 입력해 주세요.";
  }
  if (!quantity.trim()) {
    return "수량을 입력해 주세요.";
  }
  if (!greetingSize) {
    return "크기를 선택해 주세요.";
  }
  if (!receivePlace.trim() || receivePlace === GREETING_RECEIVE_PLACE_PLACEHOLDER) {
    return "받을 곳을 선택해 주세요.";
  }
  return "";
}

function GreetingForm({
  linkedProductNames = [],
  customerInfo,
  initialDraft = null,
  onBackToOrder,
  onDirtyChange,
  onSave,
}: {
  linkedProductNames?: string[];
  customerInfo?: {
    ordererName: string;
    phone: string;
    churchName: string;
    senderName?: string;
    productSummary?: string;
    productLines?: Array<{ product: string; qty: number }>;
  };
  /** Previously saved greeting — used when opening 인사장보기. */
  initialDraft?: GreetingDraft | null;
  onBackToOrder: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  onSave: (draft: GreetingDraft) => void;
}) {
  const isLinkedOrder = true; // product-order-linked greeting only on 주문 작성
  const [greetingNumber, setGreetingNumber] = useState<
    (typeof GREETING_NUMBERS)[number]
  >(initialDraft?.greetingNumber ?? "1");
  const [includeSelfGreeting, setIncludeSelfGreeting] = useState(
    initialDraft?.includeSelf ?? false,
  );
  const [businessCard, setBusinessCard] = useState(
    initialDraft?.businessCard === BUSINESS_CARD_INCLUDED
      ? BUSINESS_CARD_INCLUDED
      : BUSINESS_CARD_EXCLUDED,
  );
  const [greetingSize, setGreetingSize] = useState<
    (typeof GREETING_SIZES)[number] | ""
  >(initialDraft?.greetingSize ?? "");
  const [greetingContent, setGreetingContent] = useState(
    initialDraft?.greetingContent ?? "",
  );
  const [quantity, setQuantity] = useState(initialDraft?.quantity ?? "");
  const [productName, setProductName] = useState(
    initialDraft?.productName ?? "",
  );
  const [receivePlace, setReceivePlace] = useState(
    initialDraft?.receivePlace ?? "",
  );
  const [specialNote, setSpecialNote] = useState(
    initialDraft?.specialNote ?? "",
  );
  const [savedImageUrl, setSavedImageUrl] = useState<string | undefined>(
    initialDraft?.imageUrl,
  );
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [resultDialog, setResultDialog] = useState<{
    open: boolean;
    success: boolean;
  }>({ open: false, success: false });
  const [savedGreetingId, setSavedGreetingId] = useState<number | undefined>(
    initialDraft?.id,
  );

  const markDirty = () => {
    onDirtyChange?.(true);
  };

  const productLines = useMemo(() => {
    if (customerInfo?.productLines && customerInfo.productLines.length > 0) {
      return customerInfo.productLines;
    }
    return linkedProductNames
      .map((name) => name.trim())
      .filter(Boolean)
      .map((product) => ({ product, qty: 1 }));
  }, [customerInfo?.productLines, linkedProductNames]);

  const productOptions = useMemo(() => {
    const unique = Array.from(
      new Set(productLines.map((item) => item.product.trim()).filter(Boolean)),
    );
    return unique.map((name) => ({ value: name, label: name }));
  }, [productLines]);

  useEffect(() => {
    if (!isLinkedOrder) {
      setProductName("");
      return;
    }
    if (productOptions.length === 0) {
      setProductName("");
      return;
    }
    setProductName((current) =>
      productOptions.some((option) => option.value === current)
        ? current
        : productOptions[0].value,
    );
  }, [isLinkedOrder, productOptions]);

  useEffect(() => {
    if (!initialDraft?.id) {
      return;
    }

    let cancelled = false;

    const loadSaved = async () => {
      try {
        const response = await apiFetch(
          `/api/greeting-forms/${initialDraft.id}`,
        );
        if (!response.ok || cancelled) {
          return;
        }
        const data = (await response.json()) as {
          id: number;
          greetingNumber: string;
          includeSelf: boolean;
          businessCard?: string | null;
          imageUrl: string;
          content: string;
          quantity: number;
          size: string;
          productName?: string | null;
          receivePlace: string;
          specialNote?: string | null;
        };

        const number = (GREETING_NUMBERS.includes(
          data.greetingNumber as (typeof GREETING_NUMBERS)[number],
        )
          ? data.greetingNumber
          : "1") as (typeof GREETING_NUMBERS)[number];

        setSavedGreetingId(data.id);
        setGreetingNumber(number);
        setIncludeSelfGreeting(Boolean(data.includeSelf));
        setBusinessCard(
          data.businessCard === BUSINESS_CARD_INCLUDED
            ? BUSINESS_CARD_INCLUDED
            : BUSINESS_CARD_EXCLUDED,
        );
        setGreetingSize(
          (GREETING_SIZES.includes(data.size as (typeof GREETING_SIZES)[number])
            ? data.size
            : "") as (typeof GREETING_SIZES)[number] | "",
        );
        setGreetingContent(data.content ?? "");
        setQuantity(String(data.quantity ?? ""));
        setProductName(data.productName?.trim() || "");
        setReceivePlace(data.receivePlace ?? "");
        setSpecialNote(data.specialNote?.trim() || "");
        if (data.imageUrl) {
          setSavedImageUrl(data.imageUrl);
        }
      } catch {
        // Keep initialDraft hydration if fetch fails.
      }
    };

    void loadSaved();
    return () => {
      cancelled = true;
    };
  }, [initialDraft?.id]);

  const catalogImageUrl = GREETING_PREVIEW_IMAGE[greetingNumber];

  const buildDraft = (id?: number, imageUrl?: string): GreetingDraft => ({
    id,
    greetingNumber,
    includeSelf: includeSelfGreeting,
    businessCard,
    greetingSize: greetingSize as (typeof GREETING_SIZES)[number],
    greetingContent,
    quantity,
    productName,
    receivePlace,
    specialNote,
    imageNumbers: [greetingNumber],
    imageUrl: imageUrl || savedImageUrl || catalogImageUrl || initialDraft?.imageUrl,
  });

  const runRequiredValidation = () => {
    const error = validateGreetingForm({
      greetingContent,
      quantity,
      greetingSize,
      receivePlace,
      businessCard,
    });
    setFormError(error);
    return error;
  };

  const postGreetingForm = async (submitted: boolean) => {
    const auth = getAuthUser();
    const formData = new FormData();
    formData.append("greetingNumber", greetingNumber);
    formData.append("includeSelf", String(includeSelfGreeting));
    formData.append("businessCard", businessCard);
    formData.append("content", greetingContent.trim());
    formData.append("quantity", quantity.trim());
    formData.append("size", greetingSize);
    formData.append("receivePlace", receivePlace.trim());
    formData.append("linkedToOrder", String(isLinkedOrder));
    formData.append("submitted", String(submitted));
    if (specialNote.trim()) {
      formData.append("specialNote", specialNote.trim());
    }
    if (isLinkedOrder && productName.trim()) {
      formData.append("productName", productName.trim());
    }
    if (customerInfo?.ordererName.trim()) {
      formData.append("ordererName", customerInfo.ordererName.trim());
    }
    if (customerInfo?.churchName.trim()) {
      formData.append("churchName", customerInfo.churchName.trim());
    }
    if (customerInfo?.phone.trim()) {
      formData.append("phone", customerInfo.phone.trim());
    }
    if (auth?.id) {
      formData.append("userId", String(auth.id));
    }

    const response = await apiFetch("/api/greeting-forms", {
      method: "POST",
      body: formData,
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as {
        message?: string | string[];
      } | null;
      const message = Array.isArray(payload?.message)
        ? payload.message.join(", ")
        : payload?.message;
      throw new Error(message || "인사장 저장에 실패하였습니다.");
    }
    return (await response.json()) as { id: number; imageUrl?: string };
  };

  const handleSave = async () => {
    if (isSaving || runRequiredValidation()) {
      return;
    }
    if (isLinkedOrder && !productName.trim()) {
      setFormError("제품명을 선택해 주세요.");
      return;
    }

    setIsSaving(true);
    try {
      if (savedGreetingId && savedImageUrl) {
        onDirtyChange?.(false);
        setFormError("");
        setResultDialog({ open: true, success: true });
        onSave(buildDraft(savedGreetingId, savedImageUrl));
        return;
      }

      const created = await postGreetingForm(false);
      setSavedGreetingId(created.id);
      if (created.imageUrl) {
        setSavedImageUrl(created.imageUrl);
      }
      onDirtyChange?.(false);
      setFormError("");
      setResultDialog({ open: true, success: true });
      onSave(buildDraft(created.id, created.imageUrl));
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "인사장 저장에 실패하였습니다.",
      );
      setResultDialog({ open: true, success: false });
    } finally {
      setIsSaving(false);
    }
  };


  const closeResultDialog = () => {
    const wasSuccess = resultDialog.success;
    setResultDialog((current) => ({ ...current, open: false }));
    if (wasSuccess) {
      onBackToOrder();
    }
  };

  return (
    <>
      <div className="mb-2.5">
        <button
          type="button"
          onClick={onBackToOrder}
          className="text-sm font-semibold text-brand underline-offset-2 hover:underline"
        >
          주문서 작성으로 돌아가기
        </button>
      </div>

      <div className="mb-2.5 space-y-2.5">
        <div>
          <p className="mb-1.5 block text-2xl font-bold text-ink">
            보내는 사람 (택배기표지)
          </p>
          <input
            type="text"
            readOnly
            value={
              customerInfo?.senderName?.trim() ||
              customerInfo?.ordererName?.trim() ||
              ""
            }
            placeholder="주문서의 보내는 사람 가져오기 (확인용)"
            className="min-h-9 w-full rounded-[7px] border border-[#cbd5e1] bg-[#f8fafc] px-2.5 py-2 text-lg text-ink placeholder:text-muted"
          />
        </div>
        <div>
          <p className="mb-1.5 block text-2xl font-bold text-ink">
            제품명 / 수량
          </p>
          <p className="mb-1.5 text-sm font-semibold leading-relaxed text-[#dc2626]">
            기쁨1호, 특선1호는 세로형으로 제작됩니다. 해당 제품이면 제품명을 꼭
            적어주세요.
          </p>
          {productLines.length > 0 ? (
            <div className="space-y-2">
              {productLines.map((item, index) => (
                <input
                  key={`${item.product}-${index}`}
                  type="text"
                  readOnly
                  value={`${item.product} ${item.qty}개`}
                  className="min-h-9 w-full rounded-[7px] border border-[#cbd5e1] bg-[#f8fafc] px-2.5 py-2 text-lg text-ink"
                />
              ))}
            </div>
          ) : (
            <input
              type="text"
              readOnly
              value=""
              placeholder="주문서의 제품명 수량 가져오기 (확인용)"
              className="min-h-9 w-full rounded-[7px] border border-[#cbd5e1] bg-[#f8fafc] px-2.5 py-2 text-lg text-ink placeholder:text-muted"
            />
          )}
        </div>
      </div>

      <GreetingNumberChipPicker
        value={greetingNumber}
        onChange={(value) => {
          setGreetingNumber(value);
          markDirty();
        }}
        includeSelf={includeSelfGreeting}
        onIncludeSelfChange={(value) => {
          setIncludeSelfGreeting(value);
          markDirty();
        }}
        businessCardIncluded={businessCard === BUSINESS_CARD_INCLUDED}
        onBusinessCardIncludedChange={(included) => {
          setBusinessCard(
            included ? BUSINESS_CARD_INCLUDED : BUSINESS_CARD_EXCLUDED,
          );
          markDirty();
        }}
      />

      <div className="mt-2.5 grid grid-cols-1 gap-2.5 min-[900px]:grid-cols-2">
        <Input
          label="인사장내용 *"
          value={greetingContent}
          onChange={(event) => {
            setGreetingContent(event.target.value);
            markDirty();
          }}
          placeholder="인사장 문구"
          required
        />
        <Input
          label="수량 *"
          type="number"
          min={1}
          value={quantity}
          onChange={(event) => {
            setQuantity(event.target.value);
            markDirty();
          }}
          placeholder="수량"
          required
        />
      </div>

      <ChoiceGrid
        label="크기 *"
        items={GREETING_SIZES}
        value={greetingSize}
        onChange={(value) => {
          setGreetingSize(value);
          markDirty();
        }}
        columns={4}
      />

      <div
        className={cn(
          "mt-2.5 grid grid-cols-1 gap-2.5",
          isLinkedOrder ? "min-[900px]:grid-cols-2" : undefined,
        )}
      >
        {isLinkedOrder ? (
          <div>
            <p className="mb-1.5 block text-2xl font-bold text-ink">제품명</p>
            <Dropdown
              value={productName}
              options={
                productOptions.length > 0
                  ? productOptions
                  : [{ value: "", label: "주문서 상품 목록이 비어 있습니다" }]
              }
              onChange={(value) => {
                setProductName(value);
                markDirty();
              }}
              disabled={productOptions.length === 0}
            />
            {productOptions.length === 0 ? (
              <p className="mt-1 text-xs text-[#64748b]">
                주문서 작성에서 상품을 추가한 뒤{" "}
                <button
                  type="button"
                  onClick={onBackToOrder}
                  className="font-semibold text-brand underline-offset-2 hover:underline"
                >
                  주문서 작성으로 돌아가기
                </button>
              </p>
            ) : (
              <p className="mt-1 text-xs text-[#64748b]">
                상품을 추가·변경하려면{" "}
                <button
                  type="button"
                  onClick={onBackToOrder}
                  className="font-semibold text-brand underline-offset-2 hover:underline"
                >
                  주문서 작성으로 돌아가기
                </button>
              </p>
            )}
          </div>
        ) : null}
        <Dropdown
          label="받을 곳 *"
          value={receivePlace}
          options={[
            { value: "", label: GREETING_RECEIVE_PLACE_PLACEHOLDER },
            ...GREETING_RECEIVE_PLACES.map((place) => ({
              value: place,
              label: place,
            })),
          ]}
          onChange={(value) => {
            setReceivePlace(value);
            markDirty();
          }}
          required
        />
      </div>

      <div className="mt-2.5">
        <label htmlFor="special-note" className="mb-1.5 block text-2xl font-bold text-ink">
          특이사항
        </label>
        <textarea
          id="special-note"
          value={specialNote}
          onChange={(event) => {
            setSpecialNote(event.target.value);
            markDirty();
          }}
          placeholder="특이사항을 입력해 주세요"
          className="min-h-[74px] w-full resize-none rounded-[7px] border border-[#cbd5e1] bg-white px-2.5 py-2 text-lg text-ink placeholder:text-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
        />
      </div>

      {formError ? (
        <p className="mt-2.5 rounded-[7px] border border-red/30 bg-[#fff0ed] px-3 py-2 text-sm text-red">
          {formError}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          className="border-brand bg-brand text-white hover:bg-[#1856bf]"
          disabled={isSaving}
          onClick={() => {
            void handleSave();
          }}
        >
          {isSaving ? "저장 중..." : "인사장 저장"}
        </Button>
      </div>

      <Dialog
        open={resultDialog.open}
        title={resultDialog.success ? "인사장 저장 완료" : "저장 실패"}
        onClose={closeResultDialog}
      >
        <p className="text-sm leading-6 text-ink">
          {resultDialog.success
            ? "인사장이 저장되었습니다."
            : formError || "처리에 실패하였습니다."}
        </p>
        <div className="mt-5 flex justify-end">
          <Button
            type="button"
            className={
              resultDialog.success
                ? "border-green bg-green text-white hover:bg-[#128a52]"
                : "border-[#1f2937] bg-[#1f2937] text-white hover:bg-[#111827]"
            }
            onClick={closeResultDialog}
          >
            확인
          </Button>
        </div>
      </Dialog>
    </>
  );
}

function formatPrice(value: number) {
  return `${value.toLocaleString("ko-KR")}원`;
}

const DEFAULT_PRODUCT_IMAGE = "/assets/images/No_img.jpg";

type StockCatalogItem = {
  id: number;
  code: string;
  imageUrl: string | null;
  productName: string;
  spec: string | null;
  unit: number;
  stock?: number | null;
  stockMax?: number | null;
  wholesalePrice: number;
  category: string;
};

function productImageSrc(imageUrl: string | null | undefined) {
  const trimmed = imageUrl?.trim();
  return trimmed ? trimmed : DEFAULT_PRODUCT_IMAGE;
}

function ProductAddDialog({
  open,
  onClose,
  onAddItems,
  defaultOrderKind,
  openStockOnly = false,
}: {
  open: boolean;
  onClose: () => void;
  onAddItems: (
    items: Array<{
      product: string;
      qty: number;
      note: string;
      unitPrice: number;
      deliveryOnly: boolean;
    }>,
  ) => void;
  defaultOrderKind: OrderType;
  /** 개인회원 제품주문서: openStock=true 상품만 */
  openStockOnly?: boolean;
}) {
  const [catalog, setCatalog] = useState<StockCatalogItem[]>([]);
  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const [keyword, setKeyword] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    if (!open) {
      return;
    }

    let cancelled = false;

    const loadCatalog = async () => {
      setIsLoading(true);
      setLoadError("");

      try {
        const response = await apiFetch(
          `/api/stock-inventory${openStockOnly ? "?openOnly=true" : ""}`,
        );
        const data = (await response.json()) as
          | StockCatalogItem[]
          | { message?: string };

        if (!response.ok || !Array.isArray(data) || cancelled) {
          if (!cancelled) {
            setLoadError(
              !Array.isArray(data) && data.message
                ? data.message
                : "상품 목록을 불러오지 못했습니다.",
            );
            setCatalog([]);
          }
          return;
        }

        setCatalog(data);
        setQuantities({});
      } catch {
        if (!cancelled) {
          setLoadError("상품 목록을 불러오지 못했습니다.");
          setCatalog([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadCatalog();

    return () => {
      cancelled = true;
    };
  }, [open, openStockOnly]);

  const filteredCatalog = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();

    return catalog.filter((item) => {
      if (categoryFilter !== "all" && item.category !== categoryFilter) {
        return false;
      }
      // 택배 주문에서는 배달 전용(선물세트 박스) 상품 제외
      if (
        defaultOrderKind === "parcel" &&
        isDeliveryOnlyProduct(item.category, item.productName)
      ) {
        return false;
      }
      if (!normalizedKeyword) {
        return true;
      }
      return (
        item.productName.toLowerCase().includes(normalizedKeyword) ||
        item.code.toLowerCase().includes(normalizedKeyword) ||
        (item.spec ?? "").toLowerCase().includes(normalizedKeyword)
      );
    });
  }, [catalog, keyword, categoryFilter, defaultOrderKind]);

  const selectedItems = useMemo(() => {
    return catalog
      .filter((item) => (quantities[item.id] ?? 0) > 0)
      .map((item) => ({
        product: item.productName,
        qty: quantities[item.id] ?? 0,
        note: "",
        unitPrice: item.wholesalePrice,
        deliveryOnly: isDeliveryOnlyProduct(item.category, item.productName),
      }));
  }, [catalog, quantities]);

  const selectedQtyTotal = selectedItems.reduce((sum, item) => sum + item.qty, 0);
  const selectedPriceTotal = selectedItems.reduce(
    (sum, item) => sum + item.qty * item.unitPrice,
    0,
  );

  const setQty = (id: number, next: number) => {
    setQuantities((current) => ({
      ...current,
      [id]: Math.max(0, next),
    }));
  };

  const handleAdd = () => {
    if (selectedItems.length === 0) {
      return;
    }
    onAddItems(selectedItems);
    setQuantities({});
    onClose();
  };

  return (
    <Dialog
      open={open}
      title="상품 추가"
      onClose={onClose}
      className="max-w-lg"
    >
      <div className="space-y-3">
        <p className="text-sm text-[#64748b]">
          주문종류:{" "}
          <span className="font-semibold text-ink">
            {orderKindLabel(defaultOrderKind)}
          </span>{" "}
          (현재 배달/택배 탭 기준)
        </p>

        <div className="grid gap-2 min-[480px]:grid-cols-[140px_1fr]">
          <select
            aria-label="구분 필터"
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value)}
            className="min-h-9 w-full rounded-[7px] border border-[#cbd5e1] bg-white px-2.5 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
          >
            <option value="all">전체</option>
            <option value="선물세트">선물세트</option>
            <option value="일반품">일반품</option>
          </select>
          <input
            type="search"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="품명 / 코드 / 규격 검색"
            className="min-h-9 w-full rounded-[7px] border border-[#cbd5e1] bg-white px-2.5 py-2 text-sm text-ink placeholder:text-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
          />
        </div>

        {isLoading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            상품 목록을 불러오는 중...
          </p>
        ) : loadError ? (
          <p className="rounded-[7px] border border-red/30 bg-[#fff0ed] px-3 py-2 text-sm text-red">
            {loadError}
          </p>
        ) : filteredCatalog.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            검색 결과가 없습니다.
          </p>
        ) : (
          <div className="max-h-[50vh] divide-y divide-[#e5eaf0] overflow-y-auto rounded-lg border border-line">
            {filteredCatalog.map((item) => {
              const qty = quantities[item.id] ?? 0;
              return (
                <div
                  key={item.id}
                  className="flex items-center gap-3 px-3 py-2.5"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={productImageSrc(item.imageUrl)}
                    alt={item.productName}
                    className="h-14 w-14 shrink-0 rounded border border-line bg-white object-contain"
                  />
                  <div className="min-w-0 flex-1">
                    <ProductNameWithStock
                      name={item.productName}
                      stock={item.stock}
                      stockMax={item.stockMax}
                    />
                    <p className="mt-0.5 text-xs text-[#64748b]">
                      {item.spec || "규격 없음"}
                    </p>
                    <p className="mt-0.5 text-xs text-[#64748b]">
                      {item.unit} · {item.category} ·{" "}
                      {formatPrice(item.wholesalePrice)}
                    </p>
                  </div>
                  <input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    aria-label={`${item.productName} 수량`}
                    placeholder="0"
                    value={qty === 0 ? "" : qty}
                    onChange={(event) => {
                      const raw = event.target.value;
                      if (raw === "") {
                        setQty(item.id, 0);
                        return;
                      }
                      const nextQty = Number(raw);
                      if (!Number.isNaN(nextQty)) {
                        setQty(item.id, nextQty);
                      }
                    }}
                    className="h-9 w-20 shrink-0 rounded-md border border-[#cbd5e1] bg-white px-2 text-center text-sm font-semibold text-ink placeholder:text-[#94a3b8] focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  />
                </div>
              );
            })}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-[#64748b]">
          <span>
            선택 {selectedItems.length}종 · 수량 {selectedQtyTotal}개
          </span>
          <span className="font-semibold text-ink">
            합계 {formatPrice(selectedPriceTotal)}
          </span>
        </div>

        <Button
          type="button"
          className="h-11 w-full rounded-full border-brand bg-brand text-white hover:bg-[#1856bf]"
          disabled={selectedItems.length === 0}
          onClick={handleAdd}
        >
          <Plus className="size-4" />
          상품 추가
        </Button>
      </div>
    </Dialog>
  );
}

function ChurchSearchField({
  churches,
  isLoading,
  loadError = "",
  onRetryLoad,
  query,
  selectedId,
  onQueryChange,
  onSelect,
  readOnly = false,
}: {
  churches: ChurchOption[];
  isLoading: boolean;
  loadError?: string;
  onRetryLoad?: () => void;
  query: string;
  selectedId: number | null;
  onQueryChange: (value: string) => void;
  onSelect: (church: ChurchOption) => void;
  readOnly?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) {
      return churches.slice(0, 40);
    }

    // 숫자만 입력 시 branchCode 정확 일치 우선 (예: "5" → 서울5, 부산5)
    if (/^\d+$/.test(keyword)) {
      const exactBranch = churches.filter(
        (church) => (church.branchCode ?? "").toLowerCase() === keyword,
      );
      if (exactBranch.length > 0) {
        return exactBranch.slice(0, 30);
      }
    }

    return churches
      .filter((church) => {
        const haystack = [
          church.name,
          church.region,
          church.branchCode ?? "",
          church.assigner,
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(keyword);
      })
      .slice(0, 30);
  }, [churches, query]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  return (
    <div ref={containerRef} className="relative w-full">
      <label htmlFor="order-church" className="mb-1.5 block text-2xl font-bold text-ink">
        중앙 *
      </label>
      <input
        id="order-church"
        type="text"
        role="combobox"
        aria-expanded={isOpen}
        aria-controls="order-church-suggestions"
        aria-autocomplete="list"
        value={query}
        readOnly={readOnly}
        onChange={(event) => {
          if (readOnly) {
            return;
          }
          onQueryChange(event.target.value);
          setIsOpen(true);
        }}
        onFocus={() => {
          if (readOnly) {
            return;
          }
          setIsOpen(true);
          if (!isLoading && churches.length === 0) {
            onRetryLoad?.();
          }
        }}
        placeholder="예: 5, 서울, 원주"
        autoComplete="off"
        required
        className={cn(
          "min-h-9 w-full rounded-[7px] border border-[#cbd5e1] px-2.5 py-2 text-lg text-ink",
          "placeholder:text-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20",
          readOnly ? "cursor-default bg-[#f8fafc]" : "bg-white",
        )}
      />
      {isOpen && !readOnly ? (
        <ul
          id="order-church-suggestions"
          role="listbox"
          className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-[7px] border border-line bg-white shadow-lg"
        >
          {isLoading ? (
            <li className="px-3 py-2.5 text-sm text-[#64748b]">중앙 목록 불러오는 중...</li>
          ) : loadError || churches.length === 0 ? (
            <li className="px-3 py-2.5 text-sm text-[#64748b]">
              <p>{loadError || "중앙 목록을 불러오지 못했습니다."}</p>
              {onRetryLoad ? (
                <button
                  type="button"
                  className="mt-1 font-semibold text-brand underline-offset-2 hover:underline"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => onRetryLoad()}
                >
                  다시 불러오기
                </button>
              ) : null}
            </li>
          ) : filtered.length === 0 ? (
            <li className="px-3 py-2.5 text-sm text-[#64748b]">검색 결과가 없습니다.</li>
          ) : (
            filtered.map((church) => {
              const selected = selectedId === church.id;
              return (
                <li key={church.id} role="option" aria-selected={selected}>
                  <button
                    type="button"
                    className={cn(
                      "flex w-full flex-col items-start gap-0.5 px-3 py-2.5 text-left hover:bg-[#eff6ff]",
                      selected ? "bg-[#eff6ff]" : "bg-white",
                    )}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      onSelect(church);
                      setIsOpen(false);
                    }}
                  >
                    <span className="text-sm font-semibold text-ink">{church.name}</span>
                    <span className="text-xs text-[#64748b]">
                      {church.region}
                      {church.branchCode ? ` · ${church.branchCode}` : ""}
                      {church.assigner ? ` · ${church.assigner}` : ""}
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      ) : null}
      {selectedId ? (
        <p className="mt-1 text-xs text-green">중앙이 선택되었습니다.</p>
      ) : readOnly ? null : (
        <p className="mt-1 text-xs text-[#64748b]">
          키워드를 입력해 중앙을 검색한 뒤 목록에서 선택해 주세요.
        </p>
      )}
    </div>
  );
}

function RequiredLabel({ children }: { children: ReactNode }) {
  return (
    <span>
      {children}
      <span className="ml-0.5 text-red" aria-hidden>
        *
      </span>
    </span>
  );
}

function AddressField({
  id,
  label,
  value,
  onChange,
  detailValue,
  onDetailChange,
  required = true,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  detailValue: string;
  onDetailChange: (value: string) => void;
  required?: boolean;
}) {
  const [isSearching, setIsSearching] = useState(false);
  const detailId = `${id}-detail`;

  const handleSearch = async () => {
    setIsSearching(true);
    try {
      await openDaumPostcode((address) => {
        onChange(address);
        onDetailChange("");
      });
    } catch {
      window.alert("주소 검색을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="space-y-2">
      <div>
        <label htmlFor={id} className="mb-1.5 block text-2xl font-bold text-ink">
          {required ? <RequiredLabel>{label}</RequiredLabel> : label}
        </label>
        <div className="flex gap-2">
          <input
            id={id}
            type="text"
            required={required}
            readOnly
            value={value}
            placeholder="주소 검색 버튼으로 입력해 주세요"
            className="min-h-9 w-full cursor-default rounded-[7px] border border-[#cbd5e1] bg-[#f8fafc] px-2.5 py-2 text-lg text-ink placeholder:text-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
          />
          <Button
            type="button"
            className="shrink-0 border-[#1f2937] bg-[#1f2937] px-4 text-white hover:bg-[#111827]"
            disabled={isSearching}
            onClick={() => {
              void handleSearch();
            }}
          >
            {isSearching ? "검색 중" : "주소 검색"}
          </Button>
        </div>
      </div>
      <Input
        id={detailId}
        label="상세주소"
        value={detailValue}
        onChange={(event) => onDetailChange(event.target.value)}
        placeholder="동·호수 / 호실 (예: 101동 1203호)"
        disabled={!value.trim()}
      />
    </div>
  );
}

function resolveGreetingImageUrl(url: string) {
  if (!url) {
    return "";
  }
  if (
    url.startsWith("http://") ||
    url.startsWith("https://") ||
    url.startsWith("blob:") ||
    url.startsWith("/")
  ) {
    return url;
  }
  return `${API_BASE_URL}${url.startsWith("/") ? url : `/${url}`}`;
}

function GreetingViewField({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <dt className="text-xs font-semibold text-[#64748b]">{label}</dt>
      <dd className="mt-0.5 whitespace-pre-wrap break-all text-sm text-ink">
        {value.trim() ? value : "-"}
      </dd>
    </div>
  );
}

function GreetingViewModal({
  open,
  greetingId,
  draft,
  onClose,
}: {
  open: boolean;
  greetingId?: number;
  draft?: GreetingDraft | null;
  onClose: () => void;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [view, setView] = useState<{
    greetingNumber: string;
    includeSelf: boolean;
    businessCard: string;
    imageUrl: string;
    content: string;
    quantity: string;
    size: string;
    productName: string;
    receivePlace: string;
    specialNote: string;
  } | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    let cancelled = false;

    const hydrateFromDraft = () => {
      if (!draft) {
        return null;
      }
      return {
        greetingNumber: draft.greetingNumber,
        includeSelf: draft.includeSelf,
        businessCard: draft.businessCard || BUSINESS_CARD_DEFAULT,
        imageUrl: draft.imageUrl ?? "",
        content: draft.greetingContent,
        quantity: draft.quantity,
        size: draft.greetingSize,
        productName: draft.productName,
        receivePlace: draft.receivePlace,
        specialNote: draft.specialNote,
      };
    };

    const load = async () => {
      setIsLoading(true);
      setError("");
      setView(hydrateFromDraft());

      if (!greetingId) {
        setIsLoading(false);
        if (!draft) {
          setError("저장된 인사장 정보를 찾을 수 없습니다.");
        }
        return;
      }

      try {
        const response = await apiFetch(`/api/greeting-forms/${greetingId}`);
        const data = (await response.json()) as
          | {
              greetingNumber: string;
              includeSelf: boolean;
              businessCard?: string | null;
              imageUrl: string;
              content: string;
              quantity: number;
              size: string;
              productName?: string | null;
              receivePlace: string;
              specialNote?: string | null;
            }
          | { message?: string };

        if (!response.ok || !("content" in data)) {
          throw new Error(
            "message" in data && data.message
              ? String(data.message)
              : "인사장 정보를 불러오지 못했습니다.",
          );
        }
        if (cancelled) {
          return;
        }
        setView({
          greetingNumber: data.greetingNumber,
          includeSelf: Boolean(data.includeSelf),
          businessCard: data.businessCard?.trim() || BUSINESS_CARD_DEFAULT,
          imageUrl: data.imageUrl ?? "",
          content: data.content ?? "",
          quantity: String(data.quantity ?? ""),
          size: data.size ?? "",
          productName: data.productName?.trim() || "",
          receivePlace: data.receivePlace ?? "",
          specialNote: data.specialNote?.trim() || "",
        });
      } catch (err) {
        if (!cancelled) {
          if (!hydrateFromDraft()) {
            setError(
              err instanceof Error
                ? err.message
                : "인사장 정보를 불러오지 못했습니다.",
            );
          }
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [open, greetingId, draft]);

  return (
    <Dialog
      open={open}
      title="인사장 보기"
      onClose={onClose}
      className="max-h-[90vh] max-w-2xl overflow-y-auto"
    >
      {isLoading ? (
        <p className="text-sm text-muted-foreground">불러오는 중...</p>
      ) : error ? (
        <p className="text-sm text-red">{error}</p>
      ) : view ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-start gap-4">
            {view.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={resolveGreetingImageUrl(view.imageUrl)}
                alt="인사장 이미지"
                className="h-28 w-28 rounded border border-line object-cover"
              />
            ) : (
              <div className="flex h-28 w-28 items-center justify-center rounded border border-dashed border-line text-xs text-[#94a3b8]">
                이미지 없음
              </div>
            )}
            <dl className="grid min-w-0 flex-1 gap-3 min-[480px]:grid-cols-2">
              <GreetingViewField
                label="인사장번호"
                value={`${view.greetingNumber}${view.includeSelf ? " (+자체)" : ""}`}
              />
              <GreetingViewField
                label="명함 동봉"
                value={
                  view.businessCard === BUSINESS_CARD_INCLUDED
                    ? "동봉 ✓"
                    : view.businessCard === BUSINESS_CARD_EXCLUDED
                      ? BUSINESS_CARD_EXCLUDED
                      : view.businessCard || BUSINESS_CARD_DEFAULT
                }
              />
              <GreetingViewField label="크기" value={view.size} />
              <GreetingViewField label="수량" value={view.quantity} />
              <GreetingViewField label="받을 곳" value={view.receivePlace} />
              <GreetingViewField label="제품명" value={view.productName} />
            </dl>
          </div>
          <dl className="grid gap-3">
            <GreetingViewField label="인사장내용" value={view.content} />
            <GreetingViewField label="특이사항" value={view.specialNote} />
          </dl>
          <div className="flex justify-end">
            <Button type="button" variant="outline" onClick={onClose}>
              닫기
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">표시할 인사장 정보가 없습니다.</p>
      )}
    </Dialog>
  );
}

function ProductOrderPanel({
  onGreetingClick,
  blankCustomerFields = false,
  openStockOnly = false,
  hasUnsavedGreeting = false,
  savedGreetingsByProduct = {},
  onUnsavedGreetingResolved,
  onOrderAccepted,
  onDirtyChange,
  editOrderNumber = null,
  onHydratedGreetings,
}: {
  onGreetingClick: (context: {
    productNames: string[];
    ordererName: string;
    phone: string;
    churchName: string;
    senderName: string;
    productSummary: string;
    productLines: Array<{ product: string; qty: number }>;
    targetProduct: string;
  }) => void;
  /** When true (admin proxy order), leave customer fields empty for manual entry. */
  blankCustomerFields?: boolean;
  /** 개인회원: 상품 추가 목록에 공개(openStock) 상품만 표시 */
  openStockOnly?: boolean;
  hasUnsavedGreeting?: boolean;
  savedGreetingsByProduct?: Record<string, GreetingDraft>;
  onUnsavedGreetingResolved?: () => void;
  /** After successful 접수하기 / 변경내용접수 / 취소 confirm — e.g. go to list. */
  onOrderAccepted?: (orderNumber?: string) => void;
  /** Called when draft content changes (for leave-guard). */
  onDirtyChange?: (dirty: boolean) => void;
  /** When set, load existing order and submit via PATCH. */
  editOrderNumber?: string | null;
  /** Edit hydrate: restore linked greeting drafts into parent state. */
  onHydratedGreetings?: (drafts: Record<string, GreetingDraft>) => void;
}) {
  const isEditMode = Boolean(editOrderNumber);
  const [editOrderId, setEditOrderId] = useState<number | null>(null);
  const [editOrderStatus, setEditOrderStatus] = useState<string | null>(null);
  const [isHydrating, setIsHydrating] = useState(isEditMode);
  const [hydrateError, setHydrateError] = useState("");
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [orderType, setOrderType] = useState<OrderType | null>(null);
  const [productItems, setProductItems] = useState<ProductLineItem[]>([]);
  const [isProductDialogOpen, setIsProductDialogOpen] = useState(false);
  const [ordererName, setOrdererName] = useState("");
  const [ordererPhone, setOrdererPhone] = useState("");
  const [orderDate, setOrderDate] = useState(() => todayDateValue());
  const [churchQuery, setChurchQuery] = useState("");
  const [churchId, setChurchId] = useState<number | null>(null);
  const [churches, setChurches] = useState<ChurchOption[]>([]);
  const [isChurchesLoading, setIsChurchesLoading] = useState(true);
  const [churchesLoadError, setChurchesLoadError] = useState("");

  const reloadChurches = useCallback(async () => {
    setIsChurchesLoading(true);
    setChurchesLoadError("");
    try {
      const response = await apiFetch("/api/churches");
      const data = (await response.json()) as
        | ChurchOption[]
        | { message?: string };
      if (!response.ok || !Array.isArray(data)) {
        setChurches([]);
        setChurchesLoadError(
          !Array.isArray(data) && data.message
            ? data.message
            : "중앙 목록을 불러오지 못했습니다.",
        );
        return;
      }
      setChurches(data);
    } catch {
      setChurches([]);
      setChurchesLoadError("중앙 목록을 불러오지 못했습니다.");
    } finally {
      setIsChurchesLoading(false);
    }
  }, []);
  const [deliveryCompanyName, setDeliveryCompanyName] = useState("");
  const [parcelCompanyName, setParcelCompanyName] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [deliveryTime, setDeliveryTime] = useState("");
  const [parcelShipDate, setParcelShipDate] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [recipientAddress, setRecipientAddress] = useState("");
  const [recipientAddressDetail, setRecipientAddressDetail] = useState("");
  const [senderName, setSenderName] = useState("");
  const [senderPhone, setSenderPhone] = useState("");
  const [senderAddress, setSenderAddress] = useState("");
  const [senderAddressDetail, setSenderAddressDetail] = useState("");
  const [branchStore, setBranchStore] = useState<BranchStoreId | null>(null);
  const [isDirector, setIsDirector] = useState<boolean | null>(null);
  const [viewingGreetingProduct, setViewingGreetingProduct] = useState<
    string | null
  >(null);
  const [formError, setFormError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGreetingViewOpen, setIsGreetingViewOpen] = useState(false);
  const [alertDialog, setAlertDialog] = useState<{
    open: boolean;
    message: string;
  }>({ open: false, message: "" });
  const [resultDialog, setResultDialog] = useState<{
    open: boolean;
    success: boolean;
  }>({ open: false, success: false });
  const [acceptedOrderNumber, setAcceptedOrderNumber] = useState<string | null>(
    null,
  );
  const isDesktop = useMinWidth(1040);
  const isWideProductList = useMinWidth(500);
  const isDelivery = orderType === "delivery";
  const memberFieldsReadOnly = !blankCustomerFields;
  const displayOrdererName =
    isDirector === true
      ? `${ordererName.trim()}${ordererName.trim().endsWith("관") ? "" : "관"}`
      : ordererName.trim().endsWith("관")
        ? ordererName.trim().slice(0, -1)
        : ordererName.trim();
  const savedGreetingCount = Object.values(savedGreetingsByProduct).filter(
    (draft) => draft.id,
  ).length;
  const viewingGreeting = viewingGreetingProduct
    ? (savedGreetingsByProduct[viewingGreetingProduct] ?? null)
    : null;

  useEffect(() => {
    if (!onDirtyChange) {
      return;
    }
    const dirty =
      productItems.length > 0 ||
      savedGreetingCount > 0 ||
      hasUnsavedGreeting ||
      Boolean(deliveryCompanyName.trim()) ||
      Boolean(parcelCompanyName.trim()) ||
      Boolean(deliveryDate) ||
      Boolean(deliveryTime) ||
      Boolean(parcelShipDate) ||
      Boolean(recipientName.trim()) ||
      Boolean(recipientPhone.trim()) ||
      Boolean(recipientAddress.trim()) ||
      Boolean(recipientAddressDetail.trim()) ||
      Boolean(senderName.trim()) ||
      Boolean(senderPhone.trim()) ||
      Boolean(senderAddress.trim()) ||
      Boolean(senderAddressDetail.trim()) ||
      Boolean(branchStore) ||
      (blankCustomerFields &&
        (Boolean(ordererName.trim()) ||
          Boolean(ordererPhone.trim()) ||
          Boolean(orderDate) ||
          Boolean(churchId)));
    onDirtyChange(dirty);
  }, [
    onDirtyChange,
    productItems.length,
    savedGreetingCount,
    hasUnsavedGreeting,
    deliveryCompanyName,
    parcelCompanyName,
    deliveryDate,
    deliveryTime,
    parcelShipDate,
    recipientName,
    recipientPhone,
    recipientAddress,
    recipientAddressDetail,
    senderName,
    senderPhone,
    senderAddress,
    senderAddressDetail,
    branchStore,
    blankCustomerFields,
    ordererName,
    ordererPhone,
    orderDate,
    churchId,
  ]);

  useEffect(() => {
    const auth = getAuthUser();

    // Admin proxy / edit hydrate: don't overwrite customer fields from session.
    if (!isEditMode && auth && !blankCustomerFields) {
      if (auth.name) {
        setOrdererName(auth.name);
      }
      if (auth.phone) {
        setOrdererPhone(formatPhoneInput(auth.phone));
      }
    }

    let cancelled = false;

    void reloadChurches();

    const loadMemberProfile = async () => {
      if (isEditMode || blankCustomerFields) {
        return;
      }
      try {
        if (!getAccessToken()) {
          return;
        }

        const response = await apiFetch("/api/auth/me");
        if (!response.ok) {
          return;
        }

        const data = (await response.json()) as {
          user?: {
            name?: string;
            phone?: string;
            id?: number;
            role?: string;
            church?: {
              id?: number;
              name?: string;
            } | null;
          };
        };

        if (cancelled || !data.user) {
          return;
        }

        if (data.user.name) {
          setOrdererName(data.user.name);
        }
        if (data.user.phone) {
          setOrdererPhone(formatPhoneInput(data.user.phone));
        }
        if (data.user.church?.id) {
          setChurchId(data.user.church.id);
          setChurchQuery(data.user.church.name ?? "");
        }
      } catch {
        // ignore
      }
    };

    void loadMemberProfile();

    return () => {
      cancelled = true;
    };
  }, [blankCustomerFields, isEditMode, reloadChurches]);

  useEffect(() => {
    if (!editOrderNumber) {
      setIsHydrating(false);
      return;
    }

    let cancelled = false;

    const hydrate = async () => {
      setIsHydrating(true);
      setHydrateError("");
      try {
        const response = await apiFetch("/api/orders");
        const data = (await response.json()) as
          | Array<{
              id: number;
              orderNumber: string;
              status: string;
              notes?: string | null;
              items?: Array<{
                productName: string;
                quantity: number;
                price: number;
              }>;
              shipment?: {
                carrier?: string | null;
                deliveryAddress?: string | null;
                estimatedWindow?: string | null;
              } | null;
              greetingForms?: Array<{
                id: number;
                linkedToOrder: boolean;
                greetingNumber: string;
                includeSelf: boolean;
                businessCard?: string | null;
                specialNote?: string | null;
                imageUrl?: string | null;
                content?: string | null;
                quantity?: number | null;
                size?: string | null;
                productName?: string | null;
                receivePlace?: string | null;
                orderId?: number | null;
              }>;
            }>
          | { message?: string };

        if (!response.ok || !Array.isArray(data)) {
          throw new Error(
            !Array.isArray(data) && data.message
              ? data.message
              : "주문서를 불러오지 못했습니다.",
          );
        }

        const order = data.find((row) => row.orderNumber === editOrderNumber);
        if (!order) {
          throw new Error("주문서를 찾을 수 없습니다.");
        }
        if (!canEditOrderStatus(order.status)) {
          throw new Error("배송중 이후 주문은 수정할 수 없습니다.");
        }
        if (cancelled) {
          return;
        }

        const notes = order.notes ?? "";
        const typeLabel = parseOrderTypeFromNotes(notes);
        const isDeliveryOrder =
          typeLabel === "배달" || typeLabel.startsWith("배달");
        setOrderType(isDeliveryOrder ? "delivery" : "parcel");
        setEditOrderId(order.id);
        setEditOrderStatus(order.status);

        setOrdererPhone(formatPhoneInput(parseOrdererPhoneFromNotes(notes)));
        setOrderDate(parseOrderDateFromNotes(notes));
        setChurchQuery(parseChurchFromNotes(notes));

        const parsedOrderer = parseOrdererFromNotes(notes).trim();
        if (parsedOrderer.endsWith("관")) {
          setIsDirector(true);
          setOrdererName(parsedOrderer.slice(0, -1));
        } else {
          setIsDirector(false);
          setOrdererName(parsedOrderer);
        }

        setDeliveryCompanyName(parseDeliveryCompanyFromNotes(notes));
        setParcelCompanyName(parseParcelCompanyFromNotes(notes));

        const deliveryDt = parseDeliveryDateTimeFromNotes(notes).trim();
        if (deliveryDt) {
          const [d, t] = deliveryDt.split(/\s+/);
          setDeliveryDate(d?.slice(0, 10) ?? "");
          setDeliveryTime(t?.slice(0, 5) ?? "");
        } else if (order.shipment?.estimatedWindow && isDeliveryOrder) {
          const iso = order.shipment.estimatedWindow;
          setDeliveryDate(iso.slice(0, 10));
          setDeliveryTime(iso.slice(11, 16));
        }

        const shipDate = parseShipDateFromNotes(notes);
        if (shipDate && !isDeliveryOrder) {
          setParcelShipDate(shipDate.slice(0, 10));
        }

        const recipient = parseRecipientPartsFromNotes(notes);
        setRecipientName(recipient.name);
        setRecipientPhone(formatPhoneInput(recipient.phone));
        setRecipientAddress(
          recipient.address || order.shipment?.deliveryAddress || "",
        );
        setRecipientAddressDetail("");

        const sender = parseSenderPartsFromNotes(notes);
        setSenderName(sender.name);
        setSenderPhone(formatPhoneInput(sender.phone));
        setSenderAddress(sender.address);
        setSenderAddressDetail("");

        const branchName = parseBranchStoreFromNotes(notes);
        const branch =
          BRANCH_STORES.find(
            (store) =>
              store.name === branchName ||
              store.shortLabel === branchName ||
              branchName.includes(store.name.slice(0, 2)) ||
              branchName.includes(store.shortLabel.slice(0, 2)),
          ) ?? null;
        setBranchStore(branch?.id ?? null);

        const greetingMap: Record<string, GreetingDraft> = {};
        for (const form of order.greetingForms ?? []) {
          const draft = greetingDraftFromApi(form);
          if (!draft) {
            continue;
          }
          const key =
            draft.productName.trim() ||
            form.productName?.trim() ||
            `greeting-${draft.id ?? form.id}`;
          greetingMap[key] = draft;
        }
        onHydratedGreetings?.(greetingMap);

        const orderKind: OrderType = isDeliveryOrder ? "delivery" : "parcel";
        setProductItems(
          (order.items ?? []).map((item) => {
            const matched =
              greetingMap[item.productName] ??
              Object.values(greetingMap).find(
                (draft) => draft.productName === item.productName,
              );
            return {
              product: item.productName,
              orderKind,
              qty: item.quantity || 1,
              note: parseItemNoteFromNotes(
                notes,
                item.productName,
                item.quantity,
              ),
              greeting: matched?.id ? "인사장보기" : "",
              unitPrice: item.price || 0,
              deliveryOnly: false,
            };
          }),
        );
      } catch (err) {
        if (!cancelled) {
          setHydrateError(
            err instanceof Error
              ? err.message
              : "주문서를 불러오지 못했습니다.",
          );
          onHydratedGreetings?.({});
        }
      } finally {
        if (!cancelled) {
          setIsHydrating(false);
        }
      }
    };

    void hydrate();
    return () => {
      cancelled = true;
    };
    // Parent passes a stable callback; avoid depending on inline fn identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onHydratedGreetings
  }, [editOrderNumber]);

  useEffect(() => {
    if (!churchQuery.trim() || churchId || churches.length === 0) {
      return;
    }
    const matched = churches.find(
      (church) => church.name === churchQuery.trim(),
    );
    if (matched) {
      setChurchId(matched.id);
    }
  }, [churchQuery, churchId, churches]);

  const addProductItems = (
    items: Array<{
      product: string;
      qty: number;
      note: string;
      unitPrice: number;
      deliveryOnly: boolean;
    }>,
  ) => {
    if (!orderType) {
      return;
    }

    const selectedOrderType = orderType;
    const allowedItems =
      selectedOrderType === "parcel"
        ? items.filter((item) => !item.deliveryOnly)
        : items;

    if (allowedItems.length === 0) {
      return;
    }

    setProductItems((current) => {
      const next = [...current];

      for (const item of allowedItems) {
        const existingIndex = next.findIndex(
          (row) => row.product === item.product,
        );

        if (existingIndex >= 0) {
          const existing = next[existingIndex];
          next[existingIndex] = {
            ...existing,
            qty: existing.qty + item.qty,
            unitPrice: item.unitPrice,
            orderKind: selectedOrderType,
            deliveryOnly: existing.deliveryOnly || item.deliveryOnly,
          };
        } else {
          next.push({
            product: item.product,
            qty: item.qty,
            note: item.note,
            unitPrice: item.unitPrice,
            orderKind: selectedOrderType,
            greeting: savedGreetingsByProduct[item.product]?.id
              ? "인사장보기"
              : "",
            deliveryOnly: item.deliveryOnly,
          });
        }
      }

      return next;
    });
  };

  useEffect(() => {
    setProductItems((current) =>
      current.map((item) => ({
        ...item,
        greeting: savedGreetingsByProduct[item.product]?.id
          ? "인사장보기"
          : "",
      })),
    );
  }, [savedGreetingsByProduct]);

  const handleOrderTypeChange = (nextType: OrderType) => {
    if (orderType !== null) {
      return;
    }
    setOrderType(nextType);
  };

  const resetOrderTypeForm = () => {
    setOrderType(null);
    setDeliveryCompanyName("");
    setParcelCompanyName("");
    setDeliveryDate("");
    setDeliveryTime("");
    setParcelShipDate("");
    setRecipientName("");
    setRecipientPhone("");
    setRecipientAddress("");
    setRecipientAddressDetail("");
    setSenderName("");
    setSenderPhone("");
    setSenderAddress("");
    setSenderAddressDetail("");
  };

  const productListTotal = productItems.reduce(
    (sum, item) => sum + item.qty * (item.unitPrice || 0),
    0,
  );

  const updateProductQty = (rowIndex: number, qty: number) => {
    setProductItems((current) =>
      current.map((item, index) =>
        index === rowIndex ? { ...item, qty: Math.max(1, qty) } : item,
      ),
    );
  };

  const joinAddress = (base: string, detail: string) =>
    [base.trim(), detail.trim()].filter(Boolean).join(" ");

  const fullRecipientAddress = joinAddress(
    recipientAddress,
    recipientAddressDetail,
  );
  const fullSenderAddress = joinAddress(senderAddress, senderAddressDetail);

  const closeResultDialog = () => {
    const wasSuccess = resultDialog.success;
    const orderNo = acceptedOrderNumber ?? editOrderNumber ?? undefined;
    setResultDialog((current) => ({ ...current, open: false }));
    if (wasSuccess) {
      onOrderAccepted?.(orderNo ?? undefined);
      setAcceptedOrderNumber(null);
    }
  };

  const removeProductItem = (rowIndex: number) => {
    setProductItems((current) => current.filter((_, index) => index !== rowIndex));
  };

  const openGreetingForm = (targetProduct: string) => {
    if (!ordererName.trim() || !ordererPhone.trim() || !churchId) {
      setAlertDialog({
        open: true,
        message:
          '"주문 기본정보"를 먼저 입력하신 후 인사장 작성 하셔야 합니다.',
      });
      return;
    }

    const targetItem = productItems.find(
      (item) => item.product === targetProduct,
    );
    if (!targetItem) {
      setAlertDialog({
        open: true,
        message: "인사장 작성을 위해선 상품이 필요합니다. 상품을 먼저 추가하세요!",
      });
      return;
    }

    setFormError("");
    onGreetingClick({
      productNames: [targetItem.product],
      productSummary: `${targetItem.product} ${targetItem.qty}개`,
      productLines: [{ product: targetItem.product, qty: targetItem.qty }],
      targetProduct: targetItem.product,
      ordererName: displayOrdererName || ordererName.trim(),
      phone: ordererPhone.trim(),
      churchName: churchQuery.trim(),
      senderName:
        (isDelivery ? displayOrdererName || ordererName.trim() : senderName.trim()) ||
        displayOrdererName ||
        ordererName.trim(),
    });
  };

  const validateRequired = () => {
    if (!branchStore) {
      return "주문 작업 지역(남부/중부/서부)을 선택해 주세요.";
    }
    if (isDirector === null) {
      return "관장님여부를 선택해 주세요.";
    }
    if (!orderType) {
      return "배달 또는 택배를 선택해 주세요.";
    }
    if (!ordererName.trim() || !ordererPhone.trim() || !orderDate || !churchId) {
      return "성명, 연락처, 주문일자, 중앙을 모두 입력해 주세요.";
    }
    if (!isDateOnOrAfterToday(orderDate)) {
      return "주문일자는 오늘 이후 날짜만 선택할 수 있습니다.";
    }

    const hasDeliveryItems = isDelivery;
    const hasParcelItems = !isDelivery;

    if (hasDeliveryItems) {
      if (!deliveryCompanyName.trim()) {
        return "배달 업체명을 입력해 주세요.";
      }
      if (
        !deliveryDate ||
        !deliveryTime ||
        !recipientName.trim() ||
        !recipientPhone.trim() ||
        !recipientAddress.trim()
      ) {
        return "배달 정보를 모두 입력해 주세요.";
      }
      if (!isDateOnOrAfterToday(deliveryDate)) {
        return "배달일은 오늘 이후 날짜만 선택할 수 있습니다.";
      }
    }

    if (hasParcelItems) {
      if (!parcelCompanyName.trim()) {
        return "택배 업체명을 입력해 주세요.";
      }
      if (
        !parcelShipDate ||
        !senderName.trim() ||
        !senderPhone.trim() ||
        !senderAddress.trim()
      ) {
        return "택배 정보를 모두 입력해 주세요.";
      }
      if (!isDateOnOrAfterToday(parcelShipDate)) {
        return "택배발송일은 오늘 이후 날짜만 선택할 수 있습니다.";
      }
      if (!recipientAddress.trim()) {
        return "받는 사람 주소를 입력해 주세요.";
      }
    }

    if (productItems.length === 0) {
      return "상품을 1개 이상 추가해 주세요.";
    }
    return "";
  };

  const handleSubmitOrder = async () => {
    if (isSubmitting) {
      return;
    }

    if (hasUnsavedGreeting) {
      const proceed = window.confirm(
        isEditMode
          ? "작성중인 인사장이 있습니다. 변경내용접수를 누르면 인사장은 저장되지 않습니다."
          : "작성중인 인사장이 있습니다. 접수하기를 누르면 인사장은 저장되지 않습니다.",
      );
      if (!proceed) {
        return;
      }
      onUnsavedGreetingResolved?.();
    }

    const shouldAttachGreetings =
      savedGreetingCount > 0 && !hasUnsavedGreeting;

    setFormError("");
    const validationError = validateRequired();
    if (validationError) {
      setFormError(validationError);
      setResultDialog({ open: true, success: false });
      return;
    }

    if (!orderType) {
      return;
    }
    const selectedOrderType = orderType;

    setIsSubmitting(true);

    try {
      const auth = getAuthUser();

      if (!auth?.id || !getAccessToken()) {
        setFormError("로그인이 필요합니다.");
        setResultDialog({ open: true, success: false });
        return;
      }

      const selectedBranch =
        BRANCH_STORES.find((store) => store.id === branchStore)?.name ?? "";
      if (!selectedBranch) {
        setFormError("주문 작업 지역(남부/중부/서부)을 선택해 주세요.");
        setResultDialog({ open: true, success: false });
        return;
      }
      const year = new Date().getFullYear();
      const orderNumber =
        editOrderNumber ??
        `ORD-${year}-${String(Date.now()).slice(-6)}`;
      const hasDeliveryItems = isDelivery;
      const hasParcelItems = !isDelivery;
      const attachedGreetingNotes = shouldAttachGreetings
        ? Object.values(savedGreetingsByProduct)
            .filter((draft) => draft.id)
            .map((draft) => formatGreetingDraftNotes(draft))
            .join(" / ")
        : null;
      const notes = [
        `주문자:${displayOrdererName || ordererName.trim()}`,
        `연락처:${ordererPhone.trim()}`,
        `주문일자:${orderDate}`,
        `중앙:${churchQuery.trim()}`,
        hasDeliveryItems ? `배달업체명:${deliveryCompanyName.trim()}` : null,
        hasParcelItems ? `택배업체명:${parcelCompanyName.trim()}` : null,
        hasDeliveryItems ? `배달일:${deliveryDate} ${deliveryTime}` : null,
        hasDeliveryItems
          ? `받는분:${recipientName.trim()} / ${recipientPhone.trim()} / ${fullRecipientAddress}`
          : null,
        hasParcelItems ? `택배발송일:${parcelShipDate}` : null,
        hasParcelItems
          ? `보내는사람:${senderName.trim()} / ${senderPhone.trim()} / ${fullSenderAddress}`
          : null,
        hasParcelItems && fullRecipientAddress
          ? `받는분주소:${fullRecipientAddress}`
          : null,
        `주문작업지역:${selectedBranch}`,
        `지부매장:${selectedBranch}`,
        `인사장종류:${savedGreetingCount > 0 ? "본사" : "없음"}`,
        attachedGreetingNotes,
        ...productItems.map(
          (item) =>
            `[${orderKindLabel(selectedOrderType)}] ${item.product} ${item.qty}개${item.note ? `(${item.note})` : ""}`,
        ),
      ]
        .filter(Boolean)
        .join(" / ");

      const primaryKind = hasDeliveryItems ? "delivery" : "parcel";
      const payload = {
        totalAmount: productItems.reduce(
          (sum, item) => sum + item.qty * (item.unitPrice || 0),
          0,
        ),
        notes,
        items: productItems.map((item) => ({
          productName: item.product,
          quantity: item.qty,
          price: item.unitPrice || 0,
        })),
        shipment: {
          fulfillmentType: "PARCEL" as const,
          carrier:
            primaryKind === "delivery"
              ? deliveryCompanyName.trim()
              : parcelCompanyName.trim(),
          deliveryAddress:
            primaryKind === "delivery"
              ? fullRecipientAddress
              : fullSenderAddress,
          estimatedWindow:
            primaryKind === "delivery"
              ? `${deliveryDate}T${deliveryTime}:00.000Z`
              : `${parcelShipDate}T09:00:00.000Z`,
        },
      };

      const response = isEditMode && editOrderId
        ? await apiFetch(`/api/orders/${editOrderId}`, {
            method: "PATCH",
            body: JSON.stringify(payload),
          })
        : await apiFetch("/api/orders", {
            method: "POST",
            body: JSON.stringify({
              orderNumber,
              userId: auth.id,
              status: "PLACED",
              ...payload,
            }),
          });

      setResultDialog({ open: true, success: response.ok });
      if (!response.ok) {
        const errBody = (await response.json().catch(() => null)) as {
          message?: string | string[];
        } | null;
        const raw = errBody?.message;
        const message = Array.isArray(raw) ? raw[0] : raw;
        setFormError(
          message ||
            (isEditMode
              ? "주문서 변경 접수에 실패하였습니다."
              : "제품주문서 접수에 실패하였습니다."),
        );
      } else {
        setAcceptedOrderNumber(orderNumber);
        if (!isEditMode) {
          const created = (await response.json().catch(() => null)) as {
            id?: number;
          } | null;
          if (created?.id && shouldAttachGreetings) {
            const greetingIds = Object.values(savedGreetingsByProduct)
              .map((draft) => draft.id)
              .filter((id): id is number => typeof id === "number");
            await Promise.all(
              greetingIds.map((id) =>
                apiFetch(`/api/greeting-forms/${id}/link-order`, {
                  method: "PATCH",
                  body: JSON.stringify({ orderId: created.id }),
                }).catch(() => null),
              ),
            );
          }
        }
      }
    } catch {
      setFormError(
        isEditMode
          ? "주문서 변경 접수에 실패하였습니다."
          : "제품주문서 접수에 실패하였습니다.",
      );
      setResultDialog({ open: true, success: false });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelOrder = async () => {
    if (!editOrderId || isCancelling) {
      return;
    }
    setIsCancelling(true);
    setFormError("");
    try {
      const response = await apiFetch(
        `/api/orders/${editOrderId}/delivery-action`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "CANCEL_ORDER" }),
        },
      );
      const data = (await response.json()) as
        | { id: number; message?: string | string[] }
        | { message?: string | string[] };
      if (!response.ok) {
        const raw = data.message;
        const message = Array.isArray(raw) ? raw[0] : raw;
        throw new Error(message || "주문서 취소에 실패했습니다.");
      }
      setCancelConfirmOpen(false);
      setResultDialog({ open: true, success: true });
      setFormError("");
    } catch (err) {
      setCancelConfirmOpen(false);
      setFormError(
        err instanceof Error ? err.message : "주문서 취소에 실패했습니다.",
      );
      setResultDialog({ open: true, success: false });
    } finally {
      setIsCancelling(false);
    }
  };

  const productColumns: TableColumn<ProductLineItem>[] = [
    {
      key: "product",
      header: "상품명",
      render: (row) => <span className="font-medium text-ink">{row.product}</span>,
    },
    {
      key: "qty",
      header: "수량",
      className: "w-[88px] px-1 py-0",
      render: (row) => {
        const rowIndex = productItems.indexOf(row);
        if (rowIndex < 0) {
          return row.qty;
        }

        return (
          <input
            type="number"
            min={1}
            required
            aria-label={`${row.product} 수량`}
            value={row.qty}
            onChange={(event) => {
              const nextQty = Number(event.target.value);
              if (!Number.isNaN(nextQty)) {
                updateProductQty(rowIndex, nextQty);
              }
            }}
            className="mx-auto block h-8 w-16 rounded border border-[#cbd5e1] bg-white px-1 text-center text-sm text-ink focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand/20 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
        );
      },
    },
    {
      key: "unitPrice",
      header: "단가",
      className: "w-[96px]",
      render: (row) => formatPrice(row.unitPrice || 0),
    },
    {
      key: "note",
      header: "요청사항",
      render: (row) => row.note || <span className="text-[#94a3b8]">-</span>,
    },
    {
      key: "greeting",
      header: "인사장",
      className: "w-[120px]",
      render: (row) => {
        const draft = savedGreetingsByProduct[row.product];
        const isSaved = Boolean(draft?.id);

        return (
          <Button
            type="button"
            size="sm"
            className={cn(
              "h-8 px-2 text-xs",
              isSaved
                ? "border-brand bg-brand text-white hover:bg-[#1856bf]"
                : "border-green bg-green text-white hover:bg-[#128a52]",
            )}
            onClick={(event) => {
              event.stopPropagation();
              if (isSaved) {
                setViewingGreetingProduct(row.product);
                setIsGreetingViewOpen(true);
                return;
              }
              openGreetingForm(row.product);
            }}
          >
            {isSaved ? "인사장보기" : "인사장주문"}
          </Button>
        );
      },
    },
    {
      key: "action",
      header: "",
      className: "w-[44px] px-1",
      render: (row) => {
        const rowIndex = productItems.indexOf(row);
        if (rowIndex < 0) {
          return null;
        }

        return (
          <button
            type="button"
            aria-label={`${row.product} 삭제`}
            onClick={() => removeProductItem(rowIndex)}
            className="inline-flex size-8 items-center justify-center rounded text-[#64748b] hover:bg-[#fee2e2] hover:text-red"
          >
            <Trash2 className="size-4" />
          </button>
        );
      },
    },
  ];

  if (isHydrating) {
    return (
      <Panel>
        <p className="text-sm text-muted-foreground">주문서를 불러오는 중...</p>
      </Panel>
    );
  }

  if (hydrateError) {
    return (
      <Panel>
        <p className="text-sm text-red">{hydrateError}</p>
      </Panel>
    );
  }

  return (
    <div className="space-y-3">
      {isEditMode ? (
        <p className="text-sm text-[#64748b]">
          주문번호 {editOrderNumber}
          {editOrderStatus
            ? ` · ${ORDER_STATUS_LABEL[editOrderStatus] ?? editOrderStatus}`
            : ""}
        </p>
      ) : null}

      <Panel title="주문 작업 지역 *">
        <div className="flex flex-wrap gap-2">
          {BRANCH_STORES.map((store) => {
            const selected = branchStore === store.id;
            return (
              <button
                key={store.id}
                type="button"
                onClick={() => setBranchStore(store.id)}
                className={cn(
                  "min-h-10 min-w-[96px] rounded-[7px] px-4 text-sm font-semibold transition-colors",
                  selected
                    ? "bg-[#1f2937] text-white"
                    : "border border-line bg-white text-ink hover:bg-soft",
                )}
              >
                {store.shortLabel}
              </button>
            );
          })}
        </div>
        {!branchStore ? (
          <p className="mt-2 text-sm text-[#b45309]">
            남부·중부·서부 중 한 곳을 선택해 주세요. (필수, 작성 중에도 변경 가능)
          </p>
        ) : null}
      </Panel>

      <Panel title="주문 기본정보">
        <div className="grid grid-cols-1 gap-2.5 min-[640px]:grid-cols-2">
          <div className="grid grid-cols-1 gap-2 min-[480px]:grid-cols-[1fr_auto] min-[480px]:items-end">
            <Input
              label="주문자 성명 *"
              value={
                memberFieldsReadOnly
                  ? displayOrdererName
                  : isDirector === true
                    ? displayOrdererName
                    : ordererName
              }
              onChange={(event) => {
                if (memberFieldsReadOnly) {
                  return;
                }
                const next = event.target.value;
                if (isDirector === true && next.endsWith("관")) {
                  setOrdererName(next.slice(0, -1));
                } else {
                  setOrdererName(next);
                }
              }}
              readOnly={memberFieldsReadOnly}
              className={memberFieldsReadOnly ? "bg-[#f8fafc]" : undefined}
              placeholder={blankCustomerFields ? "고객 성명" : "주문자 성명"}
              required
            />
            <div className="pb-0.5">
              <p className="mb-1.5 text-sm font-bold text-ink">관장님여부 *</p>
              <div className="flex gap-3" role="radiogroup" aria-label="관장님여부" aria-required>
                {(
                  [
                    { value: true, label: "여" },
                    { value: false, label: "부" },
                  ] as const
                ).map((option) => (
                  <label
                    key={option.label}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink"
                  >
                    <input
                      type="radio"
                      name="is-director"
                      checked={isDirector === option.value}
                      onChange={() => setIsDirector(option.value)}
                      className="size-4 accent-brand"
                      required={isDirector === null}
                    />
                    {option.label}
                  </label>
                ))}
              </div>
              {isDirector === null ? (
                <p className="mt-1 text-xs text-[#b45309]">여 또는 부를 선택해 주세요.</p>
              ) : null}
            </div>
          </div>
          <Input
            label="주문자 연락처 *"
            type="text"
            inputMode="numeric"
            maxLength={13}
            value={ordererPhone}
            onChange={(event) => {
              if (memberFieldsReadOnly) {
                return;
              }
              setOrdererPhone(formatPhoneInput(event.target.value));
            }}
            readOnly={memberFieldsReadOnly}
            className={memberFieldsReadOnly ? "bg-[#f8fafc]" : undefined}
            placeholder="010-1234-5678"
            required
          />
        </div>
        <div className="mt-2.5 grid grid-cols-1 gap-2.5 min-[640px]:grid-cols-2">
          <div className="w-full">
            <Input
              id="order-date"
              label="주문일자 *"
              type="date"
              value={orderDate}
              readOnly
              tabIndex={-1}
              className="pointer-events-none cursor-default bg-[#f8fafc]"
              required
            />
          </div>
          <ChurchSearchField
            churches={churches}
            isLoading={isChurchesLoading}
            loadError={churchesLoadError}
            onRetryLoad={() => {
              void reloadChurches();
            }}
            query={churchQuery}
            selectedId={churchId}
            readOnly={memberFieldsReadOnly}
            onQueryChange={(value) => {
              setChurchQuery(value);
              setChurchId(null);
            }}
            onSelect={(church) => {
              setChurchQuery(church.name);
              setChurchId(church.id);
            }}
          />
        </div>
      </Panel>

      <Panel>
        <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-base font-semibold text-ink">
            {orderType === "delivery"
              ? "배달 주문 내역"
              : orderType === "parcel"
                ? "택배 주문 내역"
                : "배달 / 택배 선택"}
          </h4>
          <OrderTypePicker
            value={orderType}
            locked={orderType !== null}
            onSelect={handleOrderTypeChange}
            onReset={resetOrderTypeForm}
          />
        </div>

        {!orderType ? (
          <p className="rounded-lg border border-dashed border-line bg-white px-3 py-6 text-center text-sm text-[#64748b]">
            택배 또는 배달을 선택해 주세요. 선택 후 다른 유형은 폼초기화로만
            변경할 수 있습니다.
          </p>
        ) : isDelivery ? (
          <div className="space-y-2.5">
            <div className="grid grid-cols-1 gap-2.5 min-[640px]:grid-cols-2 xl:grid-cols-3">
              <Input
                label="배달일 *"
                type="date"
                min={todayDateValue()}
                value={deliveryDate}
                onChange={(event) => {
                  const next = event.target.value;
                  if (next && next < todayDateValue()) {
                    return;
                  }
                  setDeliveryDate(next);
                }}
                required
              />
              <Input
                label="배달 시간 *"
                type="time"
                value={deliveryTime}
                onChange={(event) => setDeliveryTime(event.target.value)}
                required
              />
              <Input
                label="업체명 *"
                value={deliveryCompanyName}
                onChange={(event) => setDeliveryCompanyName(event.target.value)}
                placeholder="업체명"
                required
              />
            </div>
            <div className="grid grid-cols-1 gap-2.5 min-[640px]:grid-cols-2">
              <Input
                label="받는 분 성함 *"
                value={recipientName}
                onChange={(event) => setRecipientName(event.target.value)}
                placeholder="받는 분 성함"
                required
              />
              <Input
                label="받는 분 전화번호 *"
                type="text"
                inputMode="numeric"
                maxLength={13}
                value={recipientPhone}
                onChange={(event) =>
                  setRecipientPhone(formatPhoneInput(event.target.value))
                }
                placeholder="010-1234-5678"
                required
              />
            </div>
            <AddressField
              id="recipient-address"
              label="받는 분 주소"
              value={recipientAddress}
              onChange={setRecipientAddress}
              detailValue={recipientAddressDetail}
              onDetailChange={setRecipientAddressDetail}
            />
          </div>
        ) : (
          <div className="space-y-2.5">
            <div className="grid grid-cols-1 gap-2.5 min-[640px]:grid-cols-2">
              <Input
                label="택배발송일 *"
                type="date"
                min={todayDateValue()}
                value={parcelShipDate}
                onChange={(event) => {
                  const next = event.target.value;
                  if (next && next < todayDateValue()) {
                    return;
                  }
                  setParcelShipDate(next);
                }}
                required
              />
              <Input
                label="업체명 *"
                value={parcelCompanyName}
                onChange={(event) => setParcelCompanyName(event.target.value)}
                placeholder="업체명"
                required
              />
            </div>
            <div className="grid grid-cols-1 gap-2.5 min-[640px]:grid-cols-2">
              <Input
                label="보내는 사람 (택배기표지) *"
                value={senderName}
                onChange={(event) => setSenderName(event.target.value)}
                placeholder="보내는 사람"
                required
              />
              <Input
                label="보내는 사람 전화번호 (택배기표지) *"
                type="text"
                inputMode="numeric"
                maxLength={13}
                value={senderPhone}
                onChange={(event) =>
                  setSenderPhone(formatPhoneInput(event.target.value))
                }
                placeholder="010-1234-5678"
                required
              />
            </div>
            <AddressField
              id="sender-address"
              label="보내는 사람 주소 (택배기표지)"
              value={senderAddress}
              onChange={setSenderAddress}
              detailValue={senderAddressDetail}
              onDetailChange={setSenderAddressDetail}
            />
            <AddressField
              id="parcel-recipient-address"
              label="받는 사람 주소 *"
              value={recipientAddress}
              onChange={setRecipientAddress}
              detailValue={recipientAddressDetail}
              onDetailChange={setRecipientAddressDetail}
            />
          </div>
        )}
      </Panel>

      <Panel>
        <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            disabled={!orderType}
            onClick={() => {
              if (!orderType) {
                setAlertDialog({
                  open: true,
                  message: "배달 또는 택배를 먼저 선택해 주세요.",
                });
                return;
              }
              setIsProductDialogOpen(true);
            }}
            className={cn(
              "text-left text-base font-semibold",
              orderType
                ? "text-brand underline-offset-2 hover:underline"
                : "cursor-not-allowed text-[#94a3b8]",
            )}
          >
            상품추가+
          </button>
          {productItems.length > 0 ? (
            <span className="text-sm leading-relaxed text-[#64748b]">
              총 {productItems.length}건 · 수량 합계{" "}
              {productItems.reduce((sum, item) => sum + item.qty, 0)}개 ·{" "}
              <span className="font-semibold text-ink">
                금액 합계 {formatPrice(productListTotal)}
              </span>
            </span>
          ) : null}
        </div>
        <p className="mb-2 text-sm text-[#64748b]">
          {orderType ? (
            <>
              현재{" "}
              <span className="font-semibold text-ink">
                {orderKindLabel(orderType)}
              </span>{" "}
              주문입니다. 상품별 인사장주문 버튼으로 인사장을 작성할 수 있습니다.
            </>
          ) : (
            <>배달/택배를 먼저 선택한 뒤 상품을 추가해 주세요.</>
          )}
        </p>

        {isWideProductList ? (
          <Table
            caption="제품 주문 상품 목록"
            columns={productColumns}
            data={productItems}
            emptyMessage="등록된 상품이 없습니다. 「상품추가+」로 추가해 주세요."
            scrollable={!isDesktop}
            visibleRows={isDesktop ? undefined : 4}
          />
        ) : productItems.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line bg-white px-3 py-6 text-center text-sm text-[#64748b]">
            등록된 상품이 없습니다. 「상품추가+」로 추가해 주세요.
          </p>
        ) : (
          <ul className="space-y-2.5">
            {productItems.map((row, rowIndex) => {
              const draft = savedGreetingsByProduct[row.product];
              const isSaved = Boolean(draft?.id);

              return (
                <li
                  key={`${row.product}-${rowIndex}`}
                  className="rounded-lg border border-line bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 flex-1 text-base font-semibold leading-snug text-ink break-keep">
                      {row.product}
                    </p>
                    <button
                      type="button"
                      aria-label={`${row.product} 삭제`}
                      onClick={() => removeProductItem(rowIndex)}
                      className="inline-flex size-9 shrink-0 items-center justify-center rounded-md text-[#64748b] hover:bg-[#fee2e2] hover:text-red"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2.5">
                    <label className="block">
                      <span className="mb-1 block text-xs font-semibold text-[#64748b]">
                        수량
                      </span>
                      <input
                        type="number"
                        min={1}
                        required
                        aria-label={`${row.product} 수량`}
                        value={row.qty}
                        onChange={(event) => {
                          const nextQty = Number(event.target.value);
                          if (!Number.isNaN(nextQty)) {
                            updateProductQty(rowIndex, nextQty);
                          }
                        }}
                        className="h-10 w-full rounded-[7px] border border-[#cbd5e1] bg-white px-2.5 text-center text-base text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                      />
                    </label>
                    <div>
                      <span className="mb-1 block text-xs font-semibold text-[#64748b]">
                        단가
                      </span>
                      <p className="flex h-10 items-center text-base font-semibold text-ink">
                        {formatPrice(row.unitPrice || 0)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-[#eef2f7] pt-2.5">
                    <span className="text-xs font-semibold text-[#64748b]">
                      인사장
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      className={cn(
                        "h-8 px-2 text-xs",
                        isSaved
                          ? "border-brand bg-brand text-white hover:bg-[#1856bf]"
                          : "border-green bg-green text-white hover:bg-[#128a52]",
                      )}
                      onClick={() => {
                        if (isSaved) {
                          setViewingGreetingProduct(row.product);
                          setIsGreetingViewOpen(true);
                          return;
                        }
                        openGreetingForm(row.product);
                      }}
                    >
                      {isSaved ? "인사장보기" : "인사장주문"}
                    </Button>
                  </div>

                  {row.note ? (
                    <p className="mt-2 text-sm leading-relaxed text-[#475569]">
                      <span className="font-semibold text-[#64748b]">요청사항 · </span>
                      {row.note}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      {formError && !formError.includes("주문 기본정보") ? (
        <p className="rounded-[7px] border border-red/30 bg-[#fff0ed] px-3 py-2 text-sm text-red">
          {formError}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          className="border-green bg-green text-white hover:bg-[#128a52]"
          disabled={isSubmitting || isCancelling}
          onClick={() => {
            void handleSubmitOrder();
          }}
        >
          {isSubmitting
            ? isEditMode
              ? "저장 중..."
              : "접수 중..."
            : isEditMode
              ? "변경내용접수"
              : "주문접수완료"}
        </Button>
        {isEditMode ? (
          <Button
            type="button"
            variant="outline"
            className="border-[#dc2626] bg-white text-[#dc2626] hover:bg-[#fef2f2]"
            disabled={isSubmitting || isCancelling}
            onClick={() => setCancelConfirmOpen(true)}
          >
            주문서 취소
          </Button>
        ) : null}
      </div>

      <ProductAddDialog
        open={isProductDialogOpen && orderType !== null}
        defaultOrderKind={orderType ?? "delivery"}
        openStockOnly={openStockOnly}
        onClose={() => setIsProductDialogOpen(false)}
        onAddItems={addProductItems}
      />

      <GreetingViewModal
        open={isGreetingViewOpen}
        greetingId={viewingGreeting?.id}
        draft={viewingGreeting}
        onClose={() => {
          setIsGreetingViewOpen(false);
          setViewingGreetingProduct(null);
        }}
      />

      <Dialog
        open={cancelConfirmOpen}
        title="주문서 취소"
        onClose={() => {
          if (!isCancelling) {
            setCancelConfirmOpen(false);
          }
        }}
      >
        <p className="text-sm leading-6 text-ink">
          주문서를 정말 취소하시겠습니까?
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={isCancelling}
            onClick={() => setCancelConfirmOpen(false)}
          >
            닫기
          </Button>
          <Button
            type="button"
            className="border-[#dc2626] bg-[#dc2626] text-white hover:bg-[#b91c1c]"
            disabled={isCancelling}
            onClick={() => {
              void handleCancelOrder();
            }}
          >
            {isCancelling ? "처리 중..." : "확인"}
          </Button>
        </div>
      </Dialog>

      <Dialog
        open={alertDialog.open}
        title="알림"
        onClose={() => setAlertDialog({ open: false, message: "" })}
      >
        <p className="text-sm leading-6 text-ink">{alertDialog.message}</p>
        <div className="mt-5 flex justify-end">
          <Button
            type="button"
            className="border-[#1f2937] bg-[#1f2937] text-white hover:bg-[#111827]"
            onClick={() => setAlertDialog({ open: false, message: "" })}
          >
            확인
          </Button>
        </div>
      </Dialog>

      <Dialog
        open={resultDialog.open}
        title={
          resultDialog.success
            ? isEditMode
              ? "처리 완료"
              : "접수 완료"
            : isEditMode
              ? "처리 실패"
              : "접수 실패"
        }
        onClose={closeResultDialog}
      >
        <p className="text-sm leading-6 text-ink">
          {resultDialog.success
            ? isEditMode
              ? "주문서가 처리되었습니다."
              : "제품주문서가 접수되었습니다."
            : formError ||
              (isEditMode
                ? "주문서 처리에 실패하였습니다."
                : "제품주문서 접수에 실패하였습니다.")}
        </p>
        <div className="mt-5 flex justify-end">
          <Button
            type="button"
            className={
              resultDialog.success
                ? "border-green bg-green text-white hover:bg-[#128a52]"
                : "border-[#1f2937] bg-[#1f2937] text-white hover:bg-[#111827]"
            }
            onClick={closeResultDialog}
          >
            확인
          </Button>
        </div>
      </Dialog>
    </div>
  );
}

function GreetingPanel({
  linkedProductNames,
  customerInfo,
  initialDraft = null,
  onBackToOrder,
  onDirtyChange,
  onSave,
}: {
  linkedProductNames: string[];
  customerInfo?: {
    ordererName: string;
    phone: string;
    churchName: string;
    senderName?: string;
    productSummary?: string;
    productLines?: Array<{ product: string; qty: number }>;
  };
  initialDraft?: GreetingDraft | null;
  onBackToOrder: () => void;
  onDirtyChange: (dirty: boolean) => void;
  onSave: (draft: GreetingDraft) => void;
}) {
  return (
    <Panel>
      <GreetingForm
        linkedProductNames={linkedProductNames}
        customerInfo={customerInfo}
        initialDraft={initialDraft}
        onBackToOrder={onBackToOrder}
        onDirtyChange={onDirtyChange}
        onSave={onSave}
      />
    </Panel>
  );
}

function MemberMobileOrderCard({
  order,
  onView,
  onEdit,
  onConfirmReceive,
  isConfirming,
}: {
  order: OrderRow;
  onView: () => void;
  onEdit?: () => void;
  onConfirmReceive: () => void;
  isConfirming: boolean;
}) {
  const editable = canEditOrderStatus(order.statusCode);

  return (
    <article className="rounded-xl border border-[#d8e0ea] bg-white px-3.5 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-lg font-bold text-ink">
            {editable && onEdit ? (
              <button
                type="button"
                className="text-left text-brand underline-offset-2 hover:underline"
                onClick={onEdit}
              >
                {order.orderNumber}
              </button>
            ) : (
              order.orderNumber
            )}
          </p>
          <p className="mt-0.5 text-lg font-bold text-ink">
            {order.name} · {order.type}
          </p>
          <p className="mt-0.5 text-base text-[#64748b]">{order.productName}</p>
          <p className="mt-1 text-base text-[#64748b]">
            {order.orderDate} · {order.status}
          </p>
        </div>
        <div className="flex shrink-0 flex-col gap-1.5">
          {order.canConfirmReceive ? (
            <Button
              type="button"
              size="sm"
              className="border-[#db2777] bg-[#fce7f3] text-base text-[#9d174d] hover:bg-[#fbcfe8]"
              disabled={isConfirming}
              onClick={onConfirmReceive}
            >
              {isConfirming ? "처리 중..." : "상품수령"}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-[#93c5fd] bg-[#eff6ff] text-base text-brand hover:bg-[#dbeafe]"
            onClick={onView}
          >
            보기
          </Button>
        </div>
      </div>
    </article>
  );
}

function OrderStatusPanel({
  reloadToken = 0,
  onEditOrder,
}: {
  reloadToken?: number;
  onEditOrder?: (orderNumber: string) => void;
}) {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [viewingOrderNumber, setViewingOrderNumber] = useState<string | null>(
    null,
  );
  const [confirmingId, setConfirmingId] = useState<number | null>(null);

  const mapOrders = (
    data: Array<{
      id: number;
      orderNumber: string;
      status: string;
      createdAt: string;
      notes?: string | null;
      items?: Array<{ productName: string; quantity: number }>;
      shipment?: { fulfillmentType?: string | null } | null;
      greetingForms?: Array<{ id: number; linkedToOrder: boolean }>;
      user?: { fullname?: string | null } | null;
    }>,
  ): OrderRow[] =>
    data.map((order) => {
      const greetingKind = parseGreetingKindFromNotes(order.notes);
      const hasLinkedGreeting = (order.greetingForms ?? []).some(
        (form) => form.linkedToOrder,
      );
      let greetingLabel = greetingKind || "-";
      if (greetingKind === "본사" || hasLinkedGreeting) {
        greetingLabel = hasLinkedGreeting ? "연계" : greetingKind || "본사";
      }
      if (greetingKind === "자체") {
        greetingLabel = "자체";
      }
      if (greetingKind === "없음") {
        greetingLabel = "없음";
      }

      const orderDateFromNotes = parseOrderDateFromNotes(order.notes);
      const type = parseOrderTypeFromNotes(order.notes);
      const isDelivery = type === "배달" || type.startsWith("배달");

      return {
        id: order.id,
        orderNumber: order.orderNumber,
        name:
          parseOrdererFromNotes(order.notes) || order.user?.fullname || "-",
        type,
        greeting: greetingLabel,
        status: ORDER_STATUS_LABEL[order.status] ?? order.status,
        statusCode: order.status,
        productName: buildMemberOrderSummary(order.items),
        total: (order.items ?? []).reduce(
          (sum, item) => sum + (item.quantity || 0),
          0,
        ),
        orderDate:
          orderDateFromNotes || formatMemberOrderDate(order.createdAt),
        canConfirmReceive: false,
      };
    });

  useEffect(() => {
    let cancelled = false;

    const load = async (silent = false) => {
      if (!silent) {
        setIsLoading(true);
        setError("");
      }
      try {
        const response = await apiFetch("/api/orders");
        const data = (await response.json()) as
          | Array<{
              id: number;
              orderNumber: string;
              status: string;
              createdAt: string;
              notes?: string | null;
              items?: Array<{ productName: string; quantity: number }>;
              shipment?: { fulfillmentType?: string | null } | null;
              greetingForms?: Array<{ id: number; linkedToOrder: boolean }>;
              user?: { fullname?: string | null } | null;
            }>
          | { message?: string };

        if (!response.ok || !Array.isArray(data)) {
          throw new Error(
            !Array.isArray(data) && data.message
              ? data.message
              : "주문 목록을 불러오지 못했습니다.",
          );
        }
        if (cancelled) {
          return;
        }

        setOrders(
          mapOrders(data.filter((order) => order.status !== "CANCELLED")),
        );
      } catch (err) {
        if (!cancelled && !silent) {
          setError(
            err instanceof Error
              ? err.message
              : "주문 목록을 불러오지 못했습니다.",
          );
          setOrders([]);
        }
      } finally {
        if (!cancelled && !silent) {
          setIsLoading(false);
        }
      }
    };

    void load();
    const timer = window.setInterval(() => {
      void load(true);
    }, 4000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [reloadToken]);

  const handleConfirmReceive = async (orderId: number) => {
    if (confirmingId) {
      return;
    }
    setConfirmingId(orderId);
    try {
      const response = await apiFetch(
        `/api/orders/${orderId}/delivery-action`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "MEMBER_RECEIVE" }),
        },
      );
      const data = (await response.json()) as
        | { id: number; status: string; message?: string }
        | { message?: string };
      if (!response.ok) {
        throw new Error(
          data.message ?? "상품수령 처리에 실패했습니다.",
        );
      }
      setOrders((prev) =>
        prev.map((row) =>
          row.id === orderId
            ? {
                ...row,
                statusCode: "RECEIVED",
                status: ORDER_STATUS_LABEL.RECEIVED,
                canConfirmReceive: false,
              }
            : row,
        ),
      );
    } catch (err) {
      window.alert(
        err instanceof Error ? err.message : "상품수령 처리에 실패했습니다.",
      );
    } finally {
      setConfirmingId(null);
    }
  };

  const orderColumns: TableColumn<OrderRow>[] = [
    {
      key: "orderNumber",
      header: "접수번호",
      render: (row) => {
        const editable = canEditOrderStatus(row.statusCode);
        return (
          <span className="inline-flex flex-wrap items-center gap-1.5">
            {editable && onEditOrder ? (
              <button
                type="button"
                className="font-medium text-brand underline-offset-2 hover:underline"
                onClick={() => onEditOrder(row.orderNumber)}
              >
                {row.orderNumber}
              </button>
            ) : (
              <span>{row.orderNumber}</span>
            )}
          </span>
        );
      },
    },
    { key: "name", header: "성명" },
    { key: "type", header: "구분" },
    { key: "greeting", header: "인사장" },
    {
      key: "status",
      header: "상태",
      render: (row) => <StatusChip status={row.status} />,
    },
    {
      key: "productName",
      header: "상품명",
      className: "w-[28%]",
    },
    {
      key: "total",
      header: "수량",
      className: "text-right",
      render: (row) => `${row.total}개`,
    },
    { key: "orderDate", header: "주문일자" },
    {
      key: "action",
      header: "작업",
      render: (row) => (
        <div className="flex flex-wrap items-center justify-center gap-1.5">
          {row.canConfirmReceive ? (
            <Button
              size="sm"
              className="border-[#db2777] bg-[#fce7f3] text-[#9d174d] hover:bg-[#fbcfe8]"
              disabled={confirmingId === row.id}
              onClick={() => {
                void handleConfirmReceive(row.id);
              }}
            >
              {confirmingId === row.id ? "처리 중..." : "상품수령"}
            </Button>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setViewingOrderNumber(row.orderNumber)}
          >
            보기
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-3">
      {isLoading ? (
        <Panel title="내 주문 현황">
          <p className="text-sm text-muted-foreground">불러오는 중...</p>
        </Panel>
      ) : error ? (
        <Panel title="내 주문 현황">
          <p className="text-sm text-red">{error}</p>
        </Panel>
      ) : (
        <>
          <Panel title="내 주문 현황">
            <p className="text-sm text-[#64748b] min-[1040px]:text-lg">
              총 {orders.length}건
            </p>
          </Panel>

          <div className="max-h-[28rem] space-y-2.5 overflow-y-auto min-[1040px]:hidden">
            {orders.length === 0 ? (
              <p className="rounded-xl border border-line bg-white px-3.5 py-6 text-center text-lg text-muted-foreground">
                접수한 주문이 없습니다.
              </p>
            ) : (
              orders.map((order) => (
                <MemberMobileOrderCard
                  key={order.id}
                  order={order}
                  isConfirming={confirmingId === order.id}
                  onConfirmReceive={() => {
                    void handleConfirmReceive(order.id);
                  }}
                  onView={() => setViewingOrderNumber(order.orderNumber)}
                  onEdit={
                    onEditOrder
                      ? () => onEditOrder(order.orderNumber)
                      : undefined
                  }
                />
              ))
            )}
          </div>

          <Panel className="hidden min-[1040px]:block">
            <Table
              caption="내 주문 현황"
              columns={orderColumns}
              data={orders}
              emptyMessage="접수한 주문이 없습니다."
              scrollable
              visibleRows={10}
              rowHeightRem={3.5}
              className="text-lg"
            />
          </Panel>
        </>
      )}
      <OrderPrintPreviewModal
        open={Boolean(viewingOrderNumber)}
        orderNumber={viewingOrderNumber}
        onClose={() => setViewingOrderNumber(null)}
        showAdminDeliveryControls={false}
      />
    </div>
  );
}

export function OrderListInput({
  embedded = false,
  onNavigateToPrint,
  onDirtyChange,
  editOrderNumber = null,
  onEditComplete,
}: {
  /** When true, renders only the order form content (no member sidebar shell). */
  embedded?: boolean;
  /** After order 접수 완료 confirm (admin). */
  onNavigateToPrint?: (orderNumber?: string) => void;
  /** Admin leave-guard: reports whether the draft has unsaved input. */
  onDirtyChange?: (dirty: boolean) => void;
  /** Open form in edit mode for this order number. */
  editOrderNumber?: string | null;
  /** After edit save/cancel (admin returns to list). */
  onEditComplete?: () => void;
} = {}) {
  const [activeMenu, setActiveMenu] = useState<MemberNav>("새 주문서 작성");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [linkedProductNames, setLinkedProductNames] = useState<string[]>([]);
  const [greetingCustomer, setGreetingCustomer] = useState<{
    ordererName: string;
    phone: string;
    churchName: string;
    senderName: string;
    productSummary: string;
    productLines: Array<{ product: string; qty: number }>;
  } | null>(null);
  const [savedGreetingsByProduct, setSavedGreetingsByProduct] = useState<
    Record<string, GreetingDraft>
  >({});
  const [activeGreetingProduct, setActiveGreetingProduct] = useState<
    string | null
  >(null);
  const [hasUnsavedGreeting, setHasUnsavedGreeting] = useState(false);
  const [greetingWriteMode, setGreetingWriteMode] = useState(false);
  const [orderFormKey, setOrderFormKey] = useState(0);
  const [orderFormDirty, setOrderFormDirty] = useState(false);
  const [ordersReloadToken, setOrdersReloadToken] = useState(0);
  const [greetingReloadToken, setGreetingReloadToken] = useState(0);
  const [editingOrderNumber, setEditingOrderNumber] = useState<string | null>(
    editOrderNumber,
  );
  const preserveGreetingOnOrderNavRef = useRef(false);
  const [memberProfile, setMemberProfile] = useState<{
    name: string;
    churchName: string;
  }>({ name: "", churchName: "" });

  useEffect(() => {
    setEditingOrderNumber(editOrderNumber);
    if (editOrderNumber) {
      setActiveMenu("새 주문서 작성");
      setOrderFormKey((key) => key + 1);
    }
  }, [editOrderNumber]);

  useEffect(() => {
    onDirtyChange?.(
      orderFormDirty ||
        Object.keys(savedGreetingsByProduct).length > 0 ||
        hasUnsavedGreeting,
    );
  }, [orderFormDirty, savedGreetingsByProduct, hasUnsavedGreeting, onDirtyChange]);

  useEffect(() => {
    if (embedded) {
      return;
    }

    let cancelled = false;
    const auth = getAuthUser();
    if (auth?.name) {
      setMemberProfile((prev) => ({ ...prev, name: auth.name }));
    }

    const loadProfile = async () => {
      try {
        const response = await apiFetch("/api/auth/me");
        const data = (await response.json()) as {
          user?: {
            name?: string;
            church?: { name?: string | null } | null;
          };
        };
        if (!response.ok || cancelled) {
          return;
        }
        setMemberProfile({
          name: data.user?.name?.trim() || auth?.name || "",
          churchName: data.user?.church?.name?.trim() || "",
        });
      } catch {
        // Keep session name if /me fails.
      }
    };

    void loadProfile();
    return () => {
      cancelled = true;
    };
  }, [embedded]);

  const handleHydratedGreetings = useCallback(
    (drafts: Record<string, GreetingDraft>) => {
      setSavedGreetingsByProduct(drafts);
      setHasUnsavedGreeting(false);
    },
    [],
  );

  const clearLinkedGreeting = () => {
    setSavedGreetingsByProduct({});
    setActiveGreetingProduct(null);
    setHasUnsavedGreeting(false);
    setLinkedProductNames([]);
    setGreetingCustomer(null);
    setGreetingWriteMode(false);
  };

  const discardOrderDraftAndGo = (menu: MemberNav) => {
    clearLinkedGreeting();
    setOrderFormDirty(false);
    setEditingOrderNumber(null);
    setOrderFormKey((key) => key + 1);
    setActiveMenu(menu);
    setIsMobileMenuOpen(false);
  };

  const handleStartEditOrder = (orderNumber: string) => {
    if (
      (orderFormDirty ||
        Object.keys(savedGreetingsByProduct).length > 0 ||
        hasUnsavedGreeting) &&
      !window.confirm(
        "작성 중인 내용이 있습니다. 주문서 수정으로 이동하시겠습니까?",
      )
    ) {
      return;
    }
    clearLinkedGreeting();
    setOrderFormDirty(false);
    setEditingOrderNumber(orderNumber);
    setOrderFormKey((key) => key + 1);
    setActiveMenu("새 주문서 작성");
    setIsMobileMenuOpen(false);
  };

  const handleEditOrCreateComplete = (orderNumber?: string) => {
    clearLinkedGreeting();
    setOrderFormDirty(false);
    const wasEditing = Boolean(editingOrderNumber);
    setEditingOrderNumber(null);
    setOrderFormKey((key) => key + 1);
    if (embedded) {
      if (wasEditing) {
        onEditComplete?.();
        return;
      }
      onNavigateToPrint?.(orderNumber);
      return;
    }
    setOrdersReloadToken((token) => token + 1);
    setActiveMenu("내 주문 현황");
    setIsMobileMenuOpen(false);
  };

  const handleMenuChange = (menu: MemberNav) => {
    if (menu === activeMenu) {
      setIsMobileMenuOpen(false);
      return;
    }

    const leavingOrderDraft =
      activeMenu === "새 주문서 작성" ||
      (activeMenu === "인사장관리" && greetingWriteMode);

    if (
      leavingOrderDraft &&
      menu !== "새 주문서 작성" &&
      (orderFormDirty ||
        Object.keys(savedGreetingsByProduct).length > 0 ||
        hasUnsavedGreeting)
    ) {
      const confirmed = window.confirm(
        "주문서를 벗어나면 데이터가 소실됩니다. 주문서 작성을 먼저 완료해주세요.\n\n그래도 다른 메뉴로 이동하시겠습니까?",
      );
      if (!confirmed) {
        setIsMobileMenuOpen(false);
        return;
      }
      discardOrderDraftAndGo(menu);
      return;
    }

    if (menu === "인사장관리") {
      setGreetingWriteMode(false);
    }
    if (menu === "새 주문서 작성") {
      if (preserveGreetingOnOrderNavRef.current) {
        preserveGreetingOnOrderNavRef.current = false;
      } else if (activeMenu !== "새 주문서 작성") {
        clearLinkedGreeting();
        setEditingOrderNumber(null);
        setOrderFormDirty(false);
        setOrderFormKey((key) => key + 1);
      }
    } else if (menu !== "인사장관리") {
      setEditingOrderNumber(null);
    }
    setActiveMenu(menu);
    setIsMobileMenuOpen(false);
  };

  const pageMeta = editingOrderNumber
    ? {
        title: "주문서 수정",
        description: "주문 내용을 수정한 뒤 변경내용접수로 저장합니다.",
      }
    : PAGE_META[activeMenu];

  const renderHeaderActions = () => {
    switch (activeMenu) {
      case "새 주문서 작성":
        return null;
      case "인사장관리":
        return null;
      case "내 주문 현황":
        return null;
    }
  };

  const renderContent = () => {
    switch (activeMenu) {
      case "새 주문서 작성":
      case "인사장관리":
        return (
          <>
            <div className={activeMenu === "새 주문서 작성" ? "block" : "hidden"}>
              <ProductOrderPanel
                key={orderFormKey}
                blankCustomerFields={embedded}
                openStockOnly={!embedded}
                hasUnsavedGreeting={hasUnsavedGreeting}
                savedGreetingsByProduct={savedGreetingsByProduct}
                editOrderNumber={editingOrderNumber}
                onUnsavedGreetingResolved={() => setHasUnsavedGreeting(false)}
                onDirtyChange={setOrderFormDirty}
                onOrderAccepted={handleEditOrCreateComplete}
                onHydratedGreetings={handleHydratedGreetings}
                onGreetingClick={({
                  productNames,
                  ordererName,
                  phone,
                  churchName,
                  senderName,
                  productSummary,
                  productLines,
                  targetProduct,
                }) => {
                  setLinkedProductNames(productNames);
                  setActiveGreetingProduct(targetProduct);
                  setGreetingCustomer({
                    ordererName,
                    phone,
                    churchName,
                    senderName,
                    productSummary,
                    productLines,
                  });
                  setGreetingWriteMode(true);
                  setActiveMenu("인사장관리");
                  setIsMobileMenuOpen(false);
                }}
              />
            </div>
            <div className={activeMenu === "인사장관리" ? "block" : "hidden"}>
              {greetingWriteMode ? (
                <GreetingPanel
                  linkedProductNames={linkedProductNames}
                  customerInfo={greetingCustomer ?? undefined}
                  initialDraft={
                    activeGreetingProduct
                      ? (savedGreetingsByProduct[activeGreetingProduct] ?? null)
                      : null
                  }
                  onBackToOrder={() => {
                    preserveGreetingOnOrderNavRef.current = true;
                    setGreetingWriteMode(false);
                    handleMenuChange("새 주문서 작성");
                  }}
                  onDirtyChange={setHasUnsavedGreeting}
                  onSave={(draft) => {
                    const key =
                      draft.productName.trim() ||
                      activeGreetingProduct ||
                      linkedProductNames[0] ||
                      "인사장";
                    setSavedGreetingsByProduct((current) => ({
                      ...current,
                      [key]: { ...draft, productName: key },
                    }));
                    setActiveGreetingProduct(key);
                    setHasUnsavedGreeting(false);
                    setGreetingReloadToken((token) => token + 1);
                  }}
                />
              ) : (
                <MemberGreetingMng reloadToken={greetingReloadToken} />
              )}
            </div>
          </>
        );
      case "내 주문 현황":
        return (
          <OrderStatusPanel
            reloadToken={ordersReloadToken}
            onEditOrder={handleStartEditOrder}
          />
        );
    }
  };

  const content = (
    <>
      {!embedded ? (
        <div className="mb-3.5 flex flex-col gap-3 min-[1100px]:flex-row min-[1100px]:items-start min-[1100px]:justify-between">
          <div>
            <h3 className="text-[22px] font-semibold text-ink">{pageMeta.title}</h3>
            <p className="mt-1 text-[13px] text-muted-foreground">
              {pageMeta.description}
            </p>
          </div>

          {renderHeaderActions() ? (
            <div className="flex flex-wrap gap-2">{renderHeaderActions()}</div>
          ) : null}
        </div>
      ) : null}

      <div className="w-full">{renderContent()}</div>
    </>
  );

  if (embedded) {
    return content;
  }

  return (
    <div className="grid min-h-[730px] grid-cols-1 overflow-hidden rounded-[10px] border border-[#cbd3df] bg-white min-[1040px]:grid-cols-[200px_1fr]">
      <MemberSidebar
        activeMenu={activeMenu}
        onMenuChange={handleMenuChange}
        churchName={memberProfile.churchName}
        memberName={memberProfile.name}
      />

      <section className="bg-[#f7f9fc] p-4">
        <MobileMemberHeader
          activeMenu={activeMenu}
          isOpen={isMobileMenuOpen}
          onToggle={() => setIsMobileMenuOpen((open) => !open)}
          onMenuChange={handleMenuChange}
          churchName={memberProfile.churchName}
          memberName={memberProfile.name}
        />

        {content}
      </section>
    </div>
  );
}

export default OrderListInput;
