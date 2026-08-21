"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  ProductPickDialog,
  type ProductPickResult,
} from "@/components/product-pick-dialog";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";

type PaymentType = "선불" | "착불";
type ConvertPhase = "idle" | "converting" | "ready";

type ChurchOption = {
  id: number;
  name: string;
  region?: string | null;
  branchCode?: string | null;
  assigner?: string | null;
};

type OptionBlock = {
  id: string;
  productLabel: string;
  quantity: string;
  paymentType: PaymentType;
  boxUnit: string;
};

const DOWNLOAD_FILENAME = "우체국택배_업로드_컨버트.xlsx";
const MAX_OPTIONS = 10;

function newOptionBlock(): OptionBlock {
  return {
    id: `opt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    productLabel: "",
    quantity: "1",
    paymentType: "선불",
    boxUnit: "",
  };
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

function fieldClassName() {
  return "min-h-9 w-full rounded-[7px] border border-[#cbd5e1] bg-white px-2.5 py-2 text-sm text-ink placeholder:text-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20";
}

function ConvertProgress({ percent }: { percent: number }) {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped / 100);

  return (
    <div className="mt-4 flex flex-col items-center gap-3 rounded-lg border border-line bg-[#0b1b33] px-4 py-5">
      <p className="text-base font-semibold text-white">변환중</p>
      <div className="relative flex size-[120px] items-center justify-center">
        <svg
          className="size-full -rotate-90"
          viewBox="0 0 100 100"
          aria-hidden
        >
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke="#000000"
            strokeWidth="10"
          />
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke="#2f80ed"
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="transition-[stroke-dashoffset] duration-300 ease-out"
          />
        </svg>
        <span className="absolute text-xl font-bold text-white">{clamped}%</span>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/assets/images/convert-spinner.png"
        alt=""
        className="size-10 animate-spin"
        style={{ animationDuration: "0.85s" }}
      />
      <p className="text-sm font-medium text-white/80">Progressbar</p>
    </div>
  );
}

function ChurchSearchField({
  churches,
  isLoading,
  loadError,
  onRetryLoad,
  query,
  selectedId,
  onQueryChange,
  onSelect,
}: {
  churches: ChurchOption[];
  isLoading: boolean;
  loadError: string;
  onRetryLoad: () => void;
  query: string;
  selectedId: number | null;
  onQueryChange: (value: string) => void;
  onSelect: (church: ChurchOption) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) {
      return churches.slice(0, 40);
    }
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
          church.region ?? "",
          church.branchCode ?? "",
          church.assigner ?? "",
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
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={query}
        onChange={(e) => {
          onQueryChange(e.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        placeholder="중앙 검색"
        className={fieldClassName()}
        autoComplete="off"
      />
      {selectedId ? (
        <p className="mt-1 text-xs text-green">중앙이 선택되었습니다.</p>
      ) : null}
      {isOpen ? (
        <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-line bg-white shadow-md">
          {isLoading ? (
            <li className="px-3 py-2.5 text-sm text-[#64748b]">
              중앙 목록 불러오는 중...
            </li>
          ) : loadError || churches.length === 0 ? (
            <li className="px-3 py-2.5 text-sm text-[#64748b]">
              <p>{loadError || "중앙 목록을 불러오지 못했습니다."}</p>
              <button
                type="button"
                className="mt-1 text-xs font-semibold text-brand"
                onClick={onRetryLoad}
              >
                다시 시도
              </button>
            </li>
          ) : filtered.length === 0 ? (
            <li className="px-3 py-2.5 text-sm text-[#64748b]">
              검색 결과가 없습니다.
            </li>
          ) : (
            filtered.map((church) => (
              <li key={church.id}>
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left text-sm hover:bg-[#f6f8fb]"
                  onClick={() => {
                    onSelect(church);
                    setIsOpen(false);
                  }}
                >
                  <span className="font-medium text-ink">{church.name}</span>
                  {church.assigner ? (
                    <span className="text-[#64748b]">
                      {" "}
                      - {church.assigner}
                    </span>
                  ) : null}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}

/** Admin tool: convert holiday-gift recipient xlsx → Korea Post upload xlsx. */
export function AdminPostOfficeUploadMng() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const downloadUrlRef = useRef<string | null>(null);

  const [ordererName, setOrdererName] = useState("");
  const [churchQuery, setChurchQuery] = useState("");
  const [churchId, setChurchId] = useState<number | null>(null);
  const [churches, setChurches] = useState<ChurchOption[]>([]);
  const [churchesLoading, setChurchesLoading] = useState(false);
  const [churchesError, setChurchesError] = useState("");

  const [options, setOptions] = useState<OptionBlock[]>([newOptionBlock()]);
  const [pickTargetId, setPickTargetId] = useState<string | null>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<ConvertPhase>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");

  const loadChurches = async () => {
    setChurchesLoading(true);
    setChurchesError("");
    try {
      const response = await apiFetch("/api/churches");
      const data = await response.json();
      if (!response.ok || !Array.isArray(data)) {
        setChurchesError("중앙 목록을 불러오지 못했습니다.");
        setChurches([]);
        return;
      }
      setChurches(data as ChurchOption[]);
    } catch {
      setChurchesError("중앙 목록을 불러오지 못했습니다.");
      setChurches([]);
    } finally {
      setChurchesLoading(false);
    }
  };

  useEffect(() => {
    void loadChurches();
  }, []);

  useEffect(() => {
    return () => {
      if (downloadUrlRef.current) {
        URL.revokeObjectURL(downloadUrlRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (phase !== "converting") {
      return;
    }
    setProgress(8);
    const timer = window.setInterval(() => {
      setProgress((current) => {
        if (current >= 90) {
          return current;
        }
        return current + Math.max(1, Math.round((90 - current) * 0.08));
      });
    }, 200);
    return () => {
      window.clearInterval(timer);
    };
  }, [phase]);

  const clearDownloadUrl = () => {
    if (downloadUrlRef.current) {
      URL.revokeObjectURL(downloadUrlRef.current);
      downloadUrlRef.current = null;
    }
  };

  const updateOption = (id: string, patch: Partial<OptionBlock>) => {
    setOptions((prev) =>
      prev.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
  };

  const handleProductConfirm = (result: ProductPickResult) => {
    if (!pickTargetId) {
      return;
    }
    updateOption(pickTargetId, {
      productLabel: result.productLabel,
      quantity: String(result.quantity),
      boxUnit:
        result.postWeight != null && result.postWeight > 0
          ? String(result.postWeight)
          : "",
    });
    setPickTargetId(null);
    setError("");
  };

  const validateBeforeConvert = () => {
    if (!ordererName.trim()) {
      setError("주문자 성명을 입력해 주세요.");
      return false;
    }
    if (!churchQuery.trim()) {
      setError("중앙을 검색하여 선택해 주세요.");
      return false;
    }
    const filled = options.filter((o) => o.productLabel.trim());
    if (filled.length === 0) {
      setError("상품 옵션을 1개 이상 선택해 주세요.");
      return false;
    }
    for (const opt of filled) {
      const qty = Number(opt.quantity);
      const unit = Number(opt.boxUnit);
      if (!Number.isFinite(qty) || qty < 1) {
        setError("수량은 1 이상이어야 합니다. (해당 상품의 엑셀 행 수)");
        return false;
      }
      if (!Number.isFinite(unit) || unit <= 0) {
        setError(
          "박스단위(무게)가 비어 있습니다. 상품을 다시 선택하거나 숫자를 입력해 주세요.",
        );
        return false;
      }
    }
    return true;
  };

  const handleUploadClick = () => {
    setError("");
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }
    clearDownloadUrl();
    setSelectedFile(file);
    setPhase("idle");
    setProgress(0);
    setError("");
  };

  const handleConvert = async () => {
    if (phase === "converting") {
      return;
    }
    if (!validateBeforeConvert()) {
      return;
    }
    if (!selectedFile) {
      setError("명절선물_입력.xlsx 파일을 먼저 선택해 주세요.");
      return;
    }

    clearDownloadUrl();
    setPhase("converting");
    setProgress(8);
    setError("");

    const filled = options.filter((o) => o.productLabel.trim());
    const payloadOptions = filled.map((o) => ({
      productLabel: o.productLabel.trim(),
      quantity: Math.trunc(Number(o.quantity)),
      paymentType: o.paymentType,
      boxUnit: Number(o.boxUnit),
    }));

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("ordererName", ordererName.trim());
      formData.append("churchName", churchQuery.trim());
      formData.append("options", JSON.stringify(payloadOptions));

      const response = await apiFetch(
        "/api/post-office/holiday-gift-convert",
        {
          method: "POST",
          body: formData,
        },
      );

      if (!response.ok) {
        let message = "엑셀 변환에 실패했습니다.";
        try {
          const data = (await response.json()) as {
            message?: string | string[];
          };
          if (Array.isArray(data.message)) {
            message = data.message.join(", ");
          } else if (typeof data.message === "string" && data.message) {
            message = data.message;
          }
        } catch {
          // non-JSON
        }
        setPhase("idle");
        setProgress(0);
        setError(message);
        return;
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      downloadUrlRef.current = url;
      setProgress(100);
      setPhase("ready");
    } catch {
      setPhase("idle");
      setProgress(0);
      setError("엑셀 변환에 실패했습니다. 잠시 후 다시 시도해 주세요.");
    }
  };

  const handleDownload = () => {
    if (!downloadUrlRef.current) {
      setError("다운로드할 변환 파일이 없습니다. 다시 변환해 주세요.");
      return;
    }
    const link = document.createElement("a");
    link.href = downloadUrlRef.current;
    link.download = DOWNLOAD_FILENAME;
    link.click();
  };

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-lg font-semibold text-ink min-[1040px]:text-[22px]">
          우체국택배 업로드용
        </h3>
        <p className="mt-1 text-[13px] text-muted-foreground">
          명절선물 수취인 리스트를 우체국택배 업로드 양식(.xlsx)으로 변환합니다.
        </p>
      </div>

      <Panel>
        <div className="mb-4 grid gap-3 min-[720px]:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">
              주문자 성명 *
            </label>
            <input
              type="text"
              value={ordererName}
              onChange={(e) => setOrdererName(e.target.value)}
              placeholder="예: 김순옥"
              className={fieldClassName()}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">
              중앙
            </label>
            <ChurchSearchField
              churches={churches}
              isLoading={churchesLoading}
              loadError={churchesError}
              onRetryLoad={() => void loadChurches()}
              query={churchQuery}
              selectedId={churchId}
              onQueryChange={(value) => {
                setChurchQuery(value);
                setChurchId(null);
              }}
              onSelect={(church) => {
                setChurchId(church.id);
                setChurchQuery(church.name);
              }}
            />
          </div>
        </div>

        <p className="mb-3 text-sm text-muted-foreground">
          옵션을 선택한 뒤 명절선물_입력.xlsx 파일을 선택하고, 변환 버튼을
          누르면 우체국택배_업로드_컨버트.xlsx를 내려받을 수 있습니다. (옵션
          최대 {MAX_OPTIONS}개)
        </p>

        <div className="space-y-3">
          {options.map((opt, index) => (
            <div
              key={opt.id}
              className="space-y-3 rounded-md border border-line bg-[#f8fafc] p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-ink">
                  옵션 {index + 1}
                </p>
                {options.length > 1 ? (
                  <button
                    type="button"
                    className="text-xs font-semibold text-[#E53E3E]"
                    onClick={() =>
                      setOptions((prev) => prev.filter((r) => r.id !== opt.id))
                    }
                  >
                    삭제
                  </button>
                ) : null}
              </div>

              <div className="grid gap-3 min-[640px]:grid-cols-[100px_1fr] min-[640px]:items-center">
                <span className="text-sm font-medium text-ink">1. 상품명</span>
                <div className="flex min-w-0 flex-wrap gap-2">
                  <input
                    type="text"
                    readOnly
                    value={opt.productLabel}
                    placeholder="상품명 검색으로 선택"
                    className={cn(fieldClassName(), "min-w-0 flex-1")}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setPickTargetId(opt.id)}
                  >
                    상품명 검색
                  </Button>
                </div>
              </div>

              <div className="grid gap-3 min-[640px]:grid-cols-[100px_1fr] min-[640px]:items-center">
                <label className="text-sm font-medium text-ink">
                  2. 수량 (행 수)
                </label>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={opt.quantity}
                  onChange={(e) =>
                    updateOption(opt.id, { quantity: e.target.value })
                  }
                  className={cn(fieldClassName(), "max-w-[120px]")}
                />
              </div>

              <div className="grid gap-3 min-[640px]:grid-cols-[100px_1fr] min-[640px]:items-center">
                <span className="text-sm font-medium text-ink">3. 선/착</span>
                <div className="flex flex-wrap gap-4 text-sm text-ink">
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="radio"
                      name={`pay-${opt.id}`}
                      checked={opt.paymentType === "선불"}
                      onChange={() =>
                        updateOption(opt.id, { paymentType: "선불" })
                      }
                    />
                    선불
                  </label>
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="radio"
                      name={`pay-${opt.id}`}
                      checked={opt.paymentType === "착불"}
                      onChange={() =>
                        updateOption(opt.id, { paymentType: "착불" })
                      }
                    />
                    착불
                  </label>
                </div>
              </div>

              <div className="grid gap-3 min-[640px]:grid-cols-[100px_1fr] min-[640px]:items-center">
                <label className="text-sm font-medium text-ink">
                  4. 박스단위
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={opt.boxUnit}
                    onChange={(e) =>
                      updateOption(opt.id, { boxUnit: e.target.value })
                    }
                    placeholder="무게(KG)"
                    className={cn(fieldClassName(), "max-w-[120px]")}
                  />
                  {opt.boxUnit ? (
                    <span className="text-sm text-[#64748b]">KG</span>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>

        {options.length < MAX_OPTIONS ? (
          <div className="mt-3">
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                setOptions((prev) => [...prev, newOptionBlock()])
              }
            >
              옵션 추가
            </Button>
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={phase === "converting"}
            onClick={handleUploadClick}
          >
            명절선물수취인 리스트 업로드
          </Button>
          <Button
            type="button"
            disabled={phase === "converting" || !selectedFile}
            onClick={() => void handleConvert()}
          >
            변환
          </Button>
          {selectedFile ? (
            <span className="text-sm text-muted-foreground">
              선택 파일: {selectedFile.name}
            </span>
          ) : null}
        </div>

        {phase === "converting" ? (
          <div className="mt-4">
            <ConvertProgress percent={progress} />
          </div>
        ) : null}

        {phase === "ready" ? (
          <div className="mt-4 space-y-2">
            <p className="text-sm text-ink">변환이 완료되었습니다.</p>
            <Button type="button" onClick={handleDownload}>
              변환된 파일 다운로드
            </Button>
          </div>
        ) : null}

        {error ? <p className="mt-3 text-sm text-red">{error}</p> : null}
      </Panel>

      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={handleFileChange}
      />

      <ProductPickDialog
        open={Boolean(pickTargetId)}
        onClose={() => setPickTargetId(null)}
        onConfirm={handleProductConfirm}
      />
    </div>
  );
}

export default AdminPostOfficeUploadMng;
