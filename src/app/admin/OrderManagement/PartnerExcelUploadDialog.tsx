"use client";

import { Image as ImageIcon, Upload, X } from "lucide-react";
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

const TEMPLATE_URL = "/templates/partner-bulk-upload.xlsx";
const TEMPLATE_FILENAME = "거래처_일괄등록_양식.xlsx";

type RowStatus = "create" | "update" | "error";

type PreviewRow = {
  rowNumber: number;
  status: RowStatus;
  name: string;
  category: string | null;
  subCategory: string | null;
  centerName: string | null;
  contactName: string;
  mobile: string | null;
  phone: string | null;
  address: string;
  addressDetail: string | null;
  hasImage: boolean;
  errors: string[];
};

type PreviewResponse = {
  summary: {
    total: number;
    create: number;
    update: number;
    error: number;
    images: number;
  };
  rows: PreviewRow[];
  saved?: number;
};

const STATUS_BADGE: Record<RowStatus, { label: string; className: string }> = {
  create: { label: "신규", className: "bg-[#EBF4FD] text-[#3182CE]" },
  update: { label: "수정", className: "bg-[#E9F8EF] text-[#2F855A]" },
  error: { label: "오류", className: "bg-[#FDEEEE] text-[#C53030]" },
};

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

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * 거래처 일괄 등록 (재고 엑셀 일괄 업로드와 같은 흐름).
 * 파일을 고르면 서버 미리보기로 행별 신규/수정/오류를 보여주고, 저장하면 한 번에 반영한다.
 * 거래처명 + 주소가 같은 기존 거래처는 수정된다.
 */
export function PartnerExcelUploadDialog({
  open,
  onClose,
  onUploaded,
}: {
  open: boolean;
  onClose: () => void;
  onUploaded?: (saved: number) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const reset = useCallback(() => {
    setFile(null);
    setPreview(null);
    setPreviewing(false);
    setError("");
  }, []);

  const close = useCallback(() => {
    if (saving) return;
    reset();
    onClose();
  }, [saving, reset, onClose]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, close]);

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
      const response = await apiFetch("/api/partners/bulk-import/preview", {
        method: "POST",
        body: formData,
      });
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
      if (!/\.xlsx$/i.test(selected.name)) {
        setError("xlsx 형식의 엑셀 파일을 선택해 주세요.");
        return;
      }
      setFile(selected);
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
      const response = await apiFetch("/api/partners/bulk-import", {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        setError(await readErrorMessage(response, "일괄 등록에 실패했습니다."));
        return;
      }
      const data = (await response.json()) as PreviewResponse;
      reset();
      onUploaded?.(data.saved ?? 0);
      onClose();
    } catch {
      setError("일괄 등록에 실패했습니다. 네트워크 상태를 확인해 주세요.");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  const validRows = preview ? preview.summary.create + preview.summary.update : 0;
  const canSave = Boolean(file) && !previewing && !saving && validRows > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 py-10">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="partner-excel-upload-title"
        className={cn(
          "w-full rounded-xl border border-[#1A202C]/70 bg-white p-6 shadow-[0_14px_34px_rgba(18,38,63,0.18)] transition-[max-width]",
          preview || previewing ? "max-w-[1180px]" : "max-w-[540px]",
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <h2
            id="partner-excel-upload-title"
            className="text-[17px] font-bold text-[#C05621]"
          >
            거래처 일괄 등록
          </h2>
          <button
            type="button"
            aria-label="닫기"
            disabled={saving}
            onClick={close}
            className="shrink-0 rounded-md p-1 text-[#94A3B8] hover:bg-[#F5F7FA] hover:text-[#1A202C] disabled:opacity-40"
          >
            <X className="size-4.5" strokeWidth={2} />
          </button>
        </div>

        <p className="mt-2 text-[12.5px] leading-relaxed text-[#1A202C]">
          엑셀로 여러 거래처를 한 번에 등록합니다. 정해진 양식에 입력해
          업로드하세요.(지원하는 파일 양식: xlsx)
          <br />
          거래처명과 주소가 같은 거래처가 이미 있으면 그 거래처를 수정합니다.
          증거자료(명함·계약서)는 그림을 해당 행의 &apos;거래처증거자료&apos;
          칸에 넣어 주세요.
        </p>

        <button
          type="button"
          onClick={handleDownloadTemplate}
          className="mt-2.5 text-[12.5px] font-semibold text-red underline underline-offset-2 hover:opacity-80"
        >
          일괄등록 양식 다운로드
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
          <Upload className="mx-auto size-5 text-[#94A3B8]" strokeWidth={2} />
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
            <TableSkeleton rows={5} columns={8} />
          </div>
        ) : null}

        {preview && !previewing ? <PreviewPanel preview={preview} /> : null}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            disabled={!canSave}
            onClick={() => void handleSave()}
            className="rounded-md bg-green px-6 py-2 text-[13px] font-bold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? "저장 중…" : `저장${validRows ? ` (${validRows}건)` : ""}`}
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={close}
            className="rounded-md bg-[#A0AEC0] px-6 py-2 text-[13px] font-bold text-white hover:bg-[#8D9BAE] disabled:opacity-40"
          >
            취소
          </button>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  );
}

function SummaryChip({
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
        "rounded-md bg-[#F1F5F9] px-2.5 py-1 font-semibold text-[#475569]",
        className,
      )}
    >
      {label} {value.toLocaleString()}
    </span>
  );
}

function PreviewPanel({ preview }: { preview: PreviewResponse }) {
  const { summary, rows } = preview;
  const cell = "border-b border-[#EDF2F7] px-2 py-1.5 align-top";
  return (
    <div className="mt-4">
      <div className="flex flex-wrap gap-2 text-[12px]">
        <SummaryChip label="전체" value={summary.total} />
        <SummaryChip
          label="신규"
          value={summary.create}
          className="bg-[#EBF4FD] text-[#3182CE]"
        />
        <SummaryChip
          label="수정"
          value={summary.update}
          className="bg-[#E9F8EF] text-[#2F855A]"
        />
        <SummaryChip
          label="오류"
          value={summary.error}
          className="bg-[#FDEEEE] text-[#C53030]"
        />
        <SummaryChip
          label="증거자료 그림"
          value={summary.images}
          className="bg-[#FFF7ED] text-[#9C4221]"
        />
      </div>
      {summary.error > 0 ? (
        <p className="mt-2 text-[12px] text-[#C53030]">
          오류 행은 저장하지 않습니다. 사유를 확인하고 양식을 고쳐 다시 올리거나,
          나머지 행만 저장하세요.
        </p>
      ) : null}
      <div className="mt-2.5 max-h-[52vh] overflow-auto rounded-md border border-[#E2E8F0]">
        <table className="w-full min-w-[980px] border-collapse text-left text-[12px] text-[#1A202C]">
          <thead className="sticky top-0 bg-[#F8FAFC] text-[11.5px] font-bold text-[#64748B]">
            <tr>
              <th className={cn(cell, "w-[44px]")}>행</th>
              <th className={cn(cell, "w-[52px]")}>상태</th>
              <th className={cell}>거래처명</th>
              <th className={cell}>구분</th>
              <th className={cell}>구분2</th>
              <th className={cell}>중앙</th>
              <th className={cell}>담당자</th>
              <th className={cell}>휴대폰</th>
              <th className={cell}>유선전화</th>
              <th className={cell}>주소</th>
              <th className={cn(cell, "w-[60px]")}>증거자료</th>
              <th className={cell}>사유</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const badge = STATUS_BADGE[row.status];
              return (
                <tr
                  key={row.rowNumber}
                  className={row.status === "error" ? "bg-[#FFFAFA]" : ""}
                >
                  <td className={cell}>{row.rowNumber}</td>
                  <td className={cell}>
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 text-[11px] font-bold",
                        badge.className,
                      )}
                    >
                      {badge.label}
                    </span>
                  </td>
                  <td className={cn(cell, "font-semibold")}>
                    {row.name || "-"}
                  </td>
                  <td className={cell}>{row.category || "-"}</td>
                  <td className={cell}>{row.subCategory || "-"}</td>
                  <td className={cell}>{row.centerName || "-"}</td>
                  <td className={cell}>{row.contactName || "-"}</td>
                  <td className={cell}>{row.mobile || "-"}</td>
                  <td className={cell}>{row.phone || "-"}</td>
                  <td className={cn(cell, "break-words")}>
                    {[row.address, row.addressDetail]
                      .filter(Boolean)
                      .join(" ") || "-"}
                  </td>
                  <td className={cell}>
                    {row.hasImage ? (
                      <ImageIcon
                        className="size-4 text-[#9C4221]"
                        aria-label="그림 있음"
                      />
                    ) : (
                      <span className="text-[#CBD5E1]">-</span>
                    )}
                  </td>
                  <td className={cn(cell, "text-[#C53030]")}>
                    {row.errors.join(" ")}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
