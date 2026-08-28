"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { FACTORY_CHANGE_ALERT_MESSAGE } from "@/lib/order-delivery";

export type FactoryAlertTarget = {
  id: number;
  orderNumber: string;
  message: string;
};

/** 공장관리자: factoryAlert 모달 — 확인 시 alert 클리어(○수정 소등) */
export function FactoryAlertModal({
  alert,
  onCleared,
}: {
  alert: FactoryAlertTarget | null;
  onCleared: () => void;
}) {
  const [clearing, setClearing] = useState(false);

  if (!alert) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="factory-change-alert-title"
        className="w-full max-w-md rounded-xl border border-line bg-panel p-5 shadow-[0_14px_34px_rgba(18,38,63,0.08)]"
      >
        <h2
          id="factory-change-alert-title"
          className="text-lg font-semibold text-ink"
        >
          {alert.message || FACTORY_CHANGE_ALERT_MESSAGE}
        </h2>
        <p className="mt-3 text-base leading-relaxed text-ink">
          주문번호 {alert.orderNumber}
        </p>
        <div className="mt-5 flex justify-end">
          <Button
            type="button"
            className="border-[#ea580c] bg-[#ea580c] text-white hover:bg-[#c2410c]"
            disabled={clearing}
            onClick={() => {
              void (async () => {
                setClearing(true);
                try {
                  await apiFetch(`/api/orders/${alert.id}/factory-alert`, {
                    method: "PATCH",
                  });
                  onCleared();
                } finally {
                  setClearing(false);
                }
              })();
            }}
          >
            {clearing ? "확인 중..." : "확인"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** 목록에서 factoryAlert가 있는 첫 주문 → 모달 타겟 */
export function pickFactoryAlertTarget(
  rows: Array<{
    id: number;
    orderNumber: string;
    factoryAlert?: string | null;
  }>,
): FactoryAlertTarget | null {
  const hit = rows.find((row) => Boolean(row.factoryAlert?.trim()));
  if (!hit?.factoryAlert) return null;
  return {
    id: hit.id,
    orderNumber: hit.orderNumber,
    message: hit.factoryAlert.trim(),
  };
}
