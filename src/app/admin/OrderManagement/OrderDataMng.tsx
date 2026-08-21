"use client";

import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Table, type TableColumn } from "@/components/ui/table";
import { apiFetch } from "@/lib/api";
import {
  parseBranchStoreFromNotes,
  parseBusinessCardFromNotes,
  parseChurchFromNotes,
  parseDeliveryCompanyFromNotes,
  parseDeliveryDateTimeFromNotes,
  parseGreetingKindFromNotes,
  parseGreetingNumberFromNotes,
  parseGreetingSelfFromNotes,
  parseGreetingSpecialNoteFromNotes,
  parseItemNoteFromNotes,
  parseOrderDateFromNotes,
  parseOrdererFromNotes,
  parseOrdererPhoneFromNotes,
  parseOrderTypeFromNotes,
  parseRecipientPartsFromNotes,
  parseSenderPartsFromNotes,
  parseShipDateFromNotes,
} from "@/lib/order-notes";
import {
  exportOrderMasterWorkbook,
  type OrderDetailExportValues,
  type OrderMasterExportValues,
} from "@/lib/export-order-master-excel";
import { cn } from "@/lib/utils";

type OrderStatusCode =
  | "PLACED"
  | "WAITING_FOR_SHIPMENT"
  | "PREPARED"
  | "LOAD_NOTIFIED"
  | "SHIPPING"
  | "RECEIVED"
  | "PRINTING_COMPLETE"
  | "CANCELLED";

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

interface OrderMasterRow {
  [key: string]: string | number;
  id: string;
  orderStatus: string;
  type: string;
  orderDate: string;
  branchStore: string;
  churchName: string;
  name: string;
  phone: string;
  parcelShipDate: string;
  deliveryDateTime: string;
  clientContactName: string;
  clientContactPhone: string;
  senderName: string;
  senderPhone: string;
  senderAddress: string;
  greetingNumber: string;
  businessCard: string;
  greetingSelf: string;
  specialNote: string;
  productCount: number;
  totalQty: number;
  printFileName: string;
  createdAt: string;
  updatedAt: string;
  manager: string;
  remark: string;
}

interface OrderDetailRow {
  [key: string]: string | number;
  orderId: string;
  seq: number;
  shipType: string;
  productCode: string;
  product: string;
  qty: number;
  requestNote: string;
  unitPrice: number;
  amount: number;
  shipStatus: string;
  remark: string;
}

type ApiOrder = {
  id: number;
  orderNumber: string;
  status: OrderStatusCode | string;
  createdAt: string;
  updatedAt?: string;
  notes?: string | null;
  items?: Array<{ productName: string; quantity: number; price?: number }>;
  shipment?: {
    fulfillmentType?: string | null;
    carrier?: string | null;
    deliveryAddress?: string | null;
    estimatedWindow?: string | null;
  } | null;
  greetingForms?: Array<{
    id: number;
    linkedToOrder: boolean;
    greetingNumber?: string | null;
    includeSelf?: boolean;
    businessCard?: string | null;
    specialNote?: string | null;
  }>;
  user?: {
    fullname?: string | null;
    phone?: string | null;
    church?: { name?: string | null } | null;
  } | null;
};

function formatDateTime(value?: string | null) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value.slice(0, 19).replace("T", " ");
  }
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${y}-${m}-${d} ${hh}:${mm}:${ss}`;
}

function formatDateOnly(value?: string | null) {
  if (!value) {
    return "";
  }
  return value.slice(0, 10);
}

function formatOrderType(
  notes: string | null | undefined,
  fulfillmentType?: string | null,
) {
  const fromNotes = parseOrderTypeFromNotes(notes);
  if (fromNotes === "배달" || fromNotes === "택배" || fromNotes === "배달/택배") {
    return fromNotes;
  }
  if (fulfillmentType === "PICKUP") {
    return "배달";
  }
  return "택배";
}

function shipStatusFromOrderStatus(status: string) {
  if (status === "PRINTING_COMPLETE" || status === "RECEIVED") {
    return "완료";
  }
  if (
    status === "SHIPPING" ||
    status === "WAITING_FOR_SHIPMENT" ||
    status === "PREPARED" ||
    status === "LOAD_NOTIFIED"
  ) {
    return "진행";
  }
  if (status === "CANCELLED") {
    return "취소";
  }
  return "대기";
}

function mapOrders(data: ApiOrder[]): {
  masters: OrderMasterRow[];
  details: OrderDetailRow[];
} {
  const masters: OrderMasterRow[] = [];
  const details: OrderDetailRow[] = [];

  for (const order of data) {
    if (order.status === "CANCELLED") {
      continue;
    }

    const items = order.items ?? [];
    const orderId = order.orderNumber;
    const notes = order.notes;
    const orderType = formatOrderType(notes, order.shipment?.fulfillmentType);
    const sender = parseSenderPartsFromNotes(notes);
    const recipient = parseRecipientPartsFromNotes(notes);
    const linkedGreeting =
      order.greetingForms?.find((form) => form.linkedToOrder) ??
      order.greetingForms?.[0];

    const greetingNumber =
      linkedGreeting?.greetingNumber?.trim() ||
      parseGreetingNumberFromNotes(notes);
    const includeSelf =
      linkedGreeting?.includeSelf ?? parseGreetingSelfFromNotes(notes);
    const businessCardRaw = linkedGreeting?.businessCard?.trim() || "";
    const businessCard =
      businessCardRaw === "동봉" || parseBusinessCardFromNotes(notes)
        ? "유"
        : businessCardRaw === "미동봉"
          ? "무"
          : "";
    const specialNote =
      linkedGreeting?.specialNote?.trim() ||
      parseGreetingSpecialNoteFromNotes(notes);
    const greetingSelfLabel = includeSelf
      ? "유"
      : parseGreetingKindFromNotes(notes) === "자체"
        ? "유"
        : linkedGreeting
          ? "무"
          : "";

    const clientName =
      parseDeliveryCompanyFromNotes(notes) ||
      order.shipment?.carrier ||
      "";

    masters.push({
      id: orderId,
      orderStatus: ORDER_STATUS_LABEL[order.status] ?? order.status,
      type: orderType,
      orderDate:
        parseOrderDateFromNotes(notes) || formatDateOnly(order.createdAt),
      branchStore: parseBranchStoreFromNotes(notes),
      churchName:
        parseChurchFromNotes(notes) || order.user?.church?.name || "",
      name:
        parseOrdererFromNotes(notes) || order.user?.fullname || "-",
      phone:
        parseOrdererPhoneFromNotes(notes) || order.user?.phone || "",
      parcelShipDate:
        orderType.includes("택배")
          ? parseShipDateFromNotes(notes) ||
            formatDateOnly(order.shipment?.estimatedWindow)
          : "",
      deliveryDateTime:
        orderType.includes("배달")
          ? parseDeliveryDateTimeFromNotes(notes) ||
            formatDateTime(order.shipment?.estimatedWindow)
          : "",
      clientContactName: clientName,
      clientContactPhone: "",
      senderName:
        sender.name || (orderType.includes("배달") ? recipient.name : ""),
      senderPhone:
        sender.phone || (orderType.includes("배달") ? recipient.phone : ""),
      senderAddress:
        sender.address ||
        (orderType.includes("배달")
          ? recipient.address || order.shipment?.deliveryAddress || ""
          : order.shipment?.deliveryAddress || ""),
      greetingNumber: greetingNumber ? `${greetingNumber}번` : "",
      businessCard,
      greetingSelf: greetingSelfLabel,
      specialNote,
      productCount: items.length,
      totalQty: items.reduce((sum, item) => sum + item.quantity, 0),
      printFileName: `${orderId}_주문서.pdf`,
      createdAt: formatDateTime(order.createdAt),
      updatedAt: formatDateTime(order.updatedAt || order.createdAt),
      manager: "관리자",
      remark: "",
    });

    items.forEach((item, index) => {
      const unitPrice = item.price ?? 0;
      details.push({
        orderId,
        seq: index + 1,
        shipType: orderType === "배달/택배" ? "" : orderType,
        productCode: "",
        product: item.productName,
        qty: item.quantity,
        requestNote: parseItemNoteFromNotes(
          notes,
          item.productName,
          item.quantity,
        ),
        unitPrice,
        amount: unitPrice * item.quantity,
        shipStatus: shipStatusFromOrderStatus(order.status),
        remark: "",
      });
    });
  }

  return { masters, details };
}

function masterToExportRow(master: OrderMasterRow): OrderMasterExportValues {
  return [
    master.id,
    master.orderStatus,
    master.type,
    master.orderDate,
    master.branchStore,
    master.churchName,
    master.name,
    master.phone,
    master.parcelShipDate,
    master.deliveryDateTime,
    master.clientContactName,
    master.clientContactPhone,
    master.senderName,
    master.senderPhone,
    master.senderAddress,
    master.greetingNumber,
    master.businessCard,
    master.greetingSelf,
    master.specialNote,
    master.productCount,
    master.totalQty,
    master.printFileName,
    master.createdAt,
    master.updatedAt,
    master.manager,
    master.remark,
  ];
}

function detailToExportRow(item: OrderDetailRow): OrderDetailExportValues {
  return [
    item.orderId,
    item.seq,
    item.shipType,
    item.productCode,
    item.product,
    item.qty,
    item.requestNote,
    item.unitPrice || null,
    null, // 금액: template formula F*H
    item.shipStatus,
    item.remark,
  ];
}

export function OrderDataMng() {
  const [masters, setMasters] = useState<OrderMasterRow[]>([]);
  const [details, setDetails] = useState<OrderDetailRow[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState("");
  const [exportError, setExportError] = useState("");

  const loadOrders = async () => {
    setIsLoading(true);
    setError("");

    try {
      const response = await apiFetch("/api/orders");
      const data = (await response.json()) as ApiOrder[] | { message?: string };

      if (!response.ok || !Array.isArray(data)) {
        setError(
          !Array.isArray(data) && data.message
            ? data.message
            : "주문 목록을 불러오지 못했습니다.",
        );
        setMasters([]);
        setDetails([]);
        setSelectedOrderId("");
        return;
      }

      const mapped = mapOrders(data);
      setMasters(mapped.masters);
      setDetails(mapped.details);
      setSelectedOrderId((current) => {
        if (current && mapped.masters.some((row) => row.id === current)) {
          return current;
        }
        return mapped.masters[0]?.id ?? "";
      });
    } catch {
      setError("주문 목록을 불러오지 못했습니다.");
      setMasters([]);
      setDetails([]);
      setSelectedOrderId("");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadOrders();
  }, []);

  const selectedDetails = useMemo(
    () => details.filter((item) => item.orderId === selectedOrderId),
    [details, selectedOrderId],
  );

  const masterColumns: TableColumn<OrderMasterRow>[] = [
    { key: "id", header: "주문번호" },
    { key: "orderStatus", header: "주문상태" },
    { key: "type", header: "주문구분" },
    { key: "orderDate", header: "주문일자" },
    { key: "churchName", header: "중앙" },
    { key: "name", header: "(주문자)성명" },
    { key: "phone", header: "연락처" },
    { key: "productCount", header: "상품건수", className: "text-right" },
    { key: "totalQty", header: "총수량", className: "text-right" },
  ];

  const detailColumns: TableColumn<OrderDetailRow>[] = [
    { key: "orderId", header: "주문번호" },
    { key: "seq", header: "순번", className: "text-right" },
    { key: "shipType", header: "배달/택배" },
    { key: "product", header: "주문제품명" },
    { key: "qty", header: "주문수량", className: "text-right" },
    { key: "requestNote", header: "주문요청사항" },
    { key: "shipStatus", header: "출고상태" },
  ];

  const handleExportExcel = async () => {
    if (masters.length === 0 || isExporting) {
      return;
    }

    setIsExporting(true);
    setExportError("");

    try {
      const today = new Date();
      const y = today.getFullYear();
      const m = String(today.getMonth() + 1).padStart(2, "0");
      const d = String(today.getDate()).padStart(2, "0");

      await exportOrderMasterWorkbook({
        masters: masters.map(masterToExportRow),
        details: details.map(detailToExportRow),
        filename: `주문마스터_내보내기_${y}${m}${d}.xlsx`,
      });
    } catch (err) {
      setExportError(
        err instanceof Error
          ? err.message
          : "엑셀 파일을 생성하지 못했습니다.",
      );
    } finally {
      setIsExporting(false);
    }
  };

  if (isLoading) {
    return (
      <section className="rounded-lg border border-line bg-panel p-4">
        <p className="text-sm text-muted-foreground">주문 목록을 불러오는 중...</p>
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

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-lg font-semibold text-ink min-[1040px]:text-[22px]">
          데이터 내보내기
        </h3>
        <p className="mt-1 text-[13px] text-muted-foreground">
          주문마스터를 선택하면 해당 주문의 상품상세가 표시됩니다. 엑셀 내보내기는
          전체 주문마스터(1행=1주문)와 상품상세(2시트)를 양식 디자인으로
          내보냅니다.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <section className="min-w-0 rounded-lg border border-line bg-panel p-3.5">
          <h4 className="mb-2.5 text-base font-semibold text-ink">주문마스터</h4>
          <Table
            caption="주문마스터"
            columns={masterColumns}
            data={masters}
            emptyMessage="등록된 주문이 없습니다."
            scrollable
            visibleRows={10}
            onRowClick={(row) => setSelectedOrderId(row.id)}
            getRowClassName={(row) =>
              cn(
                "cursor-pointer",
                row.id === selectedOrderId &&
                  "bg-[#e9f1ff] font-semibold hover:bg-[#e9f1ff]",
              )
            }
          />
        </section>

        <section className="min-w-0 rounded-lg border border-line bg-panel p-3.5">
          <h4 className="mb-2.5 text-base font-semibold text-ink">상품상세</h4>
          <Table
            caption={`${selectedOrderId || "선택 주문"} 상품상세`}
            columns={detailColumns}
            data={selectedDetails}
            emptyMessage="선택한 주문의 상품이 없습니다."
            scrollable
            visibleRows={10}
          />
        </section>
      </div>

      <div className="flex flex-col items-end gap-2">
        {exportError ? (
          <p className="text-sm text-red">{exportError}</p>
        ) : null}
        <Button
          type="button"
          className="border-[#1f2937] bg-[#1f2937] text-white hover:bg-[#111827]"
          disabled={masters.length === 0 || isExporting}
          onClick={() => void handleExportExcel()}
        >
          {isExporting ? "내보내는 중..." : "엑셀 내보내기"}
        </Button>
      </div>
    </div>
  );
}

export default OrderDataMng;
