import { hasEditAlert } from "@/lib/shipment-ops";

/** 포장/출고/배송 이름 옆 수정 경고등 (점멸하는 빨간 점 + 수정) */
export function EditAlertBadge({
  factoryAlert,
}: {
  factoryAlert?: string | null;
}) {
  if (!hasEditAlert(factoryAlert)) return null;
  return (
    <span className="ml-1 inline-flex items-center gap-1 align-middle text-[11px] font-bold text-[#E53E3E]">
      <span
        aria-hidden
        className="edit-alert-blink size-[7px] shrink-0 rounded-full bg-[#E53E3E]"
      />
      수정
    </span>
  );
}
