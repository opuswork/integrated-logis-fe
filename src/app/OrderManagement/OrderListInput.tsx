"use client";

import { Menu, Plus, Trash2, X } from "lucide-react";
import {
  useRef,
  useState,
  useEffect,
  useMemo,
  useCallback,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import { OrderPrintPreviewModal } from "@/app/admin/OrderManagement/OrderPrintPreview";
import { MemberGreetingMng } from "@/app/OrderManagement/MemberGreetingMng";
import { MemberPartnerMng } from "@/app/OrderManagement/MemberPartnerMng";
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
import { MdCalendarPicker } from "@/components/ui/md-calendar-picker";
import { Spinner } from "@/components/ui/spinner";
import { Table, type TableColumn } from "@/components/ui/table";
import { apiFetch } from "@/lib/api";
import { getAccessToken, getAuthUser } from "@/lib/auth";
import { formatMonthDay } from "@/lib/date-format";
import { openDaumPostcode } from "@/lib/daum-postcode";
import { API_BASE_URL } from "@/lib/env";
import {
  parseBranchStoreFromNotes,
  parseChurchFromNotes,
  parseDeliveryCompanyFromNotes,
  parseDeliveryDateTimeFromNotes,
  isGreetingCatalogNumber,
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
  splitAddressAndDetail,
} from "@/lib/order-notes";
import {
  canEditOrderStatus,
} from "@/lib/order-delivery";
import { cn } from "@/lib/utils";

const MEMBER_NAV = [
  "새 주문서 작성",
  "인사장관리",
  "내 주문 현황",
  "거래처관리",
] as const;
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
  { value: "parcel", label: "택배" },
  { value: "delivery", label: "배달" },
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
  /** 배달 주문 섹션: 박스 vs 선물세트(개). 택배는 giftUnit로 둠 */
  lineSection: "box" | "giftUnit";
}

function orderKindLabel(kind: OrderType) {
  return kind === "delivery" ? "배달" : "택배";
}

function isGiftSetCategory(category: string) {
  const normalized = category.replace(/\s+/g, "");
  return normalized === "선물세트" || normalized === "선물셋트";
}

/** 품명에 '박스' 포함 → ① 박스상품 */
function isBoxProduct(productName: string) {
  return productName.includes("박스");
}

/** 선물세트 + (개) → ② 선물세트 낱개 (박스는 ① 우선) */
function isGiftUnitProduct(
  category: string,
  productName: string,
  spec?: string | null,
) {
  if (isBoxProduct(productName)) {
    return false;
  }
  return (
    isGiftSetCategory(category) &&
    (productName.includes("(개)") || (spec ?? "").includes("(개)"))
  );
}

function inferLineSection(productName: string): "box" | "giftUnit" {
  return isBoxProduct(productName) ? "box" : "giftUnit";
}

/** 선물세트 + 품명에 '박스' 포함 → 배달 전용 (택배 목록에서 제외) */
function isDeliveryOnlyProduct(category: string, productName: string) {
  return isGiftSetCategory(category) && productName.includes("박스");
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
    title: "제품주문서 (신규작성)",
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
  거래처관리: {
    title: "거래처관리",
    description: "자주 쓰는 거래처를 등록하면 제품주문서에 자동 입력됩니다.",
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
    <div className="space-y-2">
      <div className="flex rounded-lg bg-[#EDF2F7] p-[3px]">
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
                "flex-1 rounded-md px-2 py-2.5 text-[13px] font-bold transition-colors",
                selected
                  ? "bg-[#1A365D] text-white"
                  : disabled
                    ? "cursor-not-allowed text-[#A0AEC0]"
                    : "bg-transparent text-[#64748B] hover:text-[#1A202C]",
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      {locked ? (
        <div className="flex justify-end">
          <Button type="button" variant="outline" size="sm" onClick={onReset}>
            폼초기화
          </Button>
        </div>
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
  greetingNumber: (typeof GREETING_NUMBERS)[number] | "";
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
    draft.greetingNumber ? `인사장번호:${draft.greetingNumber}` : null,
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

/** 동일적용·접수 시 id 없는 draft를 서버 인사장으로 복제 */
async function createGreetingFormFromDraft(
  draft: GreetingDraft,
  productName: string,
  customer?: {
    ordererName?: string;
    churchName?: string;
    phone?: string;
  },
): Promise<GreetingDraft> {
  const auth = getAuthUser();
  const formData = new FormData();
  formData.append("greetingNumber", draft.greetingNumber);
  formData.append("includeSelf", String(draft.includeSelf));
  formData.append(
    "businessCard",
    draft.businessCard || BUSINESS_CARD_DEFAULT,
  );
  formData.append("content", draft.greetingContent.trim());
  formData.append("quantity", draft.quantity.trim() || "1");
  formData.append("size", draft.greetingSize);
  formData.append("receivePlace", draft.receivePlace.trim());
  formData.append("linkedToOrder", "true");
  formData.append("submitted", "false");
  formData.append("productName", productName.trim());
  if (draft.specialNote.trim()) {
    formData.append("specialNote", draft.specialNote.trim());
  }
  if (customer?.ordererName?.trim()) {
    formData.append("ordererName", customer.ordererName.trim());
  }
  if (customer?.churchName?.trim()) {
    formData.append("churchName", customer.churchName.trim());
  }
  if (customer?.phone?.trim()) {
    formData.append("phone", customer.phone.trim());
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
    throw new Error(message || "인사장 복제에 실패하였습니다.");
  }
  const created = (await response.json()) as {
    id: number;
    imageUrl?: string;
  };
  return {
    ...draft,
    productName,
    imageNumbers: [...draft.imageNumbers],
    id: created.id,
    imageUrl: created.imageUrl ?? draft.imageUrl,
  };
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
  const catalogNumber = GREETING_NUMBERS.find(
    (value) => value === String(form.greetingNumber).trim(),
  );
  const greetingNumber = catalogNumber ?? "";
  const greetingSize = GREETING_SIZES.find(
    (value) => value === String(form.size ?? "").trim(),
  );
  const includeSelf = Boolean(form.includeSelf);
  const includeCard = form.businessCard === BUSINESS_CARD_INCLUDED;
  if ((!greetingNumber && !includeSelf && !includeCard) || !greetingSize) {
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
    includeSelf,
    businessCard,
    greetingSize,
    greetingContent: form.content?.trim() ?? "",
    quantity: form.quantity != null ? String(form.quantity) : "",
    productName: form.productName?.trim() ?? "",
    receivePlace: form.receivePlace?.trim() || GREETING_RECEIVE_PLACE_PLACEHOLDER,
    specialNote: form.specialNote?.trim() ?? "",
    imageNumbers: greetingNumber ? [greetingNumber] : [],
    imageUrl: form.imageUrl?.trim() || undefined,
  };
}

function validateGreetingForm({
  greetingNumber,
  includeSelf,
  greetingContent,
  quantity,
  greetingSize,
  receivePlace,
  businessCard,
}: {
  greetingNumber: string;
  includeSelf: boolean;
  greetingContent: string;
  quantity: string;
  greetingSize: string;
  receivePlace: string;
  businessCard: string;
}) {
  const hasCatalog = isGreetingCatalogNumber(greetingNumber);
  const includeCard = businessCard === BUSINESS_CARD_INCLUDED;
  if (!hasCatalog && !includeSelf && !includeCard) {
    return "인사장번호, 자체, 명함 중 하나 이상을 선택해 주세요.";
  }
  if (hasCatalog && !greetingContent.trim()) {
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
    (typeof GREETING_NUMBERS)[number] | ""
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

        const number = GREETING_NUMBERS.includes(
          data.greetingNumber as (typeof GREETING_NUMBERS)[number],
        )
          ? (data.greetingNumber as (typeof GREETING_NUMBERS)[number])
          : "";

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

  const catalogImageUrl = greetingNumber
    ? GREETING_PREVIEW_IMAGE[greetingNumber]
    : undefined;

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
    imageNumbers: greetingNumber ? [greetingNumber] : [],
    imageUrl: imageUrl || savedImageUrl || catalogImageUrl || initialDraft?.imageUrl,
  });

  const runRequiredValidation = () => {
    const error = validateGreetingForm({
      greetingNumber,
      includeSelf: includeSelfGreeting,
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
        value={greetingNumber || null}
        onChange={(value) => {
          setGreetingNumber(value ?? "");
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
          label={
            isGreetingCatalogNumber(greetingNumber)
              ? "인사장내용 *"
              : "인사장내용"
          }
          value={greetingContent}
          onChange={(event) => {
            setGreetingContent(event.target.value);
            markDirty();
          }}
          placeholder={
            isGreetingCatalogNumber(greetingNumber)
              ? "인사장 문구"
              : "자체·명함만 선택하면 생략할 수 있습니다"
          }
          required={isGreetingCatalogNumber(greetingNumber)}
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
  mode = "all",
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
      lineSection: "box" | "giftUnit";
    }>,
  ) => void;
  defaultOrderKind: OrderType;
  /** 개인회원 제품주문서: openStock=true 상품만 */
  openStockOnly?: boolean;
  /** all=택배 통합 / box=①박스 / giftUnit=②선물세트(개) */
  mode?: "all" | "box" | "giftUnit";
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
      setKeyword("");
      setCategoryFilter("all");

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
      if (mode === "box") {
        if (!isBoxProduct(item.productName)) {
          return false;
        }
      } else if (mode === "giftUnit") {
        if (
          !isGiftUnitProduct(item.category, item.productName, item.spec)
        ) {
          return false;
        }
      } else if (
        defaultOrderKind === "parcel" &&
        isDeliveryOnlyProduct(item.category, item.productName)
      ) {
        // 택배 통합: 배달 전용(선물세트 박스) 제외
        return false;
      }

      if (mode === "all" && categoryFilter !== "all" && item.category !== categoryFilter) {
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
  }, [catalog, keyword, categoryFilter, defaultOrderKind, mode]);

  const selectedItems = useMemo(() => {
    return catalog
      .filter((item) => (quantities[item.id] ?? 0) > 0)
      .map((item) => {
        const deliveryOnly = isDeliveryOnlyProduct(
          item.category,
          item.productName,
        );
        const lineSection: "box" | "giftUnit" =
          mode === "box"
            ? "box"
            : mode === "giftUnit"
              ? "giftUnit"
              : inferLineSection(item.productName);
        return {
          product: item.productName,
          qty: quantities[item.id] ?? 0,
          note: "",
          unitPrice: item.wholesalePrice,
          deliveryOnly,
          lineSection,
        };
      });
  }, [catalog, quantities, mode]);

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

  const dialogTitle =
    mode === "box"
      ? "박스상품 추가"
      : mode === "giftUnit"
        ? "선물세트 낱개 추가"
        : "상품 추가";

  return (
    <Dialog
      open={open}
      title={dialogTitle}
      onClose={onClose}
      className="max-w-lg"
    >
      <div className="space-y-3">
        <p className="text-sm text-[#64748b]">
          주문종류:{" "}
          <span className="font-semibold text-ink">
            {orderKindLabel(defaultOrderKind)}
          </span>{" "}
          {mode === "box"
            ? "· 박스 상품만 표시"
            : mode === "giftUnit"
              ? "· 선물세트 (개)만 표시"
              : "(현재 배달/택배 탭 기준)"}
        </p>

        <div
          className={cn(
            "grid gap-2",
            mode === "all" ? "min-[480px]:grid-cols-[140px_1fr]" : "",
          )}
        >
          {mode === "all" ? (
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
          ) : null}
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

function nextSuggestIndex(current: number, delta: 1 | -1, count: number) {
  if (count <= 0) {
    return -1;
  }
  if (current < 0) {
    return delta === 1 ? 0 : count - 1;
  }
  return (current + delta + count) % count;
}

function handleSuggestListKeyDown<T>(
  event: KeyboardEvent<HTMLInputElement>,
  options: {
    isOpen: boolean;
    items: T[];
    highlightIndex: number;
    setHighlightIndex: (index: number) => void;
    onSelect: (item: T) => void;
    onClose: () => void;
  },
) {
  const { isOpen, items, highlightIndex, setHighlightIndex, onSelect, onClose } =
    options;
  if (!isOpen || items.length === 0) {
    if (event.key === "Escape") {
      onClose();
    }
    return;
  }
  if (event.key === "ArrowDown") {
    event.preventDefault();
    setHighlightIndex(nextSuggestIndex(highlightIndex, 1, items.length));
    return;
  }
  if (event.key === "ArrowUp") {
    event.preventDefault();
    setHighlightIndex(nextSuggestIndex(highlightIndex, -1, items.length));
    return;
  }
  if (event.key === "Enter" && highlightIndex >= 0 && items[highlightIndex]) {
    event.preventDefault();
    onSelect(items[highlightIndex]);
    return;
  }
  if (event.key === "Escape") {
    event.preventDefault();
    onClose();
  }
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
  const [highlightIndex, setHighlightIndex] = useState(-1);
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

  useEffect(() => {
    setHighlightIndex(-1);
  }, [query, isOpen]);

  useEffect(() => {
    if (highlightIndex < 0) {
      return;
    }
    const row = containerRef.current?.querySelector(
      `[data-suggest-index="${highlightIndex}"]`,
    );
    row?.scrollIntoView({ block: "nearest" });
  }, [highlightIndex]);

  const selectChurch = (church: ChurchOption) => {
    onSelect(church);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <label
        htmlFor="order-church"
        className="mb-[5px] block text-[12px] font-bold text-[#64748B]"
      >
        중앙 *
      </label>
      <input
        id="order-church"
        type="text"
        role="combobox"
        aria-expanded={isOpen}
        aria-controls="order-church-suggestions"
        aria-autocomplete="list"
        aria-activedescendant={
          highlightIndex >= 0
            ? `order-church-option-${highlightIndex}`
            : undefined
        }
        value={query}
        readOnly={readOnly}
        onChange={(event) => {
          if (readOnly) {
            return;
          }
          onQueryChange(event.target.value);
          setIsOpen(true);
        }}
        onKeyDown={(event) => {
          if (readOnly) {
            return;
          }
          handleSuggestListKeyDown(event, {
            isOpen,
            items: filtered,
            highlightIndex,
            setHighlightIndex,
            onSelect: selectChurch,
            onClose: () => setIsOpen(false),
          });
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
          "mb-0 w-full rounded-lg border border-[#E2E8F0] bg-white px-[11px] py-[9px] text-[13px] text-[#1A202C]",
          "placeholder:text-[#A0AEC0] focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20",
          readOnly && "cursor-default bg-[#EDF2F7]",
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
            filtered.map((church, index) => {
              const selected = selectedId === church.id;
              const highlighted = highlightIndex === index;
              return (
                <li
                  key={church.id}
                  id={`order-church-option-${index}`}
                  role="option"
                  aria-selected={selected || highlighted}
                  data-suggest-index={index}
                >
                  <button
                    type="button"
                    tabIndex={-1}
                    className={cn(
                      "flex w-full flex-col items-start gap-0.5 px-3 py-2.5 text-left hover:bg-[#eff6ff]",
                      selected || highlighted ? "bg-[#eff6ff]" : "bg-white",
                    )}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => selectChurch(church)}
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

type PartnerSuggest = {
  id: number;
  name: string;
  contactName: string;
  phone: string;
  address: string;
  email: string | null;
};

function DeliveryCompanyField({
  value,
  onChange,
  onSelectPartner,
  inputClassName,
  listId = "delivery-partner-suggestions",
}: {
  value: string;
  onChange: (value: string) => void;
  onSelectPartner: (partner: PartnerSuggest) => void;
  inputClassName: string;
  listId?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const [suggestions, setSuggestions] = useState<PartnerSuggest[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const q = value.trim();
    if (q.length < 1) {
      setSuggestions([]);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      setLoading(true);
      void apiFetch(`/api/partners?q=${encodeURIComponent(q)}`)
        .then(async (res) => {
          const data = (await res.json()) as
            | PartnerSuggest[]
            | { message?: string };
          if (cancelled) return;
          if (!res.ok || !Array.isArray(data)) {
            setSuggestions([]);
            return;
          }
          setSuggestions(data);
        })
        .catch(() => {
          if (!cancelled) setSuggestions([]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [value]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  useEffect(() => {
    setHighlightIndex(-1);
  }, [value, isOpen]);

  useEffect(() => {
    if (highlightIndex < 0) {
      return;
    }
    const row = containerRef.current?.querySelector(
      `[data-suggest-index="${highlightIndex}"]`,
    );
    row?.scrollIntoView({ block: "nearest" });
  }, [highlightIndex]);

  const selectPartner = (partner: PartnerSuggest) => {
    onSelectPartner(partner);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <input
        type="text"
        role="combobox"
        aria-expanded={isOpen}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={
          highlightIndex >= 0 ? `${listId}-option-${highlightIndex}` : undefined
        }
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setIsOpen(true);
        }}
        onKeyDown={(event) =>
          handleSuggestListKeyDown(event, {
            isOpen: isOpen && value.trim().length > 0,
            items: suggestions,
            highlightIndex,
            setHighlightIndex,
            onSelect: selectPartner,
            onClose: () => setIsOpen(false),
          })
        }
        onFocus={() => setIsOpen(true)}
        placeholder="업체명 (등록 거래처 자동완성)"
        autoComplete="off"
        required
        className={inputClassName}
      />
      {isOpen && value.trim() ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-[7px] border border-line bg-white shadow-lg"
        >
          {loading ? (
            <li className="px-3 py-2.5 text-sm text-[#64748b]">검색 중...</li>
          ) : suggestions.length === 0 ? (
            <li className="px-3 py-2.5 text-sm text-[#64748b]">
              일치하는 거래처가 없습니다.
            </li>
          ) : (
            suggestions.map((partner, index) => (
              <li
                key={partner.id}
                id={`${listId}-option-${index}`}
                role="option"
                aria-selected={highlightIndex === index}
                data-suggest-index={index}
              >
                <button
                  type="button"
                  tabIndex={-1}
                  className={cn(
                    "flex w-full flex-col items-start gap-0.5 px-3 py-2.5 text-left hover:bg-[#eff6ff]",
                    highlightIndex === index ? "bg-[#eff6ff]" : "bg-white",
                  )}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => selectPartner(partner)}
                >
                  <span className="text-sm font-semibold text-ink">
                    {partner.name}
                  </span>
                  <span className="text-xs text-[#64748b]">
                    {partner.contactName} · {partner.phone}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}

type MemberSuggest = {
  id: number;
  fullname: string;
  phone: string;
  churchId: number | null;
  churchName: string;
};

/** 관리자 대리작성 전용: 이름 일부로 기존 회원을 찾아 연락처·중앙까지 채웁니다. */
function OrdererNameField({
  value,
  onChange,
  onSelectMember,
  inputClassName,
}: {
  value: string;
  onChange: (value: string) => void;
  onSelectMember: (member: MemberSuggest) => void;
  inputClassName: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const [suggestions, setSuggestions] = useState<MemberSuggest[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const q = value.trim();
    if (q.length < 1) {
      setSuggestions([]);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      setLoading(true);
      void apiFetch(`/api/members/search?q=${encodeURIComponent(q)}`)
        .then(async (res) => {
          const data = (await res.json()) as
            | MemberSuggest[]
            | { message?: string };
          if (cancelled) return;
          if (!res.ok || !Array.isArray(data)) {
            setSuggestions([]);
            return;
          }
          setSuggestions(data);
        })
        .catch(() => {
          if (!cancelled) setSuggestions([]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [value]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  useEffect(() => {
    setHighlightIndex(-1);
  }, [value, isOpen]);

  useEffect(() => {
    if (highlightIndex < 0) {
      return;
    }
    const row = containerRef.current?.querySelector(
      `[data-suggest-index="${highlightIndex}"]`,
    );
    row?.scrollIntoView({ block: "nearest" });
  }, [highlightIndex]);

  const selectMember = (member: MemberSuggest) => {
    onSelectMember(member);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <input
        type="text"
        role="combobox"
        aria-expanded={isOpen}
        aria-controls="orderer-member-suggestions"
        aria-autocomplete="list"
        aria-activedescendant={
          highlightIndex >= 0
            ? `orderer-member-option-${highlightIndex}`
            : undefined
        }
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setIsOpen(true);
        }}
        onKeyDown={(event) =>
          handleSuggestListKeyDown(event, {
            isOpen: isOpen && value.trim().length > 0,
            items: suggestions,
            highlightIndex,
            setHighlightIndex,
            onSelect: selectMember,
            onClose: () => setIsOpen(false),
          })
        }
        onFocus={() => setIsOpen(true)}
        placeholder="고객 성명 (등록 회원 자동완성)"
        autoComplete="off"
        required
        className={inputClassName}
      />
      {isOpen && value.trim() ? (
        <ul
          id="orderer-member-suggestions"
          role="listbox"
          className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-[7px] border border-line bg-white shadow-lg"
        >
          {loading ? (
            <li className="px-3 py-2.5 text-sm text-[#64748b]">검색 중...</li>
          ) : suggestions.length === 0 ? (
            <li className="px-3 py-2.5 text-sm text-[#64748b]">
              일치하는 회원이 없습니다. 입력한 정보로 새 주문자 계정이
              생성됩니다.
            </li>
          ) : (
            suggestions.map((member, index) => (
              <li
                key={member.id}
                id={`orderer-member-option-${index}`}
                role="option"
                aria-selected={highlightIndex === index}
                data-suggest-index={index}
              >
                <button
                  type="button"
                  tabIndex={-1}
                  className={cn(
                    "flex w-full flex-col items-start gap-0.5 px-3 py-2.5 text-left hover:bg-[#eff6ff]",
                    highlightIndex === index ? "bg-[#eff6ff]" : "bg-white",
                  )}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => selectMember(member)}
                >
                  <span className="text-sm font-semibold text-ink">
                    {member.fullname}
                  </span>
                  <span className="text-xs text-[#64748b]">
                    {[member.churchName, member.phone]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
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
  locked = false,
  labelExtra,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  detailValue: string;
  onDetailChange: (value: string) => void;
  required?: boolean;
  /** true면 주소 검색·상세주소 수정을 막습니다 (보내는 주소와 같음). */
  locked?: boolean;
  labelExtra?: ReactNode;
}) {
  const [isSearching, setIsSearching] = useState(false);
  const detailId = `${id}-detail`;
  const omLabelClass = "mb-[5px] block text-[12px] font-bold text-[#64748B]";

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
        <div className="mb-[5px] flex items-center justify-between gap-2">
          <label htmlFor={id} className="block text-[12px] font-bold text-[#64748B]">
            {required ? <RequiredLabel>{label}</RequiredLabel> : label}
          </label>
          {labelExtra}
        </div>
        <div className="flex gap-2">
          <input
            id={id}
            type="text"
            required={required}
            readOnly
            value={value}
            placeholder="주소 검색 버튼으로 입력해 주세요"
            className="mb-0 min-h-9 w-full cursor-default rounded-lg border border-[#E2E8F0] bg-[#f8fafc] px-[11px] py-[9px] text-[13px] text-[#1A202C] placeholder:text-[#A0AEC0] focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
          />
          <Button
            type="button"
            className="shrink-0 border-[#1f2937] bg-[#1f2937] px-4 text-white hover:bg-[#111827]"
            disabled={isSearching || locked}
            onClick={() => {
              void handleSearch();
            }}
          >
            {isSearching ? "검색 중" : "주소 검색"}
          </Button>
        </div>
      </div>
      <div>
        <label htmlFor={detailId} className={omLabelClass}>
          상세주소
        </label>
        <input
          id={detailId}
          type="text"
          value={detailValue}
          onChange={(event) => onDetailChange(event.target.value)}
          placeholder="동·호수 / 호실 (예: 101동 1203호)"
          disabled={!value.trim() || locked}
          className="mb-3 w-full rounded-lg border border-[#E2E8F0] bg-white px-[11px] py-[9px] text-[13px] text-[#1A202C] placeholder:text-[#A0AEC0] disabled:bg-[#EDF2F7] disabled:text-[#A0AEC0]"
        />
      </div>
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
  onApplyGreetingToAll,
  onRemoveGreeting,
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
  /** After 접수하기 / 변경내용접수 / 취소 confirm / 주문서닫기 — e.g. go to list. */
  onOrderAccepted?: (orderNumber?: string) => void;
  /** Called when draft content changes (for leave-guard). */
  onDirtyChange?: (dirty: boolean) => void;
  /** When set, load existing order and submit via PATCH. */
  editOrderNumber?: string | null;
  /** Edit hydrate: restore linked greeting drafts into parent state. */
  onHydratedGreetings?: (drafts: Record<string, GreetingDraft>) => void;
  /** 인사장주문 동일적용 — 대상 상품명 목록에 기준 인사장 복제(서버 id 포함) */
  onApplyGreetingToAll?: (
    productNames: string[],
    customer: {
      ordererName: string;
      churchName: string;
      phone: string;
    },
  ) => void | Promise<void>;
  /** 행 인사장 로컬 제거(서버 DELETE 없음) */
  onRemoveGreeting?: (productName: string) => void;
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
  const [productDialogMode, setProductDialogMode] = useState<
    "all" | "box" | "giftUnit"
  >("all");
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
  const [deliveryAmPm, setDeliveryAmPm] = useState<"" | "오전" | "오후">("");
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
  const [sameAsSenderAddress, setSameAsSenderAddress] = useState(false);
  const [branchStore, setBranchStore] = useState<BranchStoreId | null>(null);
  const [extraNote, setExtraNote] = useState("");
  const [isDirector, setIsDirector] = useState<boolean>(false);
  /** 관리자 대리작성에서 자동완성으로 고른 기존 회원. null이면 신규 주문자 */
  const [selectedMemberId, setSelectedMemberId] = useState<number | null>(null);
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
    kind: "accept" | "cancel" | "fail";
  }>({ open: false, success: false, kind: "fail" });
  const [acceptedOrderNumber, setAcceptedOrderNumber] = useState<string | null>(
    null,
  );
  const isDesktop = useMinWidth(1040);
  const isWideProductList = useMinWidth(500);
  const isDelivery = orderType === "delivery";
  const memberFieldsReadOnly = !blankCustomerFields;
  /** 관리자 신규작성에서만 주문자 자동완성 (수정 모드는 소유자 변경 방지) */
  const ordererAutocomplete = blankCustomerFields && !isEditMode;
  const displayOrdererName =
    isDirector === true
      ? `${ordererName.trim()}${ordererName.trim().endsWith("관") ? "" : "관"}`
      : ordererName.trim().endsWith("관")
        ? ordererName.trim().slice(0, -1)
        : ordererName.trim();
  const savedGreetingCount = Object.values(savedGreetingsByProduct).filter(
    (draft) => Boolean(draft?.id || draft?.greetingContent?.trim()),
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
      Boolean(deliveryAmPm) ||
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
      Boolean(extraNote.trim()) ||
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
    deliveryAmPm,
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
    extraNote,
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
              extraNote?: string | null;
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
        setExtraNote(order.extraNote ?? "");

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
          const parts = deliveryDt.split(/\s+/).filter(Boolean);
          setDeliveryDate(parts[0]?.slice(0, 10) ?? "");
          if (parts[1] === "오전" || parts[1] === "오후") {
            setDeliveryAmPm(parts[1]);
            setDeliveryTime(parts[2]?.slice(0, 5) ?? "");
          } else {
            setDeliveryAmPm("");
            setDeliveryTime(parts[1]?.slice(0, 5) ?? "");
          }
        } else if (order.shipment?.estimatedWindow && isDeliveryOrder) {
          const iso = order.shipment.estimatedWindow;
          setDeliveryDate(iso.slice(0, 10));
          setDeliveryAmPm("");
          setDeliveryTime(iso.slice(11, 16));
        }

        const shipDate = parseShipDateFromNotes(notes);
        if (shipDate && !isDeliveryOrder) {
          setParcelShipDate(shipDate.slice(0, 10));
        }

        const recipient = parseRecipientPartsFromNotes(notes);
        const recipientFull =
          recipient.address || order.shipment?.deliveryAddress || "";
        const recipientSplit = splitAddressAndDetail(recipientFull);
        setRecipientName(recipient.name);
        setRecipientPhone(formatPhoneInput(recipient.phone));
        setRecipientAddress(recipientSplit.address);
        setRecipientAddressDetail(recipientSplit.detail);

        const sender = parseSenderPartsFromNotes(notes);
        const senderSplit = splitAddressAndDetail(sender.address);
        setSenderName(sender.name);
        setSenderPhone(formatPhoneInput(sender.phone));
        setSenderAddress(senderSplit.address);
        setSenderAddressDetail(senderSplit.detail);

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
            const lineSection = inferLineSection(item.productName);
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
              deliveryOnly: lineSection === "box",
              lineSection,
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
      lineSection: "box" | "giftUnit";
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
            lineSection: item.lineSection,
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
            lineSection: item.lineSection,
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
    setDeliveryAmPm("");
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
    setSameAsSenderAddress(false);
  };

  useEffect(() => {
    if (!sameAsSenderAddress) {
      return;
    }
    setRecipientAddress(senderAddress);
    setRecipientAddressDetail(senderAddressDetail);
  }, [sameAsSenderAddress, senderAddress, senderAddressDetail]);

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
    } else {
      // Modal already showed the error — clear so it does not reappear inline.
      setFormError("");
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
        !deliveryAmPm ||
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

    const giftUnitItems = productItems.filter(
      (item) => item.lineSection !== "box",
    );
    const productsWithGreeting = giftUnitItems.filter((item) =>
      Boolean(savedGreetingsByProduct[item.product]),
    );
    if (
      productsWithGreeting.length > 0 &&
      productsWithGreeting.length < giftUnitItems.length
    ) {
      setAlertDialog({
        open: true,
        message: "인사장이 작성되지 않은 상품이 존재합니다.",
      });
      return;
    }

    // 미저장 인사장 경고와 별개로, 이미 저장된 인사장은 주문에 반드시 연결
    const shouldAttachGreetings = Object.values(savedGreetingsByProduct).some(
      (draft) => Boolean(draft?.id || draft?.greetingContent?.trim()),
    );

    setFormError("");
    const validationError = validateRequired();
    if (validationError) {
      setFormError(validationError);
      setResultDialog({ open: true, success: false, kind: "fail" });
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
        setResultDialog({ open: true, success: false, kind: "fail" });
        return;
      }

      // id 없는 draft는 접수 전 서버에 저장·복제
      let greetingsForSubmit = { ...savedGreetingsByProduct };
      if (shouldAttachGreetings) {
        const resolved: Record<string, GreetingDraft> = {
          ...greetingsForSubmit,
        };
        for (const [name, draft] of Object.entries(resolved)) {
          if (!draft || draft.id) continue;
          resolved[name] = await createGreetingFormFromDraft(
            draft,
            name,
            {
              ordererName: displayOrdererName || ordererName.trim(),
              churchName: churchQuery.trim(),
              phone: ordererPhone.trim(),
            },
          );
        }
        greetingsForSubmit = resolved;
      }

      const greetingIdsForSubmit = Object.values(greetingsForSubmit)
        .map((draft) => draft?.id)
        .filter((id): id is number => typeof id === "number");
      const greetingCountForNotes = greetingIdsForSubmit.length;
      const greetingDraftsForNotes = Object.values(greetingsForSubmit).filter(
        (draft): draft is GreetingDraft => Boolean(draft),
      );
      const hasCatalogGreeting = greetingDraftsForNotes.some((draft) =>
        isGreetingCatalogNumber(draft.greetingNumber),
      );
      const hasSelfOrCardGreeting = greetingDraftsForNotes.some(
        (draft) =>
          draft.includeSelf || draft.businessCard === BUSINESS_CARD_INCLUDED,
      );
      const greetingKindNote = hasCatalogGreeting
        ? "본사"
        : hasSelfOrCardGreeting
          ? "자체"
          : greetingCountForNotes > 0
            ? "본사"
            : "없음";

      const selectedBranch =
        BRANCH_STORES.find((store) => store.id === branchStore)?.name ?? "";
      if (!selectedBranch) {
        setFormError("주문 작업 지역(남부/중부/서부)을 선택해 주세요.");
        setResultDialog({ open: true, success: false, kind: "fail" });
        return;
      }
      const year = new Date().getFullYear();
      const orderNumber =
        editOrderNumber ??
        `ORD-${year}-${String(Date.now()).slice(-6)}`;
      const hasDeliveryItems = isDelivery;
      const hasParcelItems = !isDelivery;
      const attachedGreetingNotes =
        greetingCountForNotes > 0
          ? Object.values(greetingsForSubmit)
              .filter((draft) => draft?.id)
              .map((draft) => formatGreetingDraftNotes(draft!))
              .join(" / ")
          : null;
      const notes = [
        `주문자:${displayOrdererName || ordererName.trim()}`,
        `연락처:${ordererPhone.trim()}`,
        `주문일자:${orderDate}`,
        `중앙:${churchQuery.trim()}`,
        hasDeliveryItems ? `배달업체명:${deliveryCompanyName.trim()}` : null,
        hasParcelItems ? `택배업체명:${parcelCompanyName.trim()}` : null,
        hasDeliveryItems
          ? `배달일:${deliveryDate} ${deliveryAmPm} ${deliveryTime}`
          : null,
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
        `인사장종류:${greetingKindNote}`,
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
        extraNote: extraNote.trim(),
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
              userId: selectedMemberId ?? auth.id,
              status: "PLACED",
              // 자동완성으로 회원을 고르지 않았으면 주문자 정보를 넘겨
              // 기존 회원 연결 또는 신규 계정 생성을 서버가 처리합니다.
              ...(ordererAutocomplete && !selectedMemberId
                ? {
                    ordererProfile: {
                      // 계정 이름에는 '관장님' 표기를 붙이지 않습니다.
                      fullname: ordererName.trim() || displayOrdererName,
                      phone: ordererPhone.trim(),
                      ...(churchId != null ? { churchId } : {}),
                    },
                  }
                : {}),
              ...payload,
            }),
          });

      setResultDialog({
        open: true,
        success: response.ok,
        kind: response.ok ? "accept" : "fail",
      });
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
        const created = (await response.json().catch(() => null)) as {
          id?: number;
        } | null;
        const orderId =
          created?.id ??
          (isEditMode ? editOrderId : null);
        if (orderId && greetingIdsForSubmit.length > 0) {
          const linkResults = await Promise.all(
            greetingIdsForSubmit.map(async (id) => {
              const linkRes = await apiFetch(
                `/api/greeting-forms/${id}/link-order`,
                {
                  method: "PATCH",
                  body: JSON.stringify({ orderId }),
                },
              );
              return linkRes.ok;
            }),
          );
          if (linkResults.some((ok) => !ok)) {
            setFormError(
              "주문은 접수되었으나 일부 인사장 연결에 실패했습니다. 인사장관리에서 확인해 주세요.",
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
      setResultDialog({ open: true, success: false, kind: "fail" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDiscardNewOrder = () => {
    setResultDialog({ open: true, success: true, kind: "cancel" });
  };

  /** 수정 모드: 저장·취소 없이 주문서만 닫음 (주문 데이터 변경 없음) */
  const handleCloseEditForm = () => {
    onOrderAccepted?.(editOrderNumber ?? undefined);
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
      setResultDialog({ open: true, success: true, kind: "cancel" });
      setFormError("");
    } catch (err) {
      setCancelConfirmOpen(false);
      setFormError(
        err instanceof Error ? err.message : "주문서 취소에 실패했습니다.",
      );
      setResultDialog({ open: true, success: false, kind: "fail" });
    } finally {
      setIsCancelling(false);
    }
  };

  const buildProductColumns = (
    includeGreeting: boolean,
  ): TableColumn<ProductLineItem>[] => {
    const cols: TableColumn<ProductLineItem>[] = [
      {
        key: "product",
        header: "상품명",
        render: (row) => (
          <span className="font-medium text-ink">{row.product}</span>
        ),
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
        render: (row) =>
          row.note || <span className="text-[#94a3b8]">-</span>,
      },
    ];

    if (includeGreeting) {
      cols.push({
        key: "greeting",
        header: "인사장",
        className: "w-[140px]",
        render: (row) => {
          const draft = savedGreetingsByProduct[row.product];
          const isSaved = Boolean(draft);

          return (
            <div className="flex items-center gap-1">
              <Button
                type="button"
                size="sm"
                className={cn(
                  "h-8 px-2 text-xs",
                  isSaved
                    ? "border-[#2F855A] bg-[#DCF0DC] text-[#2F855A] hover:bg-[#c6e6c6]"
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
              {isSaved ? (
                <button
                  type="button"
                  aria-label={`${row.product} 인사장 제거`}
                  className="inline-flex size-7 items-center justify-center rounded text-red hover:bg-[#fee2e2]"
                  onClick={(event) => {
                    event.stopPropagation();
                    onRemoveGreeting?.(row.product);
                  }}
                >
                  <X className="size-4" strokeWidth={2.5} />
                </button>
              ) : null}
            </div>
          );
        },
      });
    }

    cols.push({
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
    });

    return cols;
  };

  const productColumns = buildProductColumns(true);
  const boxProductColumns = buildProductColumns(false);

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

  const boxProductItems = productItems.filter(
    (item) => item.lineSection === "box",
  );
  const giftUnitProductItems = productItems.filter(
    (item) => item.lineSection !== "box",
  );

  const editorName = getAuthUser()?.name?.trim() || getAuthUser()?.username || "—";
  const greetingTargetProducts = (
    isDelivery ? giftUnitProductItems : productItems
  ).map((item) => item.product);
  const greetingCountOnProducts = greetingTargetProducts.filter(
    (name) => savedGreetingsByProduct[name],
  ).length;

  const handleApplyInsaAll = async () => {
    if (greetingTargetProducts.length < 2) {
      setAlertDialog({
        open: true,
        message: "동일적용하려면 상품을 2개 이상 추가해 주세요.",
      });
      return;
    }
    if (greetingCountOnProducts === 0) {
      setAlertDialog({
        open: true,
        message: "먼저 한 상품에 인사장을 작성·저장한 뒤 동일적용해 주세요.",
      });
      return;
    }
    if (greetingCountOnProducts >= 2) {
      setAlertDialog({
        open: true,
        message: "인사장을 모두 삭제하고 다시 추가해야 합니다.",
      });
      return;
    }
    try {
      await onApplyGreetingToAll?.(greetingTargetProducts, {
        ordererName: displayOrdererName || ordererName.trim(),
        churchName: churchQuery.trim(),
        phone: ordererPhone.trim(),
      });
      setAlertDialog({
        open: true,
        message: "인사장주문이 동일 적용되었습니다.",
      });
    } catch (error) {
      setAlertDialog({
        open: true,
        message:
          error instanceof Error
            ? error.message
            : "인사장 동일적용에 실패하였습니다.",
      });
    }
  };

  const handleOrdererNameInput = (next: string) => {
    if (memberFieldsReadOnly) return;
    if (isDirector === true && next.endsWith("관")) {
      setOrdererName(next.slice(0, -1));
    } else {
      setOrdererName(next);
    }
  };

  const handleSelectOrdererMember = (member: MemberSuggest) => {
    const trimmed = member.fullname.trim();
    const directorName = trimmed.endsWith("관");
    setIsDirector(directorName);
    setOrdererName(directorName ? trimmed.slice(0, -1) : trimmed);
    setOrdererPhone(formatPhoneInput(member.phone));
    setChurchQuery(member.churchName);
    setChurchId(member.churchId);
    setSelectedMemberId(member.id);
  };

  const omInputClass =
    "mb-3 w-full rounded-lg border border-[#E2E8F0] bg-white px-[11px] py-[9px] text-[13px] text-[#1A202C] disabled:bg-[#EDF2F7] disabled:text-[#A0AEC0]";
  const omDatePickerClass =
    "mb-3 flex w-full [&>button]:h-auto [&>button]:w-full [&>button]:justify-between [&>button]:rounded-lg [&>button]:border-[#E2E8F0] [&>button]:px-[11px] [&>button]:py-[9px] [&>button]:text-[13px]";
  const omLabelClass =
    "mb-[5px] block text-[12px] font-bold text-[#64748B]";

  return (
    <div className="mx-auto w-full max-w-[420px] space-y-0 rounded-2xl bg-[#F5F7FA] sm:max-w-none">
      {/* Highlight: store + orderer */}
      <div className="mb-4 rounded-xl border-2 border-[#F6AD55] bg-white p-4">
        <div className="mb-3.5 flex rounded-lg bg-[#EDF2F7] p-[3px]">
          {BRANCH_STORES.map((store) => {
            const selected = branchStore === store.id;
            return (
              <button
                key={store.id}
                type="button"
                onClick={() => setBranchStore(store.id)}
                className={cn(
                  "flex-1 rounded-md px-1 py-2 text-center text-[12.5px] font-bold transition-colors",
                  selected
                    ? "bg-[#1A365D] text-white"
                    : "bg-transparent text-[#64748B]",
                )}
              >
                {store.shortLabel}
              </button>
            );
          })}
        </div>
        {!branchStore ? (
          <p className="mb-3 text-[11px] text-[#9C4221]">
            남부·중부·서부 중 한 곳을 선택해 주세요. (필수)
          </p>
        ) : null}

        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <label className={omLabelClass}>주문자 성명</label>
            {ordererAutocomplete ? (
              <OrdererNameField
                value={isDirector === true ? displayOrdererName : ordererName}
                onChange={(next) => {
                  setSelectedMemberId(null);
                  handleOrdererNameInput(next);
                }}
                onSelectMember={handleSelectOrdererMember}
                inputClassName={cn(omInputClass, "mb-0")}
              />
            ) : (
              <input
                type="text"
                value={
                  memberFieldsReadOnly
                    ? displayOrdererName
                    : isDirector === true
                      ? displayOrdererName
                      : ordererName
                }
                onChange={(event) => handleOrdererNameInput(event.target.value)}
                readOnly={memberFieldsReadOnly}
                required
                placeholder={blankCustomerFields ? "고객 성명" : "주문자 성명"}
                className={cn(omInputClass, "mb-0", memberFieldsReadOnly && "bg-[#EDF2F7]")}
              />
            )}
          </div>
          <div className="flex items-center gap-1.5 pt-6 text-[12.5px] font-semibold whitespace-nowrap text-[#1A202C]">
            <label className="inline-flex cursor-pointer items-center gap-1.5">
              <input
                type="checkbox"
                checked={isDirector === true}
                onChange={(e) => setIsDirector(e.target.checked)}
                className="size-4 accent-[#3182CE]"
              />
              관장님
            </label>
          </div>
        </div>

        {ordererAutocomplete ? (
          <p
            className={cn(
              "mb-3 -mt-1 text-[11px]",
              selectedMemberId ? "text-[#2F855A]" : "text-[#64748B]",
            )}
          >
            {selectedMemberId
              ? "등록된 회원과 연결되었습니다. 주문이 해당 회원의 '내 주문현황'에 표시됩니다."
              : "목록에 없는 이름이면 주문자 계정이 자동 생성됩니다. 아이디와 초기 비밀번호는 모두 연락처 숫자이므로 연락처를 정확히 입력해 주세요."}
          </p>
        ) : null}

        <label className={omLabelClass}>주문자 연락처</label>
        <input
          type="text"
          inputMode="numeric"
          maxLength={13}
          value={ordererPhone}
          onChange={(event) => {
            if (memberFieldsReadOnly) return;
            setOrdererPhone(formatPhoneInput(event.target.value));
          }}
          readOnly={memberFieldsReadOnly}
          required
          placeholder="010-1234-5678"
          className={cn(omInputClass, memberFieldsReadOnly && "bg-[#EDF2F7]")}
        />

        <div className="flex gap-3">
          <div className="flex-1">
            <label className={omLabelClass}>주문일자</label>
            <div
              className={cn(
                omInputClass,
                "pointer-events-none flex items-center bg-[#EDF2F7] tabular-nums",
              )}
              aria-readonly
            >
              {formatMonthDay(orderDate)}
            </div>
          </div>
          <div className="flex-1">
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
        </div>
      </div>

      {/* Delivery / parcel */}
      <div className="mb-4">
        <OrderTypePicker
          value={orderType}
          locked={orderType !== null}
          onSelect={handleOrderTypeChange}
          onReset={resetOrderTypeForm}
        />
      </div>

      {!orderType ? (
        <p className="mb-4 rounded-lg border border-dashed border-[#E2E8F0] bg-white px-3 py-6 text-center text-[13px] text-[#64748B]">
          택배 또는 배달을 선택해 주세요. 선택 후 다른 유형은 폼초기화로만
          변경할 수 있습니다.
        </p>
      ) : isDelivery ? (
        <div className="mb-4 space-y-0">
          <label className={omLabelClass}>배달일 *</label>
          <MdCalendarPicker
            valueIso={deliveryDate || null}
            minIso={todayDateValue()}
            placeholder="m/d"
            title="배달일"
            className={omDatePickerClass}
            onChangeIso={(iso) => {
              if (iso < todayDateValue()) return;
              setDeliveryDate(iso);
            }}
          />
          <label className={omLabelClass}>배달 시간 *</label>
          <div className="mb-3 flex gap-2">
            <select
              value={deliveryAmPm}
              onChange={(event) =>
                setDeliveryAmPm(
                  event.target.value === "오전" || event.target.value === "오후"
                    ? event.target.value
                    : "",
                )
              }
              required
              className={cn(
                omInputClass,
                "mb-0 w-[88px] shrink-0",
              )}
            >
              <option value="">선택</option>
              <option value="오전">오전</option>
              <option value="오후">오후</option>
            </select>
            <input
              type="time"
              value={deliveryTime}
              onChange={(event) => setDeliveryTime(event.target.value)}
              required
              className={cn(omInputClass, "mb-0 min-w-0 flex-1")}
            />
          </div>
          <label className={omLabelClass}>업체명 *</label>
          <div className="mb-3">
            <DeliveryCompanyField
              value={deliveryCompanyName}
              onChange={setDeliveryCompanyName}
              inputClassName={cn(omInputClass, "mb-0")}
              onSelectPartner={(partner) => {
                setDeliveryCompanyName(partner.name);
                setRecipientName(partner.contactName);
                setRecipientPhone(formatPhoneInput(partner.phone));
                const split = splitAddressAndDetail(partner.address);
                setRecipientAddress(split.address);
                setRecipientAddressDetail(split.detail);
              }}
            />
          </div>
          <label className={omLabelClass}>받는 분 성함 *</label>
          <input
            type="text"
            value={recipientName}
            onChange={(event) => setRecipientName(event.target.value)}
            required
            className={omInputClass}
          />
          <label className={omLabelClass}>받는 분 전화번호 *</label>
          <input
            type="text"
            inputMode="numeric"
            maxLength={13}
            value={recipientPhone}
            onChange={(event) =>
              setRecipientPhone(formatPhoneInput(event.target.value))
            }
            required
            className={omInputClass}
          />
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
        <div className="mb-4 space-y-0">
          <label className={omLabelClass}>택배발송일 *</label>
          <MdCalendarPicker
            valueIso={parcelShipDate || null}
            minIso={todayDateValue()}
            placeholder="m/d"
            title="택배발송일"
            className={omDatePickerClass}
            onChangeIso={(iso) => {
              if (iso < todayDateValue()) return;
              setParcelShipDate(iso);
            }}
          />
          <label className={omLabelClass}>업체명 *</label>
          <div className="mb-3">
            <DeliveryCompanyField
              value={parcelCompanyName}
              onChange={setParcelCompanyName}
              listId="parcel-partner-suggestions"
              inputClassName={cn(omInputClass, "mb-0")}
              onSelectPartner={(partner) => {
                setParcelCompanyName(partner.name);
                setSenderName(partner.contactName);
                setSenderPhone(formatPhoneInput(partner.phone));
                const split = splitAddressAndDetail(partner.address);
                setSenderAddress(split.address);
                setSenderAddressDetail(split.detail);
              }}
            />
          </div>
          <label className={omLabelClass}>보내는 사람 (택배기표지) *</label>
          <input
            type="text"
            value={senderName}
            onChange={(event) => setSenderName(event.target.value)}
            required
            className={omInputClass}
          />
          <label className={omLabelClass}>
            보내는 사람 전화번호 (택배기표지) *
          </label>
          <input
            type="text"
            inputMode="numeric"
            maxLength={13}
            value={senderPhone}
            onChange={(event) =>
              setSenderPhone(formatPhoneInput(event.target.value))
            }
            required
            className={omInputClass}
          />
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
            label="받는 사람 주소"
            value={recipientAddress}
            onChange={setRecipientAddress}
            detailValue={recipientAddressDetail}
            onDetailChange={setRecipientAddressDetail}
            locked={sameAsSenderAddress}
            labelExtra={
              <label className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 text-[12.5px] font-semibold whitespace-nowrap text-[#1A202C]">
                <input
                  type="checkbox"
                  checked={sameAsSenderAddress}
                  onChange={(event) => {
                    const checked = event.target.checked;
                    setSameAsSenderAddress(checked);
                    if (checked) {
                      setRecipientAddress(senderAddress);
                      setRecipientAddressDetail(senderAddressDetail);
                    }
                  }}
                  className="size-4 accent-[#6B46C1]"
                />
                보내는 사람 주소와 같음
              </label>
            }
          />
        </div>
      )}

      {/* Products — only after 배달/택배 selected (avoids showing parcel UI before choice) */}
      {orderType ? (
      <div className="mb-4 space-y-3">
        {isDelivery ? (
          <>
            {/* ① 박스상품 */}
            <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3">
              <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-[13px] font-bold text-[#1A202C]">
                  ① 박스 상품
                </h4>
                <button
                  type="button"
                  onClick={() => {
                    setProductDialogMode("box");
                    setIsProductDialogOpen(true);
                  }}
                  className="rounded-lg border border-[#CBD5E0] bg-white px-3 py-2 text-[12.5px] font-bold text-[#1A365D]"
                >
                  + 박스상품 추가
                </button>
              </div>
              {isWideProductList ? (
                <div className="overflow-x-auto rounded-lg border border-[#E2E8F0] bg-white">
                  <Table
                    caption="박스 상품 목록"
                    columns={boxProductColumns}
                    data={boxProductItems}
                    emptyMessage="박스단위로만 주문 가능합니다 (인사장 없음). '+ 박스상품 추가'로 담아주세요."
                    scrollable={!isDesktop}
                    visibleRows={isDesktop ? undefined : 4}
                  />
                </div>
              ) : boxProductItems.length === 0 ? (
                <p className="rounded-lg border border-dashed border-[#E2E8F0] bg-white px-3 py-6 text-center text-[12px] text-[#A0AEC0] italic">
                  박스단위로만 주문 가능합니다 (인사장 없음). &apos;+ 박스상품
                  추가&apos;로 담아주세요.
                </p>
              ) : (
                <ul className="space-y-2.5">
                  {boxProductItems.map((row) => {
                    const rowIndex = productItems.indexOf(row);
                    return (
                      <li
                        key={`box-${row.product}-${rowIndex}`}
                        className="rounded-[10px] border border-[#E2E8F0] bg-white p-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="min-w-0 flex-1 text-[13px] font-bold leading-snug text-[#1A202C] break-keep">
                            {row.product}
                          </p>
                          <button
                            type="button"
                            aria-label={`${row.product} 삭제`}
                            onClick={() => removeProductItem(rowIndex)}
                            className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-[#64748B] hover:bg-[#FDEEEE] hover:text-[#E53E3E]"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2.5">
                          <label className="block">
                            <span className="mb-1 block text-[11px] font-bold text-[#64748B]">
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
                              className="h-9 w-full rounded-md border border-[#E2E8F0] bg-white px-2 text-center text-[13px] text-[#1A202C] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                            />
                          </label>
                          <div>
                            <span className="mb-1 block text-[11px] font-bold text-[#64748B]">
                              단가
                            </span>
                            <p className="flex h-9 items-center text-[13px] font-bold text-[#1A202C]">
                              {formatPrice(row.unitPrice || 0)}
                            </p>
                          </div>
                        </div>
                        {row.note ? (
                          <p className="mt-2 text-[12px] leading-relaxed text-[#475569]">
                            <span className="font-semibold text-[#64748B]">
                              요청사항 ·{" "}
                            </span>
                            {row.note}
                          </p>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* ② 선물세트 (인사장 주문) */}
            <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3">
              <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-[13px] font-bold text-[#1A202C]">
                  ② 선물세트 (인사장 주문)
                </h4>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setProductDialogMode("giftUnit");
                      setIsProductDialogOpen(true);
                    }}
                    className="rounded-lg border border-[#9AE6B4] bg-[#F0FFF4] px-3 py-2 text-[12.5px] font-bold text-[#276749]"
                  >
                    + 선물세트 낱개 추가
                  </button>
                  <button
                    type="button"
                    disabled={giftUnitProductItems.length === 0}
                    onClick={handleApplyInsaAll}
                    className={cn(
                      "rounded-lg px-3 py-2 text-[12.5px] font-bold",
                      giftUnitProductItems.length > 0
                        ? "bg-[#EBF4FD] text-[#3182CE]"
                        : "cursor-not-allowed bg-[#EDF2F7] text-[#A0AEC0]",
                    )}
                  >
                    인사장주문 동일적용
                  </button>
                </div>
              </div>
              {isWideProductList ? (
                <div className="overflow-x-auto rounded-lg border border-[#E2E8F0] bg-white">
                  <Table
                    caption="선물세트 낱개 상품 목록"
                    columns={productColumns}
                    data={giftUnitProductItems}
                    emptyMessage="선물세트 낱개 상품만 검색·주문할 수 있습니다. '+ 선물세트 낱개 추가'로 담아주세요."
                    scrollable={!isDesktop}
                    visibleRows={isDesktop ? undefined : 4}
                  />
                </div>
              ) : giftUnitProductItems.length === 0 ? (
                <p className="rounded-lg border border-dashed border-[#E2E8F0] bg-white px-3 py-6 text-center text-[12px] text-[#A0AEC0] italic">
                  선물세트 낱개 상품만 검색·주문할 수 있습니다. &apos;+
                  선물세트 낱개 추가&apos;로 담아주세요.
                </p>
              ) : (
                <ul className="space-y-2.5">
                  {giftUnitProductItems.map((row) => {
                    const rowIndex = productItems.indexOf(row);
                    const draft = savedGreetingsByProduct[row.product];
                    const isSaved = Boolean(draft);
                    return (
                      <li
                        key={`gift-${row.product}-${rowIndex}`}
                        className="rounded-[10px] border border-[#E2E8F0] bg-white p-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="min-w-0 flex-1 text-[13px] font-bold leading-snug text-[#1A202C] break-keep">
                            {row.product}
                          </p>
                          <button
                            type="button"
                            aria-label={`${row.product} 삭제`}
                            onClick={() => removeProductItem(rowIndex)}
                            className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-[#64748B] hover:bg-[#FDEEEE] hover:text-[#E53E3E]"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2.5">
                          <label className="block">
                            <span className="mb-1 block text-[11px] font-bold text-[#64748B]">
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
                              className="h-9 w-full rounded-md border border-[#E2E8F0] bg-white px-2 text-center text-[13px] text-[#1A202C] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                            />
                          </label>
                          <div>
                            <span className="mb-1 block text-[11px] font-bold text-[#64748B]">
                              단가
                            </span>
                            <p className="flex h-9 items-center text-[13px] font-bold text-[#1A202C]">
                              {formatPrice(row.unitPrice || 0)}
                            </p>
                          </div>
                        </div>
                        <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-[#E2E8F0] pt-2.5">
                          <span className="text-[11px] font-bold text-[#64748B]">
                            인사장
                          </span>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              className={cn(
                                "inline-flex items-center rounded-full px-2.5 py-1 text-[10.5px] font-bold",
                                isSaved
                                  ? "bg-[#DCF0DC] text-[#2F855A]"
                                  : "bg-[#EDF2F7] text-[#64748B]",
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
                            </button>
                            {isSaved ? (
                              <button
                                type="button"
                                aria-label={`${row.product} 인사장 제거`}
                                className="inline-flex size-7 items-center justify-center rounded text-red hover:bg-[#fee2e2]"
                                onClick={() => onRemoveGreeting?.(row.product)}
                              >
                                <X className="size-4" strokeWidth={2.5} />
                              </button>
                            ) : null}
                          </div>
                        </div>
                        {row.note ? (
                          <p className="mt-2 text-[12px] leading-relaxed text-[#475569]">
                            <span className="font-semibold text-[#64748B]">
                              요청사항 ·{" "}
                            </span>
                            {row.note}
                          </p>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {productItems.length > 0 ? (
              <p className="text-[11px] text-[#64748B]">
                총 {productItems.length}건 · 수량{" "}
                {productItems.reduce((sum, item) => sum + item.qty, 0)}개 ·{" "}
                <span className="font-bold text-[#1A202C]">
                  {formatPrice(productListTotal)}
                </span>
              </p>
            ) : null}
          </>
        ) : (
          <>
            <div className="mb-2.5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setProductDialogMode("all");
                  setIsProductDialogOpen(true);
                }}
                className="rounded-lg px-3 py-2 text-[12.5px] font-bold bg-[#1A365D] text-white"
              >
                + 상품추가
              </button>
              <button
                type="button"
                disabled={productItems.length === 0}
                onClick={handleApplyInsaAll}
                className={cn(
                  "rounded-lg px-3 py-2 text-[12.5px] font-bold",
                  productItems.length > 0
                    ? "bg-[#EBF4FD] text-[#3182CE]"
                    : "cursor-not-allowed bg-[#EDF2F7] text-[#A0AEC0]",
                )}
              >
                인사장주문 동일적용
              </button>
            </div>
            {productItems.length > 0 ? (
              <p className="mb-2 text-[11px] text-[#64748B]">
                총 {productItems.length}건 · 수량{" "}
                {productItems.reduce((sum, item) => sum + item.qty, 0)}개 ·{" "}
                <span className="font-bold text-[#1A202C]">
                  {formatPrice(productListTotal)}
                </span>
              </p>
            ) : null}

            {isWideProductList ? (
              <div className="overflow-x-auto rounded-lg border border-[#E2E8F0] bg-white">
                <Table
                  caption="제품 주문 상품 목록"
                  columns={productColumns}
                  data={productItems}
                  emptyMessage="등록된 상품이 없습니다. 「+ 상품추가」로 추가해 주세요."
                  scrollable={!isDesktop}
                  visibleRows={isDesktop ? undefined : 4}
                />
              </div>
            ) : productItems.length === 0 ? (
              <p className="rounded-lg border border-dashed border-[#E2E8F0] bg-white px-3 py-6 text-center text-[12px] text-[#A0AEC0] italic">
                등록된 상품이 없습니다. 「+ 상품추가」로 추가해 주세요.
              </p>
            ) : (
              <ul className="space-y-2.5">
                {productItems.map((row, rowIndex) => {
                  const draft = savedGreetingsByProduct[row.product];
                  const isSaved = Boolean(draft);

                  return (
                    <li
                      key={`${row.product}-${rowIndex}`}
                      className="rounded-[10px] border border-[#E2E8F0] bg-white p-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="min-w-0 flex-1 text-[13px] font-bold leading-snug text-[#1A202C] break-keep">
                          {row.product}
                        </p>
                        <button
                          type="button"
                          aria-label={`${row.product} 삭제`}
                          onClick={() => removeProductItem(rowIndex)}
                          className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-[#64748B] hover:bg-[#FDEEEE] hover:text-[#E53E3E]"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-2.5">
                        <label className="block">
                          <span className="mb-1 block text-[11px] font-bold text-[#64748B]">
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
                            className="h-9 w-full rounded-md border border-[#E2E8F0] bg-white px-2 text-center text-[13px] text-[#1A202C] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                          />
                        </label>
                        <div>
                          <span className="mb-1 block text-[11px] font-bold text-[#64748B]">
                            단가
                          </span>
                          <p className="flex h-9 items-center text-[13px] font-bold text-[#1A202C]">
                            {formatPrice(row.unitPrice || 0)}
                          </p>
                        </div>
                      </div>

                      <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-[#E2E8F0] pt-2.5">
                        <span className="text-[11px] font-bold text-[#64748B]">
                          인사장
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            className={cn(
                              "inline-flex items-center rounded-full px-2.5 py-1 text-[10.5px] font-bold",
                              isSaved
                                ? "bg-[#DCF0DC] text-[#2F855A]"
                                : "bg-[#EDF2F7] text-[#64748B]",
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
                          </button>
                          {isSaved ? (
                            <button
                              type="button"
                              aria-label={`${row.product} 인사장 제거`}
                              className="inline-flex size-7 items-center justify-center rounded text-red hover:bg-[#fee2e2]"
                              onClick={() => onRemoveGreeting?.(row.product)}
                            >
                              <X className="size-4" strokeWidth={2.5} />
                            </button>
                          ) : null}
                        </div>
                      </div>

                      {row.note ? (
                        <p className="mt-2 text-[12px] leading-relaxed text-[#475569]">
                          <span className="font-semibold text-[#64748B]">
                            요청사항 ·{" "}
                          </span>
                          {row.note}
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </div>
      ) : null}

      {orderType ? (
        <div className="mb-4">
          <label htmlFor="order-extra-note" className={omLabelClass}>
            특이사항
          </label>
          <textarea
            id="order-extra-note"
            value={extraNote}
            onChange={(event) => setExtraNote(event.target.value)}
            placeholder="특이사항을 입력해 주세요"
            className="min-h-[74px] w-full resize-none rounded-lg border border-[#E2E8F0] bg-white px-[11px] py-[9px] text-[13px] text-[#1A202C] placeholder:text-[#A0AEC0]"
          />
        </div>
      ) : null}

      {isEditMode ? (
        <div className="mb-4 rounded-[10px] border border-[#F6AD55] bg-[#FFEDD5] px-3.5 py-3">
          <label className="mb-[5px] block text-[12px] font-bold text-[#9C4221]">
            수정자 성명
          </label>
          <input
            type="text"
            value={editorName}
            readOnly
            className="w-full rounded-lg border border-[#F6AD55] bg-white px-[11px] py-[9px] text-[13px] text-[#1A202C]"
          />
          {editOrderStatus ? (
            <p className="mt-2 text-[11px] text-[#9C4221]">
              현재 상태:{" "}
              {ORDER_STATUS_LABEL[editOrderStatus] ?? editOrderStatus}
            </p>
          ) : null}
        </div>
      ) : null}

      {formError &&
      !formError.includes("주문 기본정보") &&
      !(resultDialog.open && !resultDialog.success) ? (
        <p className="mb-3 rounded-lg border border-[#E53E3E]/30 bg-[#FDEEEE] px-3 py-2 text-[13px] text-[#E53E3E]">
          {formError}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={isSubmitting || isCancelling}
          onClick={() => {
            void handleSubmitOrder();
          }}
          className="w-full rounded-[10px] bg-[#2F855A] py-3.5 text-[14.5px] font-bold text-white disabled:cursor-not-allowed disabled:bg-[#CBD5E0]"
        >
          {isSubmitting ? (
            <span className="inline-flex items-center justify-center gap-2">
              <Spinner
                size="sm"
                label={isEditMode ? "저장 중" : "접수 중"}
              />
              {isEditMode ? "저장 중..." : "접수 중..."}
            </span>
          ) : isEditMode ? (
            "변경내용접수"
          ) : (
            "주문접수완료"
          )}
        </button>
        <Button
          type="button"
          variant="outline"
          className="w-full border-[#E53E3E] bg-white py-3.5 text-[14.5px] font-bold text-[#E53E3E] hover:bg-[#FDEEEE]"
          disabled={isSubmitting || isCancelling}
          onClick={() => {
            if (isEditMode) {
              handleCloseEditForm();
            } else {
              handleDiscardNewOrder();
            }
          }}
        >
          {isEditMode ? "주문서닫기" : "주문접수취소"}
        </Button>
      </div>

      <ProductAddDialog
        open={isProductDialogOpen && orderType !== null}
        defaultOrderKind={orderType ?? "delivery"}
        openStockOnly={openStockOnly}
        mode={productDialogMode}
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
            className="border-[#1A365D] bg-[#1A365D] text-white hover:bg-[#24487C]"
            onClick={() => setAlertDialog({ open: false, message: "" })}
          >
            확인
          </Button>
        </div>
      </Dialog>

      <Dialog
        open={resultDialog.open}
        title={
          resultDialog.kind === "cancel"
            ? "취소 완료"
            : resultDialog.success
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
          {resultDialog.kind === "cancel"
            ? "주문이 취소 되었습니다."
            : resultDialog.success
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
                ? "border-[#2F855A] bg-[#2F855A] text-white hover:bg-[#276749]"
                : "border-[#1A365D] bg-[#1A365D] text-white hover:bg-[#24487C]"
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
      const greetingFormCount = order.greetingForms?.length ?? 0;
      const hasLinkedGreeting =
        greetingFormCount > 0 ||
        (order.greetingForms ?? []).some((form) => form.linkedToOrder);
      let greetingLabel = greetingKind || "-";
      if (hasLinkedGreeting) {
        greetingLabel = "연계";
      } else if (greetingKind === "본사") {
        greetingLabel = "본사";
      } else if (greetingKind === "자체") {
        greetingLabel = "자체";
      } else if (greetingKind === "없음") {
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
        title: `제품주문서 (수정) — ${editingOrderNumber}`,
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
      case "거래처관리":
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
                onRemoveGreeting={(productName) => {
                  setSavedGreetingsByProduct((current) => {
                    if (!current[productName]) {
                      return current;
                    }
                    const next = { ...current };
                    delete next[productName];
                    return next;
                  });
                }}
                onApplyGreetingToAll={async (productNames, customer) => {
                  const current = savedGreetingsByProduct;
                  const sourceKey =
                    productNames.find((name) => current[name]?.id) ??
                    productNames.find((name) => current[name]) ??
                    Object.keys(current).find((key) => current[key]);
                  const source = sourceKey ? current[sourceKey] : undefined;
                  if (!source) {
                    throw new Error(
                      "동일적용할 인사장 원본을 찾을 수 없습니다.",
                    );
                  }
                  if (!source.id) {
                    throw new Error(
                      "원본 인사장을 먼저 저장한 뒤 동일적용해 주세요.",
                    );
                  }

                  const next: Record<string, GreetingDraft> = { ...current };
                  for (const name of productNames) {
                    if (name === sourceKey) {
                      next[name] = {
                        ...source,
                        productName: name,
                        imageNumbers: [...source.imageNumbers],
                      };
                      continue;
                    }
                    if (current[name]?.id) {
                      // 이미 저장된 인사장 유지
                      continue;
                    }
                    next[name] = await createGreetingFormFromDraft(
                      source,
                      name,
                      customer,
                    );
                  }
                  setSavedGreetingsByProduct(next);
                }}
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
      case "거래처관리":
        return <MemberPartnerMng />;
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
