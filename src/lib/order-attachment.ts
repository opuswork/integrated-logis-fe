/** 주문 첨부(대량 택배 명단) 파일 종류 — BE order-attachment-types 와 같은 허용 목록 */
export type OrderAttachmentKind = "image" | "pdf" | "sheet";

const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "gif", "webp", "heic", "heif", "bmp"];
const SHEET_EXTENSIONS = ["xlsx", "xls", "csv"];

/** 파일 선택 창에 넘기는 accept */
export const ORDER_ATTACHMENT_ACCEPT = "image/*,.pdf,.xlsx,.xls,.csv";

function extensionOf(name: string) {
  const clean = name.split(/[?#]/)[0] ?? "";
  const dot = clean.lastIndexOf(".");
  return dot >= 0 ? clean.slice(dot + 1).toLowerCase() : "";
}

/** 업로드할 파일의 종류. 받을 수 없는 파일이면 null */
export function orderAttachmentKindOfFile(file: File): OrderAttachmentKind | null {
  const ext = extensionOf(file.name);
  if (ext === "pdf") return "pdf";
  if (SHEET_EXTENSIONS.includes(ext)) return "sheet";
  if (!file.type.startsWith("image/")) return null;
  return ext === "" || IMAGE_EXTENSIONS.includes(ext) ? "image" : null;
}

/** 저장된 첨부(URL·파일 이름)의 종류. 예전 첨부는 모두 사진이다 */
export function orderAttachmentKindOfUrl(url: string): OrderAttachmentKind {
  const ext = extensionOf(url);
  if (ext === "pdf") return "pdf";
  if (SHEET_EXTENSIONS.includes(ext)) return "sheet";
  return "image";
}

export function orderAttachmentIcon(kind: OrderAttachmentKind) {
  return kind === "pdf" ? "📄" : kind === "sheet" ? "📊" : "🖼️";
}
