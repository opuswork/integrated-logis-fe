"use client";

import {
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type Dispatch,
  type SetStateAction,
} from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Dropdown } from "@/components/ui/dropdown";
import { Input } from "@/components/ui/input";
import { Skeleton, TableSkeleton } from "@/components/ui/skeleton";
import { Table, type TableColumn } from "@/components/ui/table";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";

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
  stock: string;
  effectiveDate: string;
  priceOver500man: string;
  priceOver100man: string;
  wholesalePrice: string;
  associatePrice: string;
  category: string;
  openStock: boolean;
};

const CATEGORY_FILTER_OPTIONS = [
  { value: "all", label: "전체" },
  { value: "선물세트", label: "선물세트" },
  { value: "일반품", label: "일반품" },
] as const;

const CATEGORY_FORM_OPTIONS = [
  { value: "선물세트", label: "선물세트" },
  { value: "일반품", label: "일반품" },
] as const;

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
    effectiveDate: new Date().toISOString().slice(0, 10),
    priceOver500man: "",
    priceOver100man: "",
    wholesalePrice: "",
    associatePrice: "",
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
    stock: product.stock === null || product.stock === undefined ? "" : String(product.stock),
    effectiveDate: formatDate(product.effectiveDate),
    priceOver500man: String(product.priceOver500man),
    priceOver100man: String(product.priceOver100man),
    wholesalePrice: String(product.wholesalePrice),
    associatePrice: String(product.associatePrice),
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
  value: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <dt className="text-xs font-semibold text-[#64748b]">{label}</dt>
      <dd className="mt-0.5 text-sm text-ink break-all">{value || "-"}</dd>
    </div>
  );
}

function StockInventoryDetailContent({
  product,
}: {
  product: StockInventoryRow;
}) {
  return (
    <>
      <div className="mb-4">
        <ProductThumbnail
          product={product}
          className="mx-auto h-40 w-40 max-h-40"
        />
      </div>

      <dl className="grid gap-3 min-[640px]:grid-cols-2 min-[1040px]:grid-cols-3">
        <DetailField label="코드" value={product.code} />
        <DetailField label="품명" value={product.productName} />
        <DetailField label="구분" value={product.category} />
        <DetailField
          label="고객 공개"
          value={product.openStock !== false ? "공개" : "비공개"}
        />
        <DetailField label="규격" value={product.spec ?? ""} />
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
    </>
  );
}

function ProductFormEditor({
  mode,
  form,
  setForm,
  imageFile,
  setImageFile,
  existingImageUrl,
  formError,
  isSaving,
  onCancel,
  onSubmit,
}: {
  mode: "create" | "edit";
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

  return (
    <section className="rounded-lg border border-line bg-panel p-4">
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
        <Input
          label="규격"
          value={form.spec}
          onChange={updateField("spec")}
        />
        <Input
          label="단위"
          type="number"
          min={1}
          value={form.unit}
          onChange={updateField("unit")}
          required
        />
        <Input
          label="재고 (처음 입력값이 기준 수량, 예: 3 → 3/3)"
          type="number"
          min={0}
          value={form.stock}
          onChange={updateField("stock")}
          placeholder="무제한"
        />
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

function StockInventoryDetailPanel({
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
  return (
    <section className="hidden rounded-lg border border-line bg-panel p-4 min-[1040px]:block">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className="text-base font-semibold text-ink">상품 상세</h4>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            {product.productName}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onEdit}>
            수정
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-red text-red hover:bg-[#fef2f2]"
            disabled={isDeleting}
            onClick={onDelete}
          >
            {isDeleting ? "삭제 중..." : "삭제"}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            닫기
          </Button>
        </div>
      </div>

      <StockInventoryDetailContent product={product} />
    </section>
  );
}

function StockInventoryDetailModal({
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
  return (
    <div className="min-[1040px]:hidden">
      <Dialog open title="상품 상세" onClose={onClose}>
        <p className="mb-3 text-[13px] text-muted-foreground">
          {product.productName}
        </p>
        <div className="max-h-[60vh] overflow-y-auto pr-1">
          <StockInventoryDetailContent product={product} />
        </div>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onEdit}>
            수정
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-red text-red hover:bg-[#fef2f2]"
            disabled={isDeleting}
            onClick={onDelete}
          >
            {isDeleting ? "삭제 중..." : "삭제"}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}

function MobileProductCard({
  product,
  isSelected,
  onSelect,
}: {
  product: StockInventoryRow;
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
            <p className="text-sm font-bold text-ink">{product.productName}</p>
            <p className="mt-0.5 text-xs text-[#64748b]">{product.code}</p>
            <p className="mt-1 text-xs text-[#64748b]">
              {product.spec || "규격 없음"} · 단위 {product.unit} · 재고{" "}
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

    return products.filter((product) => {
      if (categoryFilter !== "all" && product.category !== categoryFilter) {
        return false;
      }

      if (!normalizedKeyword) {
        return true;
      }

      return (
        product.code.toLowerCase().includes(normalizedKeyword) ||
        product.productName.toLowerCase().includes(normalizedKeyword) ||
        (product.spec ?? "").toLowerCase().includes(normalizedKeyword) ||
        product.category.toLowerCase().includes(normalizedKeyword)
      );
    });
  }, [products, keyword, categoryFilter]);

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
    formData.append(
      "stock",
      form.stock.trim() === "" ? "" : String(Number(form.stock)),
    );
    formData.append("effectiveDate", form.effectiveDate);
    formData.append("priceOver500man", String(Number(form.priceOver500man)));
    formData.append("priceOver100man", String(Number(form.priceOver100man)));
    formData.append("wholesalePrice", String(Number(form.wholesalePrice)));
    formData.append("associatePrice", String(Number(form.associatePrice)));
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
      if ("id" in data) {
        setSelectedProduct(data);
      }
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
      render: (row) => row.spec || "-",
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

  if (view === "create" || view === "edit") {
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
              <Dropdown
                label="구분"
                options={[...CATEGORY_FILTER_OPTIONS]}
                value={categoryFilter}
                onChange={setCategoryFilter}
              />
              <Input
                label="검색"
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="코드 / 품명 / 규격"
              />
            </div>
            <p className="mt-2 text-xs text-[#64748b]">
              총 {filteredProducts.length}건
              {keyword.trim() || categoryFilter !== "all"
                ? ` (전체 ${products.length}건 중)`
                : ""}
            </p>
          </section>

          <div className="space-y-2.5 min-[1040px]:hidden">
            {filteredProducts.length === 0 ? (
              <p className="rounded-xl border border-line bg-white px-3.5 py-6 text-center text-sm text-muted-foreground">
                검색 결과가 없습니다.
              </p>
            ) : (
              filteredProducts.map((product) => (
                <MobileProductCard
                  key={product.id}
                  product={product}
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
              data={filteredProducts}
              emptyMessage="검색 결과가 없습니다."
              scrollable
              visibleRows={10}
              onRowClick={(row) => setSelectedProduct(row)}
              getRowClassName={(row) =>
                selectedProduct?.id === row.id
                  ? "cursor-pointer bg-[#eff6ff]"
                  : "cursor-pointer hover:bg-[#f8fafc]"
              }
            />
          </section>

          {selectedProduct ? (
            <>
              <StockInventoryDetailPanel
                product={selectedProduct}
                onClose={() => setSelectedProduct(null)}
                onEdit={() => openEdit(selectedProduct)}
                onDelete={() => void handleDelete(selectedProduct)}
                isDeleting={isDeleting}
              />
              <StockInventoryDetailModal
                product={selectedProduct}
                onClose={() => setSelectedProduct(null)}
                onEdit={() => openEdit(selectedProduct)}
                onDelete={() => void handleDelete(selectedProduct)}
                isDeleting={isDeleting}
              />
            </>
          ) : null}
        </>
      )}
    </div>
  );
}
