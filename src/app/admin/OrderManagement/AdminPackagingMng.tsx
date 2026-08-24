"use client";

import html2canvas from "html2canvas-pro";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { TableSkeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api";
import { canWriteShipmentOps, getAuthUser } from "@/lib/auth";
import {
  SaveCancelledError,
  canvasToPngBlob,
  copyPngBlobToClipboard,
  packagingCaptureFilename,
  savePngBlob,
} from "@/lib/region-screen-capture";
import {
  mapShipmentOpsOrder,
  parseApiErrorMessage,
  patchShipmentOps,
  todayIsoDate,
  type PackDept,
  type ShipmentOpsOrder,
} from "@/lib/shipment-ops";
import { cn } from "@/lib/utils";

type PackTab = "pre" | "factory" | "sock";

function CellBtn({
  children,
  disabled,
  onClick,
  variant = "ghost",
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick?: () => void;
  variant?: "ghost" | "confirm";
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "rounded-md px-2.5 py-1 text-[11px] font-bold transition-colors",
        variant === "confirm" &&
          "bg-[#3182CE] text-white hover:bg-[#2B6CB0] disabled:bg-[#CBD5E0]",
        variant === "ghost" &&
          "border border-[#E2E8F0] bg-white text-[#1A202C] hover:bg-[#F5F7FA] disabled:opacity-40",
        disabled && "cursor-not-allowed",
      )}
    >
      {children}
    </button>
  );
}

export function AdminPackagingMng() {
  const auth = getAuthUser();
  const canOperate = canWriteShipmentOps(auth);
  const [tab, setTab] = useState<PackTab>("pre");
  const [rows, setRows] = useState<ShipmentOpsOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [alertDialog, setAlertDialog] = useState<{
    open: boolean;
    message: string;
  }>({ open: false, message: "" });
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deptDraft, setDeptDraft] = useState<Record<number, PackDept>>({});
  const [ptDraft, setPtDraft] = useState<Record<number, string>>({});
  const [packDateDraft, setPackDateDraft] = useState<Record<number, string>>(
    {},
  );
  const [isCapturing, setIsCapturing] = useState(false);
  const captureRootRef = useRef<HTMLDivElement>(null);

  const handleScreenCapture = useCallback(async () => {
    if (isCapturing) {
      return;
    }
    const root = captureRootRef.current;
    if (!root) {
      setAlertDialog({
        open: true,
        message: "캡처할 영역을 찾지 못했습니다.",
      });
      return;
    }

    setIsCapturing(true);
    try {
      const canvas = await html2canvas(root, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#F5F7FA",
        logging: false,
      });
      const blob = await canvasToPngBlob(canvas);
      const filename = packagingCaptureFilename();
      await savePngBlob(blob, filename);
      await copyPngBlobToClipboard(blob);
    } catch (error) {
      if (error instanceof SaveCancelledError) {
        return;
      }
      setAlertDialog({
        open: true,
        message:
          error instanceof Error
            ? error.message
            : "화면 캡처에 실패했습니다.",
      });
    } finally {
      setIsCapturing(false);
    }
  }, [isCapturing]);

  const load = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true);
      setError("");
    }
    try {
      const res = await apiFetch("/api/orders?readyForShipment=true");
      const data = await res.json();
      if (!res.ok || !Array.isArray(data)) {
        if (!silent) {
          setError("포장관리 목록을 불러오지 못했습니다.");
          setRows([]);
        }
        return;
      }
      const mapped = data
        .filter((o: { status?: string }) => o.status !== "CANCELLED")
        .map(mapShipmentOpsOrder);
      setRows(mapped);
      setDeptDraft((prev) => {
        const next = { ...prev };
        for (const row of mapped) {
          if (next[row.id] === undefined) {
            next[row.id] = row.packDept;
          }
        }
        return next;
      });
    } catch {
      if (!silent) {
        setError("포장관리 목록을 불러오지 못했습니다.");
        setRows([]);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const t = window.setInterval(() => void load(true), 8000);
    return () => window.clearInterval(t);
  }, [load]);

  const preRows = useMemo(
    () => rows.filter((r) => !r.packDone),
    [rows],
  );
  const factoryRows = useMemo(
    () =>
      rows
        .filter((r) => !r.packDone && r.packDept === "FACTORY_PACK")
        .sort((a, b) =>
          (a.requestedShipDate ?? "9999").localeCompare(
            b.requestedShipDate ?? "9999",
          ),
        ),
    [rows],
  );
  const sockRows = useMemo(
    () =>
      rows
        .filter((r) => !r.packDone && r.packDept === "SOCK_PACK")
        .sort((a, b) =>
          (a.requestedShipDate ?? "9999").localeCompare(
            b.requestedShipDate ?? "9999",
          ),
        ),
    [rows],
  );

  const runOp = async (
    orderId: number,
    body: Record<string, unknown>,
    key: string,
  ) => {
    setSavingId(key);
    try {
      const { response, data } = await patchShipmentOps(orderId, body, apiFetch);
      if (!response.ok) {
        setAlertDialog({
          open: true,
          message: parseApiErrorMessage(data),
        });
        return;
      }
      const mapped = mapShipmentOpsOrder(data as never);
      setRows((prev) => prev.map((r) => (r.id === orderId ? mapped : r)));
    } catch {
      setAlertDialog({ open: true, message: "처리에 실패했습니다." });
    } finally {
      setSavingId(null);
    }
  };

  const completePack = (row: ShipmentOpsOrder) => {
    const packPt = (ptDraft[row.id] ?? "").trim();
    const packDate = (packDateDraft[row.id] ?? todayIsoDate()).trim();

    if (!packPt) {
      setAlertDialog({ open: true, message: "PT를 입력해 주세요." });
      return;
    }
    if (!packDate) {
      setAlertDialog({ open: true, message: "포장완료일을 입력해 주세요." });
      return;
    }

    void runOp(
      row.id,
      {
        action: "completePack",
        packPt,
        packDate,
      },
      `pc-${row.id}`,
    );
  };

  const detailLabel = (row: ShipmentOpsOrder) =>
    `${row.name} ${row.clientLabel} : ${row.productSummary} ${row.quantity}세트`;

  const renderDeptTable = (
    list: ShipmentOpsOrder[],
    emptyText: string,
  ) => (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1100px] border-collapse text-left text-[12px]">
        <thead className="bg-[#EDF2F7] text-[11px] font-bold text-[#64748B]">
          <tr>
            <th className="px-2 py-2">출고요청일</th>
            <th className="px-2 py-2">상세내역</th>
            <th className="px-2 py-2">상차/택배</th>
            <th className="px-2 py-2">개별/박스</th>
            <th className="px-2 py-2">인사장소재</th>
            <th className="px-2 py-2">인사장위치</th>
            <th className="px-2 py-2">기표지</th>
            <th className="px-2 py-2">특이사항</th>
            <th className="px-2 py-2">PT</th>
            <th className="px-2 py-2">포장완료일</th>
            <th className="px-2 py-2">완료</th>
          </tr>
        </thead>
        <tbody>
          {list.length === 0 ? (
            <tr>
              <td
                colSpan={11}
                className="px-2 py-8 text-center text-sm text-[#64748B]"
              >
                {emptyText}
              </td>
            </tr>
          ) : (
            list.map((row) => (
              <tr key={row.id} className="border-t border-[#E2E8F0]">
                <td className="px-2 py-2">
                  {row.requestedShipDate
                    ? row.requestedShipDate.replaceAll("-", ".")
                    : "—"}
                </td>
                <td className="px-2 py-2 font-semibold text-[#1A365D]">
                  {detailLabel(row)}
                </td>
                <td className="px-2 py-2">{row.loadType}</td>
                <td className="px-2 py-2">{row.unitType}</td>
                <td className="px-2 py-2">
                  {row.greetingCount > 0 ? row.productSummary : "—"}
                </td>
                <td className="px-2 py-2">—</td>
                <td className="px-2 py-2">
                  {row.isParcel
                    ? row.slipDone
                      ? detailLabel(row)
                      : "—"
                    : "무"}
                </td>
                <td className="px-2 py-2">{row.specialNote}</td>
                <td className="overflow-visible whitespace-nowrap px-2 py-2 align-middle">
                  <input
                    disabled={!canOperate}
                    value={ptDraft[row.id] ?? ""}
                    onChange={(e) =>
                      setPtDraft((p) => ({ ...p, [row.id]: e.target.value }))
                    }
                    className="box-border h-8 min-h-8 w-16 rounded border border-[#E2E8F0] px-2 text-[12px] leading-none"
                    placeholder="PT"
                  />
                </td>
                <td className="overflow-visible whitespace-nowrap px-2 py-2 align-middle">
                  <input
                    type="date"
                    disabled={!canOperate}
                    value={packDateDraft[row.id] ?? todayIsoDate()}
                    onChange={(e) =>
                      setPackDateDraft((p) => ({
                        ...p,
                        [row.id]: e.target.value,
                      }))
                    }
                    className="box-border h-8 min-h-8 min-w-[9.5rem] rounded border border-[#E2E8F0] px-2 text-[12px] leading-none"
                  />
                </td>
                <td className="px-2 py-2">
                  <CellBtn
                    variant="confirm"
                    disabled={!canOperate || savingId === `pc-${row.id}`}
                    onClick={() => completePack(row)}
                  >
                    완료
                  </CellBtn>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );

  return (
    <div ref={captureRootRef}>
      <div className="mb-[18px]">
        <h3 className="text-[19px] font-bold tracking-tight text-[#1A202C]">
          포장관리
        </h3>
        <p className="mt-1 text-[12.5px] text-[#A0AEC0]">
          포장 전 · 공장포장 · 양말부포장
        </p>
      </div>

      <div className="mb-3 flex gap-1 border-b border-[#E2E8F0]">
        {(
          [
            ["pre", "포장 전"],
            ["factory", "공장포장"],
            ["sock", "양말부포장"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              "border-b-2 px-3 py-2 text-[13px] font-bold",
              tab === id
                ? "border-[#F6AD55] text-[#1A365D]"
                : "border-transparent text-[#A0AEC0] hover:text-[#1A202C]",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {error ? (
        <p className="text-sm text-[#E53E3E]">{error}</p>
      ) : loading ? (
        <div className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white p-4">
          <TableSkeleton rows={8} columns={7} className="border-0" />
        </div>
      ) : null}

      {tab === "pre" && !loading ? (
        <div className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E2E8F0] px-3 py-2.5">
            <div className="text-[13px] font-bold">
              포장 대기 목록 (포장 미완료 건)
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                className="rounded-[7px] border border-[#E2E8F0] bg-white px-3 py-1.5 text-[12.5px] font-bold"
                onClick={() => setTab("factory")}
              >
                공장포장 바로가기
              </button>
              <button
                type="button"
                className="rounded-[7px] border border-[#E2E8F0] bg-white px-3 py-1.5 text-[12.5px] font-bold"
                onClick={() => setTab("sock")}
              >
                양말부포장 바로가기
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] border-collapse text-left text-[12px]">
              <thead className="bg-[#EDF2F7] text-[11px] font-bold text-[#64748B]">
                <tr>
                  <th className="px-2 py-2">출고요청일</th>
                  <th className="px-2 py-2">상세내역</th>
                  <th className="px-2 py-2">상차/택배</th>
                  <th className="px-2 py-2">개별/박스</th>
                  <th className="px-2 py-2">인사장소재</th>
                  <th className="px-2 py-2">인사장위치</th>
                  <th className="px-2 py-2">기표지</th>
                  <th className="px-2 py-2">특이사항</th>
                  <th className="px-2 py-2">포장구분</th>
                  <th className="px-2 py-2">저장</th>
                </tr>
              </thead>
              <tbody>
                {preRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={10}
                      className="px-2 py-8 text-center text-sm text-[#64748B]"
                    >
                      포장 대기 중인 항목이 없습니다
                    </td>
                  </tr>
                ) : (
                  preRows.map((row) => (
                    <tr key={row.id} className="border-t border-[#E2E8F0]">
                      <td className="px-2 py-2">
                        {row.requestedShipDate
                          ? row.requestedShipDate.replaceAll("-", ".")
                          : "—"}
                      </td>
                      <td className="px-2 py-2 font-semibold text-[#1A365D]">
                        {detailLabel(row)}
                      </td>
                      <td className="px-2 py-2">{row.loadType}</td>
                      <td className="px-2 py-2">{row.unitType}</td>
                      <td className="px-2 py-2">
                        {row.greetingCount > 0 ? row.productSummary : "—"}
                      </td>
                      <td className="px-2 py-2">—</td>
                      <td className="px-2 py-2">
                        {row.isParcel
                          ? row.slipDone
                            ? detailLabel(row)
                            : "—"
                          : "무"}
                      </td>
                      <td className="px-2 py-2">{row.specialNote}</td>
                      <td className="px-2 py-2">
                        <select
                          disabled={!canOperate}
                          value={deptDraft[row.id] ?? ""}
                          onChange={(e) =>
                            setDeptDraft((p) => ({
                              ...p,
                              [row.id]: (e.target.value || null) as PackDept,
                            }))
                          }
                          className="rounded border border-[#E2E8F0] px-1.5 py-1"
                        >
                          <option value="">선택</option>
                          <option value="FACTORY_PACK">공장포장</option>
                          <option value="SOCK_PACK">양말부포장</option>
                        </select>
                      </td>
                      <td className="px-2 py-2">
                        <CellBtn
                          variant="confirm"
                          disabled={
                            !canOperate ||
                            !deptDraft[row.id] ||
                            savingId === `pd-${row.id}`
                          }
                          onClick={() =>
                            void runOp(
                              row.id,
                              {
                                action: "setPackDept",
                                packDept: deptDraft[row.id],
                              },
                              `pd-${row.id}`,
                            )
                          }
                        >
                          저장
                        </CellBtn>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <p className="border-t border-[#E2E8F0] px-3 py-2 text-[11px] text-[#64748B]">
            포장구분은 언제든 다시 선택해 저장할 수 있으며, 완료 전까지 목록에
            유지됩니다.
          </p>
        </div>
      ) : null}

      {tab === "factory" && !loading ? (
        <div className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E2E8F0] px-3 py-2.5">
            <div className="text-[13px] font-bold">
              공장포장 현황{" "}
              <span className="font-normal text-[#A0AEC0]">
                · 출고요청일 빠른순 정렬
              </span>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                className="rounded-[7px] border border-[#E2E8F0] px-3 py-1.5 text-[12.5px] font-bold"
                onClick={() => window.print()}
              >
                인쇄
              </button>
              <button
                type="button"
                className="rounded-[7px] border border-[#E2E8F0] px-3 py-1.5 text-[12.5px] font-bold disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isCapturing}
                onClick={() => {
                  void handleScreenCapture();
                }}
              >
                {isCapturing ? "캡처 중..." : "화면캡쳐"}
              </button>
            </div>
          </div>
          {renderDeptTable(factoryRows, "포장 대기 중인 항목이 없습니다")}
          <p className="border-t border-[#E2E8F0] px-3 py-2 text-[11px] text-[#64748B]">
            완료 처리된 건은 이 목록과 포장 전에서 사라지고, 출고관리의
            포장완료가 완료로 표시됩니다.
          </p>
        </div>
      ) : null}

      {tab === "sock" && !loading ? (
        <div className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E2E8F0] px-3 py-2.5">
            <div className="text-[13px] font-bold">
              양말부포장 현황{" "}
              <span className="font-normal text-[#A0AEC0]">
                · 출고요청일 빠른순 정렬
              </span>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                className="rounded-[7px] border border-[#E2E8F0] px-3 py-1.5 text-[12.5px] font-bold"
                onClick={() => window.print()}
              >
                인쇄
              </button>
              <button
                type="button"
                className="rounded-[7px] border border-[#E2E8F0] px-3 py-1.5 text-[12.5px] font-bold disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isCapturing}
                onClick={() => {
                  void handleScreenCapture();
                }}
              >
                {isCapturing ? "캡처 중..." : "화면캡쳐"}
              </button>
            </div>
          </div>
          {renderDeptTable(sockRows, "포장 대기 중인 항목이 없습니다")}
          <p className="border-t border-[#E2E8F0] px-3 py-2 text-[11px] text-[#64748B]">
            완료 처리된 건은 이 목록과 포장 전에서 사라지고, 출고관리의
            포장완료가 완료로 표시됩니다.
          </p>
        </div>
      ) : null}

      {alertDialog.open ? (
        <Dialog
          open={alertDialog.open}
          title="알림"
          onClose={() => setAlertDialog({ open: false, message: "" })}
        >
          <p className="text-sm leading-6 text-ink">{alertDialog.message}</p>
          <div className="mt-5 flex justify-end">
            <Button
              type="button"
              className="border-[#1A365D] bg-[#1A365D] text-white hover:bg-[#24487C]"
              onClick={() => setAlertDialog({ open: false, message: "" })}
            >
              확인
            </Button>
          </div>
        </Dialog>
      ) : null}
    </div>
  );
}

export default AdminPackagingMng;
