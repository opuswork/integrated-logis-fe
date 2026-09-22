"use client";

import { FileSpreadsheet, Upload, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";

import { TableSkeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";

const TEMPLATE_URL = "/templates/stock-bulk-upload.xlsx";
const TEMPLATE_FILENAME = "재고관리_일괄업로드_양식.xlsx";

type PreviewStatus = "CREATE" | "UPDATE" | "INVALID";

type PreviewRow = {
  rowNumber: number;
  status: PreviewStatus;
  code: string;
  productName: string;
  spec: string | null;
  unit: number | null;
  category: string;
  stock: number | null;
  stockIn: number | null;
  currentStock: number | null;
  nextStock: number | null;
  effectiveDate: string | null;
  wholesalePrice: number | null;
  error?: string;
};

type PreviewResponse = {
  summary: { total: number; create: number; update: number; invalid: number };
  rows: PreviewRow[];
};

type ImportResult = {
  message?: string;
  summary: {
    requested: number;
    created: number;
    updated: number;
    skipped: number;
    failed: number;
  };
  createdCodes?: string[];
  updatedCodes?: string[];
  skippedCodes?: string[];
  failed?: Array<{ row?: number; code?: string; reason: string }>;
};

function formatInt(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return value.toLocaleString("ko-KR");
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

async function readErrorMessage(response: Response, fallback: string) {
  try {
    const data = (await response.json()) as { message?: string | string[] };
    if (Array.isArray(data.message)) return data.message.join(" ");
    if (typeof data.message === "string") return data.message;
  } catch {
    /* 본문이 JSON이 아닐 수 있다 */
  }
  return fallback;
}

const STATUS_BADGE: Record<PreviewStatus, { label: string; className: string }> =
  {
    CREATE: { label: "신규", className: "bg-[#EBF4FD] text-[#3182CE]" },
    UPDATE: { label: "수정", className: "bg-[#E9F8EF] text-[#2F855A]" },
    INVALID: { label: "오류", className: "bg-[#FDEEEE] text-[#C53030]" },
  };

function StatusBadge({ status }: { status: PreviewStatus }) {
  const { label, className } = STATUS_BADGE[status];
  return (
    <span
      className={cn(
        "inline-flex rounded px-2 py-0.5 text-[11px] font-bold",
        className,
      )}
    >
      {label}
    </span>
  );
}

/**
 * 재고관리 대량 엑셀업로드.
 *
 * 저장 전에 서버의 dry-run(`/api/stock-inventory/bulk-import/preview`)으로 행별
 * 신규/수정/오류와 적용 후 재고를 미리 보여준다. 미리보기와 실제 저장이 같은
 * 파서를 쓰므로 표시된 숫자가 저장 결과와 어긋나지 않는다.
 */
export function StockExcelUploadMng({
  onUploaded,
}: {
  onUploaded?: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [modalOpen, setModalOpen] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [previewing, setPreviewing] = useState(false);
  // 이 화면의 주 용도가 기존 품목 재고 반영이라 기본값을 켜 둔다. 빈 칸은 기존
  // 값이 그대로 유지되므로(백엔드 mapExcelRow), 켜 두어도 재고만 안전하게 바뀐다.
  const [overwrite, setOverwrite] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);

  const resetSelection = useCallback(() => {
    setFile(null);
    setPreview(null);
    setPreviewing(false);
    setError("");
  }, []);

  const closeModal = useCallback(() => {
    setModalOpen(false);
    resetSelection();
  }, [resetSelection]);

  const openModal = () => {
    resetSelection();
    setResult(null);
    setModalOpen(true);
  };

  // ESC 로 모달 닫기
  useEffect(() => {
    if (!modalOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) {
        closeModal();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [modalOpen, saving, closeModal]);

  const handleDownloadTemplate = () => {
    const link = document.createElement("a");
    link.href = TEMPLATE_URL;
    link.download = TEMPLATE_FILENAME;
    link.click();
  };

  const loadPreview = useCallback(async (selected: File) => {
    setPreviewing(true);
    setPreview(null);
    setError("");
    try {
      const formData = new FormData();
      formData.append("file", selected);
      const response = await apiFetch(
        "/api/stock-inventory/bulk-import/preview",
        { method: "POST", body: formData },
      );
      if (!response.ok) {
        setError(
          await readErrorMessage(response, "엑셀 미리보기에 실패했습니다."),
        );
        return;
      }
      setPreview((await response.json()) as PreviewResponse);
    } catch {
      setError("엑셀 미리보기에 실패했습니다. 네트워크 상태를 확인해 주세요.");
    } finally {
      setPreviewing(false);
    }
  }, []);

  const selectFile = useCallback(
    (selected: File | undefined) => {
      if (!selected) return;
      if (!/\.(xlsx|xls|csv)$/i.test(selected.name)) {
        setError("xlsx 형식의 엑셀 파일을 선택해 주세요. (xls, csv도 지원)");
        return;
      }
      setFile(selected);
      setResult(null);
      void loadPreview(selected);
    },
    [loadPreview],
  );

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0];
    event.target.value = "";
    selectFile(selected);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);
    if (saving || previewing) return;
    selectFile(event.dataTransfer.files?.[0]);
  };

  const handleSave = async () => {
    if (!file || saving) return;
    setSaving(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("skipExisting", overwrite ? "false" : "true");

      const response = await apiFetch("/api/stock-inventory/bulk-import", {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        setError(await readErrorMessage(response, "엑셀 업로드에 실패했습니다."));
        return;
      }
      setResult((await response.json()) as ImportResult);
      setModalOpen(false);
      resetSelection();
      onUploaded?.();
    } catch {
      setError("엑셀 업로드에 실패했습니다. 네트워크 상태를 확인해 주세요.");
    } finally {
      setSaving(false);
    }
  };

  const validRows = preview
    ? preview.summary.create + preview.summary.update
    : 0;
  const canSave = Boolean(file) && !previewing && !saving && validRows > 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-[19px] font-bold tracking-tight text-[#1A202C]">
            재고관리 대량 엑셀업로드
          </h3>
          <p className="mt-1 text-[12.5px] text-[#A0AEC0]">
            정해진 양식에 입력한 엑셀 파일로 재고/상품을 한 번에 등록하거나 입고
            수량을 가산합니다. 저장 전에 행별 미리보기로 결과를 확인하세요
          </p>
        </div>
        <button
          type="button"
          onClick={openModal}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#3182CE] px-3 py-2 text-[12.5px] font-bold text-white hover:bg-[#2B6CB0]"
        >
          <Upload className="size-3.5" strokeWidth={2} />
          엑셀 업로드
        </button>
      </div>

      {result ? (
        <section className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
          <div className="border-b border-[#E2E8F0] px-[18px] py-3.5 text-[13px] font-bold text-[#1A202C]">
            최근 업로드 결과
          </div>
          <div className="space-y-3 px-[18px] py-4">
            <div className="flex flex-wrap gap-2 text-[12.5px]">
              <ResultChip label="요청" value={result.summary.requested} />
              <ResultChip
                label="신규"
                value={result.summary.created}
                className="bg-[#EBF4FD] text-[#3182CE]"
              />
              <ResultChip
                label="수정"
                value={result.summary.updated}
                className="bg-[#E9F8EF] text-[#2F855A]"
              />
              <ResultChip label="건너뜀" value={result.summary.skipped} />
              <ResultChip
                label="실패"
                value={result.summary.failed}
                className="bg-[#FDEEEE] text-[#C53030]"
              />
            </div>
            {result.failed && result.failed.length > 0 ? (
              <ul className="list-disc space-y-0.5 pl-5 text-[12px] text-[#64748B]">
                {result.failed.slice(0, 10).map((item, index) => (
                  <li key={`${item.code ?? "row"}-${index}`}>
                    {item.row ? `${item.row}행 ` : ""}
                    {item.code ? `(${item.code}) ` : ""}
                    {item.reason}
                  </li>
                ))}
                {result.failed.length > 10 ? (
                  <li>외 {result.failed.length - 10}건…</li>
                ) : null}
              </ul>
            ) : null}
            <p className="text-[11.5px] text-[#A0AEC0]">
              반영 결과는 &apos;전체 재고 현황&apos;의 현재재고·누적 추가와 재고
              변동 이력에서 확인할 수 있습니다
            </p>
          </div>
        </section>
      ) : (
        <section className="rounded-xl border border-dashed border-[#E2E8F0] bg-white px-[18px] py-10 text-center">
          <FileSpreadsheet
            className="mx-auto size-8 text-[#CBD5E1]"
            strokeWidth={1.5}
          />
          <p className="mt-2.5 text-[13px] text-[#64748B]">
            아직 업로드한 파일이 없습니다.
          </p>
          <button
            type="button"
            onClick={openModal}
            className="mt-3 rounded-lg border border-[#E2E8F0] px-3 py-2 text-[12.5px] font-bold text-[#1A365D] hover:bg-[#F5F7FA]"
          >
            엑셀 파일로 일괄 등록
          </button>
        </section>
      )}

      {modalOpen ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 py-10">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="stock-excel-upload-title"
            className={cn(
              "w-full rounded-xl border border-[#1A202C]/70 bg-white p-6 shadow-[0_14px_34px_rgba(18,38,63,0.18)] transition-[max-width]",
              preview || previewing ? "max-w-[1080px]" : "max-w-[540px]",
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <h2
                id="stock-excel-upload-title"
                className="text-[17px] font-bold text-[#C05621]"
              >
                엑셀 파일로 일괄 등록
              </h2>
              <button
                type="button"
                aria-label="닫기"
                disabled={saving}
                onClick={closeModal}
                className="shrink-0 rounded-md p-1 text-[#94A3B8] hover:bg-[#F5F7FA] hover:text-[#1A202C] disabled:opacity-40"
              >
                <X className="size-4.5" strokeWidth={2} />
              </button>
            </div>

            <p className="mt-2 text-[12.5px] leading-relaxed text-[#1A202C]">
              엑셀을 업로드하여 다수의 재고 정보를 한번에 입력할 수 있습니다.
              <br />
              정해진 엑셀 양식에 입력하여 업로드하세요.(지원하는 파일
              양식:xlsx)
            </p>

            <button
              type="button"
              onClick={handleDownloadTemplate}
              className="mt-2.5 text-[12.5px] font-semibold text-red underline underline-offset-2 hover:opacity-80"
            >
              일괄업로드 양식 다운로드
            </button>

            <div
              onClick={() => {
                if (!saving && !previewing) fileInputRef.current?.click();
              }}
              onDragOver={(event) => {
                event.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDrop}
              className={cn(
                "mt-3.5 cursor-pointer rounded-md border-2 border-dashed px-4 py-7 text-center transition-colors",
                dragActive
                  ? "border-[#3182CE] bg-[#EBF4FD]"
                  : "border-[#CBD5E1] bg-[#FBFCFE] hover:border-[#94A3B8]",
                (saving || previewing) && "cursor-not-allowed opacity-60",
              )}
            >
              <Upload
                className="mx-auto size-5 text-[#94A3B8]"
                strokeWidth={2}
              />
              {file ? (
                <>
                  <p className="mt-2 text-[12.5px] font-bold text-[#1A202C]">
                    {file.name}
                  </p>
                  <p className="mt-0.5 text-[11.5px] text-[#A0AEC0]">
                    {formatFileSize(file.size)} · 클릭하면 다른 파일을 선택합니다
                  </p>
                </>
              ) : (
                <p className="mt-2 text-[12.5px] text-[#A0AEC0]">
                  클릭 또는 드래그해서 파일을 선택해 주세요.
                </p>
              )}
            </div>

            <label className="mt-3 flex cursor-pointer items-center gap-2 text-[12.5px] text-[#1A202C]">
              <input
                type="checkbox"
                checked={overwrite}
                disabled={saving}
                onChange={(event) => setOverwrite(event.target.checked)}
                className="size-3.5 accent-[#3182CE]"
              />
              이미 등록된 코드도 반영 (체크를 해제하면 신규 품목만 등록하고 기존
              코드는 건너뜁니다)
            </label>

            {error ? (
              <p className="mt-3 rounded-md bg-[#FDEEEE] px-3 py-2 text-[12.5px] text-[#C53030]">
                {error}
              </p>
            ) : null}

            {previewing ? (
              <div className="mt-4">
                <p className="mb-2 text-[12.5px] font-bold text-[#64748B]">
                  미리보기를 불러오는 중…
                </p>
                <TableSkeleton rows={5} columns={7} />
              </div>
            ) : null}

            {preview && !previewing ? (
              <PreviewPanel preview={preview} overwrite={overwrite} />
            ) : null}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={!canSave}
                onClick={() => void handleSave()}
                className="rounded-md bg-green px-6 py-2 text-[13px] font-bold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {saving ? "저장 중…" : "저장"}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={closeModal}
                className="rounded-md bg-[#A0AEC0] px-6 py-2 text-[13px] font-bold text-white hover:bg-[#8D9BAE] disabled:opacity-40"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  );
}

function ResultChip({
  label,
  value,
  className,
}: {
  label: string;
  value: number;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md bg-[#F1F5F9] px-2.5 py-1 font-bold text-[#475569]",
        className,
      )}
    >
      {label}
      <span className="tabular-nums">{formatInt(value)}</span>건
    </span>
  );
}

function PreviewPanel({
  preview,
  overwrite,
}: {
  preview: PreviewResponse;
  overwrite: boolean;
}) {
  const { summary, rows } = preview;
  const validRows = summary.create + summary.update;

  return (
    <div className="mt-4 space-y-2.5">
      <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
        <span className="font-bold text-[#1A202C]">미리보기</span>
        <ResultChip label="총" value={summary.total} />
        <ResultChip
          label="신규"
          value={summary.create}
          className="bg-[#EBF4FD] text-[#3182CE]"
        />
        <ResultChip
          label="수정"
          value={summary.update}
          className="bg-[#E9F8EF] text-[#2F855A]"
        />
        <ResultChip
          label="오류"
          value={summary.invalid}
          className="bg-[#FDEEEE] text-[#C53030]"
        />
      </div>

      {validRows === 0 ? (
        <p className="rounded-md bg-[#FDEEEE] px-3 py-2 text-[12px] text-[#C53030]">
          등록 가능한 행이 없습니다. 오류 사유를 확인하고 양식을 수정해 주세요.
        </p>
      ) : summary.invalid > 0 ? (
        <p className="rounded-md bg-[#FFF7ED] px-3 py-2 text-[12px] text-[#9C4221]">
          오류 {formatInt(summary.invalid)}행은 저장 시 건너뜁니다. 나머지{" "}
          {formatInt(validRows)}행만 등록됩니다.
        </p>
      ) : null}

      {!overwrite && summary.update > 0 ? (
        <p className="rounded-md bg-[#FFF7ED] px-3 py-2 text-[12px] text-[#9C4221]">
          &apos;수정&apos; {formatInt(summary.update)}행은 이미 등록된 코드입니다.
          위의 &apos;이미 등록된 코드도 반영&apos;을 체크하지 않으면 저장 시
          건너뜁니다.
        </p>
      ) : null}

      <div className="max-h-[360px] overflow-auto rounded-lg border border-[#E2E8F0]">
        <table className="w-full min-w-[980px] border-collapse text-left text-[12px]">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-[11.5px] font-bold text-[#64748B]">
              <th className="px-3 py-2.5">행</th>
              <th className="px-3 py-2.5">상태</th>
              <th className="px-3 py-2.5">코드</th>
              <th className="px-3 py-2.5">품명</th>
              <th className="px-3 py-2.5">규격</th>
              <th className="px-3 py-2.5">단위</th>
              <th className="px-3 py-2.5">구분</th>
              <th className="px-3 py-2.5">현재재고</th>
              <th className="px-3 py-2.5">입고수량</th>
              <th className="px-3 py-2.5">적용 후 재고</th>
              <th className="px-3 py-2.5">도매가</th>
              <th className="px-3 py-2.5">적용일자</th>
              <th className="px-3 py-2.5">비고</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.rowNumber}
                className={cn(
                  "border-b border-[#EEF1F5]",
                  row.status === "INVALID" && "bg-[#FDEEEE]",
                )}
              >
                <td className="px-3 py-2 text-[#A0AEC0] tabular-nums">
                  {row.rowNumber}
                </td>
                <td className="px-3 py-2">
                  <StatusBadge status={row.status} />
                </td>
                <td className="px-3 py-2 font-semibold text-[#1A202C]">
                  {row.code || "—"}
                </td>
                <td className="px-3 py-2">{row.productName || "—"}</td>
                <td className="px-3 py-2 text-[#64748B]">{row.spec || "—"}</td>
                <td className="px-3 py-2 tabular-nums">{formatInt(row.unit)}</td>
                <td className="px-3 py-2 text-[#64748B]">
                  {row.category || "—"}
                </td>
                <td className="px-3 py-2 tabular-nums text-[#64748B]">
                  {formatInt(row.currentStock)}
                </td>
                <td className="px-3 py-2 tabular-nums text-[#2F855A]">
                  {row.stockIn ? `+${formatInt(row.stockIn)}` : "—"}
                </td>
                <td className="px-3 py-2 font-bold tabular-nums text-[#1A202C]">
                  {formatInt(row.nextStock)}
                </td>
                <td className="px-3 py-2 tabular-nums">
                  {formatInt(row.wholesalePrice)}
                </td>
                <td className="px-3 py-2 text-[#64748B]">
                  {formatDate(row.effectiveDate)}
                </td>
                <td className="px-3 py-2 text-[#C53030]">{row.error ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default StockExcelUploadMng;
