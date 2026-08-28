import { hasEditAlert } from "@/lib/shipment-ops";

/** 포장/출고/배송 이름 옆 ○수정 경고등 */
export function EditAlertBadge({
  factoryAlert,
}: {
  factoryAlert?: string | null;
}) {
  if (!hasEditAlert(factoryAlert)) return null;
  return (
    <span className="ml-1 inline-block animate-pulse text-[11px] font-bold text-[#E53E3E]">
      ○수정
    </span>
  );
}
