"use client";

import { useEffect, useMemo, useState } from "react";

import { StandaloneGreetingForm } from "@/app/admin/OrderManagement/StandaloneGreetingForm";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Skeleton, TableSkeleton } from "@/components/ui/skeleton";
import { Table, type TableColumn } from "@/components/ui/table";
import { apiFetch } from "@/lib/api";
import { formatMonthDayTime } from "@/lib/date-format";
import { API_BASE_URL } from "@/lib/env";
import { cn } from "@/lib/utils";

type GreetingFormRow = {
  [key: string]: string | number;
  id: number;
  title: string;
  type: string;
  orderNumber: string;
  ordererName: string;
  churchName: string;
  phone: string;
  greetingNumber: string;
  content: string;
  quantity: number;
  size: string;
  productName: string;
  productSummary: string;
  receivePlace: string;
  specialNote: string;
  businessCard: string;
  imageUrl: string;
  createdAt: string;
  createdDate: string;
};

type ApiGreetingForm = {
  id: number;
  greetingNumber: string;
  includeSelf: boolean;
  imageUrl: string;
  imageOriginalName: string;
  content: string;
  quantity: number;
  size: string;
  productName?: string | null;
  receivePlace: string;
  specialNote?: string | null;
  businessCard?: string | null;
  ordererName?: string | null;
  churchName?: string | null;
  phone?: string | null;
  linkedToOrder: boolean;
  submitted: boolean;
  createdAt: string;
  order?: { orderNumber?: string | null } | null;
};

function resolveImageUrl(url: string) {
  if (!url) {
    return "";
  }
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }
  if (url.startsWith("/assets/")) {
    return url;
  }
  return `${API_BASE_URL}${url.startsWith("/") ? url : `/${url}`}`;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value.slice(0, 10);
  }
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function Panel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn("min-w-0 rounded-lg border border-line bg-panel p-3.5", className)}
    >
      {children}
    </section>
  );
}

function AdminMobileGreetingCard({
  row,
  onView,
}: {
  row: GreetingFormRow;
  onView: () => void;
}) {
  return (
    <article className="rounded-xl border border-[#d8e0ea] bg-white px-3.5 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-lg font-bold text-ink">{row.title}</p>
          <p className="mt-0.5 text-lg font-bold text-ink">
            {row.ordererName} · {row.type}
          </p>
          <p className="mt-0.5 text-base text-[#64748b]">{row.productSummary}</p>
          <p className="mt-1 text-base text-[#64748b]">
            {row.createdDate} · {row.size} · {row.quantity}매
            {row.receivePlace ? ` · ${row.receivePlace}` : ""}
          </p>
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

function GreetingDetailDialog({
  open,
  row,
  onClose,
}: {
  open: boolean;
  row: GreetingFormRow | null;
  onClose: () => void;
}) {
  if (!open || !row) {
    return null;
  }

  return (
    <Dialog
      open={open}
      title="인사장 보기"
      onClose={onClose}
      className="max-h-[90vh] max-w-lg overflow-y-auto"
    >
      <div className="space-y-3">
        {row.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={resolveImageUrl(String(row.imageUrl))}
            alt="인사장"
            className="mx-auto max-h-56 w-auto rounded border border-line object-contain"
          />
        ) : null}
        <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-2 text-base">
          <dt className="text-[#64748b]">번호</dt>
          <dd className="font-medium text-ink">{row.id}</dd>
          {row.type === "제품주문 연계" && row.orderNumber ? (
            <>
              <dt className="text-[#64748b]">주문번호</dt>
              <dd className="font-medium text-ink">{row.orderNumber}</dd>
            </>
          ) : null}
          <dt className="text-[#64748b]">구분</dt>
          <dd className="font-medium text-ink">{row.type}</dd>
          <dt className="text-[#64748b]">성명</dt>
          <dd className="font-medium text-ink">{row.ordererName}</dd>
          <dt className="text-[#64748b]">중앙</dt>
          <dd className="font-medium text-ink">{row.churchName}</dd>
          <dt className="text-[#64748b]">연락처</dt>
          <dd className="font-medium text-ink">{row.phone}</dd>
          <dt className="text-[#64748b]">인사장번호</dt>
          <dd className="font-medium text-ink">{row.greetingNumber}</dd>
          <dt className="text-[#64748b]">명함 동봉</dt>
          <dd className="font-medium text-ink">
            {row.businessCard === "동봉"
              ? "동봉 ✓"
              : row.businessCard === "미동봉"
                ? "미동봉"
                : row.businessCard}
          </dd>
          <dt className="text-[#64748b]">인사장내용</dt>
          <dd className="font-medium text-ink">{row.content}</dd>
          <dt className="text-[#64748b]">수량</dt>
          <dd className="font-medium text-ink">{row.quantity}매</dd>
          <dt className="text-[#64748b]">크기</dt>
          <dd className="font-medium text-ink">{row.size}</dd>
          <dt className="text-[#64748b]">제품명</dt>
          <dd className="font-medium text-ink">{row.productName}</dd>
          <dt className="text-[#64748b]">받을 곳</dt>
          <dd className="font-medium text-ink">{row.receivePlace}</dd>
          <dt className="text-[#64748b]">특이사항</dt>
          <dd className="font-medium text-ink">{row.specialNote}</dd>
          <dt className="text-[#64748b]">등록일시</dt>
          <dd className="font-medium text-ink">{row.createdAt}</dd>
        </dl>
        <div className="flex justify-end pt-1">
          <Button type="button" variant="outline" onClick={onClose}>
            닫기
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

export function GreetingFormMng() {
  const [rows, setRows] = useState<GreetingFormRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [view, setView] = useState<"list" | "create">("list");
  const [viewingRow, setViewingRow] = useState<GreetingFormRow | null>(null);

  useEffect(() => {
    if (view !== "list") {
      return;
    }

    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      setError("");
      try {
        const response = await apiFetch("/api/greeting-forms");
        const data = (await response.json()) as
          | ApiGreetingForm[]
          | { message?: string };
        if (!response.ok || !Array.isArray(data)) {
          throw new Error(
            !Array.isArray(data) && data.message
              ? data.message
              : "인사장 목록을 불러오지 못했습니다.",
          );
        }
        if (cancelled) {
          return;
        }
        setRows(
          data.map((item) => {
            const productName = item.productName?.trim() || "-";
            const orderNumber = item.order?.orderNumber?.trim();
            return {
              id: item.id,
              title: orderNumber || `인사장 #${item.id}`,
              type: item.linkedToOrder ? "제품주문 연계" : "인사장만 의뢰",
              orderNumber: item.linkedToOrder ? orderNumber || "" : "",
              ordererName: item.ordererName?.trim() || "-",
              churchName: item.churchName?.trim() || "-",
              phone: item.phone?.trim() || "-",
              greetingNumber: [
                item.greetingNumber?.trim() || null,
                item.includeSelf ? "자체" : null,
                item.businessCard === "동봉" ? "명함" : null,
              ]
                .filter(Boolean)
                .join(" + ") || "-",
              content: item.content,
              quantity: item.quantity,
              size: item.size,
              productName,
              productSummary:
                productName !== "-"
                  ? `* ${productName} ${item.quantity}매`
                  : item.content || "-",
              receivePlace: item.receivePlace,
              specialNote: item.specialNote?.trim() || "-",
              businessCard: item.businessCard?.trim() || "선택하세요",
              imageUrl: item.imageUrl,
              createdAt: formatMonthDayTime(item.createdAt),
              createdDate: formatDate(item.createdAt),
            };
          }),
        );
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "인사장 목록을 불러오지 못했습니다.",
          );
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
  }, [reloadKey, view]);

  const columns: TableColumn<GreetingFormRow>[] = useMemo(
    () => [
      {
        key: "imageUrl",
        header: "이미지",
        className: "w-[72px]",
        render: (row) =>
          row.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={resolveImageUrl(String(row.imageUrl))}
              alt="인사장"
              className="h-12 w-12 rounded border border-line object-cover"
            />
          ) : (
            "-"
          ),
      },
      { key: "id", header: "번호", className: "w-[64px] text-center" },
      { key: "type", header: "구분" },
      { key: "ordererName", header: "성명(주문자)" },
      { key: "churchName", header: "중앙" },
      { key: "phone", header: "연락처" },
      { key: "greetingNumber", header: "인사장번호", className: "text-center" },
      {
        key: "businessCard",
        header: "명함",
        className: "text-center",
        render: (row) =>
          row.businessCard === "동봉"
            ? "동봉 ✓"
            : row.businessCard === "미동봉"
              ? "미동봉"
              : row.businessCard,
      },
      { key: "content", header: "인사장내용" },
      { key: "quantity", header: "수량", className: "text-right" },
      { key: "size", header: "크기", className: "text-center" },
      { key: "productName", header: "제품명" },
      { key: "receivePlace", header: "받을 곳" },
      { key: "specialNote", header: "특이사항" },
      { key: "createdAt", header: "등록일시" },
      {
        key: "action",
        header: "보기",
        className: "text-center",
        render: (row) => (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setViewingRow(row)}
          >
            보기
          </Button>
        ),
      },
    ],
    [],
  );

  if (view === "create") {
    return (
      <div className="space-y-3">
        <div>
          <h3 className="text-lg font-semibold text-ink min-[1040px]:text-[22px]">
            인사장관리
          </h3>
          <p className="mt-1 text-[13px] text-muted-foreground">
            인사장만 별도 작업의뢰를 접수합니다.
          </p>
        </div>
        <StandaloneGreetingForm
          onCancel={() => setView("list")}
          onSubmitted={() => {
            setView("list");
            setReloadKey((key) => key + 1);
          }}
        />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="space-y-2">
          <Skeleton className="h-7 w-36" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <Panel>
          <TableSkeleton rows={8} columns={6} className="border-0" />
        </Panel>
      </div>
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
          onClick={() => setReloadKey((key) => key + 1)}
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
          <h3 className="text-[22px] font-semibold text-ink">인사장관리</h3>
          <p className="mt-1 text-[13px] text-muted-foreground">
            저장된 인사장 / 인사장만 의뢰 목록을 확인합니다.
          </p>
        </div>
        <Button
          type="button"
          className="border-green bg-green text-white hover:bg-[#128a52]"
          onClick={() => setView("create")}
        >
          인사장만 의뢰
        </Button>
      </div>

      <div className="min-[1040px]:hidden">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-base font-bold text-ink">인사장관리</h3>
          <Button
            type="button"
            size="sm"
            className="border-green bg-green text-white hover:bg-[#128a52]"
            onClick={() => setView("create")}
          >
            인사장만 의뢰
          </Button>
        </div>
      </div>

      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-lg text-[#64748b]">총 {rows.length}건</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="hidden min-[1040px]:inline-flex"
            onClick={() => setReloadKey((key) => key + 1)}
          >
            새로고침
          </Button>
        </div>
      </Panel>

      <div className="max-h-[28rem] space-y-2.5 overflow-y-auto min-[1040px]:hidden">
        {rows.length === 0 ? (
          <p className="rounded-xl border border-line bg-white px-3.5 py-6 text-center text-lg text-muted-foreground">
            등록된 인사장이 없습니다.
          </p>
        ) : (
          rows.map((row) => (
            <AdminMobileGreetingCard
              key={row.id}
              row={row}
              onView={() => setViewingRow(row)}
            />
          ))
        )}
      </div>

      <Panel className="hidden min-[1040px]:block">
        <Table
          caption="인사장 목록"
          columns={columns}
          data={rows}
          emptyMessage="등록된 인사장이 없습니다."
          scrollable
          visibleRows={10}
          rowHeightRem={3.5}
          className="text-[15px]"
        />
      </Panel>

      <GreetingDetailDialog
        open={Boolean(viewingRow)}
        row={viewingRow}
        onClose={() => setViewingRow(null)}
      />
    </div>
  );
}

export default GreetingFormMng;
