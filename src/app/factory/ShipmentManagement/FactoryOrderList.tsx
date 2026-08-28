"use client";

import { useEffect, useMemo, useState, type ReactNode, type ClipboardEvent, type KeyboardEvent, type MouseEvent } from "react";

import { OrderPrintPreviewModal } from "@/app/admin/OrderManagement/OrderPrintPreview";
import { Button } from "@/components/ui/button";
import { Dropdown } from "@/components/ui/dropdown";
import {
  FactoryAlertModal,
  type FactoryAlertTarget,
} from "@/components/ui/factory-alert-modal";
import { Input } from "@/components/ui/input";
import { Table, type TableColumn } from "@/components/ui/table";
import { apiFetch } from "@/lib/api";
import {
  type DeliveryOrderStatus,
  isDispatchWaitingStatus,
  isMemberShippingStatus,
  isWaitingFactoryLoadStatus,
  memberFacingStatusLabel,
} from "@/lib/order-delivery";
import {
  parseOrderDateFromNotes,
  parseOrdererFromNotes,
  parseOrdererPhoneFromNotes,
  parseOrderTypeFromNotes,
} from "@/lib/order-notes";
import { cn } from "@/lib/utils";

type OrderStatusCode = DeliveryOrderStatus;

type DeliveryStatusFilter =
  | "all"
  | "PLACED"
  | "PREPARED"
  | "SHIPPING"
  | "RECEIVED";

type FactoryOrderRow = {
  [key: string]: string | number;
  id: number;
  orderNumber: string;
  name: string;
  phone: string;
  type: string;
  status: OrderStatusCode;
  statusLabel: string;
  productCount: number;
  summary: string;
  orderDate: string;
  factoryAlert: string;
};

const DELIVERY_STATUS_FILTER_OPTIONS = [
  { value: "all", label: "전체" },
  { value: "PLACED", label: "접수완료" },
  { value: "PREPARED", label: "발송대기" },
  { value: "SHIPPING", label: "배송중" },
  { value: "RECEIVED", label: "배송완료" },
] as const;

const dateInputClassName =
  "min-h-9 w-full cursor-pointer rounded-[7px] border border-[#cbd5e1] bg-white px-2.5 py-2 text-base text-ink [font-variant-ligatures:none] [font-variant-numeric:tabular-nums] focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20";

function openDatePicker(input: HTMLInputElement) {
  try {
    input.showPicker?.();
  } catch {
    // showPicker can throw if the input is not user-activated.
  }
}

function datePickerOnlyProps() {
  return {
    onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Tab" || event.key === "Escape") {
        return;
      }
      event.preventDefault();
    },
    onPaste: (event: ClipboardEvent<HTMLInputElement>) => {
      event.preventDefault();
    },
    onClick: (event: MouseEvent<HTMLInputElement>) => {
      openDatePicker(event.currentTarget);
    },
  };
}

function formatOrderDate(value: string) {
  return value.slice(0, 10);
}

function formatFulfillmentType(type?: string | null, notes?: string | null) {
  const fromNotes = parseOrderTypeFromNotes(notes);
  if (fromNotes !== "택배" || notes) {
    return fromNotes;
  }

  if (type === "PICKUP") {
    return "픽업";
  }
  return "택배";
}

function buildSummary(
  items: Array<{ productName: string; quantity: number }> | undefined,
) {
  if (!items || items.length === 0) {
    return "-";
  }

  const [first, ...rest] = items;
  const head = `${first.productName} ${first.quantity}개`;
  return rest.length > 0 ? `${head} 외 ${rest.length}건` : head;
}

function Panel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("min-w-0 rounded-lg border border-line bg-panel p-3.5", className)}>
      {children}
    </section>
  );
}

function PeriodInputs({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
}: {
  startDate: string;
  endDate: string;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-2xl font-bold text-ink">기간</label>
      <div className="flex min-h-9 items-center gap-2">
        <input
          type="date"
          value={startDate}
          onChange={(event) => onStartDateChange(event.target.value)}
          className={dateInputClassName}
          {...datePickerOnlyProps()}
        />
        <span className="shrink-0 text-lg text-[#64748b]">~</span>
        <input
          type="date"
          value={endDate}
          onChange={(event) => onEndDateChange(event.target.value)}
          className={dateInputClassName}
          {...datePickerOnlyProps()}
        />
      </div>
    </div>
  );
}

function filterOrders({
  orders,
  startDate,
  endDate,
  deliveryStatus,
  keyword,
}: {
  orders: FactoryOrderRow[];
  startDate: string;
  endDate: string;
  deliveryStatus: DeliveryStatusFilter;
  keyword: string;
}) {
  const normalizedKeyword = keyword.trim().toLowerCase();
  const keywordDigits = normalizedKeyword.replaceAll("-", "");

  return orders.filter((order) => {
    const matchesDeliveryStatus =
      deliveryStatus === "all" ||
      (deliveryStatus === "RECEIVED"
        ? order.status === "RECEIVED" || order.status === "PRINTING_COMPLETE"
        : deliveryStatus === "PLACED"
          ? order.status === "PLACED" || isWaitingFactoryLoadStatus(order.status)
          : deliveryStatus === "PREPARED"
            ? isDispatchWaitingStatus(order.status)
            : deliveryStatus === "SHIPPING"
              ? isMemberShippingStatus(order.status)
              : order.status === deliveryStatus);

    const matchesDate =
      (!startDate || order.orderDate >= startDate) &&
      (!endDate || order.orderDate <= endDate);
    const matchesKeyword =
      normalizedKeyword.length === 0 ||
      order.orderNumber.toLowerCase().includes(normalizedKeyword) ||
      order.name.toLowerCase().includes(normalizedKeyword) ||
      order.phone.replaceAll("-", "").includes(keywordDigits);

    return matchesDeliveryStatus && matchesDate && matchesKeyword;
  });
}

function MobileOrderCard({
  order,
  onView,
}: {
  order: FactoryOrderRow;
  onView: () => void;
}) {
  return (
    <article className="rounded-xl border border-line bg-white px-3.5 py-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-ink">
            {order.orderNumber}
          </p>
          <p className="mt-0.5 text-sm text-[#64748b]">
            {order.orderDate} · {order.type} · {order.statusLabel}
          </p>
          <p className="mt-1 text-sm text-ink">
            {order.name} · {order.phone || "-"}
          </p>
          <p className="mt-1 truncate text-sm text-[#475569]">{order.summary}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0 border-[#93c5fd] bg-[#eff6ff] text-base text-brand hover:bg-[#dbeafe]"
          onClick={onView}
        >
          보기
        </Button>
      </div>
    </article>
  );
}

export function FactoryOrderList() {
  const [orders, setOrders] = useState<FactoryOrderRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [deliveryStatusFilter, setDeliveryStatusFilter] =
    useState<DeliveryStatusFilter>("all");
  const [keyword, setKeyword] = useState("");
  const [viewingOrderNumber, setViewingOrderNumber] = useState<string | null>(
    null,
  );
  const [listAlert, setListAlert] = useState<FactoryAlertTarget | null>(null);

  const loadOrders = async (silent = false) => {
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
            status: OrderStatusCode;
            createdAt: string;
            notes?: string | null;
            factoryAlert?: string | null;
            items?: Array<{ productName: string; quantity: number }>;
            shipment?: {
              fulfillmentType?: string | null;
              shippedAt?: string | null;
              deliveredAt?: string | null;
            } | null;
            user?: {
              fullname?: string | null;
              phone?: string | null;
            } | null;
          }>
        | { message?: string };

      if (!response.ok || !Array.isArray(data)) {
        if (!silent) {
          setError(
            !Array.isArray(data) && data.message
              ? data.message
              : "주문 목록을 불러오지 못했습니다.",
          );
          setOrders([]);
        }
        return;
      }

      const mapped = data
        .filter((order) => order.status !== "CANCELLED")
        .map((order) => {
          const status = order.status;
          const ordererName =
            parseOrdererFromNotes(order.notes) ||
            order.user?.fullname ||
            "-";
          const ordererPhone =
            parseOrdererPhoneFromNotes(order.notes) ||
            order.user?.phone ||
            "";
          const orderDateFromNotes = parseOrderDateFromNotes(order.notes);

          return {
            id: order.id,
            orderNumber: order.orderNumber,
            name: ordererName,
            phone: ordererPhone,
            type: formatFulfillmentType(
              order.shipment?.fulfillmentType,
              order.notes,
            ),
            status,
            statusLabel: memberFacingStatusLabel(status),
            productCount: order.items?.length ?? 0,
            summary: buildSummary(order.items),
            orderDate: orderDateFromNotes || formatOrderDate(order.createdAt),
            factoryAlert: order.factoryAlert ?? "",
          };
        });

      setOrders(mapped);

      // 목록 화면에서만 알림 (미리보기 열림 시에는 미리보기 모달이 처리)
      if (!viewingOrderNumber) {
        const nextAlert = mapped.find((order) => order.factoryAlert);
        setListAlert(
          nextAlert
            ? {
                id: nextAlert.id,
                orderNumber: nextAlert.orderNumber,
                message: nextAlert.factoryAlert,
              }
            : null,
        );
      }
    } catch {
      if (!silent) {
        setError("주문 목록을 불러오지 못했습니다.");
        setOrders([]);
      }
    } finally {
      if (!silent) {
        setIsLoading(false);
      }
    }
  };

  useEffect(() => {
    void loadOrders();
  }, []);

  useEffect(() => {
    if (viewingOrderNumber) {
      return;
    }
    const timer = window.setInterval(() => {
      void loadOrders(true);
    }, 4000);
    return () => window.clearInterval(timer);
  }, [viewingOrderNumber]);

  const filteredOrders = useMemo(
    () =>
      filterOrders({
        orders,
        startDate,
        endDate,
        deliveryStatus: deliveryStatusFilter,
        keyword,
      }),
    [orders, startDate, endDate, deliveryStatusFilter, keyword],
  );

  const orderColumns: TableColumn<FactoryOrderRow>[] = [
    { key: "orderNumber", header: "주문번호" },
    { key: "orderDate", header: "주문일" },
    { key: "name", header: "주문자" },
    { key: "phone", header: "연락처" },
    { key: "type", header: "유형" },
    { key: "statusLabel", header: "배송상태" },
    { key: "summary", header: "상품" },
    {
      key: "actions",
      header: "작업",
      render: (row) => (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setViewingOrderNumber(row.orderNumber)}
        >
          보기
        </Button>
      ),
    },
  ];

  if (isLoading) {
    return (
      <Panel>
        <p className="text-sm text-muted-foreground">주문 목록을 불러오는 중...</p>
      </Panel>
    );
  }

  if (error) {
    return (
      <Panel>
        <p className="text-sm text-red">{error}</p>
        <Button
          type="button"
          variant="outline"
          className="mt-3"
          onClick={() => void loadOrders()}
        >
          다시 시도
        </Button>
      </Panel>
    );
  }

  return (
    <div className="space-y-3">
      <div className="hidden items-center justify-between gap-3 min-[1040px]:flex">
        <div>
          <h3 className="text-[22px] font-semibold text-ink">출하 주문 목록</h3>
          <p className="mt-1 text-[13px] text-muted-foreground">
            승인된 주문의 상차완료·배송시작을 처리합니다.
          </p>
        </div>
      </div>

      <div className="min-[1040px]:hidden">
        <h3 className="mb-3 text-base font-bold text-ink">출하 주문 목록</h3>
      </div>

      <Panel>
        <div className="grid grid-cols-1 gap-2.5 min-[900px]:grid-cols-2 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.7fr)_minmax(0,1.1fr)]">
          <PeriodInputs
            startDate={startDate}
            endDate={endDate}
            onStartDateChange={setStartDate}
            onEndDateChange={setEndDate}
          />
          <Dropdown
            label="배송상태"
            value={deliveryStatusFilter}
            options={[...DELIVERY_STATUS_FILTER_OPTIONS]}
            onChange={(value) =>
              setDeliveryStatusFilter(value as DeliveryStatusFilter)
            }
          />
          <Input
            label="검색어"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="성명 / 연락처 / 주문번호"
          />
        </div>
        <p className="mt-2 text-lg text-[#64748b]">
          총 {filteredOrders.length}건
          {keyword.trim() ||
          startDate ||
          endDate ||
          deliveryStatusFilter !== "all"
            ? ` (전체 ${orders.length}건 중)`
            : ""}
        </p>
      </Panel>

      <div className="max-h-[28rem] space-y-2.5 overflow-y-auto min-[1040px]:hidden">
        {filteredOrders.length === 0 ? (
          <p className="rounded-xl border border-line bg-white px-3.5 py-6 text-center text-lg text-muted-foreground">
            {orders.length === 0
              ? "등록된 주문이 없습니다."
              : "검색 결과가 없습니다."}
          </p>
        ) : (
          filteredOrders.map((order) => (
            <MobileOrderCard
              key={order.id}
              order={order}
              onView={() => setViewingOrderNumber(order.orderNumber)}
            />
          ))
        )}
      </div>

      <Panel className="hidden min-[1040px]:block">
        <Table
          caption="공장 출하 주문 목록"
          columns={orderColumns}
          data={filteredOrders}
          emptyMessage={
            orders.length === 0
              ? "등록된 주문이 없습니다."
              : "검색 결과가 없습니다."
          }
          scrollable
          visibleRows={6}
          rowHeightRem={3.5}
          className="text-lg"
        />
      </Panel>

      <OrderPrintPreviewModal
        open={Boolean(viewingOrderNumber)}
        orderNumber={viewingOrderNumber}
        showAdminDeliveryControls={false}
        showFactoryControls
        onClose={() => {
          setViewingOrderNumber(null);
          void loadOrders(true);
        }}
      />

      {listAlert && !viewingOrderNumber ? (
        <FactoryAlertModal
          alert={listAlert}
          onCleared={() => {
            setListAlert(null);
            void loadOrders(true);
          }}
        />
      ) : null}
    </div>
  );
}
