"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type Dispatch,
  type PointerEvent,
  type ReactNode,
  type SetStateAction,
} from "react";

import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { Dropdown } from "@/components/ui/dropdown";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { Skeleton, TableSkeleton } from "@/components/ui/skeleton";
import { Table, type TableColumn } from "@/components/ui/table";
import { apiFetch } from "@/lib/api";
import { SpecText, specToPlain } from "@/lib/spec-text";
import { cn } from "@/lib/utils";

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100, 200, 500].map((size) => ({
  value: String(size),
  label: `${size}줄`,
}));
const DEFAULT_PAGE_SIZE = 20;

type StockInventoryRow = {
  [key: string]: string | number | boolean | null;
  id: number;
  code: string;
  imageUrl: string | null;
  imageStoredName: string | null;
  imageOriginalName: string | null;
  productName: string;
  spec: string | null;
  unit: number;
  stock: number | null;
  stockMax: number | null;
  effectiveDate: string;
  priceOver500man: number;
  priceOver100man: number;
  wholesalePrice: number;
  associatePrice: number;
  unitPriceShow: boolean | null;
  retailPrice: number | null;
  supermarketPrice: number | null;
  schoolServePrice: number | null;
  taxExemption: boolean | null;
  category: string;
  openStock: boolean;
  createdAt: string;
  updatedAt: string;
};

type ProductFormState = {
  code: string;
  productName: string;
  spec: string;
  unit: string;
  /** 남은 수량 절대값. 등록 시 초기 수량, 수정 시에는 실사 정정 모드에서만 전송한다. */
  stock: string;
  /** 이번에 추가 입고한 수량. 남은 수량과 누적 총 입고량에 함께 더해진다. */
  stockIn: string;
  /** 체크 시 남은 수량을 절대값으로 정정한다 (평상시에는 입고 수량만 입력). */
  adjustStock: boolean;
  effectiveDate: string;
  priceOver500man: string;
  priceOver100man: string;
  wholesalePrice: string;
  associatePrice: string;
  /** 선택 가격. 빈 값 = 가격 없음 */
  retailPrice: string;
  supermarketPrice: string;
  schoolServePrice: string;
  /** "" = 미지정, "true" / "false" */
  unitPriceShow: string;
  taxExemption: string;
  category: string;
  openStock: boolean;
};

/** 구분 필터: 카테고리(선물세트/일반품) */
const CATEGORY_FILTER_OPTIONS = [
  { value: "all", label: "전체" },
  { value: "선물세트", label: "선물세트" },
  { value: "일반품", label: "일반품" },
] as const;

/** 구분 하위 필터: 고객공개 여부 */
const OPEN_FILTER_OPTIONS = [
  { value: "all", label: "전체" },
  { value: "open", label: "공개" },
  { value: "closed", label: "비공개" },
] as const;

/** 검색 항목 */
const SEARCH_FIELD_OPTIONS = [
  { value: "all", label: "전체" },
  { value: "code", label: "코드" },
  { value: "productName", label: "품명" },
  { value: "spec", label: "규격" },
  { value: "stock", label: "재고" },
  { value: "unit", label: "단위" },
] as const;

const SEARCH_PLACEHOLDERS: Record<string, string> = {
  all: "코드 / 품명 / 규격 / 재고 / 단위",
  code: "예: 8809240183038",
  productName: "예: 기쁨2호",
  spec: "예: 500ML",
  stock: "예: 무제한, 재고 없음, 80000",
  unit: "예: 10",
};

const CATEGORY_FORM_OPTIONS = [
  { value: "선물세트", label: "선물세트" },
  { value: "일반품", label: "일반품" },
] as const;

/** 단가노출여부 · 비과세 (빈 값 = 미지정) */
const YES_NO_FORM_OPTIONS = [
  { value: "", label: "미지정" },
  { value: "true", label: "예" },
  { value: "false", label: "아니오" },
];

const DEFAULT_PRODUCT_IMAGE = "/assets/images/No_img.jpg";

function productImageSrc(imageUrl: string | null | undefined) {
  const trimmed = imageUrl?.trim();
  return trimmed ? trimmed : DEFAULT_PRODUCT_IMAGE;
}

function formatStock(
  stock: number | null | undefined,
  stockMax?: number | null,
) {
  if (stock === null || stock === undefined) {
    return "무제한";
  }
  if (stock <= 0) {
    return "재고 없음";
  }
  const capacity =
    stockMax !== null && stockMax !== undefined && stockMax > 0
      ? stockMax
      : stock;
  return `${stock.toLocaleString("ko-KR")}/${capacity.toLocaleString("ko-KR")}`;
}

function formatPrice(value: number) {
  return `${value.toLocaleString("ko-KR")}원`;
}

function formatOptionalPrice(value: number | null | undefined) {
  return value === null || value === undefined ? "" : formatPrice(value);
}

function formatYesNo(value: boolean | null | undefined) {
  if (value === null || value === undefined) return "";
  return value ? "예" : "아니오";
}

function optionalToForm(value: number | boolean | null | undefined) {
  return value === null || value === undefined ? "" : String(value);
}

function formatDate(value: string) {
  return value.slice(0, 10);
}

function emptyFormState(): ProductFormState {
  return {
    code: "",
    productName: "",
    spec: "",
    unit: "1",
    stock: "",
    stockIn: "",
    adjustStock: false,
    effectiveDate: new Date().toISOString().slice(0, 10),
    priceOver500man: "",
    priceOver100man: "",
    wholesalePrice: "",
    associatePrice: "",
    retailPrice: "",
    supermarketPrice: "",
    schoolServePrice: "",
    unitPriceShow: "",
    taxExemption: "",
    category: "일반품",
    openStock: true,
  };
}

function formFromProduct(product: StockInventoryRow): ProductFormState {
  return {
    code: product.code,
    productName: product.productName,
    spec: product.spec ?? "",
    unit: String(product.unit),
    stock:
      product.stock === null || product.stock === undefined
        ? ""
        : String(product.stock),
    stockIn: "",
    adjustStock: false,
    effectiveDate: formatDate(product.effectiveDate),
    priceOver500man: String(product.priceOver500man),
    priceOver100man: String(product.priceOver100man),
    wholesalePrice: String(product.wholesalePrice),
    associatePrice: String(product.associatePrice),
    retailPrice: optionalToForm(product.retailPrice),
    supermarketPrice: optionalToForm(product.supermarketPrice),
    schoolServePrice: optionalToForm(product.schoolServePrice),
    unitPriceShow: optionalToForm(product.unitPriceShow),
    taxExemption: optionalToForm(product.taxExemption),
    category: product.category || "일반품",
    openStock: product.openStock !== false,
  };
}

function ProductThumbnail({
  product,
  className,
  previewSrc,
}: {
  product: Pick<StockInventoryRow, "imageUrl" | "productName">;
  className?: string;
  previewSrc?: string | null;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={previewSrc || productImageSrc(product.imageUrl)}
      alt={product.productName || "상품 이미지"}
      className={cn(
        "rounded border border-line bg-white object-contain",
        className,
      )}
    />
  );
}

function DetailField({
  label,
  value,
  className,
}: {
  label: string;
  value: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <dt className="text-xs font-semibold text-[#64748b]">{label}</dt>
      <dd className="mt-0.5 text-sm text-ink break-all">{value || "-"}</dd>
    </div>
  );
}

/** 상품 이미지를 최대 500×500 으로 크게 보여주는 하단 시트 */
function ProductImageSheet({
  product,
  open,
  onClose,
}: {
  product: StockInventoryRow;
  open: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  return (
    <BottomSheet
      open={open}
      title="상품 이미지"
      subtitle={product.productName}
      onClose={onClose}
      className="h-auto"
    >
      <div className="flex justify-center px-5 pb-6">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={productImageSrc(product.imageUrl)}
          alt={product.productName || "상품 이미지"}
          className="aspect-square w-full max-w-[500px] rounded-lg border border-line bg-white object-contain"
        />
      </div>
    </BottomSheet>
  );
}

/** 이미지 위 렌즈 영역을 오른쪽 확대창에 몇 배로 보여줄지 */
const IMAGE_ZOOM_SCALE = 2.5;
/** 마우스 호버 확대를 쓰는 화면 (그 밖에는 탭하면 큰 이미지 시트) */
const HOVER_ZOOM_QUERY = "(hover: hover) and (min-width: 1040px)";

type ImageZoomState = {
  /** 이미지 박스 크기 (px) */
  boxWidth: number;
  boxHeight: number;
  /** 박스 안 렌즈 위치·크기 (px) */
  lensLeft: number;
  lensTop: number;
  lensWidth: number;
  lensHeight: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

/**
 * 상품 상세 — 왼쪽 이미지, 오른쪽 상세 항목.
 * PC 는 이미지에 마우스를 올리면 렌즈 영역이 오른쪽(상세 항목 위)에 확대되어 보인다 (아마존식).
 */
function StockInventoryDetailContent({
  product,
  onImageOpen,
}: {
  product: StockInventoryRow;
  /** 호버 확대가 없는 화면에서 이미지를 탭했을 때 */
  onImageOpen: () => void;
}) {
  const hasImage = Boolean(product.imageUrl?.trim());
  const [zoom, setZoom] = useState<ImageZoomState | null>(null);
  const paneRef = useRef<HTMLDivElement>(null);

  const updateZoom = (event: PointerEvent<HTMLButtonElement>) => {
    const pane = paneRef.current;
    if (event.pointerType !== "mouse" || !pane) {
      return;
    }
    const box = event.currentTarget.getBoundingClientRect();
    const paneRect = pane.getBoundingClientRect();
    const lensWidth = Math.min(paneRect.width / IMAGE_ZOOM_SCALE, box.width);
    const lensHeight = Math.min(paneRect.height / IMAGE_ZOOM_SCALE, box.height);
    setZoom({
      boxWidth: box.width,
      boxHeight: box.height,
      lensLeft: clamp(
        event.clientX - box.left - lensWidth / 2,
        0,
        box.width - lensWidth,
      ),
      lensTop: clamp(
        event.clientY - box.top - lensHeight / 2,
        0,
        box.height - lensHeight,
      ),
      lensWidth,
      lensHeight,
    });
  };

  return (
    <div className="grid gap-5 min-[1040px]:grid-cols-[360px_minmax(0,1fr)] min-[1040px]:gap-6">
      <div>
        {hasImage ? (
          <>
            <button
              type="button"
              aria-label="상품 이미지"
              onPointerMove={updateZoom}
              onPointerLeave={() => setZoom(null)}
              onClick={() => {
                if (!window.matchMedia(HOVER_ZOOM_QUERY).matches) {
                  onImageOpen();
                }
              }}
              className="relative mx-auto block aspect-square w-full max-w-[360px] cursor-zoom-in overflow-hidden rounded-lg border border-line bg-white min-[1040px]:cursor-crosshair"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={productImageSrc(product.imageUrl)}
                alt={product.productName || "상품 이미지"}
                draggable={false}
                className="h-full w-full object-contain"
              />
              {zoom ? (
                <span
                  aria-hidden
                  className="pointer-events-none absolute hidden border border-[#94a3b8] bg-white/40 [background-image:radial-gradient(#64748b_1px,transparent_1px)] [background-size:4px_4px] min-[1040px]:block"
                  style={{
                    left: zoom.lensLeft,
                    top: zoom.lensTop,
                    width: zoom.lensWidth,
                    height: zoom.lensHeight,
                  }}
                />
              ) : null}
            </button>
            <p className="mt-1.5 text-center text-xs text-[#64748b]">
              <span className="min-[1040px]:hidden">
                탭하면 크게 볼 수 있습니다
              </span>
              <span className="hidden min-[1040px]:inline">
                마우스를 올리면 확대됩니다
              </span>
            </p>
          </>
        ) : (
          <ProductThumbnail
            product={product}
            className="mx-auto aspect-square w-full max-w-[360px]"
          />
        )}
      </div>

      <div ref={paneRef} className="relative min-w-0">
        {zoom ? (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 z-10 hidden overflow-hidden rounded-lg border border-line bg-white shadow-[0_8px_30px_rgba(15,23,42,0.18)] min-[1040px]:block"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={productImageSrc(product.imageUrl)}
              alt=""
              className="absolute max-w-none object-contain"
              style={{
                width: zoom.boxWidth * IMAGE_ZOOM_SCALE,
                height: zoom.boxHeight * IMAGE_ZOOM_SCALE,
                left: -zoom.lensLeft * IMAGE_ZOOM_SCALE,
                top: -zoom.lensTop * IMAGE_ZOOM_SCALE,
              }}
            />
          </div>
        ) : null}

        <dl className="grid gap-3 min-[640px]:grid-cols-2 min-[1040px]:grid-cols-3">
          <DetailField label="코드" value={product.code} />
          <DetailField label="품명" value={product.productName} />
          <DetailField label="구분" value={product.category} />
          <DetailField
            label="고객 공개"
            value={product.openStock !== false ? "공개" : "비공개"}
          />
          <DetailField label="규격" value={<SpecText spec={product.spec} />} />
          <DetailField label="단위" value={String(product.unit)} />
          <DetailField label="재고" value={formatStock(product.stock, product.stockMax)} />
          <DetailField
            label="적용일자"
            value={formatDate(product.effectiveDate)}
          />
          <DetailField
            label="500만원 이상 할인가"
            value={formatPrice(product.priceOver500man)}
          />
          <DetailField
            label="100만원 이상 할인가"
            value={formatPrice(product.priceOver100man)}
          />
          <DetailField
            label="도매 기본가"
            value={formatPrice(product.wholesalePrice)}
          />
          <DetailField
            label="준회원가"
            value={formatPrice(product.associatePrice)}
          />
          <DetailField
            label="소매가"
            value={formatOptionalPrice(product.retailPrice)}
          />
          <DetailField
            label="슈퍼 납품가"
            value={formatOptionalPrice(product.supermarketPrice)}
          />
          <DetailField
            label="급식가"
            value={formatOptionalPrice(product.schoolServePrice)}
          />
          <DetailField
            label="단가노출여부"
            value={formatYesNo(product.unitPriceShow)}
          />
          <DetailField label="비과세" value={formatYesNo(product.taxExemption)} />
          <DetailField
            label="원본 파일명"
            value={product.imageOriginalName ?? ""}
          />
          <DetailField
            label="저장 파일명"
            value={product.imageStoredName ?? ""}
          />
          <DetailField label="등록일" value={formatDate(product.createdAt)} />
          <DetailField label="수정일" value={formatDate(product.updatedAt)} />
          {product.imageUrl?.trim() ? (
            <DetailField
              label="사진 URL"
              value={product.imageUrl}
              className="min-[640px]:col-span-2 min-[1040px]:col-span-3"
            />
          ) : null}
        </dl>
      </div>
    </div>
  );
}

function ProductFormEditor({
  mode,
  currentProduct,
  form,
  setForm,
  imageFile,
  setImageFile,
  existingImageUrl,
  formError,
  isSaving,
  onCancel,
  onSubmit,
  inSheet = false,
}: {
  mode: "create" | "edit";
  /** 바텀시트 안에 넣을 때: 테두리·제목·"목록으로" 없이 폼만 */
  inSheet?: boolean;
  currentProduct: StockInventoryRow | null;
  form: ProductFormState;
  setForm: Dispatch<SetStateAction<ProductFormState>>;
  imageFile: File | null;
  setImageFile: (file: File | null) => void;
  existingImageUrl: string | null;
  formError: string;
  isSaving: boolean;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const previewSrc = useMemo(() => {
    if (imageFile) {
      return URL.createObjectURL(imageFile);
    }
    return null;
  }, [imageFile]);

  useEffect(() => {
    return () => {
      if (previewSrc) {
        URL.revokeObjectURL(previewSrc);
      }
    };
  }, [previewSrc]);

  const updateField =
    (key: keyof ProductFormState) =>
    (event: ChangeEvent<HTMLInputElement>) => {
      setForm((prev) => ({ ...prev, [key]: event.target.value }));
    };

  /** 입고 수량을 입력하는 즉시 "저장 후 12/13" 형태로 결과를 미리 보여준다. */
  const stockInPreview = (() => {
    if (!currentProduct) {
      return "";
    }
    const added = Number(form.stockIn);
    if (
      form.stockIn.trim() === "" ||
      !Number.isFinite(added) ||
      !Number.isInteger(added) ||
      added <= 0
    ) {
      return "";
    }
    const base = currentProduct.stock ?? 0;
    const baseMax = currentProduct.stockMax ?? currentProduct.stock ?? 0;
    return ` 저장하면 ${(base + added).toLocaleString("ko-KR")}/${(
      baseMax + added
    ).toLocaleString("ko-KR")} 가 됩니다.`;
  })();

  return (
    <section
      className={
        inSheet ? undefined : "rounded-lg border border-line bg-panel p-4"
      }
    >
      {inSheet ? null : (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
          <div>
            <h4 className="text-base font-semibold text-ink">
              {mode === "create" ? "상품 등록" : "상품 수정"}
            </h4>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              이미지 파일은 선택 사항이며, 업로드 시 미리보기를 확인할 수 있습니다.
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={onCancel}>
            목록으로
          </Button>
        </div>
      )}

      <div className="mb-4 flex flex-col items-start gap-3 min-[640px]:flex-row">
        <ProductThumbnail
          product={{
            imageUrl: existingImageUrl,
            productName: form.productName || "상품",
          }}
          previewSrc={previewSrc}
          className="h-36 w-36 shrink-0"
        />
        <div className="min-w-0 flex-1 space-y-2">
          <label className="block text-sm font-semibold text-ink">
            상품 이미지
            <input
              type="file"
              accept="image/*"
              className="mt-1.5 block w-full text-sm text-ink file:mr-3 file:rounded file:border file:border-line file:bg-white file:px-3 file:py-1.5 file:text-sm"
              onChange={(event) => {
                const next = event.target.files?.[0] ?? null;
                setImageFile(next);
              }}
            />
          </label>
          {imageFile ? (
            <p className="text-xs text-[#64748b]">
              선택 파일: {imageFile.name}
            </p>
          ) : existingImageUrl ? (
            <p className="text-xs text-[#64748b]">
              현재 이미지를 유지합니다. 새 파일을 선택하면 교체됩니다.
            </p>
          ) : (
            <p className="text-xs text-[#64748b]">
              이미지를 선택하지 않으면 기본 이미지가 표시됩니다.
            </p>
          )}
          {imageFile ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setImageFile(null)}
            >
              선택 취소
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 min-[640px]:grid-cols-2">
        <Input
          label="코드"
          value={form.code}
          onChange={updateField("code")}
          required
        />
        <Dropdown
          label="구분"
          options={[...CATEGORY_FORM_OPTIONS]}
          value={form.category}
          onChange={(value) =>
            setForm((prev) => ({ ...prev, category: value }))
          }
        />
        <label className="flex items-center gap-2 self-end pb-2 text-sm font-semibold text-ink min-[640px]:col-span-2">
          <input
            type="checkbox"
            checked={form.openStock}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                openStock: event.target.checked,
              }))
            }
            className="h-4 w-4 rounded border-[#cbd5e1]"
          />
          고객 공개 (체크 시 회원 주문 화면에 표시)
        </label>
        <Input
          label="품명"
          value={form.productName}
          onChange={updateField("productName")}
          className="min-[640px]:col-span-2"
          required
        />
        <div>
          <Input
            label="규격"
            value={form.spec}
            onChange={updateField("spec")}
          />
          <p className="mt-1 text-xs text-[#64748b]">
            줄을 바꾸려면 &lt;br/&gt; 를 입력하세요. (예: 간장500mL*1,&lt;br/&gt;간장120mlx2)
          </p>
        </div>
        <Input
          label="단위"
          type="number"
          min={1}
          value={form.unit}
          onChange={updateField("unit")}
          required
        />
        {mode === "create" ? (
          <Input
            label="초기 재고 (비우면 무제한, 예: 3 → 3/3)"
            type="number"
            min={0}
            value={form.stock}
            onChange={updateField("stock")}
            placeholder="무제한"
          />
        ) : (
          <div className="rounded-md border border-line bg-[#f8fafc] p-3 min-[640px]:col-span-2">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-sm font-semibold text-ink">현재 재고</span>
              <span className="text-sm font-semibold text-ink">
                {currentProduct
                  ? formatStock(currentProduct.stock, currentProduct.stockMax)
                  : "-"}
              </span>
              <span className="text-xs text-muted-foreground">
                남은 수량 / 누적 총 입고량
              </span>
            </div>

            <div className="mt-3">
              <Input
                label="입고 수량 추가"
                type="number"
                min={0}
                value={form.stockIn}
                onChange={updateField("stockIn")}
                placeholder="비우면 재고 변동 없음"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                입력한 수량이 기존 재고에 더해집니다.
                {stockInPreview}
              </p>
            </div>

            <label className="mt-3 flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={form.adjustStock}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    adjustStock: event.target.checked,
                  }))
                }
                className="h-4 w-4 rounded border-[#cbd5e1]"
              />
              재고 수량 직접 수정 (실사 정정)
            </label>

            {form.adjustStock ? (
              <div className="mt-2">
                <Input
                  label="남은 수량 정정값"
                  type="number"
                  min={0}
                  value={form.stock}
                  onChange={updateField("stock")}
                  placeholder="비우면 무제한(재고 미추적)"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  실제 창고 수량과 다를 때만 사용하세요. 정정으로 늘어난 분은
                  입고로 간주되어 누적 총 입고량에도 반영됩니다.
                </p>
              </div>
            ) : null}
          </div>
        )}
        <Input
          label="적용일자"
          type="date"
          value={form.effectiveDate}
          onChange={updateField("effectiveDate")}
          required
        />
        <Input
          label="도매 기본가"
          type="number"
          value={form.wholesalePrice}
          onChange={updateField("wholesalePrice")}
          required
        />
        <Input
          label="준회원가"
          type="number"
          value={form.associatePrice}
          onChange={updateField("associatePrice")}
          required
        />
        <Input
          label="100만원 이상 할인가"
          type="number"
          value={form.priceOver100man}
          onChange={updateField("priceOver100man")}
          required
        />
        <Input
          label="500만원 이상 할인가"
          type="number"
          value={form.priceOver500man}
          onChange={updateField("priceOver500man")}
          required
        />
        <Input
          label="소매가"
          type="number"
          value={form.retailPrice}
          onChange={updateField("retailPrice")}
          placeholder="선택"
        />
        <Input
          label="슈퍼 납품가"
          type="number"
          value={form.supermarketPrice}
          onChange={updateField("supermarketPrice")}
          placeholder="선택"
        />
        <Input
          label="급식가"
          type="number"
          value={form.schoolServePrice}
          onChange={updateField("schoolServePrice")}
          placeholder="선택"
        />
        <Dropdown
          label="단가노출여부"
          options={YES_NO_FORM_OPTIONS}
          value={form.unitPriceShow}
          onChange={(value) =>
            setForm((prev) => ({ ...prev, unitPriceShow: value }))
          }
        />
        <Dropdown
          label="비과세"
          options={YES_NO_FORM_OPTIONS}
          value={form.taxExemption}
          onChange={(value) =>
            setForm((prev) => ({ ...prev, taxExemption: value }))
          }
        />
      </div>

      {formError ? (
        <p className="mt-3 text-sm text-red">{formError}</p>
      ) : null}

      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          취소
        </Button>
        <Button
          type="button"
          className="border-green bg-green text-white hover:bg-[#128a52]"
          disabled={isSaving}
          onClick={onSubmit}
        >
          {isSaving
            ? "저장 중..."
            : mode === "create"
              ? "등록"
              : "수정 저장"}
        </Button>
      </div>
    </section>
  );
}

/** 상품 상세 바텀시트 (PC·모바일 공통) */
function StockInventoryDetailSheet({
  product,
  onClose,
  onEdit,
  onDelete,
  isDeleting,
}: {
  product: StockInventoryRow;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  const [imageOpen, setImageOpen] = useState(false);

  return (
    <>
      <BottomSheet
        open
        title="상품 상세"
        subtitle={product.productName}
        onClose={onClose}
        footer={
          <div className="mx-auto flex max-w-[1200px] flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" onClick={onEdit}>
              수정
            </Button>
            <Button
              type="button"
              variant="outline"
              className="border-red text-red hover:bg-[#fef2f2]"
              disabled={isDeleting}
              onClick={onDelete}
            >
              {isDeleting ? "삭제 중..." : "삭제"}
            </Button>
          </div>
        }
      >
        <div className="mx-auto max-w-[1200px] px-5 pb-6">
          <StockInventoryDetailContent
            key={product.id}
            product={product}
            onImageOpen={() => setImageOpen(true)}
          />
        </div>
      </BottomSheet>
      {/* 시트 안에 두면 시트의 transform 때문에 fixed 위치가 어긋나므로 형제로 둔다 */}
      <ProductImageSheet
        product={product}
        open={imageOpen}
        onClose={() => setImageOpen(false)}
      />
    </>
  );
}

function MobileProductCard({
  product,
  index,
  isSelected,
  onSelect,
}: {
  product: StockInventoryRow;
  /** 목록 번호 (1부터) */
  index: number;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        "cursor-pointer rounded-xl border bg-white px-3.5 py-3 transition-colors",
        isSelected ? "border-brand bg-[#eff6ff]" : "border-[#d8e0ea] bg-[#f8fafc]",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <ProductThumbnail
            product={product}
            className="h-14 w-14 shrink-0"
          />
          <div className="min-w-0">
            <p className="text-sm font-bold text-ink">
              <span className="mr-1.5 text-xs font-semibold tabular-nums text-[#64748b]">
                No. {index}
              </span>
              {product.productName}
            </p>
            <p className="mt-0.5 text-xs text-[#64748b]">{product.code}</p>
            <p className="mt-1 text-xs text-[#64748b]">
              {specToPlain(product.spec) || "규격 없음"} · 단위 {product.unit} · 재고{" "}
              {formatStock(product.stock, product.stockMax)}
            </p>
            <p className="mt-0.5 text-xs text-[#64748b]">
              {product.category} ·{" "}
              {product.openStock !== false ? "공개" : "비공개"} · 도매{" "}
              {formatPrice(product.wholesalePrice)}
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0 border-[#93c5fd] bg-[#eff6ff] text-brand hover:bg-[#dbeafe]"
          onClick={(event) => {
            event.stopPropagation();
            onSelect();
          }}
        >
          상세
        </Button>
      </div>
    </article>
  );
}

export function StockInventoryMng() {
  const [products, setProducts] = useState<StockInventoryRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [keyword, setKeyword] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [openFilter, setOpenFilter] = useState("all");
  const [searchField, setSearchField] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [selectedProduct, setSelectedProduct] =
    useState<StockInventoryRow | null>(null);
  const [view, setView] = useState<"list" | "create" | "edit">("list");
  const [editingProduct, setEditingProduct] =
    useState<StockInventoryRow | null>(null);
  const [form, setForm] = useState<ProductFormState>(emptyFormState);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadProducts = async () => {
    setIsLoading(true);
    setError("");

    try {
      const response = await apiFetch("/api/stock-inventory");
      const data = (await response.json()) as
        | StockInventoryRow[]
        | { message?: string };

      if (!response.ok || !Array.isArray(data)) {
        const message =
          !Array.isArray(data) && data.message
            ? data.message
            : "상품 목록을 불러오지 못했습니다.";
        setError(message);
        setProducts([]);
        return;
      }

      setProducts(data);
    } catch {
      setError("상품 목록을 불러오지 못했습니다.");
      setProducts([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadProducts();
  }, []);

  const filteredProducts = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    const stripCommas = (value: string) => value.replace(/,/g, "");

    const matchesStock = (product: StockInventoryRow) =>
      stripCommas(
        formatStock(product.stock, product.stockMax).toLowerCase(),
      ).includes(stripCommas(normalizedKeyword));
    // 단위는 정확히 일치해야 한다 ("1" 로 10 이 걸리지 않게).
    const matchesUnit = (product: StockInventoryRow) =>
      String(product.unit) === normalizedKeyword;
    const includesText = (value: string | null | undefined) =>
      (value ?? "").toLowerCase().includes(normalizedKeyword);

    return products.filter((product) => {
      if (categoryFilter !== "all" && product.category !== categoryFilter) {
        return false;
      }
      if (openFilter !== "all") {
        const isOpen = product.openStock !== false;
        if (isOpen !== (openFilter === "open")) {
          return false;
        }
      }

      if (!normalizedKeyword) {
        return true;
      }

      switch (searchField) {
        case "code":
          return includesText(product.code);
        case "productName":
          return includesText(product.productName);
        case "spec":
          return includesText(specToPlain(product.spec, " "));
        case "stock":
          return matchesStock(product);
        case "unit":
          return matchesUnit(product);
        default:
          return (
            includesText(product.code) ||
            includesText(product.productName) ||
            includesText(specToPlain(product.spec, " ")) ||
            includesText(product.category) ||
            matchesStock(product) ||
            matchesUnit(product)
          );
      }
    });
  }, [products, keyword, categoryFilter, openFilter, searchField]);

  useEffect(() => {
    setPage(1);
  }, [keyword, categoryFilter, openFilter, searchField]);

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageOffset = (safePage - 1) * pageSize;
  const pageProducts = filteredProducts.slice(pageOffset, pageOffset + pageSize);

  const openCreate = () => {
    setView("create");
    setEditingProduct(null);
    setForm(emptyFormState());
    setImageFile(null);
    setFormError("");
    setSelectedProduct(null);
  };

  const openEdit = (product: StockInventoryRow) => {
    setView("edit");
    setEditingProduct(product);
    setForm(formFromProduct(product));
    setImageFile(null);
    setFormError("");
    setSelectedProduct(null);
  };

  const backToList = () => {
    setView("list");
    setEditingProduct(null);
    setImageFile(null);
    setFormError("");
  };

  const validateForm = () => {
    if (!form.code.trim()) {
      return "코드를 입력해 주세요.";
    }
    if (!form.productName.trim()) {
      return "품명을 입력해 주세요.";
    }
    if (!form.category.trim()) {
      return "구분을 선택해 주세요.";
    }
    if (!form.effectiveDate) {
      return "적용일자를 선택해 주세요.";
    }
    const unit = Number(form.unit);
    if (!Number.isFinite(unit) || unit < 1) {
      return "단위는 1 이상이어야 합니다.";
    }
    if (form.stock.trim() !== "") {
      const stock = Number(form.stock);
      if (!Number.isFinite(stock) || stock < 0 || !Number.isInteger(stock)) {
        return "재고는 0 이상의 정수이거나 비워 두세요 (무제한).";
      }
    }
    if (form.stockIn.trim() !== "") {
      const stockIn = Number(form.stockIn);
      if (
        !Number.isFinite(stockIn) ||
        stockIn < 0 ||
        !Number.isInteger(stockIn)
      ) {
        return "입고 수량은 0 이상의 정수이거나 비워 두세요.";
      }
    }
    const prices = [
      form.priceOver500man,
      form.priceOver100man,
      form.wholesalePrice,
      form.associatePrice,
    ];
    if (
      prices.some(
        (value) => value.trim() === "" || !Number.isFinite(Number(value)),
      )
    ) {
      return "가격을 모두 입력해 주세요.";
    }
    const optionalPrices = [
      form.retailPrice,
      form.supermarketPrice,
      form.schoolServePrice,
    ];
    if (
      optionalPrices.some(
        (value) => value.trim() !== "" && !Number.isFinite(Number(value)),
      )
    ) {
      return "소매 / 슈퍼 / 급식 가격은 숫자로 입력하거나 비워 두세요.";
    }
    return "";
  };

  const buildFormData = () => {
    const formData = new FormData();
    formData.append("code", form.code.trim());
    formData.append("productName", form.productName.trim());
    if (form.spec.trim()) {
      formData.append("spec", form.spec.trim());
    }
    formData.append("unit", String(Number(form.unit)));
    // 등록 시에만 재고 절대값을 보낸다. 수정 시에는 입고분(stockIn)만 더하고,
    // 실사 정정을 체크한 경우에만 절대값으로 덮어쓴다.
    if (view === "create" || form.adjustStock) {
      formData.append(
        "stock",
        form.stock.trim() === "" ? "" : String(Number(form.stock)),
      );
    }
    if (view !== "create" && form.stockIn.trim() !== "") {
      formData.append("stockIn", String(Number(form.stockIn)));
    }
    formData.append("effectiveDate", form.effectiveDate);
    formData.append("priceOver500man", String(Number(form.priceOver500man)));
    formData.append("priceOver100man", String(Number(form.priceOver100man)));
    formData.append("wholesalePrice", String(Number(form.wholesalePrice)));
    formData.append("associatePrice", String(Number(form.associatePrice)));
    // 빈 값은 그대로 보내 null(가격 없음 / 미지정)로 저장한다.
    for (const key of [
      "retailPrice",
      "supermarketPrice",
      "schoolServePrice",
    ] as const) {
      const value = form[key].trim();
      formData.append(key, value === "" ? "" : String(Number(value)));
    }
    formData.append("unitPriceShow", form.unitPriceShow);
    formData.append("taxExemption", form.taxExemption);
    formData.append("category", form.category.trim());
    formData.append("openStock", String(form.openStock));
    if (imageFile) {
      formData.append("image", imageFile);
    }
    return formData;
  };

  const handleSave = async () => {
    if (isSaving) {
      return;
    }
    const validationError = validateForm();
    if (validationError) {
      setFormError(validationError);
      return;
    }

    setIsSaving(true);
    setFormError("");

    try {
      const formData = buildFormData();
      const response =
        view === "create"
          ? await apiFetch("/api/stock-inventory", {
              method: "POST",
              body: formData,
            })
          : await apiFetch(`/api/stock-inventory/${editingProduct?.id}`, {
              method: "PUT",
              body: formData,
            });
      const data = (await response.json()) as
        | StockInventoryRow
        | { message?: string };

      if (!response.ok) {
        throw new Error(
          !("id" in data) && data.message
            ? data.message
            : "상품 저장에 실패했습니다.",
        );
      }

      await loadProducts();
      backToList();
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "상품 저장에 실패했습니다.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (product: StockInventoryRow) => {
    if (isDeleting) {
      return;
    }
    const confirmed = window.confirm(
      `"${product.productName}" 상품을 삭제하시겠습니까?`,
    );
    if (!confirmed) {
      return;
    }

    setIsDeleting(true);
    try {
      const response = await apiFetch(`/api/stock-inventory/${product.id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const data = (await response.json()) as { message?: string };
        throw new Error(data.message || "상품 삭제에 실패했습니다.");
      }
      setSelectedProduct(null);
      await loadProducts();
    } catch (err) {
      window.alert(
        err instanceof Error ? err.message : "상품 삭제에 실패했습니다.",
      );
    } finally {
      setIsDeleting(false);
    }
  };

  const columns: TableColumn<StockInventoryRow>[] = [
    {
      key: "no",
      header: "번호",
      className: "w-[56px]",
      render: (_row, rowIndex) => pageOffset + rowIndex + 1,
    },
    { key: "code", header: "코드" },
    {
      key: "productName",
      header: "품명",
      className: "w-[24%]",
    },
    {
      key: "image",
      header: "이미지",
      className: "w-[72px]",
      render: (row) => (
        <ProductThumbnail product={row} className="h-10 w-10" />
      ),
    },
    {
      key: "spec",
      header: "규격",
      render: (row) => <SpecText spec={row.spec} />,
    },
    {
      key: "unit",
      header: "단위",
      render: (row) => String(row.unit),
    },
    {
      key: "stock",
      header: "재고",
      render: (row) => formatStock(row.stock, row.stockMax),
    },
    { key: "category", header: "구분" },
    {
      key: "openStock",
      header: "고객공개",
      render: (row) => (row.openStock !== false ? "공개" : "비공개"),
    },
    {
      key: "wholesalePrice",
      header: "도매가",
      render: (row) => formatPrice(row.wholesalePrice),
    },
    {
      key: "retailPrice",
      header: "소매가",
      render: (row) => formatOptionalPrice(row.retailPrice) || "-",
    },
    {
      key: "effectiveDate",
      header: "적용일자",
      render: (row) => formatDate(row.effectiveDate),
    },
    {
      key: "action",
      header: "작업",
      render: (row) => (
        <div className="flex flex-wrap gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={(event) => {
              event.stopPropagation();
              setSelectedProduct(row);
            }}
          >
            상세
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={(event) => {
              event.stopPropagation();
              openEdit(row);
            }}
          >
            수정
          </Button>
        </div>
      ),
    },
  ];

  if (isLoading && view === "list") {
    return (
      <div className="space-y-3">
        <div className="space-y-2">
          <Skeleton className="h-7 w-28" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <section className="rounded-lg border border-line bg-panel p-3.5">
          <TableSkeleton rows={8} columns={6} className="border-0" />
        </section>
      </div>
    );
  }

  // 수정은 목록 위 바텀시트로 띄우고, 등록만 전체 화면 폼을 쓴다.
  if (view === "create") {
    return (
      <div className="space-y-3">
        <div>
          <h3 className="text-lg font-semibold text-ink min-[1040px]:text-[22px]">
            재고/상품
          </h3>
          <p className="mt-1 text-[13px] text-muted-foreground">
            상품 정보를 등록·수정하고 이미지를 업로드할 수 있습니다.
          </p>
        </div>
        <ProductFormEditor
          mode={view}
          currentProduct={editingProduct}
          form={form}
          setForm={setForm}
          imageFile={imageFile}
          setImageFile={setImageFile}
          existingImageUrl={editingProduct?.imageUrl ?? null}
          formError={formError}
          isSaving={isSaving}
          onCancel={backToList}
          onSubmit={() => void handleSave()}
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold text-ink min-[1040px]:text-[22px]">
            재고/상품
          </h3>
          <p className="mt-1 text-[13px] text-muted-foreground">
            상품 카탈로그를 등록·조회·수정·삭제할 수 있습니다.
          </p>
        </div>
        <Button
          type="button"
          className="border-green bg-green text-white hover:bg-[#128a52]"
          onClick={openCreate}
        >
          상품 등록
        </Button>
      </div>

      {error ? (
        <section className="rounded-lg border border-line bg-panel p-4">
          <p className="text-sm text-red">{error}</p>
          <Button
            type="button"
            variant="outline"
            className="mt-3"
            onClick={() => void loadProducts()}
          >
            다시 시도
          </Button>
        </section>
      ) : (
        <>
          <section className="rounded-lg border border-line bg-panel p-3.5">
            <div className="grid gap-3 min-[640px]:grid-cols-2">
              <div>
                <p className="mb-1.5 text-2xl font-bold text-ink">구분</p>
                <div className="grid grid-cols-2 gap-2">
                  <Dropdown
                    aria-label="구분"
                    options={[...CATEGORY_FILTER_OPTIONS]}
                    value={categoryFilter}
                    onChange={setCategoryFilter}
                  />
                  <Dropdown
                    aria-label="고객공개"
                    options={[...OPEN_FILTER_OPTIONS]}
                    value={openFilter}
                    onChange={setOpenFilter}
                  />
                </div>
              </div>
              <div>
                <p className="mb-1.5 text-2xl font-bold text-ink">검색</p>
                <div className="flex gap-2">
                  <div className="w-[110px] shrink-0">
                    <Dropdown
                      aria-label="검색 항목"
                      options={[...SEARCH_FIELD_OPTIONS]}
                      value={searchField}
                      onChange={setSearchField}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <Input
                      aria-label="검색어"
                      value={keyword}
                      onChange={(event) => setKeyword(event.target.value)}
                      placeholder={SEARCH_PLACEHOLDERS[searchField]}
                    />
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-[#64748b]">
                총 {filteredProducts.length}건
                {keyword.trim() || categoryFilter !== "all" || openFilter !== "all"
                  ? ` (전체 ${products.length}건 중)`
                  : ""}
              </p>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-[#64748b]">
                  상품보기
                </span>
                <div className="w-[96px]">
                  <Dropdown
                    aria-label="상품보기"
                    options={PAGE_SIZE_OPTIONS}
                    value={String(pageSize)}
                    onChange={(value) => {
                      setPageSize(Number(value));
                      setPage(1);
                    }}
                  />
                </div>
              </div>
            </div>
          </section>

          <div className="space-y-2.5 min-[1040px]:hidden">
            {filteredProducts.length === 0 ? (
              <p className="rounded-xl border border-line bg-white px-3.5 py-6 text-center text-sm text-muted-foreground">
                검색 결과가 없습니다.
              </p>
            ) : (
              pageProducts.map((product, index) => (
                <MobileProductCard
                  key={product.id}
                  product={product}
                  index={pageOffset + index + 1}
                  isSelected={selectedProduct?.id === product.id}
                  onSelect={() => setSelectedProduct(product)}
                />
              ))
            )}
          </div>

          <section className="hidden min-w-0 rounded-lg border border-line bg-panel p-3.5 min-[1040px]:block">
            <Table
              caption="상품 목록"
              columns={columns}
              data={pageProducts}
              emptyMessage="검색 결과가 없습니다."
              onRowClick={(row) => setSelectedProduct(row)}
              getRowClassName={(row) =>
                selectedProduct?.id === row.id
                  ? "cursor-pointer bg-[#eff6ff]"
                  : "cursor-pointer hover:bg-[#f8fafc]"
              }
            />
          </section>

          {filteredProducts.length > 0 ? (
            <div className="flex justify-center">
              <Pagination
                page={safePage}
                totalPages={totalPages}
                onPageChange={setPage}
              />
            </div>
          ) : null}

          {selectedProduct ? (
            <StockInventoryDetailSheet
              product={selectedProduct}
              onClose={() => setSelectedProduct(null)}
              onEdit={() => openEdit(selectedProduct)}
              onDelete={() => void handleDelete(selectedProduct)}
              isDeleting={isDeleting}
            />
          ) : null}
        </>
      )}

      <BottomSheet
        open={view === "edit"}
        title="상품 수정"
        subtitle={editingProduct?.productName}
        onClose={backToList}
      >
        <div className="mx-auto max-w-[1200px] px-5 pb-6">
          <p className="mb-4 text-[13px] text-muted-foreground">
            이미지 파일은 선택 사항이며, 업로드 시 미리보기를 확인할 수 있습니다.
          </p>
          <ProductFormEditor
            inSheet
            mode="edit"
            currentProduct={editingProduct}
            form={form}
            setForm={setForm}
            imageFile={imageFile}
            setImageFile={setImageFile}
            existingImageUrl={editingProduct?.imageUrl ?? null}
            formError={formError}
            isSaving={isSaving}
            onCancel={backToList}
            onSubmit={() => void handleSave()}
          />
        </div>
      </BottomSheet>
    </div>
  );
}
