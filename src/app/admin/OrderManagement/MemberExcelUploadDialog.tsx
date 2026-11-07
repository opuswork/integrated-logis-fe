"use client";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export type MemberBulkUpdateResult = {
  dryRun: boolean;
  summary: {
    total: number;
    updated: number;
    unchanged: number;
    skipped: number;
    errors: number;
  };
  results: Array<{
    rowNumber: number | null;
    username: string;
    fullname: string;
    status: "update" | "unchanged" | "skipped" | "error";
    changes: Array<{ field: string; label: string; before: string; after: string }>;
    reason?: string;
  }>;
};

const STATUS_LABEL: Record<MemberBulkUpdateResult["results"][number]["status"], string> = {
  update: "수정",
  unchanged: "변경 없음",
  skipped: "건너뜀",
  error: "오류",
};

const STATUS_CLASS: Record<MemberBulkUpdateResult["results"][number]["status"], string> = {
  update: "bg-[#e8f3ff] text-[#1e4f9c]",
  unchanged: "bg-[#f1f5f9] text-[#64748b]",
  skipped: "bg-[#fff7e6] text-[#8a5a12]",
  error: "bg-[#fff0ed] text-red",
};

/** 회원명단 엑셀 재업로드 미리보기 → 적용 */
export function MemberExcelUploadDialog({
  fileName,
  preview,
  isApplying,
  error,
  onApply,
  onClose,
}: {
  fileName: string;
  preview: MemberBulkUpdateResult;
  isApplying: boolean;
  error: string;
  onApply: () => void;
  onClose: () => void;
}) {
  const { summary } = preview;
  // 변경 없는 행은 목록에서 뺀다 (수정·오류·건너뜀만 보여 준다)
  const rows = preview.results.filter((row) => row.status !== "unchanged");
  const hasPhoneChange = rows.some(
    (row) => row.status === "update" && row.changes.some((c) => c.field === "phone"),
  );

  return (
    <Dialog
      open
      eyebrow={fileName}
      title="회원명단 엑셀 업로드 미리보기"
      onClose={isApplying ? undefined : onClose}
      className="flex max-h-[90vh] max-w-3xl flex-col"
    >
      <div className="mb-3 flex flex-wrap gap-2 text-[13px]">
        <span className="rounded-md bg-[#e8f3ff] px-2 py-1 font-semibold text-[#1e4f9c]">
          수정 {summary.updated}
        </span>
        <span className="rounded-md bg-[#f1f5f9] px-2 py-1 text-[#64748b]">
          변경 없음 {summary.unchanged}
        </span>
        <span className="rounded-md bg-[#fff7e6] px-2 py-1 text-[#8a5a12]">
          건너뜀 {summary.skipped}
        </span>
        <span className="rounded-md bg-[#fff0ed] px-2 py-1 text-red">
          오류 {summary.errors}
        </span>
        <span className="px-1 py-1 text-muted-foreground">
          전체 {summary.total}행
        </span>
      </div>

      <p className="mb-2 text-[12px] text-muted-foreground">
        아이디로 기존 회원을 찾아 이름·중앙·직분·연락처를 고칩니다. 빈 칸은 바꾸지
        않습니다. DB에 없는 아이디는 건너뛰고, 오류 행은 적용하지 않습니다.
      </p>
      {hasPhoneChange ? (
        <p className="mb-2 rounded-[7px] border border-[#f6e8cf] bg-[#fffaf0] px-3 py-2 text-[12px] text-[#8a5a12]">
          연락처가 바뀌는 회원은 로그인 아이디(연락처 가운데 자리)도 함께 바뀝니다.
        </p>
      ) : null}

      <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-line">
        {rows.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-muted-foreground">
            바뀐 내용이 없습니다.
          </p>
        ) : (
          <table className="w-full border-collapse text-xs">
            <thead className="sticky top-0 bg-[#f8fafc] text-left text-[#64748b]">
              <tr>
                <th className="w-[48px] px-2 py-2">행</th>
                <th className="w-[120px] px-2 py-2">아이디</th>
                <th className="w-[90px] px-2 py-2">이름</th>
                <th className="w-[72px] px-2 py-2">상태</th>
                <th className="px-2 py-2">내용</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={`${row.rowNumber}-${row.username}-${index}`} className="border-t border-line align-top">
                  <td className="px-2 py-1.5 tabular-nums text-[#64748b]">
                    {row.rowNumber ?? "-"}
                  </td>
                  <td className="px-2 py-1.5 break-all">{row.username || "-"}</td>
                  <td className="px-2 py-1.5">{row.fullname || "-"}</td>
                  <td className="px-2 py-1.5">
                    <span
                      className={cn(
                        "inline-block rounded px-1.5 py-0.5 font-semibold",
                        STATUS_CLASS[row.status],
                      )}
                    >
                      {STATUS_LABEL[row.status]}
                    </span>
                  </td>
                  <td className="px-2 py-1.5">
                    {row.status === "update" ? (
                      <ul className="space-y-0.5">
                        {row.changes.map((change) => (
                          <li key={change.field}>
                            <span className="text-[#64748b]">{change.label}</span>{" "}
                            <span className="text-[#94a3b8] line-through">
                              {change.before || "(없음)"}
                            </span>{" "}
                            → <span className="font-semibold">{change.after}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <span className={row.status === "error" ? "text-red" : "text-[#8a5a12]"}>
                        {row.reason}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {error ? (
        <p className="mt-3 rounded-[7px] border border-red/30 bg-[#fff0ed] px-3 py-2 text-sm text-red">
          {error}
        </p>
      ) : null}

      <div className="mt-4 flex justify-end gap-2">
        <Button variant="outline" disabled={isApplying} onClick={onClose}>
          취소
        </Button>
        <Button
          disabled={isApplying || summary.updated === 0}
          aria-busy={isApplying}
          onClick={onApply}
        >
          {isApplying ? "적용 중..." : `${summary.updated}명 수정 적용`}
        </Button>
      </div>
    </Dialog>
  );
}
