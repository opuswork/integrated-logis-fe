"use client";

import {
  Check,
  MapPin,
  Menu,
  Plus,
  ShoppingCart,
  Trash2,
  X,
} from "lucide-react";
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
import { MemberHomeInstallMng } from "@/app/OrderManagement/MemberHomeInstallMng";
import { MemberLogoutButton } from "@/app/OrderManagement/MemberLogoutButton";
import { MemberOrderCalendar } from "@/app/OrderManagement/MemberOrderCalendar";
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
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Dialog } from "@/components/ui/dialog";
import { Dropdown } from "@/components/ui/dropdown";
import { Input } from "@/components/ui/input";
import { MdCalendarPicker } from "@/components/ui/md-calendar-picker";
import { Spinner } from "@/components/ui/spinner";
import { Table, type TableColumn } from "@/components/ui/table";
import { apiFetch } from "@/lib/api";
import { getAccessToken, getAuthUser } from "@/lib/auth";
import { formatMonthDay, toLocalIsoDate } from "@/lib/date-format";
import { openDaumPostcode } from "@/lib/daum-postcode";
import { API_BASE_URL } from "@/lib/env";
import {
  parseBranchStoreFromNotes,
  parseChurchFromNotes,
  parseDeliveryCompanyFromNotes,
  parseDeliveryDateTimeFromNotes,
  parseDeliveryRequestDateFromNotes,
  parseClockParts,
  formatClock,
  isValidTwelveHourClock,
  fromTwentyFourHour,
  toTwentyFourHour,
  normalizeDeliveryClock,
  isGreetingCatalogNumber,
  parseGreetingKindFromNotes,
  parseItemNoteFromNotes,
  parseOrderDateFromNotes,
  parseOrdererFromNotes,
  parseOrdererPhoneFromNotes,
  parseOrderTypeFromNotes,
  parseParcelCompanyFromNotes,
  parseParcelRecipientContactMode,
  parseRecipientPartsFromNotes,
  parseSenderPartsFromNotes,
  parseShipDateFromNotes,
  splitSavedAddress,
  parseRecipientAddressDetailFromNotes,
  parseSenderAddressDetailFromNotes,
  encodeLineShipments,
  parseLineShipmentsFromNotes,
  emptyLineShipInfo,
  PARCEL_CONTACT_MODE_LABEL,
  type ParcelRecipientContactMode,
  type LineShipInfo,
  type LineShipment,
} from "@/lib/order-notes";
import {
  canEditOrderStatus,
  describeOrderEditLock,
  isSiblingOrderNumber,
  memberFacingStatusLabel,
  orderNumberBase,
  orderNumberSuffix,
} from "@/lib/order-delivery";
import { usePwaInstalled } from "@/lib/pwa-install";
import { cn } from "@/lib/utils";

const MEMBER_NAV = [
  "내 주문 현황",
  "인사장관리",
  "거래처관리",
  "바로가기추가",
] as const;
/** 내 주문 현황 첫 로딩 시 스피너 최소 표시 시간 */
const STATUS_LOADING_MIN_MS = 2000;
const GREETING_NUMBERS = ["1", "2", "3", "4"] as const;
const GREETING_SIZES = ["8칸", "6칸", "4칸", "자체"] as const;
const GREETING_RECEIVE_PLACES = [
  "공장작업",
  "소사매장",
  "덕소매장",
  "남부매장",
  "방문",
] as const;
/** 줄별 배송방식. 화면 라벨은 LINE_SHIP_OPTIONS 참고 */
type OrderType = "parcel" | "delivery";

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

function isSundayIso(iso: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    return false;
  }
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day).getDay() === 0;
}

function formatCalendarDayTitle(iso: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    return iso;
  }
  const [year, month, day] = iso.split("-").map(Number);
  const weekday = ["일", "월", "화", "수", "목", "금", "토"][
    new Date(year, month - 1, day).getDay()
  ];
  return `${month}/${day}(${weekday})`;
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

type MemberNav = (typeof MEMBER_NAV)[number] | "새 주문서 작성";

interface ProductLineItem {
  [key: string]: string | number | boolean;
  /** 같은 품명이 택배/상차로 갈라질 수 있어 행 식별은 품명이 아닌 이 id로 한다 */
  lineId: string;
  product: string;
  /** 줄마다 고름. ""=아직 배송선택 안 함 */
  orderKind: OrderType | "";
  qty: number;
  /** 분할 기준 수량(처음 담은 수량). qty<baseQty면 나머지가 형제 줄로 복사된다 */
  baseQty: number;
  /** 같은 상품에서 갈라진 줄끼리 공유하는 그룹 id */
  splitGroupId: string;
  /** 배송정보 입력 완료 (제출 전 검증용). 잠금은 statusLocked 로 따로 본다 */
  shipSaved: boolean;
  /**
   * 이 줄이 속한 실제 주문 id. 분할 접수된 주문서는 줄마다 주문이 다르다.
   * 신규작성은 아직 주문이 없으므로 0.
   */
  sourceOrderId: number;
  /** 표시용 주문번호 (ORD-2026-567480-1) */
  sourceOrderNumber: string;
  /** 포장완료·발송완료되어 수량·배송선택을 고칠 수 없는 줄 */
  statusLocked: boolean;
  /** statusLocked 인 이유 (화면 안내용) */
  lockReason: string;
  note: string;
  greeting: string;
  unitPrice: number;
  deliveryOnly: boolean;
  /** 배달 주문 섹션: 박스 vs 선물세트(개). 택배는 giftUnit로 둠 */
  lineSection: "box" | "giftUnit";
}

let lineIdCounter = 0;

function nextLineId() {
  lineIdCounter += 1;
  return `line-${Date.now().toString(36)}-${lineIdCounter}`;
}

/**
 * 줄이 어느 주문에서 왔는지와, 잠겼다면 그 이유를 보여준다.
 * 분할 접수된 주문서는 한 화면에 여러 주문의 줄이 섞여 있어 표시가 필요하다.
 */
function LineOriginNote({ row }: { row: ProductLineItem }) {
  if (!row.sourceOrderNumber) {
    return null;
  }
  return (
    <span className="mt-0.5 flex flex-wrap items-center gap-1">
      <span className="rounded bg-[#EDF2F7] px-1.5 py-0.5 text-[10.5px] font-bold text-[#64748B]">
        {row.sourceOrderNumber}
      </span>
      {row.statusLocked ? (
        <span
          title={row.lockReason}
          className="rounded bg-[#FDEEEE] px-1.5 py-0.5 text-[10.5px] font-bold text-[#C53030]"
        >
          수정불가
        </span>
      ) : null}
    </span>
  );
}

/** 줄별 배송방식 드롭다운 라벨 (스크린샷 ③④) */
const LINE_SHIP_OPTIONS = [
  { value: "parcel" as const, label: "택배/개별" },
  { value: "delivery" as const, label: "상차/배달" },
];

function lineShipLabel(kind: OrderType | "") {
  return LINE_SHIP_OPTIONS.find((option) => option.value === kind)?.label ?? "";
}

function oppositeKind(kind: OrderType): OrderType {
  return kind === "delivery" ? "parcel" : "delivery";
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
  deliveryDate: string;
  deliveryPlace: string;
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

const PAGE_META: Record<MemberNav, { title: string; description: string }> = {
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
  바로가기추가: {
    title: "바로가기추가",
    description:
      "홈 화면에 물류관리 앱을 추가하면 브라우저가 아닌 앱으로 열립니다.",
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
      <label className="mb-1.5 block text-2xl font-bold text-ink">
        {label}
      </label>
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
              value === item
                ? "bg-[#e9f1ff] text-brand"
                : "bg-white text-ink hover:bg-soft",
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
    <section
      className={cn(
        "min-w-0 rounded-lg border border-line bg-panel p-3.5",
        className,
      )}
    >
      {title ? (
        <h4 className="mb-2.5 text-base font-semibold text-ink">{title}</h4>
      ) : null}
      {children}
    </section>
  );
}

/** 개인회원 내 주문 현황 요약 카드: 📍교회명 / 총 N건 / 목록보기 */
function MemberStatusSummaryCard({
  churchName,
  action,
  children,
}: {
  churchName?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="min-w-0 rounded-2xl bg-white p-4">
      <div className="flex items-center justify-between gap-3 rounded-xl border-2 border-[#f9a8d4] bg-[#f5f0ff] px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <MapPin className="size-6 shrink-0 text-[#e11d48]" />
          <div className="min-w-0">
            <p className="truncate text-[18px] font-bold text-[#4c1d95]">
              {churchName || "내 주문"}
            </p>
            {children}
          </div>
        </div>
        {action}
      </div>
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
  const pwaInstalled = usePwaInstalled();
  const items = MEMBER_NAV.filter(
    (item) => !(pwaInstalled && item === "바로가기추가"),
  );

  return (
    <nav className="space-y-1.5">
      {items.map((item) => (
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
  memberName,
  memberTypeLabel,
}: {
  activeMenu: MemberNav;
  isOpen: boolean;
  onToggle: () => void;
  onMenuChange: (menu: MemberNav) => void;
  memberName?: string;
  memberTypeLabel?: string;
}) {
  // "김정호 관장님" — 직분이 없으면 "김정호 님"
  const greeting = memberName
    ? `${memberName} ${memberTypeLabel ? `${memberTypeLabel}님` : "님"}`
    : "";

  return (
    <div className="sticky top-0 z-30 bg-[#1e2a5b] pt-[env(safe-area-inset-top)] min-[1040px]:hidden">
      <header className="relative z-50 flex h-16 items-center justify-between px-4 text-white">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            aria-label={isOpen ? "메뉴 닫기" : "메뉴 열기"}
            aria-expanded={isOpen}
            onClick={onToggle}
            className="-ml-2 rounded-lg p-2 text-white transition-colors hover:bg-white/10"
          >
            {isOpen ? <X className="size-7" /> : <Menu className="size-7" />}
          </button>
          <div className="flex flex-col leading-none">
            <strong className="text-[24px] font-bold">간장</strong>
            <span className="mt-0.5 text-[12px] font-semibold text-white/80">
              주문
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {greeting ? (
            <span className="text-[15px] font-bold text-[#f9a8d4]">
              {greeting}
            </span>
          ) : null}
          <MemberLogoutButton className="rounded-lg bg-white px-4 py-2 text-[16px] font-bold text-[#1e2a5b]" />
        </div>
      </header>

      {isOpen ? (
        <>
          <button
            type="button"
            aria-label="메뉴 닫기"
            className="fixed inset-0 z-40 bg-black/40"
            onClick={onToggle}
          />
          <div className="absolute top-full right-0 left-0 z-50 mx-4 mt-2 rounded-lg border border-[#334155] bg-[#1f2937] p-3.5 shadow-lg">
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
    draft.productName.trim() ? `인사장제품:${draft.productName.trim()}` : null,
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
  formData.append("businessCard", draft.businessCard || BUSINESS_CARD_DEFAULT);
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
    receivePlace:
      form.receivePlace?.trim() || GREETING_RECEIVE_PLACE_PLACEHOLDER,
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
  if (
    !receivePlace.trim() ||
    receivePlace === GREETING_RECEIVE_PLACE_PLACEHOLDER
  ) {
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
    imageUrl:
      imageUrl || savedImageUrl || catalogImageUrl || initialDraft?.imageUrl,
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
        error instanceof Error
          ? error.message
          : "인사장 저장에 실패하였습니다.",
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
        <label
          htmlFor="special-note"
          className="mb-1.5 block text-2xl font-bold text-ink"
        >
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

function catalogItemMatches(
  item: StockCatalogItem,
  filter: {
    mode: "all" | "box" | "giftUnit";
    defaultOrderKind: OrderType;
    keyword: string;
    categoryFilter: string;
  },
) {
  const { mode, defaultOrderKind, categoryFilter } = filter;
  const normalizedKeyword = filter.keyword.trim().toLowerCase();

  if (mode === "box") {
    if (!isBoxProduct(item.productName)) {
      return false;
    }
  } else if (mode === "giftUnit") {
    if (!isGiftUnitProduct(item.category, item.productName, item.spec)) {
      return false;
    }
  } else if (
    defaultOrderKind === "parcel" &&
    isDeliveryOnlyProduct(item.category, item.productName)
  ) {
    // 택배 통합: 배달 전용(선물세트 박스) 제외
    return false;
  }

  if (
    mode === "all" &&
    categoryFilter !== "all" &&
    item.category !== categoryFilter
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
}

interface ProductDialogItem {
  product: string;
  qty: number;
  note: string;
  unitPrice: number;
  deliveryOnly: boolean;
  lineSection: "box" | "giftUnit";
}

function ProductAddDialog({
  open,
  onClose,
  onAddItems,
  defaultOrderKind,
  showOrderKind = true,
  openStockOnly = false,
  mode = "all",
  editList = false,
  initialQuantities,
  onReplaceItems,
  presentation = "dialog",
}: {
  open: boolean;
  onClose: () => void;
  onAddItems: (items: ProductDialogItem[]) => void;
  /** 전역 주문종류가 없어 "주문종류: …" 안내를 숨긴다. */
  showOrderKind?: boolean;
  defaultOrderKind: OrderType;
  /** 개인회원 제품주문서: openStock=true 상품만 */
  openStockOnly?: boolean;
  /** sheet=모바일 개인회원용 바텀시트(검색창 없음, 큰 글씨) / dialog=기존 중앙 모달 */
  presentation?: "dialog" | "sheet";
  /** all=택배 통합 / box=①박스 / giftUnit=②선물세트(개) */
  mode?: "all" | "box" | "giftUnit";
  /** 수정 모드: 현재 목록을 미리 채우고, 확정 시 추가가 아닌 목록 교체 */
  editList?: boolean;
  /** editList 시 미리 채울 수량 (품명 → 수량) */
  initialQuantities?: Record<string, number>;
  /** editList 확정. catalogProducts = 카탈로그에 있는 품명(없는 행은 유지 판단용) */
  onReplaceItems?: (
    items: ProductDialogItem[],
    catalogProducts: string[],
  ) => void;
}) {
  const [catalog, setCatalog] = useState<StockCatalogItem[]>([]);
  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const [keyword, setKeyword] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const qtyRefs = useRef<Map<number, HTMLInputElement>>(new Map());
  const initialQuantitiesRef = useRef(initialQuantities);
  useEffect(() => {
    initialQuantitiesRef.current = initialQuantities;
  }, [initialQuantities]);

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
          StockCatalogItem[] | { message?: string };

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
        const prefill: Record<number, number> = {};
        const initial = initialQuantitiesRef.current;
        if (initial) {
          for (const item of data) {
            const qty = initial[item.productName];
            if (qty && qty > 0) {
              prefill[item.id] = qty;
            }
          }
        }
        setQuantities(prefill);

        // 수정 모드: 이미 담긴 첫 상품으로 커서 이동 (검색/구분은 위에서 초기화됨)
        const visible = data.filter((item) =>
          catalogItemMatches(item, {
            mode,
            defaultOrderKind,
            keyword: "",
            categoryFilter: "all",
          }),
        );
        const firstSelected = visible.findIndex(
          (item) => (prefill[item.id] ?? 0) > 0,
        );
        setActiveIndex(Math.max(0, firstSelected));
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
  }, [open, openStockOnly, mode, defaultOrderKind]);

  const isSheet = presentation === "sheet";

  useEffect(() => {
    // 시트 모드는 검색창이 없고, 모바일 키보드가 튀어오르지 않도록 자동 포커스도 하지 않는다.
    if (!open || isSheet) {
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open, isSheet]);

  const filteredCatalog = useMemo(
    () =>
      catalog.filter((item) =>
        catalogItemMatches(item, {
          mode,
          defaultOrderKind,
          keyword,
          categoryFilter,
        }),
      ),
    [catalog, keyword, categoryFilter, defaultOrderKind, mode],
  );

  useEffect(() => {
    setActiveIndex(0);
  }, [keyword, categoryFilter]);

  useEffect(() => {
    if (filteredCatalog.length === 0) {
      return;
    }
    setActiveIndex((current) =>
      Math.min(Math.max(current, 0), filteredCatalog.length - 1),
    );
  }, [filteredCatalog.length]);

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

  const selectedQtyTotal = selectedItems.reduce(
    (sum, item) => sum + item.qty,
    0,
  );
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
    if (editList && onReplaceItems) {
      // 수정 모드: 0종이어도 확정 가능(전부 제거)
      onReplaceItems(
        selectedItems,
        catalog.map((item) => item.productName),
      );
    } else {
      if (selectedItems.length === 0) {
        return;
      }
      onAddItems(selectedItems);
    }
    setQuantities({});
    onClose();
  };

  const focusList = () => {
    listRef.current?.focus();
  };

  const focusActiveQty = () => {
    const item = filteredCatalog[activeIndex];
    if (!item) {
      return;
    }
    const input = qtyRefs.current.get(item.id);
    input?.focus();
    input?.select();
  };

  const moveActive = (delta: 1 | -1) => {
    if (filteredCatalog.length === 0) {
      return;
    }
    setActiveIndex((current) =>
      nextSuggestIndex(current, delta, filteredCatalog.length),
    );
  };

  useEffect(() => {
    const row = listRef.current?.querySelector(
      `[data-product-index="${activeIndex}"]`,
    );
    row?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const dialogTitle = editList
    ? "상품목록수정"
    : mode === "box"
      ? "박스상품 추가"
      : mode === "giftUnit"
        ? "선물세트 낱개 추가"
        : "상품 추가";

  const scopeLabel =
    mode === "box"
      ? "박스 상품만 표시"
      : mode === "giftUnit"
        ? "선물세트 (개)만 표시"
        : "(현재 배달/택배 탭 기준)";
  const subtitle = showOrderKind ? (
    <>
      주문종류:{" "}
      <span className="font-semibold text-ink">
        {orderKindLabel(defaultOrderKind)}
      </span>{" "}
      {mode === "all" ? scopeLabel : `· ${scopeLabel}`}
    </>
  ) : (
    scopeLabel
  );

  const filterControls = (
    <div
      className={cn(
        "grid gap-2",
        mode === "all" && !isSheet ? "min-[480px]:grid-cols-[140px_1fr]" : "",
      )}
    >
      {mode === "all" ? (
        <select
          aria-label="구분 필터"
          value={categoryFilter}
          onChange={(event) => setCategoryFilter(event.target.value)}
          className={cn(
            "w-full border border-[#cbd5e1] bg-white text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20",
            isSheet
              ? "min-h-14 rounded-xl px-4 text-[18px] font-semibold"
              : "min-h-9 rounded-[7px] px-2.5 py-2 text-sm",
          )}
        >
          <option value="all">전체</option>
          <option value="선물세트">선물세트</option>
          <option value="일반품">일반품</option>
        </select>
      ) : null}
      {/* 시트 모드(모바일 개인회원)는 검색창 없이 목록만 보여준다. */}
      {!isSheet ? (
        <input
          ref={searchInputRef}
          type="search"
          autoFocus
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Tab" || event.shiftKey) {
              return;
            }
            if (filteredCatalog.length === 0) {
              return;
            }
            event.preventDefault();
            setActiveIndex(0);
            window.setTimeout(() => focusList(), 0);
          }}
          placeholder="품명 / 코드 / 규격 검색"
          className="min-h-9 w-full rounded-[7px] border border-[#cbd5e1] bg-white px-2.5 py-2 text-sm text-ink placeholder:text-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
        />
      ) : null}
    </div>
  );

  const listContent = isLoading ? (
    isSheet ? (
      <div className="flex justify-center py-12 text-[#7c3aed]">
        <Spinner size="xl" label="상품 목록 불러오는 중" />
      </div>
    ) : (
      <p className="py-8 text-center text-sm text-muted-foreground">
        상품 목록을 불러오는 중...
      </p>
    )
  ) : loadError ? (
    <p
      className={cn(
        "rounded-[7px] border border-red/30 bg-[#fff0ed] px-3 py-2 text-sm text-red",
        isSheet && "mx-4 text-base",
      )}
    >
      {loadError}
    </p>
  ) : filteredCatalog.length === 0 ? (
    <p
      className={cn(
        "py-8 text-center text-muted-foreground",
        isSheet ? "text-lg" : "text-sm",
      )}
    >
      {isSheet ? "표시할 상품이 없습니다." : "검색 결과가 없습니다."}
    </p>
  ) : (
    <div
      ref={listRef}
      tabIndex={0}
      role="listbox"
      aria-label="상품 목록"
      onKeyDown={(event) => {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          moveActive(1);
          return;
        }
        if (event.key === "ArrowUp") {
          event.preventDefault();
          moveActive(-1);
          return;
        }
        if (event.key === "Tab" && !event.shiftKey) {
          event.preventDefault();
          focusActiveQty();
          return;
        }
        if (event.key === "Enter") {
          event.preventDefault();
          handleAdd();
        }
      }}
      className={cn(
        "divide-y divide-[#e5eaf0] focus:outline-none",
        isSheet
          ? "border-y border-[#e5eaf0]"
          : "max-h-[50vh] overflow-y-auto rounded-lg border border-line focus:border-brand focus:ring-2 focus:ring-brand/20",
      )}
    >
      {filteredCatalog.map((item, index) => {
        const qty = quantities[item.id] ?? 0;
        const active = index === activeIndex;
        const selected = qty > 0;
        return (
          <div
            key={item.id}
            role="option"
            aria-selected={active}
            data-product-index={index}
            onClick={() => setActiveIndex(index)}
            className={cn(
              "flex items-center border-l-4",
              isSheet ? "gap-4 px-4 py-4" : "gap-3 px-3 py-2.5",
              selected ? "border-l-brand" : "border-l-transparent",
              active ? "bg-[#eff6ff]" : selected ? "bg-[#f5f9ff]" : "bg-white",
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={productImageSrc(item.imageUrl)}
              alt={item.productName}
              className={cn(
                "shrink-0 border border-line bg-white object-contain",
                isSheet ? "h-20 w-20 rounded-xl" : "h-14 w-14 rounded",
              )}
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <ProductNameWithStock
                  name={item.productName}
                  stock={item.stock}
                  stockMax={item.stockMax}
                  className={isSheet ? "text-[22px] leading-tight" : undefined}
                />
                {selected ? (
                  <span className="inline-flex items-center gap-0.5 rounded-full bg-brand px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                    <Check className="size-3" />
                    {editList ? "담김" : "선택"}
                  </span>
                ) : null}
              </div>
              <p
                className={cn(
                  "text-[#64748b]",
                  isSheet ? "mt-1 text-[17px]" : "mt-0.5 text-xs",
                )}
              >
                {item.spec || "규격 없음"}
              </p>
              <p
                className={cn(
                  "text-[#64748b]",
                  isSheet ? "mt-0.5 text-[17px]" : "mt-0.5 text-xs",
                )}
              >
                {item.unit} · {item.category} ·{" "}
                {formatPrice(item.wholesalePrice)}
              </p>
            </div>
            <input
              ref={(node) => {
                if (node) {
                  qtyRefs.current.set(item.id, node);
                } else {
                  qtyRefs.current.delete(item.id);
                }
              }}
              type="number"
              min={0}
              inputMode="numeric"
              tabIndex={-1}
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
              onFocus={() => setActiveIndex(index)}
              onKeyDown={(event) => {
                if (event.key === "Tab") {
                  event.preventDefault();
                  focusList();
                  return;
                }
                if (event.key === "Enter") {
                  event.preventDefault();
                  handleAdd();
                  return;
                }
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  moveActive(1);
                  focusList();
                  return;
                }
                if (event.key === "ArrowUp") {
                  event.preventDefault();
                  moveActive(-1);
                  focusList();
                }
              }}
              className={cn(
                "shrink-0 border-[#cbd5e1] bg-white text-center font-semibold text-ink placeholder:text-[#94a3b8] focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
                isSheet
                  ? "h-20 w-[110px] rounded-2xl border-2 px-2 text-[24px] font-bold"
                  : "h-9 w-20 rounded-md border px-2 text-sm",
              )}
            />
          </div>
        );
      })}
    </div>
  );

  const confirmDisabled = !editList && selectedItems.length === 0;

  if (isSheet) {
    return (
      <BottomSheet
        open={open}
        title={dialogTitle}
        subtitle={subtitle}
        onClose={onClose}
        footer={
          <div className="space-y-4">
            <div className="flex items-baseline justify-between gap-3">
              <span className="whitespace-nowrap text-[17px] text-[#64748b]">
                선택 {selectedItems.length}종 · 수량 {selectedQtyTotal}개
              </span>
              <span className="whitespace-nowrap text-[22px] font-bold text-ink">
                합계: {formatPrice(selectedPriceTotal)}
              </span>
            </div>
            <div className="grid grid-cols-[1fr_2fr] gap-3">
              <Button
                type="button"
                variant="outline"
                className="h-16 rounded-xl border-2 border-[#cbd5e1] text-[20px] font-bold text-[#334155]"
                onClick={onClose}
              >
                취소
              </Button>
              <Button
                type="button"
                className={cn(
                  "h-16 rounded-xl text-[20px] font-bold",
                  confirmDisabled
                    ? "border-[#e2e8f0] bg-[#e2e8f0] text-[#94a3b8]"
                    : "border-brand bg-brand text-white hover:bg-[#1856bf]",
                )}
                disabled={confirmDisabled}
                onClick={handleAdd}
              >
                {editList ? (
                  <Check className="size-6" />
                ) : (
                  <ShoppingCart className="size-6" />
                )}
                {editList ? "목록 적용" : "장바구니 담기"}
              </Button>
            </div>
          </div>
        }
      >
        {mode === "all" ? (
          <div className="px-4 pt-1 pb-3">{filterControls}</div>
        ) : null}
        {listContent}
      </BottomSheet>
    );
  }

  return (
    <Dialog
      open={open}
      title={dialogTitle}
      onClose={onClose}
      className="max-w-lg"
    >
      <div className="space-y-3">
        <p className="text-sm text-[#64748b]">{subtitle}</p>

        {filterControls}

        {listContent}

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
          disabled={confirmDisabled}
          onClick={handleAdd}
        >
          {editList ? (
            <Check className="size-4" />
          ) : (
            <Plus className="size-4" />
          )}
          {editList ? "목록 적용" : "상품 추가"}
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
  const {
    isOpen,
    items,
    highlightIndex,
    setHighlightIndex,
    onSelect,
    onClose,
  } = options;
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
            <li className="px-3 py-2.5 text-sm text-[#64748b]">
              중앙 목록 불러오는 중...
            </li>
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
            <li className="px-3 py-2.5 text-sm text-[#64748b]">
              검색 결과가 없습니다.
            </li>
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
                    <span className="text-sm font-semibold text-ink">
                      {church.name}
                    </span>
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

type MemberSuggest = {
  id: number;
  fullname: string;
  phone: string;
  memberType?: string | null;
  churchId: number | null;
  churchName: string;
};

function isGwanjangMemberType(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed === "GWANJANG" || trimmed === "관장";
}

const MEMBER_TYPE_LABEL: Record<string, string> = {
  GWANJANG: "관장",
  GENERAL: "일반",
  CHONGMU: "총무",
  SAJANG: "사장",
  BUSAJANG: "부사장",
  SANGMU: "상무",
};

/** 직분 코드(GWANJANG 등) → 한글 라벨. 이미 한글이면 그대로. */
function formatMemberTypeLabel(value?: string | null) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) {
    return "";
  }
  return MEMBER_TYPE_LABEL[trimmed] ?? trimmed;
}

type OrdererTitle = "" | "관장" | "총무";

/** 관장·총무만 이름 뒤 '관' 접미사 + readonly 체크박스 표시 대상 */
function ordererTitleFromMemberType(value?: string | null): OrdererTitle {
  const label = formatMemberTypeLabel(value);
  return label === "관장" || label === "총무" ? label : "";
}

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
            MemberSuggest[] | { message?: string };
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
      window.alert(
        "주소 검색을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.",
      );
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="space-y-2">
      <div>
        <div className="mb-[5px] flex items-center justify-between gap-2">
          <label
            htmlFor={id}
            className="block text-[12px] font-bold text-[#64748B]"
          >
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

/** 택배 받는 사람 연락 방식. 이메일/팩스는 선택만 기록하고 별도 입력은 받지 않는다. */
function RecipientContactChoice({
  mode,
  onModeChange,
  radioName,
  addressId,
  address,
  onAddressChange,
  addressDetail,
  onAddressDetailChange,
  addressLocked = false,
  addressLabelExtra,
}: {
  mode: ParcelRecipientContactMode;
  onModeChange: (mode: ParcelRecipientContactMode) => void;
  radioName: string;
  addressId: string;
  address: string;
  onAddressChange: (value: string) => void;
  addressDetail: string;
  onAddressDetailChange: (value: string) => void;
  addressLocked?: boolean;
  addressLabelExtra?: ReactNode;
}) {
  return (
    <>
      <div className="mb-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          {(
            [
              { value: "address", label: "받는 사람 주소" },
              { value: "email", label: "이메일" },
              { value: "fax", label: "팩스" },
            ] as const
          ).map((option) => (
            <label
              key={option.value}
              className="inline-flex cursor-pointer items-center gap-1.5 text-[13px] font-semibold text-[#1A202C]"
            >
              <input
                type="radio"
                name={radioName}
                checked={mode === option.value}
                onChange={() => onModeChange(option.value)}
                className="size-4 accent-[#3182CE]"
              />
              {option.label}
            </label>
          ))}
        </div>
        <p className="mt-1.5 text-[12px] text-red-600">
          받는 사람의 주소, 이메일, 팩스 중 하나를 선택하실 수 있습니다.
        </p>
      </div>
      {mode === "address" ? (
        <AddressField
          id={addressId}
          label="받는 사람 주소"
          value={address}
          onChange={onAddressChange}
          detailValue={addressDetail}
          onDetailChange={onAddressDetailChange}
          locked={addressLocked}
          labelExtra={addressLabelExtra}
        />
      ) : null}
    </>
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

function GreetingViewField({ label, value }: { label: string; value: string }) {
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
        <p className="text-sm text-muted-foreground">
          표시할 인사장 정보가 없습니다.
        </p>
      )}
    </Dialog>
  );
}

/**
 * 줄별 배송정보 입력 시트 (스크린샷 ⑤⑥).
 * 배송선택이 택배면 "택배정보입력", 상차/배달이면 "배달정보입력"으로 열린다.
 * 하단 고정 버튼으로만 저장되며, 저장 전 값은 해당 줄에 반영되지 않는다.
 */
function LineShipSheet({
  open,
  kind,
  productName,
  qty,
  initial,
  minDateIso,
  shipDateLocked,
  onCancel,
  onSave,
}: {
  open: boolean;
  kind: OrderType;
  productName: string;
  qty: number;
  initial: LineShipInfo | null;
  minDateIso: string;
  /** 달력에서 고른 납품일이 있으면 날짜 칸을 잠근다 */
  shipDateLocked: boolean;
  onCancel: () => void;
  onSave: (info: LineShipInfo) => void;
}) {
  // 호출부가 lineId로 key를 주므로 줄이 바뀌면 이 컴포넌트가 새로 마운트된다.
  const [draft, setDraft] = useState<LineShipInfo>(() =>
    initial ? { ...initial, kind } : emptyLineShipInfo(kind),
  );
  const [error, setError] = useState("");

  const isDelivery = kind === "delivery";
  const clock = parseClockParts(draft.deliveryTime);
  const hour = clock?.hour ?? "";
  const minute = clock ? clock.minute : "";

  const patch = (next: Partial<LineShipInfo>) => {
    setDraft((current) => ({ ...current, ...next }));
  };

  /** "보내는 사람 주소와 같음" 중이면 받는 사람 주소도 함께 따라간다. */
  const patchSenderAddress = (next: {
    senderAddress?: string;
    senderAddressDetail?: string;
  }) => {
    setDraft((current) => {
      const merged = { ...current, ...next };
      return current.sameAsSenderAddress
        ? {
            ...merged,
            recipientAddress: merged.senderAddress,
            recipientAddressDetail: merged.senderAddressDetail,
          }
        : merged;
    });
  };

  const validate = () => {
    if (!draft.companyName.trim()) {
      return "납품업체명을 입력해 주세요.";
    }
    if (isDelivery) {
      if (!draft.deliveryDate) {
        return "배달일을 선택해 주세요.";
      }
      if (!isDateOnOrAfterToday(draft.deliveryDate)) {
        return "배달일은 오늘 이후 날짜만 선택할 수 있습니다.";
      }
      if (!draft.deliveryAmPm || !isValidTwelveHourClock(draft.deliveryTime)) {
        return "배달 시간을 선택해 주세요.";
      }
      if (!draft.recipientName.trim() || !draft.recipientPhone.trim()) {
        return "받는 분 성함과 전화번호를 입력해 주세요.";
      }
      if (!draft.recipientAddress.trim()) {
        return "받는 사람 주소를 입력해 주세요.";
      }
      return "";
    }
    if (!draft.parcelShipDate) {
      return "택배발송일을 선택해 주세요.";
    }
    if (!isDateOnOrAfterToday(draft.parcelShipDate)) {
      return "택배발송일은 오늘 이후 날짜만 선택할 수 있습니다.";
    }
    if (
      !draft.senderName.trim() ||
      !draft.senderPhone.trim() ||
      !draft.senderAddress.trim()
    ) {
      return "보내는 사람 정보를 모두 입력해 주세요.";
    }
    if (draft.contactMode === "address" && !draft.recipientAddress.trim()) {
      return "받는 사람 주소를 입력해 주세요.";
    }
    return "";
  };

  const handleSave = () => {
    const message = validate();
    if (message) {
      setError(message);
      return;
    }
    // 배달은 항상 주소로 수취 (이메일/팩스 선택 없음)
    onSave({
      ...draft,
      kind,
      contactMode: isDelivery ? "address" : draft.contactMode,
    });
  };

  const labelClass = "mb-[5px] block text-[12px] font-bold text-[#64748B]";
  const inputClass =
    "mb-3 w-full rounded-lg border border-[#E2E8F0] bg-white px-[11px] py-[9px] text-[13px] text-[#1A202C] disabled:bg-[#EDF2F7] disabled:text-[#A0AEC0]";
  const datePickerClass =
    "mb-3 flex w-full [&>button]:h-auto [&>button]:w-full [&>button]:justify-between [&>button]:rounded-lg [&>button]:border-[#E2E8F0] [&>button]:px-[11px] [&>button]:py-[9px] [&>button]:text-[13px]";

  return (
    <BottomSheet
      open={open}
      title={isDelivery ? "배달정보입력" : "택배정보입력"}
      subtitle={
        <>
          {productName} <span className="font-semibold text-ink">{qty}개</span>{" "}
          · {lineShipLabel(kind)}
        </>
      }
      onClose={onCancel}
      footer={
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            className="flex-1 py-3 text-[14.5px] font-bold"
            onClick={onCancel}
          >
            취소
          </Button>
          <button
            type="button"
            onClick={handleSave}
            className="flex-1 rounded-[10px] bg-[#1A365D] py-3 text-[14.5px] font-bold text-white"
          >
            {isDelivery ? "배달정보저장" : "택배정보저장"}
          </button>
        </div>
      }
    >
      <div className="px-5 pb-4">
        {isDelivery ? (
          <>
            <label className={labelClass}>배달일 *</label>
            <MdCalendarPicker
              valueIso={draft.deliveryDate || null}
              minIso={minDateIso}
              placeholder="m/d"
              title="배달일"
              disabled={shipDateLocked}
              className={datePickerClass}
              onChangeIso={(iso) => {
                if (iso < minDateIso) return;
                patch({ deliveryDate: iso });
              }}
            />
            <label className={labelClass}>배달 시간 *</label>
            <div className="mb-3 flex gap-2">
              <select
                value={draft.deliveryAmPm}
                onChange={(event) =>
                  patch({
                    deliveryAmPm:
                      event.target.value === "오전" ||
                      event.target.value === "오후"
                        ? event.target.value
                        : "",
                  })
                }
                className={cn(inputClass, "mb-0 w-[88px] shrink-0")}
              >
                <option value="">선택</option>
                <option value="오전">오전</option>
                <option value="오후">오후</option>
              </select>
              <select
                value={hour === "" ? "" : String(hour)}
                onChange={(event) => {
                  const nextHour = Number(event.target.value);
                  const nextMinute = minute === "" ? 0 : Number(minute);
                  patch({
                    deliveryTime: event.target.value
                      ? formatClock(nextHour, nextMinute)
                      : "",
                  });
                }}
                className={cn(inputClass, "mb-0 min-w-0 flex-1")}
              >
                <option value="">시</option>
                {Array.from({ length: 12 }, (_, index) => index + 1).map(
                  (value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ),
                )}
              </select>
              <select
                value={minute === "" ? "" : String(minute)}
                onChange={(event) => {
                  const nextMinute = Number(event.target.value);
                  const nextHour = hour === "" ? 12 : Number(hour);
                  patch({
                    deliveryTime: event.target.value
                      ? formatClock(nextHour, nextMinute)
                      : "",
                  });
                }}
                className={cn(inputClass, "mb-0 min-w-0 flex-1")}
              >
                <option value="">분</option>
                {Array.from({ length: 60 }, (_, value) => (
                  <option key={value} value={value}>
                    {String(value).padStart(2, "0")}
                  </option>
                ))}
              </select>
            </div>
            <label className={labelClass}>납품업체명 *</label>
            <input
              type="text"
              value={draft.companyName}
              onChange={(event) => patch({ companyName: event.target.value })}
              placeholder="납품업체명"
              className={inputClass}
            />
            <label className={labelClass}>받는 분 성함 *</label>
            <input
              type="text"
              value={draft.recipientName}
              onChange={(event) => patch({ recipientName: event.target.value })}
              className={inputClass}
            />
            <label className={labelClass}>받는 분 전화번호 *</label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={13}
              value={draft.recipientPhone}
              onChange={(event) =>
                patch({ recipientPhone: formatPhoneInput(event.target.value) })
              }
              className={inputClass}
            />
            <AddressField
              id="line-delivery-recipient-address"
              label="받는 사람 주소"
              value={draft.recipientAddress}
              onChange={(value) => patch({ recipientAddress: value })}
              detailValue={draft.recipientAddressDetail}
              onDetailChange={(value) =>
                patch({ recipientAddressDetail: value })
              }
            />
          </>
        ) : (
          <>
            <label className={labelClass}>택배발송일 *</label>
            <MdCalendarPicker
              valueIso={draft.parcelShipDate || null}
              minIso={minDateIso}
              placeholder="m/d"
              title="택배발송일"
              disabled={shipDateLocked}
              className={datePickerClass}
              onChangeIso={(iso) => {
                if (iso < minDateIso) return;
                patch({ parcelShipDate: iso });
              }}
            />
            <label className={labelClass}>납품업체명 *</label>
            <input
              type="text"
              value={draft.companyName}
              onChange={(event) => patch({ companyName: event.target.value })}
              placeholder="납품업체명"
              className={inputClass}
            />
            <label className={labelClass}>보내는 사람 (택배기표지) *</label>
            <input
              type="text"
              value={draft.senderName}
              onChange={(event) => patch({ senderName: event.target.value })}
              className={inputClass}
            />
            <label className={labelClass}>
              보내는 사람 전화번호 (택배기표지) *
            </label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={13}
              value={draft.senderPhone}
              onChange={(event) =>
                patch({ senderPhone: formatPhoneInput(event.target.value) })
              }
              className={inputClass}
            />
            <AddressField
              id="line-sender-address"
              label="보내는 사람 주소 (택배기표지)"
              value={draft.senderAddress}
              onChange={(value) => patchSenderAddress({ senderAddress: value })}
              detailValue={draft.senderAddressDetail}
              onDetailChange={(value) =>
                patchSenderAddress({ senderAddressDetail: value })
              }
            />
            <RecipientContactChoice
              mode={draft.contactMode}
              onModeChange={(mode) => patch({ contactMode: mode })}
              radioName="line-parcel-recipient-contact"
              addressId="line-parcel-recipient-address"
              address={draft.recipientAddress}
              onAddressChange={(value) => patch({ recipientAddress: value })}
              addressDetail={draft.recipientAddressDetail}
              onAddressDetailChange={(value) =>
                patch({ recipientAddressDetail: value })
              }
              addressLocked={draft.sameAsSenderAddress}
              addressLabelExtra={
                <label className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 text-[12.5px] font-semibold whitespace-nowrap text-[#1A202C]">
                  <input
                    type="checkbox"
                    checked={draft.sameAsSenderAddress}
                    onChange={(event) => {
                      const checked = event.target.checked;
                      patch(
                        checked
                          ? {
                              sameAsSenderAddress: true,
                              recipientAddress: draft.senderAddress,
                              recipientAddressDetail: draft.senderAddressDetail,
                            }
                          : { sameAsSenderAddress: false },
                      );
                    }}
                    className="size-4 accent-[#6B46C1]"
                  />
                  보내는 사람 주소와 같음
                </label>
              }
            />
          </>
        )}

        {error ? (
          <p className="mt-1 rounded-lg border border-[#E53E3E]/30 bg-[#FDEEEE] px-3 py-2 text-[13px] text-[#E53E3E]">
            {error}
          </p>
        ) : null}
      </div>
    </BottomSheet>
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
  presetShipDate = null,
  sheetOnMobile = false,
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
  /** 달력에서 고른 납품일. 있으면 배달일/택배발송일에 넣고 수정 불가. */
  presetShipDate?: string | null;
  /** 개인회원 앱: 모바일(<1040px)에서 상품 추가를 바텀시트로 표시 */
  sheetOnMobile?: boolean;
}) {
  const isEditMode = Boolean(editOrderNumber);
  const isMemberNewOrder = !blankCustomerFields && !isEditMode;
  const isDesktopWidth = useMinWidth(1040);
  const productDialogPresentation =
    sheetOnMobile && !isDesktopWidth ? "sheet" : "dialog";
  const [editOrderId, setEditOrderId] = useState<number | null>(null);
  const [editOrderStatus, setEditOrderStatus] = useState<string | null>(null);
  const [isHydrating, setIsHydrating] = useState(isEditMode);
  const [hydrateError, setHydrateError] = useState("");
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [orderType, setOrderType] = useState<OrderType | null>(null);
  const [productItems, setProductItems] = useState<ProductLineItem[]>([]);
  /**
   * 개인앱·관리자 모두 줄마다 배송방식과 배송정보를 따로 고른다.
   * 줄 자동분할(택배↔상차)은 신규작성에서만.
   * 접수 후에는 주문 1건 = 배송 1건이라, 수정화면에서 쪼개면 주문번호 규칙이 깨진다.
   */
  const canSplitLines = !isEditMode;
  /** lineId → 저장된 배송정보 */
  const [lineShipInfo, setLineShipInfo] = useState<
    Record<string, LineShipInfo>
  >({});
  /** 배송정보입력 시트를 연 대상 줄 */
  const [shipSheetLineId, setShipSheetLineId] = useState<string | null>(null);
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
        ChurchOption[] | { message?: string };
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
  const [deliveryDate, setDeliveryDate] = useState(presetShipDate ?? "");
  const [deliveryAmPm, setDeliveryAmPm] = useState<"" | "오전" | "오후">("");
  const [deliveryTime, setDeliveryTime] = useState("");
  const [parcelShipDate, setParcelShipDate] = useState(presetShipDate ?? "");
  const [recipientName, setRecipientName] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [recipientAddress, setRecipientAddress] = useState("");
  const [recipientAddressDetail, setRecipientAddressDetail] = useState("");
  const [senderName, setSenderName] = useState("");
  const [senderPhone, setSenderPhone] = useState("");
  const [senderAddress, setSenderAddress] = useState("");
  const [senderAddressDetail, setSenderAddressDetail] = useState("");
  const [parcelContactMode, setParcelContactMode] =
    useState<ParcelRecipientContactMode>("address");
  const [branchStore, setBranchStore] = useState<BranchStoreId | null>(null);
  const [extraNote, setExtraNote] = useState("");
  /** true면 이름 뒤에 '관' 접미사. 회원 직분(관장·총무)으로만 결정 */
  const [isDirector, setIsDirector] = useState<boolean>(false);
  /** readonly 체크박스 라벨용 직분 ("관장" → "관장님") */
  const [ordererTitle, setOrdererTitle] = useState<OrdererTitle>("");
  const [proxyOrder, setProxyOrder] = useState(false);
  const [loggedInMemberType, setLoggedInMemberType] = useState("");
  /** 대신 주문서 넣기 시 표시용: 로그인한 관장 이름 / 소속 중앙 */
  const [loggedInName, setLoggedInName] = useState("");
  const [loggedInChurchName, setLoggedInChurchName] = useState("");
  const selfOrdererRef = useRef({ name: "", phone: "" });
  const proxyOrderRef = useRef(false);
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
  /** 줄 단위로 쪼개 접수된 주문번호들 (접수완료 안내 문구용) */
  const [acceptedOrderNumbers, setAcceptedOrderNumbers] = useState<string[]>(
    [],
  );
  const isDesktop = useMinWidth(1040);
  const isWideProductList = useMinWidth(500);
  const memberFieldsReadOnly = !blankCustomerFields;
  const showDirectorCheckbox = !isMemberNewOrder;
  const showProxyToggle =
    isMemberNewOrder && isGwanjangMemberType(loggedInMemberType);
  const showOrdererNamePhone = !isMemberNewOrder || proxyOrder;
  const showOrderDateAndChurch = !isMemberNewOrder;
  const shipDateLocked = Boolean(presetShipDate);
  const ordererFieldsReadOnly = isMemberNewOrder
    ? !proxyOrder
    : memberFieldsReadOnly;
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
      parcelContactMode !== "address" ||
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
    parcelContactMode,
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
        selfOrdererRef.current.name = auth.name;
        setOrdererName(auth.name);
        setLoggedInName(auth.name);
      }
      if (auth.phone) {
        const phone = formatPhoneInput(auth.phone);
        selfOrdererRef.current.phone = phone;
        setOrdererPhone(phone);
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
            memberType?: string | null;
          };
        };

        if (cancelled || !data.user) {
          return;
        }

        setLoggedInMemberType(data.user.memberType ?? "");
        setLoggedInChurchName(data.user.church?.name ?? "");
        // 개인앱 본인 주문: 직분이 관장·총무면 이름 뒤 '관' 접미사 (성명 칸은 숨김)
        if (!blankCustomerFields && !isEditMode && !proxyOrderRef.current) {
          const title = ordererTitleFromMemberType(data.user.memberType);
          setOrdererTitle(title);
          setIsDirector(Boolean(title));
        }
        if (data.user.name) {
          selfOrdererRef.current.name = data.user.name;
          setLoggedInName(data.user.name);
          if (!proxyOrderRef.current) {
            setOrdererName(data.user.name);
          }
        }
        if (data.user.phone) {
          const phone = formatPhoneInput(data.user.phone);
          selfOrdererRef.current.phone = phone;
          if (!proxyOrderRef.current) {
            setOrdererPhone(phone);
          }
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
    if (!presetShipDate) {
      return;
    }
    setDeliveryDate(presetShipDate);
    setParcelShipDate(presetShipDate);
  }, [presetShipDate]);

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
              /** 포장관리 '완료' → 수량·배송방식 잠금 */
              packDone?: boolean | null;
              /** 배송관리 '발송완료' → 수량·배송방식 잠금 */
              finalConfirmDone?: boolean | null;
              packagingWorker?: string | null;
              user?: { memberType?: string | null } | null;
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

        /*
         * 분할 접수된 형제 주문(-1, -2 …)을 함께 불러온다.
         * 한 주문서를 줄 단위로 쪼개 접수하므로, 수량을 한쪽만 고치면 다른 쪽과
         * 어긋난다. 한 모달에서 같이 보여 주고 같이 저장한다.
         * 형제가 1건이면 아래 로직이 기존 단일 주문 경로와 똑같이 동작한다.
         */
        const siblingBase = orderNumberBase(order.orderNumber);
        const siblingOrders = data
          .filter((row) => isSiblingOrderNumber(row.orderNumber, siblingBase))
          .sort(
            (a, b) =>
              orderNumberSuffix(a.orderNumber) -
              orderNumberSuffix(b.orderNumber),
          );
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
        // 직분은 회원 정보 우선, 없으면 구주문 notes의 '관' 접미사로 판정
        const hydratedTitle =
          ordererTitleFromMemberType(order.user?.memberType) ||
          (parsedOrderer.endsWith("관") ? "관장" : "");
        setOrdererTitle(hydratedTitle);
        setIsDirector(Boolean(hydratedTitle));
        setOrdererName(
          parsedOrderer.endsWith("관")
            ? parsedOrderer.slice(0, -1)
            : parsedOrderer,
        );

        setDeliveryCompanyName(parseDeliveryCompanyFromNotes(notes));
        setParcelCompanyName(parseParcelCompanyFromNotes(notes));

        // 줄별 배송정보 복원에도 쓰므로 지역 변수로 받아 둔다 (state 는 아직 갱신 전)
        let hydratedDeliveryDate = "";
        let hydratedDeliveryAmPm: "" | "오전" | "오후" = "";
        let hydratedDeliveryTime = "";
        const deliveryDt = parseDeliveryDateTimeFromNotes(notes).trim();
        if (deliveryDt) {
          const parts = deliveryDt.split(/\s+/).filter(Boolean);
          hydratedDeliveryDate = parts[0]?.slice(0, 10) ?? "";
          if (parts[1] === "오전" || parts[1] === "오후") {
            const clock = normalizeDeliveryClock(
              parts[1],
              parts[2]?.slice(0, 5) ?? "",
            );
            hydratedDeliveryAmPm = clock.ampm;
            hydratedDeliveryTime = clock.time;
          } else {
            const clock =
              fromTwentyFourHour(parts[1]?.slice(0, 5) ?? "") ??
              normalizeDeliveryClock("", parts[1]?.slice(0, 5) ?? "");
            hydratedDeliveryAmPm = clock.ampm;
            hydratedDeliveryTime = clock.time;
          }
        } else if (order.shipment?.estimatedWindow && isDeliveryOrder) {
          const iso = order.shipment.estimatedWindow;
          hydratedDeliveryDate = iso.slice(0, 10);
          const clock = fromTwentyFourHour(iso.slice(11, 16));
          hydratedDeliveryAmPm = clock?.ampm ?? "";
          hydratedDeliveryTime = clock?.time ?? "";
        }
        if (hydratedDeliveryDate || hydratedDeliveryTime) {
          setDeliveryDate(hydratedDeliveryDate);
          setDeliveryAmPm(hydratedDeliveryAmPm);
          setDeliveryTime(hydratedDeliveryTime);
        }

        const shipDate = parseShipDateFromNotes(notes);
        if (shipDate && !isDeliveryOrder) {
          setParcelShipDate(shipDate.slice(0, 10));
        }

        // 배달은 항상 주소. 택배는 저장된 수취연락(주소/이메일/팩스) 복원
        const parcelMode = isDeliveryOrder
          ? "address"
          : parseParcelRecipientContactMode(notes);
        setParcelContactMode(parcelMode);

        const recipient = parseRecipientPartsFromNotes(notes);
        const recipientAddressValue =
          recipient.address === "-" ? "" : recipient.address;
        const recipientFull =
          parcelMode === "address"
            ? isDeliveryOrder
              ? recipientAddressValue || order.shipment?.deliveryAddress || ""
              : recipientAddressValue
            : "";
        const recipientSplit = splitSavedAddress(
          recipientFull,
          parseRecipientAddressDetailFromNotes(notes),
        );
        setRecipientName(recipient.name);
        setRecipientPhone(formatPhoneInput(recipient.phone));
        setRecipientAddress(recipientSplit.address);
        setRecipientAddressDetail(recipientSplit.detail);

        const sender = parseSenderPartsFromNotes(notes);
        const senderSplit = splitSavedAddress(
          sender.address,
          parseSenderAddressDetailFromNotes(notes),
        );
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

        // 인사장은 형제 주문마다 따로 달려 있어 모두 모아 둔다.
        const greetingMap: Record<string, GreetingDraft> = {};
        for (const sibling of siblingOrders) {
          for (const form of sibling.greetingForms ?? []) {
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
        }
        onHydratedGreetings?.(greetingMap);

        const orderKind: OrderType = isDeliveryOrder ? "delivery" : "parcel";
        const greetingFor = (productName: string) =>
          greetingMap[productName] ??
          Object.values(greetingMap).find(
            (draft) => draft.productName === productName,
          );

        // 줄별 배송정보(배송상세 세그먼트)가 있으면 그대로 복원한다.
        const savedLines = parseLineShipmentsFromNotes(notes);

        /** 줄에 찍어 둘 출처 주문 + 잠금 상태. 저장할 때 어느 주문에 보낼지 이걸로 안다. */
        const originOf = (src: (typeof siblingOrders)[number]) => {
          const lockReason =
            describeOrderEditLock({
              status: src.status,
              packDone: src.packDone,
              finalConfirmDone: src.finalConfirmDone,
            }) ?? "";
          return {
            sourceOrderId: src.id,
            sourceOrderNumber: src.orderNumber,
            statusLocked: lockReason !== "",
            lockReason,
          };
        };

        /**
         * 형제 주문 한 건을 화면 줄로 복원한다.
         * 줄별 배송정보를 쓰는 주문에만 쓴다(분할 접수된 주문은 항상 여기 해당).
         */
        const buildSavedRows = (
          src: (typeof siblingOrders)[number],
          lines: NonNullable<ReturnType<typeof parseLineShipmentsFromNotes>>,
        ) => {
          const info: Record<string, LineShipInfo> = {};
          const origin = originOf(src);
          // 같은 품명이 택배/상차로 갈라진 경우 같은 splitGroupId로 묶어준다.
          const groupByProduct = new Map<string, string>();
          const rows: ProductLineItem[] = lines.map((line) => {
            const lineId = nextLineId();
            info[lineId] = line.ship;
            const lineSection =
              line.lineSection ?? inferLineSection(line.product);
            let groupId = groupByProduct.get(line.product);
            if (!groupId) {
              groupId = lineId;
              groupByProduct.set(line.product, groupId);
            }
            return {
              lineId,
              splitGroupId: groupId,
              product: line.product,
              orderKind: line.ship.kind,
              qty: line.qty || 1,
              baseQty: line.baseQty || line.qty || 1,
              shipSaved: true,
              note: line.note ?? "",
              greeting: greetingFor(line.product)?.id ? "인사장보기" : "",
              unitPrice: line.unitPrice || 0,
              // 구버전 payload 는 deliveryOnly 가 없으니 저장된 배송방식으로 판단
              deliveryOnly: line.deliveryOnly ?? line.ship.kind === "delivery",
              lineSection,
              ...origin,
            };
          });
          return { rows, info };
        };

        // 형제가 모두 줄별 배송정보를 가진 경우에만 함께 편집한다.
        // 하나라도 구주문이면 아래 단일 주문 경로로 떨어뜨려 회귀를 막는다.
        const siblingSavedLines = siblingOrders.map((src) => ({
          src,
          lines: parseLineShipmentsFromNotes(src.notes ?? ""),
        }));
        const allHaveSavedLines = siblingSavedLines.every(
          (entry) => entry.lines !== null && entry.lines.length > 0,
        );

        if (savedLines && allHaveSavedLines) {
          const mergedInfo: Record<string, LineShipInfo> = {};
          const mergedRows: ProductLineItem[] = [];
          for (const entry of siblingSavedLines) {
            const built = buildSavedRows(entry.src, entry.lines!);
            Object.assign(mergedInfo, built.info);
            mergedRows.push(...built.rows);
          }
          setLineShipInfo(mergedInfo);
          setProductItems(mergedRows);
        } else {
          // 구주문: 주문 단위 배송정보 1벌을 모든 줄에 복사해 둔다.
          const legacyInfo: LineShipInfo = {
            ...emptyLineShipInfo(orderKind),
            companyName: isDeliveryOrder
              ? parseDeliveryCompanyFromNotes(notes)
              : parseParcelCompanyFromNotes(notes),
            deliveryDate: isDeliveryOrder ? hydratedDeliveryDate : "",
            deliveryAmPm: isDeliveryOrder ? hydratedDeliveryAmPm : "",
            deliveryTime: isDeliveryOrder ? hydratedDeliveryTime : "",
            recipientName: recipient.name,
            recipientPhone: formatPhoneInput(recipient.phone),
            recipientAddress: recipientSplit.address,
            recipientAddressDetail: recipientSplit.detail,
            parcelShipDate:
              !isDeliveryOrder && shipDate ? shipDate.slice(0, 10) : "",
            senderName: sender.name,
            senderPhone: formatPhoneInput(sender.phone),
            senderAddress: senderSplit.address,
            senderAddressDetail: senderSplit.detail,
            sameAsSenderAddress: false,
            contactMode: parcelMode,
          };
          const restoredInfo: Record<string, LineShipInfo> = {};
          const rows: ProductLineItem[] = (order.items ?? []).map((item) => {
            const lineId = nextLineId();
            restoredInfo[lineId] = { ...legacyInfo };
            const lineSection = inferLineSection(item.productName);
            return {
              lineId,
              splitGroupId: lineId,
              product: item.productName,
              orderKind,
              qty: item.quantity || 1,
              baseQty: item.quantity || 1,
              shipSaved: true,
              note: parseItemNoteFromNotes(
                notes,
                item.productName,
                item.quantity,
              ),
              greeting: greetingFor(item.productName)?.id ? "인사장보기" : "",
              unitPrice: item.price || 0,
              deliveryOnly: lineSection === "box",
              lineSection,
              ...originOf(order),
            };
          });
          setLineShipInfo(restoredInfo);
          setProductItems(rows);
        }
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

  const addProductItems = (items: ProductDialogItem[]) => {
    // 전역 주문종류가 없으므로 줄별 배송선택 전까지 ""로 둔다.
    const selectedOrderType: OrderType | "" = "";
    const allowedItems = items;

    if (allowedItems.length === 0) {
      return;
    }

    setProductItems((current) => {
      const next = [...current];

      for (const item of allowedItems) {
        // 이미 배송선택/배송정보가 정해진 줄에는 합치지 않는다 (분할 정보 보호).
        const existingIndex = next.findIndex(
          (row) =>
            row.product === item.product &&
            !row.shipSaved &&
            row.orderKind === "",
        );

        if (existingIndex >= 0) {
          const existing = next[existingIndex];
          const mergedQty = existing.qty + item.qty;
          next[existingIndex] = {
            ...existing,
            qty: mergedQty,
            baseQty: mergedQty,
            unitPrice: item.unitPrice,
            orderKind: selectedOrderType,
            deliveryOnly: existing.deliveryOnly || item.deliveryOnly,
            lineSection: item.lineSection,
          };
        } else {
          const lineId = nextLineId();
          next.push({
            lineId,
            splitGroupId: lineId,
            product: item.product,
            qty: item.qty,
            baseQty: item.qty,
            shipSaved: false,
            note: item.note,
            unitPrice: item.unitPrice,
            orderKind: selectedOrderType,
            greeting: savedGreetingsByProduct[item.product]?.id
              ? "인사장보기"
              : "",
            deliveryOnly: item.deliveryOnly,
            lineSection: item.lineSection,
            // 새로 담은 줄은 아직 주문이 없다. 접수 후 주문번호가 정해진다.
            sourceOrderId: 0,
            sourceOrderNumber: "",
            statusLocked: false,
            lockReason: "",
          });
        }
      }

      return next;
    });
  };

  /**
   * 배송선택 드롭다운 (스크린샷 ③→④).
   * 수량을 baseQty보다 줄여 놓은 상태에서 방식을 고르면, 남은 수량이
   * 반대 방식(택배↔상차)으로 자동 복사되어 바로 아래 줄로 들어간다.
   */
  const handleLineKindChange = (lineId: string, kind: OrderType | "") => {
    const index = productItems.findIndex((row) => row.lineId === lineId);
    if (index < 0) {
      return;
    }
    const target = productItems[index];
    /*
     * 배송방식이 바뀌면 배송정보를 다시 받아야 한다.
     * 택배는 받는분 주소·발송일, 상차는 배송일시처럼 필요한 항목이 서로 달라서
     * 이전 방식의 값을 그대로 두면 반쪽짜리 데이터가 저장된다.
     */
    const kindChanged = Boolean(target.orderKind) && target.orderKind !== kind;
    const next = productItems.map((row) =>
      row.lineId === lineId
        ? {
            ...row,
            orderKind: kind,
            shipSaved: kindChanged ? false : row.shipSaved,
          }
        : row,
    );
    if (kindChanged) {
      setLineShipInfo((info) => {
        if (!info[lineId]) return info;
        const rest = { ...info };
        delete rest[lineId];
        return rest;
      });
    }

    // 수정 모드: 이미 주문 1건 = 배송 1건이므로 줄을 더 쪼개지 않는다.
    if (!canSplitLines) {
      setProductItems(next);
      return;
    }

    const siblingIndex = next.findIndex(
      (row) =>
        row.lineId !== lineId && row.splitGroupId === target.splitGroupId,
    );
    const remainder = target.baseQty - target.qty;
    // 선물세트 박스는 배달 전용이라 반대 방식(택배)으로 복사할 수 없다.
    const canSplit = Boolean(kind) && remainder > 0 && !target.deliveryOnly;

    if (!canSplit) {
      if (siblingIndex >= 0 && !next[siblingIndex].shipSaved) {
        const removedId = next[siblingIndex].lineId;
        setProductItems(
          next.filter((_, rowIndex) => rowIndex !== siblingIndex),
        );
        setLineShipInfo((info) => {
          if (!info[removedId]) return info;
          const rest = { ...info };
          delete rest[removedId];
          return rest;
        });
        return;
      }
      setProductItems(next);
      return;
    }

    const opposite = oppositeKind(kind as OrderType);
    if (siblingIndex >= 0) {
      next[siblingIndex] = {
        ...next[siblingIndex],
        qty: remainder,
        orderKind: next[siblingIndex].shipSaved
          ? next[siblingIndex].orderKind
          : opposite,
      };
      setProductItems(next);
      return;
    }

    next.splice(index + 1, 0, {
      ...target,
      lineId: nextLineId(),
      orderKind: opposite,
      qty: remainder,
      shipSaved: false,
    });
    setProductItems(next);
  };

  useEffect(() => {
    setProductItems((current) =>
      current.map((item) => ({
        ...item,
        greeting: savedGreetingsByProduct[item.product]?.id ? "인사장보기" : "",
      })),
    );
  }, [savedGreetingsByProduct]);

  const productListTotal = productItems.reduce(
    (sum, item) => sum + item.qty * (item.unitPrice || 0),
    0,
  );

  const updateProductQty = (rowIndex: number, qty: number) => {
    setProductItems((current) => {
      const target = current[rowIndex];
      if (!target) {
        return current;
      }

      if (!canSplitLines) {
        // 관리자 / 수정 모드: 분할 없이 수량만 바꾼다 (baseQty 도 함께 따라감)
        const nextQty = Math.max(1, qty);
        return current.map((item, index) =>
          index === rowIndex
            ? { ...item, qty: nextQty, baseQty: nextQty }
            : item,
        );
      }

      const sibling = current.find(
        (row) =>
          row.lineId !== target.lineId &&
          row.splitGroupId === target.splitGroupId,
      );

      if (!sibling) {
        // 아직 분할 전: 수량을 줄이면 그만큼이 배송선택 시 반대 방식으로 복사된다.
        const nextQty = Math.min(Math.max(1, qty), target.baseQty);
        return current.map((item, index) =>
          index === rowIndex ? { ...item, qty: nextQty } : item,
        );
      }

      // 분할된 그룹은 합이 baseQty로 고정. 형제 줄이 잠겼으면 수량 변경 불가.
      if (sibling.shipSaved) {
        return current;
      }
      const nextQty = Math.min(Math.max(1, qty), target.baseQty - 1);
      return current.map((item) => {
        if (item.lineId === target.lineId) {
          return { ...item, qty: nextQty };
        }
        if (item.lineId === sibling.lineId) {
          return { ...item, qty: target.baseQty - nextQty };
        }
        return item;
      });
    });
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
      setAcceptedOrderNumbers([]);
    } else {
      // Modal already showed the error — clear so it does not reappear inline.
      setFormError("");
    }
  };

  const removeProductItem = (rowIndex: number) => {
    const removed = productItems[rowIndex];
    setProductItems((current) => {
      const target = current[rowIndex];
      if (!target) {
        return current;
      }
      const rest = current.filter((_, index) => index !== rowIndex);
      // 분할 형제가 남으면 원래 수량 기준을 남은 줄로 되돌린다.
      return rest.map((row) =>
        row.splitGroupId === target.splitGroupId
          ? { ...row, qty: row.qty, baseQty: row.qty }
          : row,
      );
    });
    if (removed) {
      setLineShipInfo((info) => {
        if (!info[removed.lineId]) return info;
        const rest = { ...info };
        delete rest[removed.lineId];
        return rest;
      });
    }
  };

  /** 배송정보입력 시트 저장 */
  const saveLineShipInfo = (lineId: string, info: LineShipInfo) => {
    setLineShipInfo((current) => ({ ...current, [lineId]: info }));
    setProductItems((current) =>
      current.map((row) =>
        row.lineId === lineId ? { ...row, shipSaved: true } : row,
      ),
    );
    setShipSheetLineId(null);
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

    const matchingLines = productItems.filter(
      (item) => item.product === targetProduct,
    );
    if (matchingLines.length === 0) {
      setAlertDialog({
        open: true,
        message:
          "인사장 작성을 위해선 상품이 필요합니다. 상품을 먼저 추가하세요!",
      });
      return;
    }
    // 택배/상차로 갈라진 줄들을 합친 수량으로 인사장을 연다.
    const targetQty = matchingLines.reduce((sum, item) => sum + item.qty, 0);

    setFormError("");
    onGreetingClick({
      productNames: [targetProduct],
      productSummary: `${targetProduct} ${targetQty}개`,
      productLines: [{ product: targetProduct, qty: targetQty }],
      targetProduct,
      ordererName: displayOrdererName || ordererName.trim(),
      phone: ordererPhone.trim(),
      churchName: churchQuery.trim(),
      // 보내는 사람은 줄별 택배정보에 있으므로 거기서 먼저 찾는다.
      senderName:
        (matchingLines
          .map((line) => lineShipInfo[line.lineId])
          .find((info) => info?.kind === "parcel" && info.senderName.trim())
          ?.senderName.trim() ??
          "") ||
        displayOrdererName ||
        ordererName.trim(),
    });
  };

  const validateRequired = () => {
    if (!branchStore) {
      return "주문 작업 지역(남부/중부/서부)을 선택해 주세요.";
    }
    if (
      !ordererName.trim() ||
      !ordererPhone.trim() ||
      !orderDate ||
      !churchId
    ) {
      return "성명, 연락처, 주문일자, 중앙을 모두 입력해 주세요.";
    }
    if (!isDateOnOrAfterToday(orderDate)) {
      return "주문일자는 오늘 이후 날짜만 선택할 수 있습니다.";
    }
    if (productItems.length === 0) {
      return "상품을 1개 이상 추가해 주세요.";
    }
    const noKind = productItems.find((item) => !item.orderKind);
    if (noKind) {
      return `'${noKind.product}'의 배송선택(택배/상차)을 골라 주세요.`;
    }
    const noShip = productItems.find(
      (item) => !item.shipSaved || !lineShipInfo[item.lineId],
    );
    if (noShip) {
      return `'${noShip.product}'의 배송정보를 입력해 주세요.`;
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

    // 같은 품명이 택배/상차로 갈라져 여러 줄이 될 수 있어 품명 단위로 센다.
    const giftUnitItems = Array.from(
      new Set(
        productItems
          .filter((item) => item.lineSection !== "box")
          .map((item) => item.product),
      ),
    );
    const productsWithGreeting = giftUnitItems.filter((product) =>
      Boolean(savedGreetingsByProduct[product]),
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

    // 줄마다 배송방식이 달라서 주문 단위 기본값으로만 쓴다.
    const selectedOrderType: OrderType = orderType ?? "delivery";

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
          resolved[name] = await createGreetingFormFromDraft(draft, name, {
            ordererName: displayOrdererName || ordererName.trim(),
            churchName: churchQuery.trim(),
            phone: ordererPhone.trim(),
          });
        }
        greetingsForSubmit = resolved;
      }

      /**
       * 주문 한 건에 실릴 인사장 = 그 주문에 담긴 품명들의 인사장.
       * (인사장은 선물세트에만 붙으므로 박스만 담긴 주문은 "없음"이 된다)
       */
      const greetingsForLines = (lines: ProductLineItem[]) => {
        const seen = new Set<string>();
        const drafts: GreetingDraft[] = [];
        for (const line of lines) {
          if (seen.has(line.product)) continue;
          seen.add(line.product);
          const draft = greetingsForSubmit[line.product];
          if (draft) {
            drafts.push(draft);
          }
        }
        return drafts;
      };

      const greetingKindNoteFor = (drafts: GreetingDraft[]) => {
        if (
          drafts.some((draft) => isGreetingCatalogNumber(draft.greetingNumber))
        ) {
          return "본사";
        }
        if (
          drafts.some(
            (draft) =>
              draft.includeSelf ||
              draft.businessCard === BUSINESS_CARD_INCLUDED,
          )
        ) {
          return "자체";
        }
        return drafts.some((draft) => draft.id) ? "본사" : "없음";
      };

      const selectedBranch =
        BRANCH_STORES.find((store) => store.id === branchStore)?.name ?? "";
      if (!selectedBranch) {
        setFormError("주문 작업 지역(남부/중부/서부)을 선택해 주세요.");
        setResultDialog({ open: true, success: false, kind: "fail" });
        return;
      }
      const year = new Date().getFullYear();
      const baseOrderNumber =
        editOrderNumber ?? `ORD-${year}-${String(Date.now()).slice(-6)}`;

      /*
       * 신규작성은 배송정보가 줄마다 달라서 주문을 줄 단위로 쪼개 접수한다.
       * (Shipment 는 주문당 1행이고 notes 도 배송방식 블록이 한 벌뿐이라,
       *  한 주문에 여러 배송지를 담으면 관리자·출력·공장·우체국 화면이 전부 틀어진다)
       * 줄이 2개 이상이면 주문번호에 -1, -2 … 접미사가 붙는다.
       */
      /*
       * 신규작성은 줄마다 새 주문을 만든다.
       * 수정은 줄이 어느 주문에서 왔는지(sourceOrderId)로 묶는다. 분할 접수된
       * 주문서는 형제 주문을 한 모달에서 같이 고치므로 묶음이 여럿일 수 있다.
       * 포장완료·발송완료된 묶음은 저장 대상에서 아예 뺀다.
       */
      const orderGroups: ProductLineItem[][] = canSplitLines
        ? productItems.map((item) => [item])
        : (() => {
            const byOrder = new Map<number, ProductLineItem[]>();
            for (const item of productItems) {
              if (item.statusLocked) continue;
              const key = item.sourceOrderId;
              const bucket = byOrder.get(key);
              if (bucket) bucket.push(item);
              else byOrder.set(key, [item]);
            }
            return [...byOrder.values()];
          })();

      if (!canSplitLines && orderGroups.length === 0) {
        setFormError(
          "포장완료·발송완료되어 수정할 수 있는 항목이 없습니다.",
        );
        setResultDialog({ open: true, success: false, kind: "fail" });
        return;
      }

      /** 줄 묶음 하나 → notes + payload 한 벌 */
      const buildOrderBody = (lines: ProductLineItem[]) => {
        const lineShipments: LineShipment[] = lines.flatMap((item) => {
          const ship = lineShipInfo[item.lineId];
          return ship
            ? [
                {
                  product: item.product,
                  qty: item.qty,
                  baseQty: item.baseQty,
                  note: item.note,
                  unitPrice: item.unitPrice || 0,
                  lineSection: item.lineSection,
                  deliveryOnly: item.deliveryOnly,
                  ship,
                },
              ]
            : [];
        });
        const firstDeliveryShip =
          lineShipments.find((line) => line.ship.kind === "delivery")?.ship ??
          null;
        const firstParcelShip =
          lineShipments.find((line) => line.ship.kind === "parcel")?.ship ??
          null;

        const hasDeliveryItems = Boolean(firstDeliveryShip);
        const hasParcelItems = Boolean(firstParcelShip);

        // 줄 단위로 쪼갠 주문은 배송정보가 딱 한 벌이라 아래 값들이 곧 정확한 값이다.
        const shipCompany = (
          firstDeliveryShip?.companyName ?? deliveryCompanyName
        ).trim();
        const parcelCompany = (
          firstParcelShip?.companyName ?? parcelCompanyName
        ).trim();
        const shipDeliveryDate =
          firstDeliveryShip?.deliveryDate ?? deliveryDate;
        const shipDeliveryAmPm =
          firstDeliveryShip?.deliveryAmPm ?? deliveryAmPm;
        const shipDeliveryTime =
          firstDeliveryShip?.deliveryTime ?? deliveryTime;
        const shipParcelDate =
          firstParcelShip?.parcelShipDate ?? parcelShipDate;
        const shipRecipientName = (
          firstDeliveryShip?.recipientName ?? recipientName
        ).trim();
        const shipRecipientPhone = (
          firstDeliveryShip?.recipientPhone ?? recipientPhone
        ).trim();
        const shipRecipientAddress = firstDeliveryShip
          ? joinAddress(
              firstDeliveryShip.recipientAddress,
              firstDeliveryShip.recipientAddressDetail,
            )
          : fullRecipientAddress;
        const shipSenderName = (
          firstParcelShip?.senderName ?? senderName
        ).trim();
        const shipSenderPhone = (
          firstParcelShip?.senderPhone ?? senderPhone
        ).trim();
        const shipSenderAddress = firstParcelShip
          ? joinAddress(
              firstParcelShip.senderAddress,
              firstParcelShip.senderAddressDetail,
            )
          : fullSenderAddress;
        const shipSenderAddressDetail = (
          firstParcelShip?.senderAddressDetail ?? senderAddressDetail
        ).trim();
        const contactSource = firstParcelShip ?? firstDeliveryShip;
        const contactAddress = joinAddress(
          contactSource?.recipientAddress ?? "",
          contactSource?.recipientAddressDetail ?? "",
        );
        const contactAddressDetail = (
          contactSource?.recipientAddressDetail ?? ""
        ).trim();
        // 배달은 항상 주소로 수취. 택배만 주소/이메일/팩스 선택
        const contactMode: ParcelRecipientContactMode =
          firstParcelShip?.contactMode ?? "address";

        const drafts = greetingsForLines(lines);
        const attachedGreetingNotes =
          drafts.filter((draft) => draft.id).length > 0
            ? drafts
                .filter((draft) => draft.id)
                .map((draft) => formatGreetingDraftNotes(draft))
                .join(" / ")
            : null;

        const notes = [
          `주문자:${displayOrdererName || ordererName.trim()}`,
          `연락처:${ordererPhone.trim()}`,
          `주문일자:${orderDate}`,
          `중앙:${churchQuery.trim()}`,
          hasDeliveryItems ? `배달업체명:${shipCompany}` : null,
          hasParcelItems ? `택배업체명:${parcelCompany}` : null,
          hasDeliveryItems
            ? `배달일:${shipDeliveryDate} ${shipDeliveryAmPm} ${shipDeliveryTime}`
            : null,
          hasDeliveryItems
            ? `받는분:${shipRecipientName} / ${shipRecipientPhone} / ${
                shipRecipientAddress || "-"
              }`
            : null,
          hasParcelItems ? `택배발송일:${shipParcelDate}` : null,
          hasParcelItems
            ? `보내는사람:${shipSenderName} / ${shipSenderPhone} / ${shipSenderAddress}`
            : null,
          hasParcelItems && shipSenderAddressDetail
            ? `보내는분상세주소:${shipSenderAddressDetail}`
            : null,
          // 이메일/팩스는 선택 여부만 기록 (값 입력 없음)
          `수취연락:${PARCEL_CONTACT_MODE_LABEL[contactMode]}`,
          contactMode === "address" && contactAddress
            ? `받는분주소:${contactAddress}`
            : null,
          contactMode === "address" && contactAddressDetail
            ? `받는분상세주소:${contactAddressDetail}`
            : null,
          `주문작업지역:${selectedBranch}`,
          `지부매장:${selectedBranch}`,
          `인사장종류:${greetingKindNoteFor(drafts)}`,
          attachedGreetingNotes,
          ...lines.map(
            (item) =>
              `[${orderKindLabel(item.orderKind || selectedOrderType)}] ${item.product} ${item.qty}개${item.note ? `(${item.note})` : ""}`,
          ),
          // 줄별 배송정보 원본 (주문서 수정 시 그대로 복원)
          encodeLineShipments(lineShipments),
        ]
          .filter(Boolean)
          .join(" / ");

        const primaryKind = hasDeliveryItems ? "delivery" : "parcel";
        const deliveryWindowTime =
          hasDeliveryItems && shipDeliveryAmPm
            ? toTwentyFourHour(shipDeliveryAmPm, shipDeliveryTime)
            : null;
        if (hasDeliveryItems && !deliveryWindowTime) {
          return {
            ok: false as const,
            error: "배달 시간은 1~12시로 입력해 주세요.",
          };
        }

        return {
          ok: true as const,
          payload: {
            totalAmount: lines.reduce(
              (sum, item) => sum + item.qty * (item.unitPrice || 0),
              0,
            ),
            notes,
            extraNote: extraNote.trim(),
            items: lines.map((item) => ({
              productName: item.product,
              quantity: item.qty,
              price: item.unitPrice || 0,
            })),
            shipment: {
              fulfillmentType: "PARCEL" as const,
              carrier: primaryKind === "delivery" ? shipCompany : parcelCompany,
              deliveryAddress:
                primaryKind === "delivery"
                  ? shipRecipientAddress
                  : shipSenderAddress,
              estimatedWindow:
                primaryKind === "delivery"
                  ? `${shipDeliveryDate}T${deliveryWindowTime}:00.000Z`
                  : `${shipParcelDate}T09:00:00.000Z`,
            },
          },
        } as const;
      };

      const bodies: Array<{
        orderNumber: string;
        /** 수정 모드에서 이 묶음을 PATCH 할 주문 id */
        targetOrderId: number | null;
        lines: ProductLineItem[];
        payload: Extract<
          ReturnType<typeof buildOrderBody>,
          { ok: true }
        >["payload"];
      }> = [];
      for (const [index, lines] of orderGroups.entries()) {
        const built = buildOrderBody(lines);
        if (!built.ok) {
          setFormError(built.error);
          setResultDialog({ open: true, success: false, kind: "fail" });
          return;
        }
        // 수정 묶음은 줄에 찍힌 출처 주문번호를 그대로 쓴다.
        const sourceNumber = lines[0]?.sourceOrderNumber ?? "";
        bodies.push({
          orderNumber: canSplitLines
            ? orderGroups.length === 1
              ? baseOrderNumber
              : `${baseOrderNumber}-${index + 1}`
            : sourceNumber || baseOrderNumber,
          targetOrderId: canSplitLines ? null : (lines[0]?.sourceOrderId ?? null),
          lines,
          payload: built.payload,
        });
      }

      /** 부분 실패 시 이미 만들어진 주문을 되돌린다 */
      const rollbackCreated = async (ids: number[]) => {
        await Promise.all(
          ids.map((id) =>
            apiFetch(`/api/orders/${id}/delivery-action`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "CANCEL_ORDER" }),
            }).catch(() => null),
          ),
        );
      };

      const createdOrders: Array<{
        id: number | null;
        orderNumber: string;
        lines: ProductLineItem[];
      }> = [];

      for (const body of bodies) {
        // 분할 접수된 주문서는 묶음마다 대상 주문이 다르다.
        const patchOrderId = body.targetOrderId || editOrderId;
        const response =
          isEditMode && patchOrderId
            ? await apiFetch(`/api/orders/${patchOrderId}`, {
                method: "PATCH",
                body: JSON.stringify(body.payload),
              })
            : await apiFetch("/api/orders", {
                method: "POST",
                body: JSON.stringify({
                  orderNumber: body.orderNumber,
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
                  ...body.payload,
                }),
              });

        if (!response.ok) {
          const errBody = (await response.json().catch(() => null)) as {
            message?: string | string[];
          } | null;
          const raw = errBody?.message;
          const message = Array.isArray(raw) ? raw[0] : raw;
          const rollbackIds = createdOrders
            .map((order) => order.id)
            .filter((id): id is number => typeof id === "number");
          if (rollbackIds.length > 0) {
            await rollbackCreated(rollbackIds);
          }
          setFormError(
            (message ||
              (isEditMode
                ? "주문서 변경 접수에 실패하였습니다."
                : "제품주문서 접수에 실패하였습니다.")) +
              (rollbackIds.length > 0
                ? ` 먼저 접수된 ${rollbackIds.length}건은 취소했습니다.`
                : ""),
          );
          setResultDialog({ open: true, success: false, kind: "fail" });
          return;
        }

        const created = (await response.json().catch(() => null)) as {
          id?: number;
        } | null;
        createdOrders.push({
          id: created?.id ?? (isEditMode ? editOrderId : null),
          orderNumber: body.orderNumber,
          lines: body.lines,
        });
      }

      setResultDialog({ open: true, success: true, kind: "accept" });
      setAcceptedOrderNumber(createdOrders[0]?.orderNumber ?? baseOrderNumber);
      setAcceptedOrderNumbers(createdOrders.map((order) => order.orderNumber));

      /*
       * 인사장 연결. 인사장은 선물세트에만 붙고 GreetingForm.orderId 는 1개뿐이라,
       * 같은 선물세트가 택배/상차로 갈려 두 주문이 된 경우 두 번째부터는 사본을 만든다.
       */
      const linkedProducts = new Set<string>();
      const linkFailures: string[] = [];
      for (const order of createdOrders) {
        if (!order.id) continue;
        const seen = new Set<string>();
        for (const line of order.lines) {
          if (seen.has(line.product)) continue;
          seen.add(line.product);
          const draft = greetingsForSubmit[line.product];
          if (!draft) continue;
          try {
            let greetingId = draft.id;
            if (linkedProducts.has(line.product)) {
              // 이미 다른 주문에 붙은 인사장 → 이 주문용 사본 생성
              const copy = await createGreetingFormFromDraft(
                draft,
                line.product,
                {
                  ordererName: displayOrdererName || ordererName.trim(),
                  churchName: churchQuery.trim(),
                  phone: ordererPhone.trim(),
                },
              );
              greetingId = copy.id;
            }
            if (!greetingId) continue;
            const linkRes = await apiFetch(
              `/api/greeting-forms/${greetingId}/link-order`,
              {
                method: "PATCH",
                body: JSON.stringify({ orderId: order.id }),
              },
            );
            if (!linkRes.ok) {
              linkFailures.push(line.product);
            } else {
              linkedProducts.add(line.product);
            }
          } catch {
            linkFailures.push(line.product);
          }
        }
      }
      if (linkFailures.length > 0) {
        setFormError(
          "주문은 접수되었으나 일부 인사장 연결에 실패했습니다. 인사장관리에서 확인해 주세요.",
        );
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
          <div className="min-w-0">
            <span className="font-medium text-ink">{row.product}</span>
            <LineOriginNote row={row} />
          </div>
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

          // 포장완료·발송완료 전까지는 수량·배송선택을 고칠 수 있다.
          // (배송정보 입력 여부(shipSaved)로 잠그던 예전 규칙을 대체한다)
          const locked = row.statusLocked;
          return (
            <input
              type="number"
              min={1}
              required
              readOnly={locked}
              aria-label={`${row.product} 수량`}
              value={row.qty}
              onChange={(event) => {
                if (locked) return;
                const nextQty = Number(event.target.value);
                if (!Number.isNaN(nextQty)) {
                  updateProductQty(rowIndex, nextQty);
                }
              }}
              className={cn(
                "mx-auto block h-8 w-16 rounded border border-[#cbd5e1] px-1 text-center text-sm text-ink focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand/20 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
                locked ? "bg-[#EDF2F7]" : "bg-white",
              )}
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
        key: "lineShip",
        header: "배송선택",
        className: "w-[180px] px-1",
        render: (row: ProductLineItem) => {
          const kindOptions = row.deliveryOnly
            ? LINE_SHIP_OPTIONS.filter((option) => option.value === "delivery")
            : LINE_SHIP_OPTIONS;
          return (
            <div className="flex items-center gap-1.5">
              <select
                aria-label={`${row.product} 배송선택`}
                value={row.orderKind}
                disabled={row.statusLocked}
                onChange={(event) =>
                  handleLineKindChange(
                    row.lineId,
                    event.target.value as OrderType | "",
                  )
                }
                className="h-8 min-w-0 flex-1 rounded border border-[#cbd5e1] bg-white px-1 text-sm text-ink disabled:bg-[#EDF2F7]"
              >
                <option value="">선택</option>
                {kindOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={!row.orderKind}
                onClick={() => setShipSheetLineId(row.lineId)}
                className={cn(
                  "shrink-0 rounded border px-1.5 py-1 text-[11px] font-bold",
                  !row.orderKind
                    ? "cursor-not-allowed border-[#E2E8F0] bg-[#EDF2F7] text-[#A0AEC0]"
                    : row.shipSaved
                      ? "border-[#2F855A] bg-[#DCF0DC] text-[#2F855A]"
                      : "border-[#1A365D] bg-white text-[#1A365D]",
                )}
              >
                {row.shipSaved ? "배송정보수정" : "배송정보입력"}
              </button>
            </div>
          );
        },
      },
      {
        key: "note",
        header: "요청사항",
        render: (row) => row.note || <span className="text-[#94a3b8]">-</span>,
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
  const boxAddLabel = "+ 박스상품 추가";
  const giftUnitProductItems = productItems.filter(
    (item) => item.lineSection !== "box",
  );
  // 택배/상차로 갈라진 줄은 한 상품이므로 '총 N건'은 품명 수로 센다.
  const productLineCount = new Set(productItems.map((item) => item.product))
    .size;
  const shipSheetLine =
    productItems.find((item) => item.lineId === shipSheetLineId) ?? null;
  /** 저장값이 없으면 달력에서 고른 납품일을 미리 채워 준다. */
  const shipSheetInitial =
    shipSheetLine && shipSheetLine.orderKind
      ? (lineShipInfo[shipSheetLine.lineId] ??
        (presetShipDate
          ? {
              ...emptyLineShipInfo(shipSheetLine.orderKind),
              deliveryDate:
                shipSheetLine.orderKind === "delivery" ? presetShipDate : "",
              parcelShipDate:
                shipSheetLine.orderKind === "parcel" ? presetShipDate : "",
            }
          : null))
      : null;

  const editorName =
    getAuthUser()?.name?.trim() || getAuthUser()?.username || "—";
  const greetingTargetProducts = Array.from(
    new Set(giftUnitProductItems.map((item) => item.product)),
  );
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
    if (ordererFieldsReadOnly) return;
    if (isDirector === true && next.endsWith("관")) {
      setOrdererName(next.slice(0, -1));
    } else {
      setOrdererName(next);
    }
  };

  const handleSelectOrdererMember = (member: MemberSuggest) => {
    const trimmed = member.fullname.trim();
    // 직분(관장·총무)으로 체크 여부 결정. 구계정의 '관' 접미사 이름은 관장으로 간주
    const title =
      ordererTitleFromMemberType(member.memberType) ||
      (trimmed.endsWith("관") ? "관장" : "");
    setOrdererTitle(title);
    setIsDirector(Boolean(title));
    setOrdererName(trimmed.endsWith("관") ? trimmed.slice(0, -1) : trimmed);
    setOrdererPhone(formatPhoneInput(member.phone));
    setChurchQuery(member.churchName);
    setChurchId(member.churchId);
    setSelectedMemberId(member.id);
  };

  /**
   * 상품 카드의 수량 / 단가 / 배송선택 줄 (스크린샷 ③④).
   * 배송선택 드롭다운과 배송정보입력 버튼을 함께 보여준다.
   */
  const renderLineControls = (row: ProductLineItem, rowIndex: number) => {
    // 포장완료·발송완료 전까지는 수량·배송선택을 고칠 수 있다.
    const locked = row.statusLocked;
    const kindOptions = row.deliveryOnly
      ? LINE_SHIP_OPTIONS.filter((option) => option.value === "delivery")
      : LINE_SHIP_OPTIONS;

    return (
      <div
        className={cn(
          "mt-3 grid gap-2.5",
          "grid-cols-[minmax(56px,1fr)_minmax(0,1fr)] sm:grid-cols-[minmax(56px,0.8fr)_minmax(0,1fr)_minmax(0,1.4fr)]",
        )}
      >
        <label className="block">
          <span className="mb-1 block text-[11px] font-bold text-[#64748B]">
            수량
          </span>
          <input
            type="number"
            min={1}
            required
            readOnly={locked}
            aria-label={`${row.product} 수량`}
            value={row.qty}
            onChange={(event) => {
              if (locked) return;
              const nextQty = Number(event.target.value);
              if (!Number.isNaN(nextQty)) {
                updateProductQty(rowIndex, nextQty);
              }
            }}
            className={cn(
              "h-9 w-full rounded-md border border-[#E2E8F0] px-2 text-center text-[13px] text-[#1A202C] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
              locked ? "bg-[#EDF2F7]" : "bg-white",
            )}
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
        <div className="col-span-2 sm:col-span-1">
          <span className="mb-1 block text-[11px] font-bold text-[#64748B]">
            배송선택
          </span>
          <div className="flex items-stretch gap-1.5">
            <select
              aria-label={`${row.product} 배송선택`}
              value={row.orderKind}
              disabled={locked}
              onChange={(event) =>
                handleLineKindChange(
                  row.lineId,
                  event.target.value as OrderType | "",
                )
              }
              className="h-9 min-w-0 flex-1 rounded-md border border-[#E2E8F0] bg-white px-1.5 text-[12.5px] text-[#1A202C] disabled:bg-[#EDF2F7] disabled:text-[#64748B]"
            >
              <option value="">선택</option>
              {kindOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!row.orderKind}
              onClick={() => setShipSheetLineId(row.lineId)}
              className={cn(
                "shrink-0 rounded-md border px-2 py-1 text-[11px] font-bold leading-tight",
                !row.orderKind
                  ? "cursor-not-allowed border-[#E2E8F0] bg-[#EDF2F7] text-[#A0AEC0]"
                  : row.shipSaved
                    ? "border-[#2F855A] bg-[#DCF0DC] text-[#2F855A]"
                    : "border-[#1A365D] bg-white text-[#1A365D]",
              )}
            >
              {row.shipSaved ? (
                <>
                  배송정보
                  <br />
                  수정
                </>
              ) : (
                <>
                  배송정보
                  <br />
                  입력
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  };

  const omInputClass =
    "mb-3 w-full rounded-lg border border-[#E2E8F0] bg-white px-[11px] py-[9px] text-[13px] text-[#1A202C] disabled:bg-[#EDF2F7] disabled:text-[#A0AEC0]";
  const omLabelClass = "mb-[5px] block text-[12px] font-bold text-[#64748B]";

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

        {showProxyToggle ? (
          <label className="mb-3 inline-flex cursor-pointer items-center gap-1.5 text-[12.5px] font-semibold text-[#1A202C]">
            <input
              type="checkbox"
              checked={proxyOrder}
              onChange={(event) => {
                const checked = event.target.checked;
                proxyOrderRef.current = checked;
                setProxyOrder(checked);
                if (checked) {
                  // 타인 주문: 직분 접미사 없음
                  setIsDirector(false);
                  setOrdererTitle("");
                  selfOrdererRef.current = {
                    name: ordererName,
                    phone: ordererPhone,
                  };
                  setOrdererName("");
                  setOrdererPhone("");
                } else {
                  // 본인으로 복귀: 로그인 회원 직분으로 복원
                  const selfTitle =
                    ordererTitleFromMemberType(loggedInMemberType);
                  setOrdererTitle(selfTitle);
                  setIsDirector(Boolean(selfTitle));
                  setOrdererName(selfOrdererRef.current.name);
                  setOrdererPhone(selfOrdererRef.current.phone);
                }
              }}
              className="size-4 accent-[#3182CE]"
            />
            대신 주문서 넣기
          </label>
        ) : null}

        {showOrdererNamePhone ? (
          <>
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <label className={omLabelClass}>주문자 성명</label>
                {ordererAutocomplete ? (
                  <OrdererNameField
                    value={
                      isDirector === true ? displayOrdererName : ordererName
                    }
                    onChange={(next) => {
                      if (selectedMemberId !== null) {
                        // 연결된 회원 이름을 수정/삭제하면 성명 칸을 비우고 직분 체크박스 제거
                        setSelectedMemberId(null);
                        setIsDirector(false);
                        setOrdererTitle("");
                        setOrdererName("");
                        return;
                      }
                      handleOrdererNameInput(next);
                    }}
                    onSelectMember={handleSelectOrdererMember}
                    inputClassName={cn(omInputClass, "mb-0")}
                  />
                ) : (
                  <input
                    type="text"
                    value={
                      ordererFieldsReadOnly
                        ? displayOrdererName
                        : isDirector === true
                          ? displayOrdererName
                          : ordererName
                    }
                    onChange={(event) =>
                      handleOrdererNameInput(event.target.value)
                    }
                    readOnly={ordererFieldsReadOnly}
                    required
                    placeholder={
                      proxyOrder
                        ? "교인 성명"
                        : blankCustomerFields
                          ? "고객 성명"
                          : "주문자 성명"
                    }
                    className={cn(
                      omInputClass,
                      "mb-0",
                      ordererFieldsReadOnly && "bg-[#EDF2F7]",
                    )}
                  />
                )}
              </div>
              {showDirectorCheckbox && isDirector ? (
                // 회원 직분(관장·총무)으로만 결정되는 readonly 표시. 일반은 렌더하지 않음
                <div className="flex items-center gap-1.5 pt-6 text-[12.5px] font-semibold whitespace-nowrap text-[#1A202C]">
                  <label className="inline-flex cursor-default items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked
                      readOnly
                      disabled
                      aria-readonly="true"
                      className="size-4 accent-[#3182CE]"
                    />
                    {ordererTitle || "관장"}님
                  </label>
                </div>
              ) : null}
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
                if (ordererFieldsReadOnly) return;
                setOrdererPhone(formatPhoneInput(event.target.value));
              }}
              readOnly={ordererFieldsReadOnly}
              required
              placeholder="010-1234-5678"
              className={cn(
                omInputClass,
                ordererFieldsReadOnly && "bg-[#EDF2F7]",
              )}
            />

            {proxyOrder ? (
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className={omLabelClass}>중앙</label>
                  <div
                    className={cn(
                      omInputClass,
                      "pointer-events-none flex items-center bg-[#EDF2F7]",
                    )}
                    aria-readonly
                  >
                    {loggedInChurchName || "-"}
                  </div>
                </div>
                <div className="flex-1">
                  <label className={omLabelClass}>관장님</label>
                  <div
                    className={cn(
                      omInputClass,
                      "pointer-events-none flex items-center bg-[#EDF2F7]",
                    )}
                    aria-readonly
                  >
                    {loggedInName || "-"}
                  </div>
                </div>
              </div>
            ) : null}
          </>
        ) : null}

        {showOrderDateAndChurch ? (
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
        ) : null}
      </div>

      {/* 상품 섹션 (①박스 / ②선물세트) — 배송은 줄마다 고른다 */}
      <div className="mb-4 space-y-3">
        {isEditMode ? (
          <p className="rounded-lg border border-[#F6AD55] bg-[#FFFAF0] px-3 py-2 text-[12px] leading-relaxed text-[#9C4221]">
            이 주문서는 배송 1건입니다. 배송방식과 배송정보는 바꿀 수 있지만,
            택배·상차로 나누시려면 주문서를 새로 작성해 주세요.
          </p>
        ) : null}
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
              {boxAddLabel}
            </button>
          </div>
          {isWideProductList ? (
            <div className="overflow-x-auto rounded-lg border border-[#E2E8F0] bg-white">
              <Table
                caption="박스 상품 목록"
                columns={boxProductColumns}
                data={boxProductItems}
                emptyMessage={`박스단위로만 주문 가능합니다 (인사장 없음). '${boxAddLabel}'로 담아주세요.`}
                scrollable={!isDesktop}
                visibleRows={isDesktop ? undefined : 4}
              />
            </div>
          ) : boxProductItems.length === 0 ? (
            <p className="rounded-lg border border-dashed border-[#E2E8F0] bg-white px-3 py-6 text-center text-[12px] text-[#A0AEC0] italic">
              박스단위로만 주문 가능합니다 (인사장 없음). &apos;{boxAddLabel}
              &apos;로 담아주세요.
            </p>
          ) : (
            <ul className="space-y-2.5">
              {boxProductItems.map((row) => {
                const rowIndex = productItems.indexOf(row);
                return (
                  <li
                    key={`box-${row.lineId}`}
                    className="rounded-[10px] border border-[#E2E8F0] bg-white p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 flex-1 text-[13px] font-bold leading-snug text-[#1A202C] break-keep">
                        {row.product}
                        <LineOriginNote row={row} />
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
                    {renderLineControls(row, rowIndex)}
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
              선물세트 낱개 상품만 검색·주문할 수 있습니다. &apos;+ 선물세트
              낱개 추가&apos;로 담아주세요.
            </p>
          ) : (
            <ul className="space-y-2.5">
              {giftUnitProductItems.map((row) => {
                const rowIndex = productItems.indexOf(row);
                const draft = savedGreetingsByProduct[row.product];
                const isSaved = Boolean(draft);
                return (
                  <li
                    key={`gift-${row.lineId}`}
                    className="rounded-[10px] border border-[#E2E8F0] bg-white p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 flex-1 text-[13px] font-bold leading-snug text-[#1A202C] break-keep">
                        {row.product}
                        <LineOriginNote row={row} />
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
                    {renderLineControls(row, rowIndex)}
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
            총 {productLineCount}건 · 수량{" "}
            {productItems.reduce((sum, item) => sum + item.qty, 0)}개 ·{" "}
            <span className="font-bold text-[#1A202C]">
              {formatPrice(productListTotal)}
            </span>
          </p>
        ) : null}
      </div>

      {productItems.length > 0 ? (
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
              <Spinner size="sm" label={isEditMode ? "저장 중" : "접수 중"} />
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
        open={isProductDialogOpen}
        defaultOrderKind={orderType ?? "delivery"}
        // 전역 주문종류가 없어 "주문종류: …" 안내를 숨긴다.
        showOrderKind={false}
        openStockOnly={openStockOnly}
        presentation={productDialogPresentation}
        mode={productDialogMode}
        onClose={() => setIsProductDialogOpen(false)}
        onAddItems={addProductItems}
      />

      {/* 줄별 배송정보 입력 (스크린샷 ⑤⑥) */}
      {shipSheetLine && shipSheetLine.orderKind ? (
        <LineShipSheet
          key={shipSheetLine.lineId}
          open
          kind={shipSheetLine.orderKind}
          productName={shipSheetLine.product}
          qty={shipSheetLine.qty}
          initial={shipSheetInitial}
          minDateIso={todayDateValue()}
          shipDateLocked={shipDateLocked}
          onCancel={() => setShipSheetLineId(null)}
          onSave={(info) => saveLineShipInfo(shipSheetLine.lineId, info)}
        />
      ) : null}

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
                : acceptedOrderNumbers.length > 1
                  ? // 배송방식이 다른 줄은 주문이 따로 접수된다
                    `배송 건별로 제품주문서 ${acceptedOrderNumbers.length}건이 접수되었습니다.`
                  : "제품주문서가 접수되었습니다."
              : formError ||
                (isEditMode
                  ? "주문서 처리에 실패하였습니다."
                  : "제품주문서 접수에 실패하였습니다.")}
        </p>
        {resultDialog.success &&
        resultDialog.kind === "accept" &&
        acceptedOrderNumbers.length > 1 ? (
          <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm text-[#475569]">
            {acceptedOrderNumbers.map((number) => (
              <li key={number}>{number}</li>
            ))}
          </ul>
        ) : null}
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
            {order.name} · {order.type}{" "}
            <span className="font-semibold text-[#64748b]">{order.status}</span>
          </p>
          <p className="mt-0.5 break-words text-base text-[#64748b]">
            {order.productName}
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-base text-[#64748b]">
            <li className="break-words">주문일:{order.orderDate}</li>
            <li className="break-words">
              납품일(배달일): {order.deliveryDate || "-"}
            </li>
            <li className="break-words">
              납품처: {order.deliveryPlace || "-"}
            </li>
          </ul>
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

/** 달력 날짜 바텀시트용 주문 카드 (큰 글씨, 유형 라벨 + 주문서 보기) */
function MemberCalendarOrderCard({
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
  const isDelivery = order.type === "배달" || order.type.startsWith("배달");

  return (
    <article className="rounded-2xl border border-[#d8e0ea] bg-white px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[20px] font-bold text-ink">
          {isDelivery ? "🚚 하차배송" : "📦 택배배송"}
        </p>
        <Button
          type="button"
          variant="outline"
          className="h-12 shrink-0 rounded-xl border-[#93c5fd] bg-[#eff6ff] px-4 text-[17px] font-bold text-brand hover:bg-[#dbeafe]"
          onClick={onView}
        >
          주문서 보기
        </Button>
      </div>
      <p className="mt-1 text-[18px] font-bold text-ink">
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
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <span className="text-[22px] font-bold text-ink">{order.name}</span>
        <span className="rounded-md bg-[#fce7f3] px-2 py-0.5 text-[14px] font-bold text-[#9d174d]">
          {order.status}
        </span>
      </div>
      <p className="mt-2 break-words text-[17px] text-[#64748b]">
        {order.productName}
      </p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[17px] text-[#64748b]">
        <li className="break-words">주문일:{order.orderDate}</li>
        <li className="break-words">
          납품일(배달일): {order.deliveryDate || "-"}
        </li>
        <li className="break-words">납품처: {order.deliveryPlace || "-"}</li>
      </ul>
      {order.canConfirmReceive ? (
        <Button
          type="button"
          className="mt-3 h-12 w-full rounded-xl border-[#db2777] bg-[#fce7f3] text-[17px] font-bold text-[#9d174d] hover:bg-[#fbcfe8]"
          disabled={isConfirming}
          onClick={onConfirmReceive}
        >
          {isConfirming ? "처리 중..." : "상품수령"}
        </Button>
      ) : null}
    </article>
  );
}

function OrderStatusPanel({
  reloadToken = 0,
  churchName,
  onEditOrder,
  onCreateOrderForDate,
}: {
  reloadToken?: number;
  churchName?: string;
  onEditOrder?: (orderNumber: string) => void;
  onCreateOrderForDate?: (iso: string) => void;
}) {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [viewingOrderNumber, setViewingOrderNumber] = useState<string | null>(
    null,
  );
  const [confirmingId, setConfirmingId] = useState<number | null>(null);
  const [statusView, setStatusView] = useState<"list" | "calendar">("calendar");
  const [calendarDateIso, setCalendarDateIso] = useState<string | null>(null);
  const [calendarDayModalOpen, setCalendarDayModalOpen] = useState(false);
  /** 상품추가 시트와 같은 기준: 데스크톱은 Dialog, 모바일은 바텀시트 */
  const isDesktopWidth = useMinWidth(1040);

  /** 선택한 날짜에 주문을 추가할 수 있는지 (오늘 이후 평일만) */
  const canAddOrderForDate =
    Boolean(calendarDateIso && onCreateOrderForDate) &&
    calendarDateIso !== null &&
    calendarDateIso >= todayDateValue() &&
    !isSundayIso(calendarDateIso);
  const handleAddOrderForDate = () => {
    if (!calendarDateIso) return;
    setCalendarDayModalOpen(false);
    onCreateOrderForDate?.(calendarDateIso);
  };

  const deliveryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const order of orders) {
      const key = order.deliveryDate.slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) {
        continue;
      }
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
  }, [orders]);

  const calendarOrders = useMemo(() => {
    if (!calendarDateIso) {
      return [];
    }
    return orders.filter(
      (order) => order.deliveryDate.slice(0, 10) === calendarDateIso,
    );
  }, [orders, calendarDateIso]);

  const mapOrders = (
    data: Array<{
      id: number;
      orderNumber: string;
      status: string;
      createdAt: string;
      notes?: string | null;
      items?: Array<{ productName: string; quantity: number }>;
      shipment?: {
        fulfillmentType?: string | null;
        carrier?: string | null;
      } | null;
      greetingForms?: Array<{ id: number; linkedToOrder: boolean }>;
      user?: { fullname?: string | null } | null;
      readyForShipment?: boolean;
      orderConfirmedAt?: string | null;
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
        name: parseOrdererFromNotes(order.notes) || order.user?.fullname || "-",
        type,
        greeting: greetingLabel,
        status:
          order.orderConfirmedAt || order.status !== "PLACED"
            ? memberFacingStatusLabel(order.status)
            : "접수",
        statusCode: order.status,
        productName: buildMemberOrderSummary(order.items),
        total: (order.items ?? []).reduce(
          (sum, item) => sum + (item.quantity || 0),
          0,
        ),
        orderDate: orderDateFromNotes || toLocalIsoDate(order.createdAt) || "",
        deliveryDate: parseDeliveryRequestDateFromNotes(order.notes),
        deliveryPlace:
          parseDeliveryCompanyFromNotes(order.notes) ||
          parseParcelCompanyFromNotes(order.notes) ||
          order.shipment?.carrier?.trim() ||
          "",
        canConfirmReceive: false,
      };
    });

  useEffect(() => {
    let cancelled = false;

    const load = async (silent = false) => {
      const startedAt = Date.now();
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
              shipment?: {
                fulfillmentType?: string | null;
                carrier?: string | null;
              } | null;
              greetingForms?: Array<{ id: number; linkedToOrder: boolean }>;
              user?: { fullname?: string | null } | null;
              readyForShipment?: boolean;
              orderConfirmedAt?: string | null;
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
          // 스피너가 너무 짧게 깜빡이지 않도록 최소 표시 시간을 보장한다.
          const remaining = STATUS_LOADING_MIN_MS - (Date.now() - startedAt);
          if (remaining > 0) {
            await new Promise((resolve) =>
              window.setTimeout(resolve, remaining),
            );
          }
          if (!cancelled) {
            setIsLoading(false);
          }
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
        { id: number; status: string; message?: string } | { message?: string };
      if (!response.ok) {
        throw new Error(data.message ?? "상품수령 처리에 실패했습니다.");
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
      key: "deliveryDate",
      header: "납품일(배달일)",
      render: (row) => row.deliveryDate || "-",
    },
    {
      key: "deliveryPlace",
      header: "납품처",
      render: (row) => row.deliveryPlace || "-",
    },
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

  // 달력 날짜 모달(모바일: 바텀시트 / 데스크톱: Dialog) 공통 조각
  const dayModalOpen = calendarDayModalOpen && Boolean(calendarDateIso);
  const dayTitle = calendarDateIso
    ? formatCalendarDayTitle(calendarDateIso)
    : "주문";
  const closeDayModal = () => setCalendarDayModalOpen(false);
  const dayEmptyMessage =
    calendarDateIso && isSundayIso(calendarDateIso)
      ? "일요일에는 주문서를 작성할 수 없습니다."
      : "선택한 날짜에 납품 주문이 없습니다.";
  const addOrderButton = (
    <button
      type="button"
      className="flex h-16 w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[#c4b5fd] bg-[#faf5ff] text-[20px] font-bold text-[#5b21b6] hover:bg-[#f3e8ff]"
      onClick={handleAddOrderForDate}
    >
      <span aria-hidden>+ 📦</span>
      주문 추가
    </button>
  );
  const renderDayCards = (Card: typeof MemberCalendarOrderCard) =>
    calendarOrders.map((order) => (
      <Card
        key={order.id}
        order={order}
        isConfirming={confirmingId === order.id}
        onConfirmReceive={() => {
          void handleConfirmReceive(order.id);
        }}
        onView={() => setViewingOrderNumber(order.orderNumber)}
        onEdit={
          onEditOrder
            ? () => {
                closeDayModal();
                onEditOrder(order.orderNumber);
              }
            : undefined
        }
      />
    ));

  return (
    <div className="space-y-3">
      {isLoading ? (
        <MemberStatusSummaryCard
          churchName={churchName}
          action={
            <Spinner
              size="xl"
              label="주문 불러오는 중"
              className="mr-2 text-[#7c3aed]"
            />
          }
        >
          <p className="text-[15px] font-semibold text-[#64748b]">&nbsp;</p>
        </MemberStatusSummaryCard>
      ) : error ? (
        <MemberStatusSummaryCard churchName={churchName}>
          <p className="text-[15px] font-semibold text-red">{error}</p>
        </MemberStatusSummaryCard>
      ) : (
        <>
          <MemberStatusSummaryCard
            churchName={churchName}
            action={
              <button
                type="button"
                className="shrink-0 rounded-lg px-2 py-2 text-[18px] font-bold text-[#0f172a] hover:bg-white/60"
                onClick={() =>
                  setStatusView((view) =>
                    view === "list" ? "calendar" : "list",
                  )
                }
              >
                {statusView === "list" ? "달력보기" : "목록보기"}
              </button>
            }
          >
            <p className="text-[15px] font-semibold text-[#1e293b]">
              총 {orders.length}건
            </p>
          </MemberStatusSummaryCard>

          {statusView === "calendar" ? (
            <>
              <section className="min-w-0 rounded-2xl bg-white p-4">
                <MemberOrderCalendar
                  counts={deliveryCounts}
                  selectedIso={calendarDateIso}
                  onSelectIso={(iso) => {
                    setCalendarDateIso(iso);
                    const empty = (deliveryCounts[iso] ?? 0) === 0;
                    if (empty && iso >= todayDateValue() && !isSundayIso(iso)) {
                      setCalendarDayModalOpen(false);
                      onCreateOrderForDate?.(iso);
                      return;
                    }
                    setCalendarDayModalOpen(true);
                  }}
                />
              </section>
              {!isDesktopWidth ? (
                <BottomSheet
                  open={dayModalOpen}
                  title={dayTitle}
                  onClose={closeDayModal}
                  footer={canAddOrderForDate ? addOrderButton : undefined}
                >
                  <div className="space-y-3 px-4 pt-1 pb-4">
                    {calendarOrders.length === 0 ? (
                      <p className="py-6 text-center text-lg text-muted-foreground">
                        {dayEmptyMessage}
                      </p>
                    ) : (
                      renderDayCards(MemberCalendarOrderCard)
                    )}
                  </div>
                </BottomSheet>
              ) : (
                <Dialog
                  open={dayModalOpen}
                  title={dayTitle}
                  onClose={closeDayModal}
                  className="max-h-[80vh] overflow-y-auto"
                >
                  {calendarOrders.length === 0 ? (
                    <p className="text-center text-lg text-muted-foreground">
                      {dayEmptyMessage}
                    </p>
                  ) : (
                    <div className="space-y-2.5">
                      {renderDayCards(MemberMobileOrderCard)}
                    </div>
                  )}
                  {canAddOrderForDate ? (
                    <div className="mt-4">{addOrderButton}</div>
                  ) : null}
                </Dialog>
              )}
            </>
          ) : (
            <>
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
  const [activeMenu, setActiveMenu] = useState<MemberNav>(
    embedded ? "새 주문서 작성" : "내 주문 현황",
  );
  const pwaInstalled = usePwaInstalled();
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
  const [presetShipDate, setPresetShipDate] = useState<string | null>(null);
  const preserveGreetingOnOrderNavRef = useRef(false);
  const [memberProfile, setMemberProfile] = useState<{
    name: string;
    churchName: string;
    /** 직분 라벨 (관장/일반/총무/...) */
    memberTypeLabel: string;
  }>({ name: "", churchName: "", memberTypeLabel: "" });

  useEffect(() => {
    if (pwaInstalled && activeMenu === "바로가기추가") {
      setActiveMenu("내 주문 현황");
    }
  }, [pwaInstalled, activeMenu]);

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
  }, [
    orderFormDirty,
    savedGreetingsByProduct,
    hasUnsavedGreeting,
    onDirtyChange,
  ]);

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
            memberType?: string | null;
            church?: { name?: string | null } | null;
          };
        };
        if (!response.ok || cancelled) {
          return;
        }
        setMemberProfile({
          name: data.user?.name?.trim() || auth?.name || "",
          churchName: data.user?.church?.name?.trim() || "",
          memberTypeLabel: formatMemberTypeLabel(data.user?.memberType),
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
    setPresetShipDate(null);
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
    setPresetShipDate(null);
    setOrderFormKey((key) => key + 1);
    setActiveMenu("새 주문서 작성");
    setIsMobileMenuOpen(false);
  };

  const handleCreateOrderForDate = (iso: string) => {
    if (isSundayIso(iso)) {
      return;
    }
    if (
      (orderFormDirty ||
        Object.keys(savedGreetingsByProduct).length > 0 ||
        hasUnsavedGreeting) &&
      !window.confirm(
        "작성 중인 내용이 있습니다. 새 주문서로 이동하시겠습니까?",
      )
    ) {
      return;
    }
    clearLinkedGreeting();
    setOrderFormDirty(false);
    setEditingOrderNumber(null);
    setPresetShipDate(iso);
    setOrderFormKey((key) => key + 1);
    setActiveMenu("새 주문서 작성");
    setIsMobileMenuOpen(false);
  };

  const handleEditOrCreateComplete = (orderNumber?: string) => {
    clearLinkedGreeting();
    setOrderFormDirty(false);
    const wasEditing = Boolean(editingOrderNumber);
    setEditingOrderNumber(null);
    setPresetShipDate(null);
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
        setPresetShipDate(null);
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
      case "바로가기추가":
        return null;
    }
  };

  const renderContent = () => {
    switch (activeMenu) {
      case "새 주문서 작성":
      case "인사장관리":
        return (
          <>
            <div
              className={activeMenu === "새 주문서 작성" ? "block" : "hidden"}
            >
              <ProductOrderPanel
                key={orderFormKey}
                blankCustomerFields={embedded}
                openStockOnly={!embedded}
                sheetOnMobile={!embedded}
                presetShipDate={presetShipDate}
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
            churchName={memberProfile.churchName}
            onEditOrder={handleStartEditOrder}
            onCreateOrderForDate={handleCreateOrderForDate}
          />
        );
      case "거래처관리":
        return <MemberPartnerMng />;
      case "바로가기추가":
        return <MemberHomeInstallMng />;
    }
  };

  // 내 주문 현황(달력/목록)은 고령 사용자용으로 제목·설명 없이 요약 카드부터 바로 보여준다.
  const hidePageMeta =
    !embedded && activeMenu === "내 주문 현황" && !editingOrderNumber;

  const content = (
    <>
      {!embedded && !hidePageMeta ? (
        <div className="mb-3.5 flex flex-col gap-3 min-[1100px]:flex-row min-[1100px]:items-start min-[1100px]:justify-between">
          <div>
            {pageMeta.title === "제품주문서 (신규작성)" ? (
              <p className="mb-1 text-[12px] font-bold tracking-wide text-[#C05621]">
                Beta 테스트중
              </p>
            ) : null}
            <h3 className="text-[22px] font-semibold text-ink">
              {pageMeta.title}
            </h3>
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
    <div className="grid min-h-[100dvh] grid-cols-1 bg-white min-[1040px]:min-h-[730px] min-[1040px]:grid-cols-[200px_1fr] min-[1040px]:overflow-hidden min-[1040px]:rounded-[10px] min-[1040px]:border min-[1040px]:border-[#cbd3df]">
      <MemberSidebar
        activeMenu={activeMenu}
        onMenuChange={handleMenuChange}
        churchName={memberProfile.churchName}
        memberName={memberProfile.name}
      />

      <section className="bg-[#f1f0f5] min-[1040px]:bg-[#f7f9fc] min-[1040px]:p-4">
        <MobileMemberHeader
          activeMenu={activeMenu}
          isOpen={isMobileMenuOpen}
          onToggle={() => setIsMobileMenuOpen((open) => !open)}
          onMenuChange={handleMenuChange}
          memberName={memberProfile.name}
          memberTypeLabel={memberProfile.memberTypeLabel}
        />

        <div className="px-4 pt-4 pb-6 min-[1040px]:p-0">{content}</div>
      </section>
    </div>
  );
}

export default OrderListInput;
