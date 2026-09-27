"use client";

import { Download, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Skeleton, TableSkeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api";

type VoiceRecordingRow = {
  id: number;
  ordererName: string;
  churchName: string | null;
  screen: string;
  fileName: string;
  fileUrl: string;
  durationSec: number | null;
  recordedAt: string;
};

function formatRecordedAt(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatDuration(sec: number | null) {
  if (sec == null) return "—";
  return `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
}

/** 인증이 필요한 다운로드 응답을 파일로 저장한다. */
async function saveResponseAsFile(res: Response, fallbackName: string) {
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fallbackName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function AdminFileMng() {
  const [rows, setRows] = useState<VoiceRecordingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  // 비동기 응답 이후에만 상태를 바꾼다 (effect 안 동기 setState 방지).
  const fetchRows = useCallback(async () => {
    try {
      const res = await apiFetch("/api/voice-recordings");
      const data = await res.json();
      if (!res.ok || !Array.isArray(data)) {
        throw new Error("녹음 목록을 불러오지 못했습니다.");
      }
      setRows(data as VoiceRecordingRow[]);
      setError("");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "녹음 목록을 불러오지 못했습니다.",
      );
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const load = () => {
    setLoading(true);
    setError("");
    void fetchRows();
  };

  useEffect(() => {
    const timer = window.setTimeout(() => void fetchRows(), 0);
    return () => window.clearTimeout(timer);
  }, [fetchRows]);

  const handleDownloadAll = async () => {
    setBusy("all");
    try {
      const res = await apiFetch("/api/voice-recordings/download-all");
      if (!res.ok) throw new Error();
      await saveResponseAsFile(res, "voice_recordings.zip");
    } catch {
      alert("전체 다운로드에 실패했습니다.");
    } finally {
      setBusy(null);
    }
  };

  const handleDownload = async (row: VoiceRecordingRow) => {
    setBusy(`dl-${row.id}`);
    try {
      const res = await apiFetch(`/api/voice-recordings/${row.id}/download`);
      if (!res.ok) throw new Error();
      await saveResponseAsFile(res, row.fileName);
    } catch {
      alert("다운로드에 실패했습니다.");
    } finally {
      setBusy(null);
    }
  };

  const handleDelete = async (row: VoiceRecordingRow) => {
    if (!confirm(`${row.fileName} 파일을 삭제하시겠습니까?`)) return;
    setBusy(`del-${row.id}`);
    try {
      const res = await apiFetch(`/api/voice-recordings/${row.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();
      setRows((prev) => prev.filter((r) => r.id !== row.id));
    } catch {
      alert("삭제에 실패했습니다.");
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <Skeleton className="h-7 w-28" />
          <Skeleton className="h-4 w-64 max-w-full" />
        </div>
        <section className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white p-4">
          <TableSkeleton rows={6} columns={5} className="border-0" />
        </section>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-[#E53E3E]">{error}</p>
        <button
          type="button"
          className="rounded-md border border-[#E2E8F0] bg-white px-3 py-1.5 text-sm font-semibold text-[#1A365D]"
          onClick={load}
        >
          다시 시도
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-[19px] font-bold tracking-tight text-[#1A202C]">
            파일관리
          </h3>
          <p className="mt-1 text-[12.5px] text-[#A0AEC0]">
            사용자 음성 불편·오류 신고 녹음 파일
          </p>
        </div>
        <button
          type="button"
          disabled={rows.length === 0 || busy !== null}
          onClick={() => void handleDownloadAll()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#1A365D] px-3.5 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
        >
          <Download className="size-4" />
          {busy === "all" ? "압축 중…" : "전체 다운로드 (ZIP)"}
        </button>
      </div>

      <section className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
        <div className="border-b border-[#E2E8F0] px-[18px] py-3.5 text-[13px] font-bold text-[#1A202C]">
          음성 녹음 목록{" "}
          <span className="text-[#3182CE]">({rows.length}건)</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] border-collapse text-left text-[12.5px]">
            <thead>
              <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-[11.5px] font-bold text-[#64748B]">
                <th className="px-4 py-2.5">주문자 성명</th>
                <th className="px-4 py-2.5">중앙</th>
                <th className="px-4 py-2.5">녹음날짜</th>
                <th className="px-4 py-2.5">길이</th>
                <th className="px-4 py-2.5">듣기</th>
                <th className="px-4 py-2.5 text-right">파일</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-8 text-center text-[#64748B]"
                  >
                    녹음 파일이 없습니다.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="border-b border-[#EEF1F5]">
                    <td className="px-4 py-2.5 font-semibold text-[#1A202C]">
                      {row.ordererName}
                    </td>
                    <td className="px-4 py-2.5 text-[#1A202C]">
                      {row.churchName ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 tabular-nums text-[#64748B]">
                      {formatRecordedAt(row.recordedAt)}
                    </td>
                    <td className="px-4 py-2.5 tabular-nums text-[#64748B]">
                      {formatDuration(row.durationSec)}
                    </td>
                    <td className="px-4 py-2.5">
                      <audio
                        controls
                        preload="none"
                        src={row.fileUrl}
                        className="h-8 w-[240px]"
                      />
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          disabled={busy !== null}
                          onClick={() => void handleDownload(row)}
                          title={row.fileName}
                          className="inline-flex items-center gap-1 rounded-md border border-[#E2E8F0] bg-white px-2.5 py-1 text-[12px] font-semibold text-[#1A365D] disabled:opacity-50"
                        >
                          <Download className="size-3.5" />
                          다운로드
                        </button>
                        <button
                          type="button"
                          disabled={busy !== null}
                          onClick={() => void handleDelete(row)}
                          className="inline-flex items-center rounded-md border border-[#E2E8F0] bg-white p-1.5 text-[#C53030] disabled:opacity-50"
                          aria-label="삭제"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

export default AdminFileMng;
