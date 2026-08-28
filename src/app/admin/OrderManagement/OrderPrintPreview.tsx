"use client";

import html2canvas from "html2canvas-pro";
import { jsPDF } from "jspdf";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Dropdown } from "@/components/ui/dropdown";
import { apiFetch } from "@/lib/api";
import {
  parseBranchStoreFromNotes,
  parseChurchFromNotes,
  parseDeliveryCompanyFromNotes,
  greetingMaterialFromNotes,
  parseGreetingSpecialNoteFromNotes,
  parseItemNoteFromNotes,
  parseOrderDateFromNotes,
  parseOrdererFromNotes,
  parseOrderTypeFromNotes,
  parseParcelCompanyFromNotes,
  parseRecipientPartsFromNotes,
  parseShipDateFromNotes,
} from "@/lib/order-notes";
import { cn } from "@/lib/utils";
import {
  type DeliveryAction,
  FACTORY_CHANGE_ALERT_MESSAGE,
} from "@/lib/order-delivery";

export type OrderShipType = "택배" | "배달";

/** One printable sheet = one product line of an order. */
export interface GiftSetPrintPage {
  /** e.g. ORD-2026-858457-1 */
  pageNo: string;
  orderNumber: string;
  type: OrderShipType;
  orderDate: string;
  shipDate: string;
  region: string;
  managerName: string;
  companyName: string;
  productName: string;
  /** Stock catalog image when available (mobile card only). */
  productImageUrl?: string | null;
  quantityLabel: string;
  shipMethod: string;
  packaging: string;
  greetingMaterial: string;
  greetingLocation: string;
  labelPresence: string;
  specialNote: string;
  /** 주문 작업 지역 (남부/서부/중부 지부 매장) */
  workRegion: string;
  recipientName: string;
  recipientPhone: string;
  recipientAddress: string;
}

type ApiOrder = {
  id: number;
  orderNumber: string;
  status: string;
  createdAt: string;
  notes?: string | null;
  factoryAlert?: string | null;
  items?: Array<{ productName: string; quantity: number }>;
  shipment?: {
    fulfillmentType?: string | null;
    estimatedWindow?: string | null;
    carrier?: string | null;
    shippedAt?: string | null;
    deliveredAt?: string | null;
  } | null;
  greetingForms?: Array<{ specialNote?: string | null }>;
  user?: {
    fullname?: string | null;
    phone?: string | null;
    church?: { name?: string | null; region?: string | null } | null;
  } | null;
};

function DeliveryWorkflowPanel({
  order,
  busyAction,
  onAction,
}: {
  order: ApiOrder;
  busyAction: DeliveryAction | null;
  onAction: (action: DeliveryAction) => void;
}) {
  const status = order.status;

  /** 관리자 승인 후 상차완료 활성화 (발송대기 전) */
  const loadCompleteReady = status === "WAITING_FOR_SHIPMENT";
  const loadCompleteDone =
    status === "PREPARED" ||
    status === "LOAD_NOTIFIED" ||
    status === "SHIPPING" ||
    status === "RECEIVED" ||
    status === "PRINTING_COMPLETE";

  /** 상차완료(발송대기) 후 배송시작 */
  const shipStartReady =
    status === "PREPARED" || status === "LOAD_NOTIFIED";
  const shipStartDone =
    status === "SHIPPING" ||
    status === "RECEIVED" ||
    status === "PRINTING_COMPLETE";

  return (
    <div className="space-y-3 rounded-lg border border-line bg-[#f8fafc] p-3 print:hidden">
      <div>
        <p className="mb-2 text-sm font-bold text-ink">공장 출하관리</p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            disabled={!loadCompleteReady || busyAction !== null}
            className={cn(
              "text-white",
              loadCompleteDone
                ? "border-[#34d399] bg-[#34d399] opacity-80"
                : loadCompleteReady
                  ? "border-[#059669] bg-[#059669] ring-2 ring-[#6ee7b7] hover:bg-[#047857]"
                  : "border-[#a7f3d0] bg-[#ecfdf5] text-[#94a3b8]",
            )}
            onClick={() => onAction("FACTORY_PREPARE")}
          >
            {busyAction === "FACTORY_PREPARE" ? "처리 중..." : "상차완료!"}
          </Button>
          {shipStartReady || shipStartDone ? (
            <Button
              type="button"
              size="sm"
              disabled={!shipStartReady || busyAction !== null}
              className={cn(
                "text-white",
                shipStartDone
                  ? "border-[#a78bfa] bg-[#a78bfa] opacity-80"
                  : shipStartReady
                    ? "border-[#7c3aed] bg-[#7c3aed] ring-2 ring-[#c4b5fd] hover:bg-[#6d28d9]"
                    : "border-[#ddd6fe] bg-[#f5f3ff] text-[#94a3b8]",
              )}
              onClick={() => onAction("FACTORY_SHIP")}
            >
              {busyAction === "FACTORY_SHIP" ? "처리 중..." : "배송시작"}
            </Button>
          ) : null}
        </div>
        {status === "PLACED" ? (
          <p className="mt-2 text-xs text-[#64748b]">
            관리자가 관리자 승인을 하면 상차완료! 버튼이 활성화됩니다.
          </p>
        ) : null}
        {loadCompleteReady ? (
          <p className="mt-2 text-xs font-medium text-[#047857]">
            상차 준비가 끝나면 상차완료!를 눌러 주세요. (발송대기로 전환)
          </p>
        ) : null}
        {shipStartReady ? (
          <p className="mt-2 text-xs font-medium text-[#6d28d9]">
            발송대기 상태입니다. 출발 시 배송시작을 눌러 주세요.
          </p>
        ) : null}
        {shipStartDone && status === "SHIPPING" ? (
          <p className="mt-2 text-xs text-[#64748b]">
            배송중. 관리자의 인수증 수령을 기다립니다.
          </p>
        ) : null}
      </div>
    </div>
  );
}

const WEEKDAY_KO = ["일", "월", "화", "수", "목", "금", "토"] as const;

function toPrintShipType(
  notes: string | null | undefined,
  fulfillmentType?: string | null,
): OrderShipType {
  const fromNotes = parseOrderTypeFromNotes(notes);
  if (fromNotes === "배달" || fromNotes.startsWith("배달")) {
    return "배달";
  }
  if (fromNotes === "택배") {
    return "택배";
  }
  if (fulfillmentType === "PICKUP") {
    return "배달";
  }
  return "택배";
}

function formatKoreanDate(value: string | null | undefined) {
  if (!value) {
    return "";
  }
  const raw = value.trim();
  const datePart = raw.slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datePart);
  if (!match) {
    return raw;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(date.getTime())) {
    return datePart;
  }
  return `${month}/${day}(${WEEKDAY_KO[date.getUTCDay()]})`;
}

function packagingForProduct(productName: string, itemNote: string) {
  if (itemNote.includes("개별")) {
    return "개별";
  }
  if (itemNote.includes("박스") || productName.includes("박스")) {
    return "박스";
  }
  return "박스";
}

function mapOrderToPrintPages(
  order: ApiOrder,
  productImageByName: Record<string, string> = {},
): GiftSetPrintPage[] {
  const notes = order.notes;
  const type = toPrintShipType(notes, order.shipment?.fulfillmentType);
  const orderDate =
    parseOrderDateFromNotes(notes) || order.createdAt.slice(0, 10);
  const shipDate =
    parseShipDateFromNotes(notes) ||
    order.shipment?.estimatedWindow?.slice(0, 10) ||
    "";
  const region =
    parseChurchFromNotes(notes) ||
    order.user?.church?.name ||
    order.user?.church?.region ||
    "";
  const managerName =
    parseOrdererFromNotes(notes) || order.user?.fullname || "-";
  const companyName =
    (type === "배달"
      ? parseDeliveryCompanyFromNotes(notes)
      : parseParcelCompanyFromNotes(notes)) ||
    order.shipment?.carrier ||
    "";
  const hasGreetingForms = (order.greetingForms?.length ?? 0) > 0;
  const greetingMaterialRaw = greetingMaterialFromNotes(notes);
  const greetingMaterial =
    hasGreetingForms && greetingMaterialRaw === "없음"
      ? "최지원"
      : greetingMaterialRaw;
  const greetingLocation =
    greetingMaterial === "없음" ? "-" : "박스외부";
  const greetingSpecialNote =
    order.greetingForms?.find((form) => form.specialNote?.trim())?.specialNote
      ?.trim() ||
    parseGreetingSpecialNoteFromNotes(notes);
  const workRegion = parseBranchStoreFromNotes(notes);
  const recipient = parseRecipientPartsFromNotes(notes);

  const basePageFields = {
    orderNumber: order.orderNumber,
    type,
    orderDate: formatKoreanDate(orderDate),
    shipDate: formatKoreanDate(shipDate),
    region,
    managerName,
    companyName,
    shipMethod: (type === "배달" ? "상차" : "택배") as "상차" | "택배" | string,
    packaging: "박스",
    greetingMaterial,
    greetingLocation,
    labelPresence: type === "택배" ? "유" : "없음",
    workRegion,
    recipientName: recipient.name,
    recipientPhone: recipient.phone,
    recipientAddress: recipient.address,
  };

  const items = order.items ?? [];
  if (items.length === 0) {
    return [
      {
        ...basePageFields,
        pageNo: `${order.orderNumber}-1`,
        productName: "-",
        productImageUrl: null,
        quantityLabel: "0세트",
        specialNote: greetingSpecialNote,
      },
    ];
  }

  return items.map((item, index) => {
    const itemNote = parseItemNoteFromNotes(
      notes,
      item.productName,
      item.quantity,
    );
    const specialNote = [greetingSpecialNote, itemNote]
      .filter(Boolean)
      .filter((value, index, list) => list.indexOf(value) === index)
      .join(" / ");
    return {
      ...basePageFields,
      pageNo: `${order.orderNumber}-${index + 1}`,
      productName: item.productName,
      productImageUrl: productImageByName[item.productName] ?? null,
      quantityLabel: `${item.quantity}세트`,
      packaging: packagingForProduct(item.productName, itemNote),
      specialNote,
    };
  });
}

function SheetCell({
  label,
  value,
  valueClassName,
  className,
  labelClassName,
}: {
  label: string;
  value: string;
  valueClassName?: string;
  className?: string;
  labelClassName?: string;
}) {
  return (
    <div className={cn("flex min-h-[104px] border-b border-[#334155]", className)}>
      <div
        className={cn(
          "flex w-[28%] shrink-0 items-center justify-center border-r border-[#334155] bg-[#fde68a] px-2 text-center text-[1.75rem] font-bold leading-tight text-ink [print-color-adjust:exact] [-webkit-print-color-adjust:exact]",
          labelClassName,
        )}
      >
        {label}
      </div>
      <div
        className={cn(
          "flex flex-1 items-center justify-center px-3 text-center text-[1.75rem] font-semibold leading-tight text-ink [print-color-adjust:exact] [-webkit-print-color-adjust:exact]",
          valueClassName,
        )}
      >
        {value || "\u00A0"}
      </div>
    </div>
  );
}

function PreviewCardRow({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="grid grid-cols-[8.5rem_1fr] gap-2 border-b border-[#e2e8f0] py-3 last:border-b-0">
      <dt className="text-[1.3125rem] font-semibold leading-snug text-[#64748b]">
        {label}
      </dt>
      <dd
        className={cn(
          "rounded-md px-2.5 py-1.5 text-[1.5rem] font-semibold leading-snug text-ink break-keep",
          valueClassName,
        )}
      >
        {value || "-"}
      </dd>
    </div>
  );
}

/** Mobile-friendly on-screen preview. Print/PDF keep GiftSetPrintSheet. */
function GiftSetPreviewCard({ page }: { page: GiftSetPrintPage }) {
  const productImage = page.productImageUrl?.trim() || "";

  return (
    <article className="overflow-hidden rounded-xl border border-line bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
      <header className="flex flex-wrap items-center justify-between gap-2 bg-[#93c5fd] px-3.5 py-3.5">
        <h2 className="text-[1.5rem] font-bold text-ink">선물세트 주문서</h2>
        <p className="rounded-md bg-white/90 px-2.5 py-1.5 text-[1.3125rem] font-bold text-ink">
          NO {page.pageNo}
        </p>
      </header>

      <dl className="px-3.5 py-1">
        <PreviewCardRow label="주문일자" value={page.orderDate} />
        <PreviewCardRow label="납품일자" value={page.shipDate} />
        <PreviewCardRow label="지역" value={page.region} />
        <PreviewCardRow label="담당자" value={page.managerName} />
        <PreviewCardRow label="업체명 납품처" value={page.companyName} />
        {productImage ? (
          <div className="border-b border-[#e2e8f0] py-3">
            <p className="mb-2 text-[1.3125rem] font-semibold text-[#64748b]">
              상품 이미지
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={productImage}
              alt={page.productName}
              className="mx-auto max-h-48 w-full max-w-[220px] rounded-lg border border-line bg-white object-contain"
            />
          </div>
        ) : null}
        <PreviewCardRow
          label="상품명"
          value={page.productName}
          valueClassName="bg-[#bbf7d0]"
        />
        <PreviewCardRow
          label="수량"
          value={page.quantityLabel}
          valueClassName="bg-[#bbf7d0]"
        />
        <PreviewCardRow
          label="상차/택배"
          value={page.shipMethod}
          valueClassName="bg-[#fdba74]"
        />
        <PreviewCardRow label="포장" value={page.packaging} />
        <PreviewCardRow label="인사장소재" value={page.greetingMaterial} />
        <PreviewCardRow label="인사장위치" value={page.greetingLocation} />
        <PreviewCardRow label="기표지유무" value={page.labelPresence} />
        <PreviewCardRow label="특이사항" value={page.specialNote} />
        <PreviewCardRow label="주문 작업 지역" value={page.workRegion} />
        {page.type === "택배" ? (
          <PreviewCardRow label="받는 분 주소" value={page.recipientAddress} />
        ) : (
          <>
            <PreviewCardRow label="받는 분 성함" value={page.recipientName} />
            <PreviewCardRow label="연락처" value={page.recipientPhone} />
            <PreviewCardRow label="주소" value={page.recipientAddress} />
          </>
        )}
      </dl>
    </article>
  );
}

function GiftSetPrintSheet({ page }: { page: GiftSetPrintPage }) {
  return (
    <div className="gift-set-print-sheet overflow-hidden rounded-md border-2 border-[#1f2937] bg-white [print-color-adjust:exact] [-webkit-print-color-adjust:exact] print:rounded-none">
      <div className="grid grid-cols-[1fr_auto] border-b-2 border-[#1f2937]">
        <div className="flex items-center justify-center bg-[#93c5fd] px-4 py-4 [print-color-adjust:exact] [-webkit-print-color-adjust:exact]">
          <h2 className="text-xl font-bold tracking-wide text-ink">
            선물세트 주문서
          </h2>
        </div>
        <div className="flex min-w-[200px] border-l-2 border-[#1f2937]">
          <div className="flex w-14 items-center justify-center border-r border-[#334155] bg-[#fde68a] text-sm font-bold text-ink [print-color-adjust:exact] [-webkit-print-color-adjust:exact]">
            NO
          </div>
          <div className="flex flex-1 items-center justify-center bg-white px-3 text-sm font-bold text-ink">
            {page.pageNo}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 border-b border-[#334155]">
        <SheetCell
          label="주문일자"
          value={page.orderDate}
          className="border-b-0 border-r border-[#334155]"
        />
        <SheetCell
          label="상차/택배 납품일자"
          value={page.shipDate}
          className="border-b-0"
          labelClassName="w-[42%]"
        />
      </div>

      <div className="grid grid-cols-2 border-b border-[#334155]">
        <SheetCell
          label="지역"
          value={page.region}
          className="border-b-0 border-r border-[#334155]"
        />
        <SheetCell
          label="담당자"
          value={page.managerName}
          className="border-b-0"
          labelClassName="w-[42%]"
        />
      </div>

      <SheetCell label="업체명 납품처" value={page.companyName} />

      <div className="grid grid-cols-2 border-b border-[#334155]">
        <SheetCell
          label="상품명 품목"
          value={page.productName}
          className="border-b-0 border-r border-[#334155]"
          valueClassName="bg-[#bbf7d0]"
        />
        <SheetCell
          label="수량"
          value={page.quantityLabel}
          className="border-b-0"
          labelClassName="w-[42%]"
          valueClassName="bg-[#bbf7d0]"
        />
      </div>

      <div className="grid grid-cols-2 border-b border-[#334155]">
        <SheetCell
          label="상차/택배"
          value={page.shipMethod}
          className="border-b-0 border-r border-[#334155]"
          valueClassName="bg-[#fdba74]"
        />
        <SheetCell
          label="개별포장/박스포장"
          value={page.packaging}
          className="border-b-0"
          labelClassName="w-[42%]"
        />
      </div>

      <SheetCell label="인사장소재" value={page.greetingMaterial} />
      <SheetCell label="인사장위치" value={page.greetingLocation} />
      <SheetCell label="기표지유무" value={page.labelPresence} />
      <SheetCell
        label="특이사항"
        value={page.specialNote}
        className="min-h-[144px]"
      />
      <SheetCell label="주문 작업 지역" value={page.workRegion} />
      {page.type === "택배" ? (
        <SheetCell
          label="받는 분 주소"
          value={page.recipientAddress}
          className="border-b-0"
        />
      ) : (
        <>
          <SheetCell label="받는 분 성함" value={page.recipientName} />
          <SheetCell label="연락처" value={page.recipientPhone} />
          <SheetCell
            label="주소"
            value={page.recipientAddress}
            className="border-b-0"
          />
        </>
      )}
    </div>
  );
}

export function OrderPrintPreview({
  orderNumber,
  embedded = false,
  showAdminDeliveryControls = true,
  showFactoryControls = false,
}: {
  /** When set, only show pages for this order number. */
  orderNumber?: string;
  /** Compact chrome when shown inside a modal. */
  embedded?: boolean;
  /** Admin delivery action buttons (관리자 배송관리). */
  showAdminDeliveryControls?: boolean;
  /** Factory shipment action buttons (공장 출하관리). */
  showFactoryControls?: boolean;
} = {}) {
  const [pages, setPages] = useState<GiftSetPrintPage[]>([]);
  const [ordersByNumber, setOrdersByNumber] = useState<Record<string, ApiOrder>>(
    {},
  );
  const [productImageByName, setProductImageByName] = useState<
    Record<string, string>
  >({});
  const productImageByNameRef = useRef(productImageByName);
  productImageByNameRef.current = productImageByName;
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedPageNo, setSelectedPageNo] = useState("");
  const [isSavingPdf, setIsSavingPdf] = useState(false);
  const [busyAction, setBusyAction] = useState<DeliveryAction | null>(null);
  const [actionError, setActionError] = useState("");
  const [clearingFactoryAlert, setClearingFactoryAlert] = useState(false);
  const pdfSheetRef = useRef<HTMLDivElement>(null);

  const loadOrders = async (silent = false) => {
    if (!silent) {
      setIsLoading(true);
      setError("");
    }

    try {
      const response = await apiFetch("/api/orders");
      const data = (await response.json()) as ApiOrder[] | { message?: string };

      if (!response.ok || !Array.isArray(data)) {
        if (!silent) {
          setError(
            !Array.isArray(data) && data.message
              ? data.message
              : "주문 목록을 불러오지 못했습니다.",
          );
          setPages([]);
          setOrdersByNumber({});
        }
        return;
      }

      const filtered = data.filter((order) => {
        if (order.status === "CANCELLED") {
          return false;
        }
        if (orderNumber) {
          return order.orderNumber === orderNumber;
        }
        return true;
      });

      const nextMap: Record<string, ApiOrder> = {};
      for (const order of filtered) {
        nextMap[order.orderNumber] = order;
      }
      setOrdersByNumber(nextMap);
      setPages(
        filtered.flatMap((order) =>
          mapOrderToPrintPages(order, productImageByNameRef.current),
        ),
      );
    } catch {
      if (!silent) {
        setError("주문 목록을 불러오지 못했습니다.");
        setPages([]);
        setOrdersByNumber({});
      }
    } finally {
      if (!silent) {
        setIsLoading(false);
      }
    }
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await apiFetch("/api/stock-inventory");
        const data = (await response.json()) as
          | Array<{ productName?: string; imageUrl?: string | null }>
          | { message?: string };
        if (!response.ok || !Array.isArray(data) || cancelled) {
          return;
        }
        const map: Record<string, string> = {};
        for (const item of data) {
          const name = item.productName?.trim();
          const imageUrl = item.imageUrl?.trim();
          if (name && imageUrl) {
            map[name] = imageUrl;
          }
        }
        productImageByNameRef.current = map;
        setProductImageByName(map);
      } catch {
        // Preview still works without images.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Attach catalog images once stock inventory is loaded.
  useEffect(() => {
    if (Object.keys(productImageByName).length === 0) {
      return;
    }
    setPages((current) => {
      if (current.length === 0) {
        return current;
      }
      const byNumber = new Map(
        Object.values(ordersByNumber).map((order) => [order.orderNumber, order]),
      );
      const rebuilt: GiftSetPrintPage[] = [];
      const seen = new Set<string>();
      for (const page of current) {
        if (seen.has(page.orderNumber)) {
          continue;
        }
        seen.add(page.orderNumber);
        const order = byNumber.get(page.orderNumber);
        if (order) {
          rebuilt.push(...mapOrderToPrintPages(order, productImageByName));
        }
      }
      return rebuilt.length > 0 ? rebuilt : current;
    });
  }, [productImageByName]);

  useEffect(() => {
    void loadOrders();
  }, [orderNumber]);

  // Admin/factory screens stay open while the other role advances status —
  // always poll so 주문서 미리보기 does not stick on a stale step.
  useEffect(() => {
    const timer = window.setInterval(() => {
      void loadOrders(true);
    }, 4000);
    return () => window.clearInterval(timer);
  }, [orderNumber]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void loadOrders(true);
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [orderNumber]);

  useEffect(() => {
    if (pages.length === 0) {
      setSelectedPageNo("");
      return;
    }
    setSelectedPageNo((current) =>
      current && pages.some((page) => page.pageNo === current)
        ? current
        : pages[0].pageNo,
    );
  }, [pages]);

  const selectedPage = useMemo(
    () => pages.find((page) => page.pageNo === selectedPageNo) ?? pages[0],
    [pages, selectedPageNo],
  );

  const selectedOrder = selectedPage
    ? ordersByNumber[selectedPage.orderNumber]
    : undefined;

  // 공장 출하관리 패널만 표시 (관리자 주문/배송 알림·상태관리 패널 제거)
  const showDeliveryWorkflow = Boolean(selectedOrder) && showFactoryControls;

  const pagesForSelectedOrder = useMemo(() => {
    if (!selectedPage) {
      return [];
    }
    return pages.filter((page) => page.orderNumber === selectedPage.orderNumber);
  }, [pages, selectedPage]);

  const factoryAlertTarget = useMemo(() => {
    if (!showFactoryControls) {
      return null;
    }
    if (selectedOrder?.factoryAlert) {
      return selectedOrder;
    }
    return (
      Object.values(ordersByNumber).find((order) => order.factoryAlert) ?? null
    );
  }, [showFactoryControls, selectedOrder, ordersByNumber]);

  const factoryAlertMessage = factoryAlertTarget?.factoryAlert ?? null;

  const runDeliveryAction = async (action: DeliveryAction) => {
    if (!selectedOrder || busyAction) {
      return;
    }
    setBusyAction(action);
    setActionError("");
    try {
      const response = await apiFetch(
        `/api/orders/${selectedOrder.id}/delivery-action`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        },
      );
      const data = (await response.json()) as ApiOrder | { message?: string | string[] };
      if (!response.ok) {
        const raw =
          !("id" in data) && data.message
            ? data.message
            : "상태 변경에 실패했습니다.";
        throw new Error(Array.isArray(raw) ? raw[0] : raw);
      }
      if ("id" in data) {
        setOrdersByNumber((prev) => ({
          ...prev,
          [data.orderNumber]: data,
        }));
      }
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "상태 변경에 실패했습니다.",
      );
    } finally {
      setBusyAction(null);
    }
  };

  const clearFactoryAlert = async () => {
    if (!factoryAlertTarget?.factoryAlert || clearingFactoryAlert) {
      return;
    }
    setClearingFactoryAlert(true);
    setActionError("");
    try {
      const response = await apiFetch(
        `/api/orders/${factoryAlertTarget.id}/factory-alert`,
        { method: "PATCH" },
      );
      const data = (await response.json()) as ApiOrder | { message?: string | string[] };
      if (!response.ok) {
        const raw =
          !("id" in data) && data.message
            ? data.message
            : "알림 확인에 실패했습니다.";
        throw new Error(Array.isArray(raw) ? raw[0] : raw);
      }
      if ("id" in data) {
        setOrdersByNumber((prev) => ({
          ...prev,
          [data.orderNumber]: data,
        }));
      }
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "알림 확인에 실패했습니다.",
      );
    } finally {
      setClearingFactoryAlert(false);
    }
  };

  const handlePrint = async () => {
    window.print();
    if (
      !showAdminDeliveryControls ||
      !selectedOrder ||
      selectedOrder.status === "PRINTING_COMPLETE"
    ) {
      return;
    }
    if (
      selectedOrder.status === "RECEIVED" &&
      selectedOrder.shipment?.deliveredAt
    ) {
      await runDeliveryAction("PRINT_COMPLETE");
    }
  };

  const handleSavePdf = async () => {
    if (!selectedPage || !pdfSheetRef.current || isSavingPdf) {
      return;
    }

    setIsSavingPdf(true);

    try {
      const element = pdfSheetRef.current;
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false,
      });

      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 10;
      const maxWidth = pageWidth - margin * 2;
      const maxHeight = pageHeight - margin * 2;
      const ratio = Math.min(maxWidth / canvas.width, maxHeight / canvas.height);
      const imgWidth = canvas.width * ratio;
      const imgHeight = canvas.height * ratio;
      const x = (pageWidth - imgWidth) / 2;
      const y = (pageHeight - imgHeight) / 2;

      pdf.addImage(imgData, "PNG", x, y, imgWidth, imgHeight);
      pdf.save(`${selectedPage.pageNo}_선물세트주문서.pdf`);
    } catch (pdfError) {
      console.error("PDF 저장 실패:", pdfError);
      window.alert("PDF 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setIsSavingPdf(false);
    }
  };

  if (isLoading) {
    return (
      <section className="rounded-lg border border-line bg-panel p-4">
        <p className="text-sm text-muted-foreground">주문서를 불러오는 중...</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-lg border border-line bg-panel p-4">
        <p className="text-sm text-red">{error}</p>
        <Button
          type="button"
          variant="outline"
          className="mt-3"
          onClick={() => void loadOrders()}
        >
          다시 시도
        </Button>
      </section>
    );
  }

  if (!selectedPage) {
    return (
      <p className="rounded-lg border border-line bg-white px-3.5 py-6 text-center text-sm text-muted-foreground">
        출력할 주문이 없습니다.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 print:hidden min-[900px]:flex-row min-[900px]:items-center min-[900px]:justify-between">
        {!embedded ? (
        <div>
          <h3 className="text-lg font-semibold text-ink min-[1040px]:text-[22px]">
            주문서 미리보기
          </h3>
          <p className="mt-1 hidden text-[13px] text-muted-foreground min-[1040px]:block">
              상품 1건당 1장입니다. NO는 주문번호-순번 형식입니다.
            </p>
          </div>
        ) : (
          <div>
            <p className="text-[13px] text-muted-foreground">
              {selectedPage.orderNumber} · 총 {pagesForSelectedOrder.length}장
          </p>
        </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            className="border-[#0f766e] bg-[#0f766e] text-white hover:bg-[#0d9488]"
            disabled={isSavingPdf}
            onClick={() => {
              void handleSavePdf();
            }}
          >
            {isSavingPdf ? "저장 중..." : "PDF 저장"}
          </Button>
          <Button
            type="button"
            className="border-[#1d4ed8] bg-[#1d4ed8] text-white hover:bg-[#1e40af]"
            onClick={() => {
              void handlePrint();
            }}
          >
            인쇄
          </Button>
        </div>
      </div>

      <div className="max-w-xl print:hidden">
        <Dropdown
          label="출력 주문서"
          value={selectedPage.pageNo}
          options={pages.map((page) => ({
            value: page.pageNo,
            label: `${page.pageNo} · ${page.productName}`,
          }))}
          onChange={setSelectedPageNo}
        />
      </div>

      {showDeliveryWorkflow && selectedOrder ? (
        <>
          <DeliveryWorkflowPanel
            order={selectedOrder}
            busyAction={busyAction}
            onAction={(action) => {
              void runDeliveryAction(action);
            }}
          />
          {actionError ? (
            <p className="text-sm text-red print:hidden">{actionError}</p>
          ) : null}
        </>
      ) : null}

      {factoryAlertMessage ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4 print:hidden">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="factory-change-alert-title"
            className="w-full max-w-md rounded-xl border border-line bg-panel p-5 shadow-[0_14px_34px_rgba(18,38,63,0.08)]"
          >
            <h2
              id="factory-change-alert-title"
              className="text-lg font-semibold text-ink"
            >
              {factoryAlertMessage || FACTORY_CHANGE_ALERT_MESSAGE}
            </h2>
            <p className="mt-3 text-base leading-relaxed text-ink">
              관리자가 승인을 취소했습니다. 주문서를 다시 확인해 주세요.
            </p>
            <div className="mt-5 flex justify-end">
        <Button
          type="button"
                className="border-[#ea580c] bg-[#ea580c] text-white hover:bg-[#c2410c]"
                disabled={clearingFactoryAlert}
                onClick={() => {
                  void clearFactoryAlert();
                }}
              >
                {clearingFactoryAlert ? "확인 중..." : "확인"}
        </Button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="print:hidden">
        <div className="min-[640px]:hidden">
          <GiftSetPreviewCard page={selectedPage} />
        </div>
        <div className="hidden min-[640px]:block">
          <GiftSetPrintSheet page={selectedPage} />
        </div>
      </div>

      {/* Print: all pages of the selected order */}
      <div className="hidden print:block">
        {pagesForSelectedOrder.map((page, index) => (
          <div
            key={page.pageNo}
            className={cn(index < pagesForSelectedOrder.length - 1 && "break-after-page")}
          >
            <GiftSetPrintSheet page={page} />
          </div>
        ))}
      </div>

      {/* Off-screen sheet for PDF capture of current page */}
      <div
        className="pointer-events-none fixed left-[-9999px] top-0 w-[800px]"
        aria-hidden
      >
        <div ref={pdfSheetRef}>
          <GiftSetPrintSheet page={selectedPage} />
        </div>
      </div>
    </div>
  );
}

export function OrderPrintPreviewModal({
  open,
  orderNumber,
  onClose,
  showAdminDeliveryControls = true,
  showFactoryControls = false,
}: {
  open: boolean;
  orderNumber: string | null;
  onClose: () => void;
  showAdminDeliveryControls?: boolean;
  showFactoryControls?: boolean;
}) {
  if (!open || !orderNumber) {
    return null;
  }

  return (
    <Dialog
      open={open}
      title="주문서 미리보기"
      onClose={onClose}
      className="max-h-[90vh] max-w-3xl overflow-y-auto"
    >
      <OrderPrintPreview
        orderNumber={orderNumber}
        embedded
        showAdminDeliveryControls={showAdminDeliveryControls}
        showFactoryControls={showFactoryControls}
      />
    </Dialog>
  );
}

export default OrderPrintPreview;
