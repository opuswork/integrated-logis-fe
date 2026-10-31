"use client";

import { useEffect, useRef, useState } from "react";

import { apiFetch } from "@/lib/api";
import { getAuthUser } from "@/lib/auth";
import { openDaumPostcode } from "@/lib/daum-postcode";
import { isSundayIso } from "@/lib/date-format";
import {
  ORDER_ATTACHMENT_ACCEPT,
  orderAttachmentIcon,
  orderAttachmentKindOfFile,
  type OrderAttachmentKind,
} from "@/lib/order-attachment";
import {
  emptyLineShipInfo,
  encodeLineShipments,
  parseBranchStoreFromNotes,
  parseDeliveryRequestDateFromNotes,
  parseLineShipmentsFromNotes,
  parseOrderDateFromNotes,
  parseOrdererFromNotes,
  parseOrdererPhoneFromNotes,
  type LineShipInfo,
} from "@/lib/order-notes";

import {
  BRANCH_STORES,
  ProductAddDialog,
  type ProductDialogItem,
} from "../OrderListInput";
import {
  V2Dock,
  V2Header,
  dateLabel,
  formatWon,
  todayIso,
  type ApiMemberOrder,
} from "./order-v2-shared";

type ShipMethod = "delivery" | "pickup" | "parcel";
type BranchStoreId = (typeof BRANCH_STORES)[number]["id"];
type View = "form" | "ship" | "confirm" | "done";

/** 관리자 제품주문서와 같은 순서·이름: 직접수령 / 배달 / 택배 */
const SHIP_OPTIONS: Array<{ id: ShipMethod; label: string }> = [
  { id: "pickup", label: "직접수령" },
  { id: "delivery", label: "배달" },
  { id: "parcel", label: "택배" },
];

const DELIVERY_REQUESTS = [
  "문 앞에 놓아주세요",
  "도착 전에 전화 주세요",
  "직접 받을게요",
  "경비실에 맡겨주세요",
];

type ProductCategory = "일반품" | "선물세트";
const PRODUCT_CATEGORIES: ProductCategory[] = ["일반품", "선물세트"];

/** 시안 순서: 중부 · 서부 · 남부 */
const BRANCH_ORDER: BranchStoreId[] = ["jungbu", "seobu", "nambu"];

const QTY_ERROR = "수량은 1이상이어야 합니다.";
const BRANCH_ERROR = "작업매장(중부·서부·남부)을 선택해 주세요.";
const DELIVERY_ONLY_ERROR =
  "선물세트 박스 상품은 택배로 보낼 수 없어요. 배달 또는 직접수령을 선택해 주세요.";
/** 주문 정보 칸의 오류: 화면 맨 아래가 아니라 주문 정보 섹션 바로 아래에 보여준다 */
const ORDER_INFO_ERRORS = new Set([
  "날짜를 선택해 주세요.",
  "지난 날짜에는 주문할 수 없어요.",
  "일요일에는 주문할 수 없어요.",
  "주문자 성명을 입력해 주세요.",
  "대신 주문하는 분의 연락처를 입력해 주세요.",
  BRANCH_ERROR,
]);

const MAX_PHOTOS = 5;
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

type CartItem = ProductDialogItem;

type Profile = {
  name: string;
  phone: string;
  churchName: string;
  memberType: string;
};

/** 명단 첨부 파일 (사진·PDF·엑셀). url 은 미리보기·key 용 object URL */
type Photo = { file: File; url: string; kind: OrderAttachmentKind };

type DeliveryInfo = {
  address: string;
  addressDetail: string;
  /** 받는 분 연락처 (비우면 주문자 연락처) */
  phone: string;
  request: string;
  remark: string;
};

type ParcelInfo = {
  senderName: string;
  senderPhone: string;
  senderAddress: string;
  senderAddressDetail: string;
  receiverName: string;
  receiverPhone: string;
  receiverAddress: string;
  receiverAddressDetail: string;
  /** 이 줄(=이 주문)에만 올리는 명단 파일 */
  photos: Photo[];
};

/**
 * 상품 줄 = 배송 한 건 = 주문 한 건.
 * 관리자 제품주문서처럼 배송방식을 고른 뒤 수량을 줄이면 나머지가 반대 방식 줄로 나뉜다.
 * 같은 splitGroupId 줄들의 수량 합은 baseQty 로 고정된다.
 */
type OrderLine = CartItem & {
  lineId: string;
  splitGroupId: string;
  baseQty: number;
  ship: ShipMethod | "";
  /** 방식을 바꿨다 돌아와도 입력값이 남도록 배달·택배 정보를 따로 둔다 */
  delivery: DeliveryInfo | null;
  parcel: ParcelInfo | null;
  /** 직접수령·택배 메모 */
  memo: string;
  /** 수정 모드: 이 줄(=수정하는 주문)에 이미 붙은 첨부 수 */
  existingPhotoCount: number;
};

type UploadTarget = { orderId: number; photos: Photo[] };

let lineSeq = 0;
function nextLineId() {
  lineSeq += 1;
  return `line-${lineSeq}`;
}

function newLine(item: CartItem): OrderLine {
  const lineId = nextLineId();
  return {
    ...item,
    lineId,
    splitGroupId: lineId,
    baseQty: item.qty,
    ship: "",
    delivery: null,
    parcel: null,
    memo: "",
    existingPhotoCount: 0,
  };
}

function emptyDelivery(): DeliveryInfo {
  return {
    address: "",
    addressDetail: "",
    phone: "",
    request: DELIVERY_REQUESTS[0],
    remark: "",
  };
}

/** 배달 ↔ 택배. 직접수령은 반대 방식이 없다 */
function oppositeShip(ship: ShipMethod | ""): ShipMethod | "" {
  if (ship === "delivery") return "parcel";
  if (ship === "parcel") return "delivery";
  return "";
}

/** 나머지를 반대 방식으로 나눌 수 있는 줄 (선물세트 박스는 배달 전용이라 택배 줄을 만들 수 없다) */
function canSplitLine(line: OrderLine, isEdit: boolean) {
  return (
    !isEdit &&
    (line.ship === "delivery" || line.ship === "parcel") &&
    !line.deliveryOnly
  );
}

function siblingOf(lines: OrderLine[], line: OrderLine) {
  return lines.find(
    (row) => row.lineId !== line.lineId && row.splitGroupId === line.splitGroupId,
  );
}

function isParcelComplete(parcel: ParcelInfo | null, existingPhotoCount: number) {
  if (!parcel) return false;
  if (
    !parcel.senderName.trim() ||
    !parcel.senderPhone.trim() ||
    !parcel.senderAddress.trim()
  ) {
    return false;
  }
  return (
    parcel.photos.length + existingPhotoCount > 0 ||
    Boolean(
      parcel.receiverName.trim() &&
        parcel.receiverPhone.trim() &&
        parcel.receiverAddress.trim(),
    )
  );
}

/** 배송정보까지 다 넣은 줄인지 (직접수령은 메모만 있어 따로 넣을 정보가 없다) */
function isLineShipDone(line: OrderLine) {
  if (line.ship === "pickup") return true;
  if (line.ship === "delivery") return Boolean(line.delivery?.address.trim());
  if (line.ship === "parcel") {
    return !line.deliveryOnly && isParcelComplete(line.parcel, line.existingPhotoCount);
  }
  return false;
}

/**
 * 수량 변경 (관리자 updateProductQty 와 같은 규칙).
 * - 나뉜 줄: 합계 baseQty 고정, 형제 줄이 나머지 (각 줄 최소 1)
 * - 배송방식을 고른 줄을 줄이면 → 나머지가 반대 방식 줄로 바로 생긴다
 * - 그 밖(방식 전·직접수령·선물세트 박스·수정 모드): 수량만 바뀌고 baseQty 도 따라간다
 */
function changeLineQty(
  lines: OrderLine[],
  lineId: string,
  qty: number,
  isEdit: boolean,
): OrderLine[] {
  const target = lines.find((row) => row.lineId === lineId);
  if (!target) return lines;
  const sibling = siblingOf(lines, target);
  if (sibling) {
    const nextQty = Math.min(Math.max(1, qty), target.baseQty - 1);
    return lines.map((row) =>
      row.lineId === lineId
        ? { ...row, qty: nextQty }
        : row.lineId === sibling.lineId
          ? { ...row, qty: target.baseQty - nextQty }
          : row,
    );
  }
  const nextQty = Math.max(1, qty);
  if (nextQty < target.baseQty && canSplitLine(target, isEdit)) {
    const remainder: OrderLine = {
      ...target,
      lineId: nextLineId(),
      qty: target.baseQty - nextQty,
      ship: oppositeShip(target.ship),
      delivery: null,
      parcel: null,
      memo: "",
      existingPhotoCount: 0,
    };
    const next = lines.map((row) =>
      row.lineId === lineId ? { ...row, qty: nextQty } : row,
    );
    next.splice(next.findIndex((row) => row.lineId === lineId) + 1, 0, remainder);
    return next;
  }
  return lines.map((row) =>
    row.lineId === lineId ? { ...row, qty: nextQty, baseQty: nextQty } : row,
  );
}

/** 배송방식 변경. 나뉜 형제 줄이 아직 배송정보 전이면 반대 방식으로 맞춰 준다 (관리자와 같음) */
function changeLineShip(lines: OrderLine[], lineId: string, ship: ShipMethod) {
  const target = lines.find((row) => row.lineId === lineId);
  if (!target || target.ship === ship) return lines;
  const sibling = siblingOf(lines, target);
  const opposite = oppositeShip(ship);
  return lines.map((row) => {
    if (row.lineId === lineId) return { ...row, ship };
    if (sibling && row.lineId === sibling.lineId && opposite && !isLineShipDone(row)) {
      return { ...row, ship: opposite };
    }
    return row;
  });
}

/** notes 는 " / " 로 필드를 나누므로 입력값의 '/' 는 바꿔 둔다 */
function clean(value: string) {
  return value.replace(/\//g, "·").replace(/\s+/g, " ").trim();
}

function joinAddress(base: string, detail: string) {
  return [base.trim(), detail.trim()].filter(Boolean).join(" ");
}

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

function shipLabelOf(ship: ShipMethod | "") {
  return SHIP_OPTIONS.find((option) => option.id === ship)?.label ?? "-";
}

function AddressInput({
  id,
  label,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  const [searching, setSearching] = useState(false);
  const searchAddress = async () => {
    if (searching) return;
    setSearching(true);
    try {
      await openDaumPostcode((address) => onChange(address));
    } catch {
      window.alert("주소 검색을 불러오지 못했습니다. 잠시 후 다시 눌러 주세요.");
    } finally {
      setSearching(false);
    }
  };
  return (
    <div>
      <label className="jy-label" htmlFor={id}>
        {label}
      </label>
      <div style={{ display: "flex", gap: 8 }}>
        {/* 주소는 주소 검색으로만 넣는다. 칸을 눌러도 검색이 열린다 */}
        <input
          id={id}
          className="jy-input"
          value={value}
          readOnly
          onClick={() => void searchAddress()}
          placeholder={placeholder}
          style={{ cursor: "pointer" }}
        />
        <button
          type="button"
          className="jy-btn"
          style={{ height: 50, flex: "none" }}
          disabled={searching}
          onClick={() => void searchAddress()}
        >
          주소 검색
        </button>
      </div>
    </div>
  );
}

/** 한 줄의 배달 정보 입력 화면 */
function DeliveryInfoView({
  product,
  initial,
  onBack,
  onSave,
}: {
  product: string;
  initial: DeliveryInfo;
  onBack: () => void;
  onSave: (info: DeliveryInfo) => void;
}) {
  const [info, setInfo] = useState(initial);
  const [error, setError] = useState("");
  const update = (patch: Partial<DeliveryInfo>) =>
    setInfo((current) => ({ ...current, ...patch }));

  return (
    <div className="jy-wrap">
      <V2Header title="배달 주소" onBack={onBack} />
      <p className="jy-meta">{product}</p>
      <AddressInput
        id="jy-addr"
        label="도로명 · 지번 주소"
        value={info.address}
        onChange={(address) => update({ address })}
        placeholder="예: 김해시 장유로 123"
      />
      <div>
        <label className="jy-label" htmlFor="jy-addr2">
          상세 주소
        </label>
        <input
          id="jy-addr2"
          className="jy-input"
          value={info.addressDetail}
          onChange={(event) => update({ addressDetail: event.target.value })}
          placeholder="동, 호수, 층 등"
        />
      </div>
      <div>
        <label className="jy-label" htmlFor="jy-aphone">
          받는 분 연락처
        </label>
        <input
          id="jy-aphone"
          className="jy-input"
          type="tel"
          inputMode="tel"
          value={info.phone}
          onChange={(event) => update({ phone: formatPhone(event.target.value) })}
          placeholder="010-1234-5678"
        />
        <p className="jy-hint" style={{ marginTop: 4 }}>
          비워 두면 주문자 연락처로 접수돼요.
        </p>
      </div>
      <div>
        <label className="jy-label" htmlFor="jy-areq">
          배달 요청사항
        </label>
        <select
          id="jy-areq"
          className="jy-input"
          value={info.request}
          onChange={(event) => update({ request: event.target.value })}
        >
          {DELIVERY_REQUESTS.map((request) => (
            <option key={request}>{request}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="jy-label" htmlFor="jy-remark">
          비고
        </label>
        <input
          id="jy-remark"
          className="jy-input"
          value={info.remark}
          onChange={(event) => update({ remark: event.target.value })}
          placeholder="배송 관련 요청 사항"
        />
      </div>
      <div className="jy-info">
        <b>i</b>
        <span>배달 가능 지역과 배달 일정은 주문 확인 후 지점에서 따로 안내해요.</span>
      </div>
      {error ? <div className="jy-err">{error}</div> : null}
      <V2Dock>
        <button
          type="button"
          className="jy-btn jy-primary jy-big"
          onClick={() => {
            if (!info.address.trim()) {
              setError("주소를 입력해 주세요.");
              return;
            }
            onSave(info);
          }}
        >
          이 주소로 배달하기
        </button>
      </V2Dock>
    </div>
  );
}

/** 한 줄의 택배 정보 입력 화면 (보내는 사람 · 받는 사람 · 명단 파일 · 메모) */
function ParcelInfoView({
  product,
  initial,
  initialMemo,
  existingPhotoCount,
  onBack,
  onSave,
}: {
  product: string;
  initial: ParcelInfo;
  initialMemo: string;
  existingPhotoCount: number;
  onBack: () => void;
  onSave: (info: ParcelInfo, memo: string) => void;
}) {
  const [info, setInfo] = useState(initial);
  const [memo, setMemo] = useState(initialMemo);
  const [photoError, setPhotoError] = useState("");
  const [error, setError] = useState("");
  const photoInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const photoLimit = Math.max(0, MAX_PHOTOS - existingPhotoCount);
  const update = (patch: Partial<ParcelInfo>) =>
    setInfo((current) => ({ ...current, ...patch }));

  const addPhotos = (files: FileList | null) => {
    setPhotoError("");
    if (!files || files.length === 0) return;
    const accepted: Photo[] = [];
    for (const file of Array.from(files)) {
      const kind = orderAttachmentKindOfFile(file);
      if (!kind) {
        setPhotoError("사진·PDF·엑셀 파일만 첨부할 수 있어요.");
        continue;
      }
      if (file.size > MAX_PHOTO_BYTES) {
        setPhotoError("파일 하나는 10MB 이하만 첨부할 수 있어요.");
        continue;
      }
      accepted.push({ file, url: URL.createObjectURL(file), kind });
    }
    // 수정 모드는 이미 붙은 파일도 개수에 넣는다
    const room = photoLimit - info.photos.length;
    if (accepted.length > room) {
      setPhotoError(`파일은 최대 ${MAX_PHOTOS}개까지 첨부할 수 있어요.`);
      accepted.slice(room).forEach((photo) => URL.revokeObjectURL(photo.url));
    }
    update({ photos: [...info.photos, ...accepted.slice(0, Math.max(0, room))] });
  };

  const removePhoto = (photo: Photo) => {
    // 저장 전 화면이라, 처음부터 있던 파일은 저장할 때 정리한다 (뒤로가면 그대로 남는다)
    if (!initial.photos.includes(photo)) URL.revokeObjectURL(photo.url);
    update({ photos: info.photos.filter((row) => row !== photo) });
  };

  const goBack = () => {
    info.photos
      .filter((photo) => !initial.photos.includes(photo))
      .forEach((photo) => URL.revokeObjectURL(photo.url));
    onBack();
  };

  const save = () => {
    if (!info.senderName.trim() || !info.senderPhone.trim() || !info.senderAddress.trim()) {
      setError("보내는 사람의 이름·연락처·주소를 입력해 주세요.");
      return;
    }
    if (!isParcelComplete(info, existingPhotoCount)) {
      setError("받는 사람의 이름·연락처·주소를 입력하거나 대량 택배 명단 파일을 첨부해 주세요.");
      return;
    }
    initial.photos
      .filter((photo) => !info.photos.includes(photo))
      .forEach((photo) => URL.revokeObjectURL(photo.url));
    onSave(info, memo);
  };

  return (
    <div className="jy-wrap">
      <V2Header title="택배 정보" onBack={goBack} />
      <p className="jy-meta">{product}</p>
      <section className="jy-card">
        <h2 style={{ fontSize: 14 }}>보내는 사람</h2>
        <div className="jy-row">
          <input
            className="jy-input"
            aria-label="보내는 사람 이름"
            value={info.senderName}
            onChange={(event) => update({ senderName: event.target.value })}
            placeholder="이름"
          />
          <input
            className="jy-input"
            aria-label="보내는 사람 연락처"
            type="tel"
            inputMode="tel"
            value={info.senderPhone}
            onChange={(event) => update({ senderPhone: formatPhone(event.target.value) })}
            placeholder="연락처"
          />
        </div>
        <AddressInput
          id="jy-send-addr"
          label="보내는 사람 주소"
          value={info.senderAddress}
          onChange={(senderAddress) => update({ senderAddress })}
          placeholder="주소"
        />
        <input
          className="jy-input"
          aria-label="보내는 사람 상세 주소"
          value={info.senderAddressDetail}
          onChange={(event) => update({ senderAddressDetail: event.target.value })}
          placeholder="상세 주소"
        />

        <h2 style={{ fontSize: 14 }}>
          받는 사람{" "}
          {info.photos.length + existingPhotoCount ? (
            <span className="jy-meta">(명단 파일이 있으면 선택)</span>
          ) : null}
        </h2>
        <div className="jy-row">
          <input
            className="jy-input"
            aria-label="받는 사람 이름"
            value={info.receiverName}
            onChange={(event) => update({ receiverName: event.target.value })}
            placeholder="이름"
          />
          <input
            className="jy-input"
            aria-label="받는 사람 연락처"
            type="tel"
            inputMode="tel"
            value={info.receiverPhone}
            onChange={(event) => update({ receiverPhone: formatPhone(event.target.value) })}
            placeholder="연락처"
          />
        </div>
        <AddressInput
          id="jy-recv-addr"
          label="받는 사람 주소"
          value={info.receiverAddress}
          onChange={(receiverAddress) => update({ receiverAddress })}
          placeholder="주소"
        />
        <input
          className="jy-input"
          aria-label="받는 사람 상세 주소"
          value={info.receiverAddressDetail}
          onChange={(event) => update({ receiverAddressDetail: event.target.value })}
          placeholder="상세 주소"
        />

        <div>
          <span className="jy-label">
            택배관련 파일업로드(사진촬영 및 PDF,엑셀등 최대 {MAX_PHOTOS}개까지 업로드가능)
          </span>
          <div className="jy-photos">
            {info.photos.map((photo) => (
              <div key={photo.url} className="jy-photo">
                {photo.kind === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photo.url} alt="첨부한 명단 사진" />
                ) : (
                  <div className="jy-photo-file" title={photo.file.name}>
                    <span aria-hidden>{orderAttachmentIcon(photo.kind)}</span>
                    <span className="jy-photo-file-name">{photo.file.name}</span>
                  </div>
                )}
                <button
                  type="button"
                  aria-label={`${photo.file.name} 삭제`}
                  onClick={() => removePhoto(photo)}
                >
                  ×
                </button>
              </div>
            ))}
            {info.photos.length < photoLimit ? (
              <>
                <button
                  type="button"
                  className="jy-photo-add"
                  onClick={() => photoInputRef.current?.click()}
                >
                  <span style={{ fontSize: 22 }} aria-hidden>
                    📷
                  </span>
                  사진 촬영
                </button>
                <button
                  type="button"
                  className="jy-photo-add"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <span style={{ fontSize: 22 }} aria-hidden>
                    📁
                  </span>
                  파일 업로드
                </button>
              </>
            ) : null}
          </div>
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            hidden
            onChange={(event) => {
              addPhotos(event.target.files);
              event.target.value = "";
            }}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept={ORDER_ATTACHMENT_ACCEPT}
            multiple
            hidden
            onChange={(event) => {
              addPhotos(event.target.files);
              event.target.value = "";
            }}
          />
          {existingPhotoCount ? (
            <p className="jy-hint" style={{ marginTop: 6 }}>
              이미 첨부된 파일 {existingPhotoCount}개는 그대로 있어요. 새로 올린 파일만 추가돼요.
            </p>
          ) : null}
          {photoError ? <div className="jy-err">{photoError}</div> : null}
        </div>

        <div>
          <label className="jy-label" htmlFor="jy-memo">
            메모
          </label>
          <textarea
            id="jy-memo"
            className="jy-input"
            value={memo}
            onChange={(event) => setMemo(event.target.value)}
            placeholder="전달할 내용을 적어 주세요"
          />
        </div>
      </section>
      {error ? <div className="jy-err">{error}</div> : null}
      <V2Dock>
        <button type="button" className="jy-btn jy-primary jy-big" onClick={save}>
          이 정보로 택배 보내기
        </button>
      </V2Dock>
    </div>
  );
}

/** 줄 note 에서 "비고: …" / "메모: …" 뒤의 값을 꺼낸다 (값 안에 ", " 가 있어도 끝까지) */
function noteValueAfter(note: string, label: string) {
  const index = note.indexOf(`${label}: `);
  return index >= 0 ? note.slice(index + label.length + 2).trim() : "";
}

/**
 * 수정 모드: 이 화면이 접수한 notes · 배송상세로 입력값을 되살린다 (buildOrderBody 의 반대).
 * isV2EditableOrder 를 통과한 주문(상품 한 줄 + 배송상세 한 줄)만 들어온다.
 */
function restoreEditOrder(order: ApiMemberOrder) {
  const line = parseLineShipmentsFromNotes(order.notes)?.[0];
  const item = order.items?.[0];
  const shipInfo = line?.ship ?? emptyLineShipInfo("delivery");
  const ship: ShipMethod =
    shipInfo.kind === "parcel"
      ? "parcel"
      : shipInfo.companyName === "직접수령"
        ? "pickup"
        : "delivery";
  const note = line?.note ?? "";
  const ordererPhone = formatPhone(parseOrdererPhoneFromNotes(order.notes));
  const branchName = parseBranchStoreFromNotes(order.notes);
  const branch = BRANCH_STORES.find((store) => store.name === branchName)?.id ?? "";
  const delivery: DeliveryInfo | null =
    ship === "delivery"
      ? {
          address: shipInfo.recipientAddress,
          addressDetail: shipInfo.recipientAddressDetail,
          // 받는 분 연락처를 비워 접수했으면 주문자 연락처가 들어가 있다 → 다시 빈칸으로
          phone:
            formatPhone(shipInfo.recipientPhone) !== ordererPhone
              ? formatPhone(shipInfo.recipientPhone)
              : "",
          request:
            DELIVERY_REQUESTS.find((request) => note.startsWith(request)) ??
            DELIVERY_REQUESTS[0],
          remark: noteValueAfter(note, "비고"),
        }
      : null;
  const parcel: ParcelInfo | null =
    ship === "parcel"
      ? {
          senderName: shipInfo.senderName,
          senderPhone: shipInfo.senderPhone,
          senderAddress: shipInfo.senderAddress,
          senderAddressDetail: shipInfo.senderAddressDetail,
          receiverName: shipInfo.recipientName,
          receiverPhone: shipInfo.recipientPhone,
          receiverAddress: shipInfo.recipientAddress,
          receiverAddressDetail: shipInfo.recipientAddressDetail,
          photos: [],
        }
      : null;
  const lines: OrderLine[] = item
    ? [
        {
          product: item.productName,
          qty: item.quantity,
          note: "",
          unitPrice: line?.unitPrice ?? item.price ?? 0,
          // notes 에는 소매가가 없어 화면을 열 때 상품 목록에서 채운다
          retailPrice: null,
          deliveryOnly: line?.deliveryOnly ?? false,
          lineSection: line?.lineSection ?? "box",
          lineId: "edit-1",
          splitGroupId: "edit-1",
          baseQty: item.quantity,
          ship,
          delivery,
          parcel,
          memo: ship === "delivery" ? "" : noteValueAfter(note, "메모"),
          existingPhotoCount: order.attachments?.length ?? 0,
        },
      ]
    : [];
  return {
    date:
      (ship === "parcel" ? shipInfo.parcelShipDate : shipInfo.deliveryDate) ||
      parseDeliveryRequestDateFromNotes(order.notes),
    orderDate: parseOrderDateFromNotes(order.notes),
    ordererName: parseOrdererFromNotes(order.notes),
    ordererPhone,
    branch: branch as BranchStoreId | "",
    lines,
  };
}

export function NewOrderV2({
  initialDate,
  editOrder,
  editNextSplitIndex,
  onBackToList,
  onSubmitted,
}: {
  initialDate: string;
  /** 있으면 수정 모드: 이 주문 내용을 채워 열고, 저장하면 이 주문을 고친다 */
  editOrder?: ApiMemberOrder | null;
  /** 수정 모드에서 상품을 더 담았을 때 새 형제 주문이 쓸 첫 순번 */
  editNextSplitIndex?: number;
  onBackToList: () => void;
  /** 주문이 하나라도 접수되면 목록을 다시 불러오도록 알린다 */
  onSubmitted: (date: string) => void;
}) {
  const [restored] = useState(() =>
    editOrder ? restoreEditOrder(editOrder) : null,
  );
  const isEdit = Boolean(editOrder && restored);

  const [view, setView] = useState<View>("form");
  /** 배송정보 입력 화면에서 고치는 줄 */
  const [shipLineId, setShipLineId] = useState("");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileError, setProfileError] = useState("");

  const [date, setDate] = useState(restored?.date || initialDate);
  const [name, setName] = useState(restored?.ordererName ?? "");
  const [proxyPhone, setProxyPhone] = useState(restored?.ordererPhone ?? "");
  const [branch, setBranch] = useState<BranchStoreId | "">(restored?.branch ?? "");
  const [lines, setLines] = useState<OrderLine[]>(restored?.lines ?? []);
  /** 수량칸을 고치는 동안의 글자 (줄 → 입력값). 칸을 벗어날 때 수량에 넣는다 */
  const [qtyDrafts, setQtyDrafts] = useState<Record<string, string>>({});
  const [productDialogOpen, setProductDialogOpen] = useState(false);
  /** 상품 담기 창에 보일 구분 */
  const [productCategory, setProductCategory] =
    useState<ProductCategory>("일반품");
  /** 다른 줄의 배송정보 화면을 열 때 미리 채워 줄 마지막 입력값 */
  const [lastDelivery, setLastDelivery] = useState<DeliveryInfo | null>(
    restored?.lines[0]?.delivery ?? null,
  );
  const [lastParcel, setLastParcel] = useState<ParcelInfo | null>(
    restored?.lines[0]?.parcel ?? null,
  );
  const linesRef = useRef<OrderLine[]>([]);

  const [formError, setFormError] = useState("");
  /** 오류가 특정 줄 것이면 그 줄 아래에 보여준다 */
  const [errorLineId, setErrorLineId] = useState("");
  const infoErrorRef = useRef<HTMLDivElement>(null);
  const bottomErrorRef = useRef<HTMLDivElement>(null);
  const isInfoError = !errorLineId && ORDER_INFO_ERRORS.has(formError);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<{
    orderNumbers: string[];
    failedUploads: UploadTarget[];
  } | null>(null);
  const [isRetryingUpload, setIsRetryingUpload] = useState(false);

  useEffect(() => {
    linesRef.current = lines;
  }, [lines]);

  // 화면을 떠날 때 미리보기 URL 정리
  useEffect(
    () => () =>
      linesRef.current.forEach((line) =>
        line.parcel?.photos.forEach((photo) => URL.revokeObjectURL(photo.url)),
      ),
    [],
  );

  useEffect(() => {
    let cancelled = false;
    const auth = getAuthUser();
    const load = async () => {
      try {
        const response = await apiFetch("/api/auth/me");
        const data = (await response.json()) as {
          user?: {
            name?: string;
            phone?: string;
            memberType?: string | null;
            church?: { name?: string | null } | null;
          };
        };
        if (cancelled) return;
        if (!response.ok || !data.user) {
          throw new Error();
        }
        const next: Profile = {
          name: data.user.name?.trim() || auth?.name || "",
          phone: formatPhone(data.user.phone ?? auth?.phone ?? ""),
          churchName: data.user.church?.name?.trim() || "",
          memberType: data.user.memberType ?? "",
        };
        setProfile(next);
        // 수정 모드: 본인 관장 주문은 "홍길동관" 으로 저장돼 있으니 이름만 되돌린다
        setName((current) =>
          current && current === `${next.name}관` ? next.name : current || next.name,
        );
        // 수정 모드에서 본인 주문이면 대신 주문 연락처 칸은 비워 둔다
        if (
          restored &&
          (restored.ordererName === next.name ||
            restored.ordererName === `${next.name}관`)
        ) {
          setProxyPhone("");
        }
      } catch {
        if (!cancelled) {
          setProfileError("회원 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
    // restored 는 처음 한 번 정해지고 바뀌지 않는다
  }, [restored]);

  // 수정 모드: 저장된 단가는 도매가라, 표시할 소매가를 공개 상품 목록에서 찾아 채운다
  useEffect(() => {
    if (!restored) return;
    let cancelled = false;
    const loadRetail = async () => {
      try {
        const response = await apiFetch("/api/stock-inventory?openOnly=true");
        const data = (await response.json()) as
          | Array<{ productName: string; retailPrice?: number | null }>
          | { message?: string };
        if (cancelled || !response.ok || !Array.isArray(data)) return;
        const retailByName = new Map(
          data.map((row) => [row.productName, row.retailPrice ?? null]),
        );
        setLines((current) =>
          current.map((row) =>
            row.retailPrice == null && retailByName.get(row.product) != null
              ? { ...row, retailPrice: retailByName.get(row.product) }
              : row,
          ),
        );
      } catch {
        // 못 불러오면 저장된 단가로 보여준다
      }
    };
    void loadRetail();
    return () => {
      cancelled = true;
    };
  }, [restored]);

  const isProxy = Boolean(profile) && name.trim() !== profile?.name;
  const ordererPhone = isProxy ? proxyPhone.trim() : (profile?.phone ?? "");
  /** 본인 주문이면 관장 직분은 이름 뒤에 '관'을 붙인다 (기존 주문서와 동일) */
  const ordererDisplay =
    !isProxy &&
    (profile?.memberType === "GWANJANG" || profile?.memberType === "관장") &&
    !name.trim().endsWith("관")
      ? `${name.trim()}관`
      : name.trim();
  const branchInfo = BRANCH_STORES.find((store) => store.id === branch);
  const totalQty = lines.reduce((sum, line) => sum + line.qty, 0);
  /** 화면에는 소매가(없으면 도매가)로 보여준다. 주문 금액은 도매가(unitPrice)로 저장한다 */
  const displayUnitPrice = (item: CartItem) => item.retailPrice ?? item.unitPrice ?? 0;
  const totalDisplayAmount = lines.reduce(
    (sum, line) => sum + displayUnitPrice(line) * line.qty,
    0,
  );
  const shipLine = lines.find((line) => line.lineId === shipLineId) ?? null;

  const clearError = () => {
    setFormError("");
    setErrorLineId("");
  };

  /**
   * 담기: 같은 상품이 아직 나뉘지 않은 줄로 있으면 수량을 더하고,
   * 이미 나뉜 상품이면 새 줄로 담는다.
   */
  const addItems = (added: ProductDialogItem[]) => {
    const next = [...lines];
    for (const item of added) {
      const existing = next.findIndex(
        (row) => row.product === item.product && !siblingOf(next, row),
      );
      if (existing >= 0) {
        clearQtyDraft(next[existing].lineId);
        next[existing] = {
          ...next[existing],
          qty: next[existing].qty + item.qty,
          baseQty: next[existing].baseQty + item.qty,
        };
      } else {
        next.push(newLine(item));
      }
    }
    setLines(next);
  };

  const clearQtyDraft = (lineId: string) => {
    setQtyDrafts((current) => {
      if (!(lineId in current)) return current;
      const next = { ...current };
      delete next[lineId];
      return next;
    });
  };

  const setLineQty = (lineId: string, qty: number) => {
    clearQtyDraft(lineId);
    setLines(changeLineQty(lines, lineId, qty, isEdit));
  };

  /** 입력 중에는 글자만 둔다 (한 글자씩 칠 때마다 줄이 나뉘지 않게). 칸을 벗어날 때 수량에 넣는다 */
  const typeLineQty = (lineId: string, raw: string) => {
    setQtyDrafts((current) => ({ ...current, [lineId]: raw.replace(/\D/g, "") }));
  };

  const commitQtyDraft = (lineId: string) => {
    const draft = qtyDrafts[lineId];
    if (draft === undefined || !(Number(draft) >= 1)) return;
    setLineQty(lineId, Number(draft));
  };

  const isQtyInvalid = (lineId: string) => {
    const draft = qtyDrafts[lineId];
    return draft !== undefined && !(Number(draft) >= 1);
  };

  const removeLine = (lineId: string) => {
    const target = lines.find((line) => line.lineId === lineId);
    if (!target) return;
    clearQtyDraft(lineId);
    target.parcel?.photos.forEach((photo) => URL.revokeObjectURL(photo.url));
    if (errorLineId === lineId) clearError();
    // 나뉜 형제가 남으면 남은 줄 수량이 새 기준이 된다
    setLines(
      lines
        .filter((line) => line.lineId !== lineId)
        .map((line) =>
          line.splitGroupId === target.splitGroupId
            ? { ...line, baseQty: line.qty }
            : line,
        ),
    );
  };

  const updateLine = (lineId: string, patch: Partial<OrderLine>) => {
    setLines((current) =>
      current.map((line) => (line.lineId === lineId ? { ...line, ...patch } : line)),
    );
  };

  const openShipView = (lineId: string) => {
    setShipLineId(lineId);
    setView("ship");
    window.scrollTo(0, 0);
  };

  const chooseLineShip = (line: OrderLine, ship: ShipMethod) => {
    if (errorLineId === line.lineId) clearError();
    const next = changeLineShip(lines, line.lineId, ship);
    setLines(next);
    // 배달·택배는 정보가 없으면 바로 입력 화면을 연다
    const updated = next.find((row) => row.lineId === line.lineId);
    if (updated && ship !== "pickup" && !isLineShipDone(updated)) {
      openShipView(line.lineId);
    }
  };

  const backToForm = () => {
    setView("form");
    setShipLineId("");
  };

  const validate = (): { message: string; lineId?: string } => {
    if (!profile) return { message: profileError || "회원 정보를 불러오는 중이에요." };
    if (!profile.churchName) {
      return {
        message: "회원 정보에 중앙이 없어 주문할 수 없어요. 기본 버전 주문서를 이용해 주세요.",
      };
    }
    if (!date) return { message: "날짜를 선택해 주세요." };
    if (date < todayIso()) return { message: "지난 날짜에는 주문할 수 없어요." };
    if (isSundayIso(date)) return { message: "일요일에는 주문할 수 없어요." };
    if (!name.trim()) return { message: "주문자 성명을 입력해 주세요." };
    if (isProxy && proxyPhone.replace(/\D/g, "").length < 10) {
      return { message: "대신 주문하는 분의 연락처를 입력해 주세요." };
    }
    if (!branch) return { message: BRANCH_ERROR };
    if (lines.length === 0) return { message: "상품을 1개 이상 담아 주세요." };
    if (lines.some((line) => isQtyInvalid(line.lineId))) return { message: QTY_ERROR };
    for (const line of lines) {
      if (!line.ship) {
        return { message: `'${line.product}' 배송방식을 선택해 주세요.`, lineId: line.lineId };
      }
      if (line.ship === "parcel" && line.deliveryOnly) {
        return { message: DELIVERY_ONLY_ERROR, lineId: line.lineId };
      }
      if (!isLineShipDone(line)) {
        return { message: `'${line.product}' 배송정보를 입력해 주세요.`, lineId: line.lineId };
      }
    }
    return { message: "" };
  };

  /** 오류 문구가 보이도록 그 자리로 스크롤한다 (아래쪽에 있으면 안 보여서 버튼이 안 눌리는 것처럼 보인다) */
  const revealFormError = (message: string, lineId?: string) => {
    window.requestAnimationFrame(() => {
      const target = lineId
        ? document.getElementById(`jy-line-${lineId}`)
        : ORDER_INFO_ERRORS.has(message)
          ? infoErrorRef.current
          : bottomErrorRef.current;
      target?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  };

  const showValidation = () => {
    const { message, lineId } = validate();
    setFormError(message);
    setErrorLineId(lineId ?? "");
    if (message) revealFormError(message, lineId);
    return message;
  };

  const goConfirm = () => {
    if (showValidation()) return;
    setView("confirm");
    window.scrollTo(0, 0);
  };

  const buildLineShip = (line: OrderLine): LineShipInfo => {
    if (line.ship === "parcel") {
      const parcel = line.parcel;
      return {
        ...emptyLineShipInfo("parcel"),
        companyName: "-",
        parcelShipDate: date,
        senderName: parcel?.senderName.trim() ?? "",
        senderPhone: parcel?.senderPhone.trim() ?? "",
        senderAddress: parcel?.senderAddress.trim() ?? "",
        senderAddressDetail: parcel?.senderAddressDetail.trim() ?? "",
        recipientName: parcel?.receiverName.trim() ?? "",
        recipientPhone: parcel?.receiverPhone.trim() ?? "",
        recipientAddress: parcel?.receiverAddress.trim() ?? "",
        recipientAddressDetail: parcel?.receiverAddressDetail.trim() ?? "",
      };
    }
    if (line.ship === "pickup") {
      return {
        ...emptyLineShipInfo("delivery"),
        companyName: "직접수령",
        deliveryDate: date,
        recipientName: ordererDisplay,
        recipientPhone: ordererPhone,
        recipientAddress: branchInfo?.name ?? "",
      };
    }
    const delivery = line.delivery ?? emptyDelivery();
    return {
      ...emptyLineShipInfo("delivery"),
      companyName: "-",
      deliveryDate: date,
      recipientName: ordererDisplay,
      recipientPhone: delivery.phone.trim() || ordererPhone,
      recipientAddress: delivery.address.trim(),
      recipientAddressDetail: delivery.addressDetail.trim(),
    };
  };

  /** 기존 제품주문서와 같은 notes 형식으로 상품 줄 하나 = 주문 하나를 만든다 (줄마다 자기 배송방식) */
  const buildOrderBody = (line: OrderLine) => {
    const branchName = branchInfo?.name ?? "";
    const ship = line.ship;
    const lineShip = buildLineShip(line);
    const delivery = line.delivery ?? emptyDelivery();
    const parcel = line.parcel;
    const tag = ship === "parcel" ? "택배" : ship === "pickup" ? "직접수령" : "배달";
    // 메모는 줄 note 괄호 안에 들어가므로 괄호도 바꿔 둔다
    const memoNote = line.memo.trim()
      ? `메모: ${clean(line.memo.replace(/[()]/g, " "))}`
      : "";
    const lineNote = (
      ship === "delivery"
        ? [
            clean(delivery.request),
            delivery.remark.trim() ? `비고: ${clean(delivery.remark)}` : "",
          ]
        : [
            ship === "parcel" &&
            (parcel?.photos.length ?? 0) + line.existingPhotoCount > 0
              ? "대량 택배 명단 파일 첨부"
              : "",
            memoNote,
          ]
    )
      .filter(Boolean)
      .join(", ");

    const deliveryAddress = joinAddress(delivery.address, delivery.addressDetail);
    const senderFull = joinAddress(
      parcel?.senderAddress ?? "",
      parcel?.senderAddressDetail ?? "",
    );
    const receiverFull = joinAddress(
      parcel?.receiverAddress ?? "",
      parcel?.receiverAddressDetail ?? "",
    );

    const shipSegments =
      ship === "parcel"
        ? [
            `택배업체명:-`,
            `택배발송일:${date}`,
            `보내는사람:${clean(parcel?.senderName ?? "")} / ${clean(parcel?.senderPhone ?? "")} / ${clean(senderFull)}`,
            parcel?.senderAddressDetail.trim()
              ? `보내는분상세주소:${clean(parcel.senderAddressDetail)}`
              : null,
            `수취연락:주소`,
            receiverFull ? `받는분주소:${clean(receiverFull)}` : null,
            parcel?.receiverAddressDetail.trim()
              ? `받는분상세주소:${clean(parcel.receiverAddressDetail)}`
              : null,
          ]
        : ship === "pickup"
          ? [`배달업체명:직접수령`, `배달일:${date}`]
          : [
              `배달업체명:-`,
              `배달일:${date}`,
              `받는분:${clean(ordererDisplay)} / ${clean(lineShip.recipientPhone)} / ${clean(deliveryAddress)}`,
              `수취연락:주소`,
              `받는분주소:${clean(deliveryAddress)}`,
              delivery.addressDetail.trim()
                ? `받는분상세주소:${clean(delivery.addressDetail)}`
                : null,
            ];

    const notes = [
      `주문자:${clean(ordererDisplay)}`,
      `연락처:${clean(ordererPhone)}`,
      // 수정해도 처음 주문한 날짜는 그대로 둔다
      `주문일자:${restored?.orderDate || todayIso()}`,
      `중앙:${clean(profile?.churchName ?? "")}`,
      ...shipSegments,
      `주문작업지역:${branchName}`,
      `지부매장:${branchName}`,
      `인사장종류:없음`,
      `[${tag}] ${line.product} ${line.qty}개${lineNote ? `(${lineNote})` : ""}`,
      encodeLineShipments([
        {
          product: line.product,
          qty: line.qty,
          baseQty: line.qty,
          note: lineNote,
          unitPrice: line.unitPrice || 0,
          lineSection: line.lineSection,
          deliveryOnly: line.deliveryOnly,
          ship: lineShip,
        },
      ]),
    ]
      .filter(Boolean)
      .join(" / ");

    return {
      totalAmount: line.qty * (line.unitPrice || 0),
      notes,
      extraNote: "",
      items: [
        {
          productName: line.product,
          quantity: line.qty,
          price: line.unitPrice || 0,
        },
      ],
      shipment: {
        fulfillmentType: "PARCEL" as const,
        carrier: ship === "pickup" ? "직접수령" : "-",
        deliveryAddress:
          ship === "parcel"
            ? senderFull
            : ship === "pickup"
              ? branchName
              : deliveryAddress,
        estimatedWindow: `${date}T${ship === "parcel" ? "09" : "10"}:00:00.000Z`,
      },
    };
  };

  /** 줄 순서대로 만든 주문 id 에 그 줄의 명단 파일을 붙일 대상 */
  const uploadTargetsFor = (orderIds: number[]): UploadTarget[] =>
    lines
      .map((line, index) => ({
        orderId: orderIds[index],
        photos: line.ship === "parcel" ? (line.parcel?.photos ?? []) : [],
      }))
      .filter((target) => target.orderId && target.photos.length > 0);

  /** 줄마다 자기 주문에만 올린다. 실패한 대상만 돌려준다 */
  const uploadPhotos = async (targets: UploadTarget[]) => {
    const failed: UploadTarget[] = [];
    for (const target of targets) {
      const form = new FormData();
      form.append("orderIds", String(target.orderId));
      for (const photo of target.photos) {
        form.append("images", photo.file, photo.file.name);
      }
      const ok = await apiFetch("/api/orders/attachments", {
        method: "POST",
        body: form,
      })
        .then((response) => response.ok)
        .catch(() => false);
      if (!ok) failed.push(target);
    }
    return failed;
  };

  /**
   * 수정 모드 저장. 특이사항(extraNote)은 건드리지 않는다.
   * - 목록 첫 줄 → 이 주문(id)을 고친다 (상품을 바꿨으면 상품도 바뀐다, 번호 유지)
   * - 나머지 줄 → 같은 그룹에 새 형제 주문으로 만든다 (순번은 editNextSplitIndex 부터)
   */
  const saveEdit = async (order: ApiMemberOrder, first: OrderLine, extras: OrderLine[]) => {
    setIsSubmitting(true);
    clearError();
    const errorMessage = async (response: Response, fallback: string) => {
      const data = (await response.json().catch(() => null)) as {
        message?: string | string[];
      } | null;
      const raw = data?.message;
      return (Array.isArray(raw) ? raw[0] : raw) || fallback;
    };

    const { totalAmount, notes, items: orderItems, shipment } = buildOrderBody(first);
    try {
      const response = await apiFetch(`/api/orders/${order.id}`, {
        method: "PATCH",
        body: JSON.stringify({ totalAmount, notes, items: orderItems, shipment }),
      });
      if (!response.ok) {
        throw new Error(await errorMessage(response, "주문을 수정하지 못했습니다."));
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "주문을 수정하지 못했습니다.");
      setIsSubmitting(false);
      return;
    }

    const created: Array<{ id: number; orderNumber: string }> = [];
    if (extras.length) {
      try {
        let groupKey = order.orderGroupKey?.trim() ?? "";
        if (!groupKey) {
          // 구 번호 주문: 그룹키가 없으니 더한 상품은 새 그룹으로 묶는다
          const keyResponse = await apiFetch("/api/orders/new-group-key");
          const issued = (await keyResponse.json().catch(() => null)) as {
            orderGroupKey?: string;
          } | null;
          if (!keyResponse.ok || !issued?.orderGroupKey) {
            throw new Error("주문번호를 발급하지 못했습니다. 다시 시도해 주세요.");
          }
          groupKey = issued.orderGroupKey;
        }
        const startIndex = order.orderGroupKey ? (editNextSplitIndex ?? 2) : 1;
        const lastIndex = startIndex + extras.length - 1;
        for (const [offset, line] of extras.entries()) {
          const response = await apiFetch("/api/orders", {
            method: "POST",
            body: JSON.stringify({
              orderGroupKey: groupKey,
              splitIndex: startIndex + offset,
              // 2 이상이면 번호에 -순번 이 붙는다
              splitCount: Math.max(2, lastIndex),
              userId: getAuthUser()?.id,
              status: "PLACED",
              ...buildOrderBody(line),
            }),
          });
          const data = (await response.clone().json().catch(() => null)) as {
            id?: number;
            orderNumber?: string;
          } | null;
          if (!response.ok || !data?.id) {
            throw new Error(await errorMessage(response, "추가한 상품을 접수하지 못했습니다."));
          }
          created.push({ id: data.id, orderNumber: data.orderNumber ?? "" });
        }
      } catch (err) {
        await Promise.all(
          created.map((row) =>
            apiFetch(`/api/orders/${row.id}/delivery-action`, {
              method: "PATCH",
              body: JSON.stringify({ action: "CANCEL_ORDER" }),
            }).catch(() => null),
          ),
        );
        setFormError(
          `주문 ${order.orderNumber} 은 수정됐지만 ` +
            (err instanceof Error ? err.message : "추가한 상품을 접수하지 못했습니다.") +
            (created.length ? ` 먼저 접수된 ${created.length}건은 취소했습니다.` : ""),
        );
        setIsSubmitting(false);
        onSubmitted(date);
        return;
      }
    }

    const orderIds = [order.id, ...created.map((row) => row.id)];
    const failedUploads = await uploadPhotos(uploadTargetsFor(orderIds));
    setResult({
      orderNumbers: [order.orderNumber, ...created.map((row) => row.orderNumber)],
      failedUploads,
    });
    setIsSubmitting(false);
    onSubmitted(date);
    setView("done");
    window.scrollTo(0, 0);
  };

  const handleSubmit = async () => {
    if (isSubmitting) return;
    const { message, lineId } = validate();
    if (message) {
      setFormError(message);
      setErrorLineId(lineId ?? "");
      setView("form");
      revealFormError(message, lineId);
      return;
    }
    const auth = getAuthUser();
    if (!auth?.id) {
      setFormError("로그인이 필요합니다.");
      return;
    }

    if (editOrder && lines[0]) {
      await saveEdit(editOrder, lines[0], lines.slice(1));
      return;
    }

    setIsSubmitting(true);
    clearError();
    const created: Array<{ id: number; orderNumber: string }> = [];

    try {
      const keyResponse = await apiFetch("/api/orders/new-group-key");
      const issued = (await keyResponse.json().catch(() => null)) as {
        orderGroupKey?: string;
      } | null;
      if (!keyResponse.ok || !issued?.orderGroupKey) {
        throw new Error("주문번호를 발급하지 못했습니다. 다시 시도해 주세요.");
      }

      for (const [index, line] of lines.entries()) {
        const response = await apiFetch("/api/orders", {
          method: "POST",
          body: JSON.stringify({
            orderGroupKey: issued.orderGroupKey,
            splitIndex: index + 1,
            splitCount: lines.length,
            userId: auth.id,
            status: "PLACED",
            ...buildOrderBody(line),
          }),
        });
        const data = (await response.json().catch(() => null)) as {
          id?: number;
          orderNumber?: string;
          message?: string | string[];
        } | null;
        if (!response.ok || !data?.id) {
          const raw = data?.message;
          throw new Error(
            (Array.isArray(raw) ? raw[0] : raw) || "주문 접수에 실패했습니다.",
          );
        }
        created.push({ id: data.id, orderNumber: data.orderNumber ?? "" });
      }
    } catch (err) {
      // 일부만 접수됐으면 되돌린다 (기존 주문서와 동일)
      await Promise.all(
        created.map((order) =>
          apiFetch(`/api/orders/${order.id}/delivery-action`, {
            method: "PATCH",
            body: JSON.stringify({ action: "CANCEL_ORDER" }),
          }).catch(() => null),
        ),
      );
      setFormError(
        (err instanceof Error ? err.message : "주문 접수에 실패했습니다.") +
          (created.length ? ` 먼저 접수된 ${created.length}건은 취소했습니다.` : ""),
      );
      setIsSubmitting(false);
      return;
    }

    const failedUploads = await uploadPhotos(
      uploadTargetsFor(created.map((order) => order.id)),
    );
    setResult({
      orderNumbers: created.map((order) => order.orderNumber),
      failedUploads,
    });
    setIsSubmitting(false);
    onSubmitted(date);
    setView("done");
    window.scrollTo(0, 0);
  };

  const retryUpload = async () => {
    if (!result || isRetryingUpload) return;
    setIsRetryingUpload(true);
    const failedUploads = await uploadPhotos(result.failedUploads);
    setIsRetryingUpload(false);
    setResult({ ...result, failedUploads });
    if (failedUploads.length === 0) onSubmitted(date);
  };

  const resetForNewOrder = () => {
    lines.forEach((line) =>
      line.parcel?.photos.forEach((photo) => URL.revokeObjectURL(photo.url)),
    );
    setLines([]);
    setQtyDrafts({});
    setResult(null);
    clearError();
    setView("form");
    window.scrollTo(0, 0);
  };

  /** 줄 카드에 보여줄 배송정보 한 줄 요약 */
  const lineShipSummary = (line: OrderLine) => {
    if (line.ship === "pickup") {
      return branchInfo
        ? `${branchInfo.name} 매장에서 ${dateLabel(date)}에 직접 수령해요.`
        : "작업매장을 선택하면 그 매장에서 직접 수령해요.";
    }
    if (!isLineShipDone(line)) return "";
    if (line.ship === "delivery" && line.delivery) {
      return `${joinAddress(line.delivery.address, line.delivery.addressDetail)} · ${line.delivery.request}`;
    }
    if (line.ship === "parcel" && line.parcel) {
      const parcel = line.parcel;
      return parcel.receiverName.trim()
        ? `받는 분 ${parcel.receiverName.trim()} · ${joinAddress(parcel.receiverAddress, parcel.receiverAddressDetail)}`
        : `명단 파일 ${parcel.photos.length + line.existingPhotoCount}개`;
    }
    return "";
  };

  if (view === "ship" && shipLine?.ship === "delivery") {
    return (
      <DeliveryInfoView
        key={shipLine.lineId}
        product={`${shipLine.product} · ${shipLine.qty}개`}
        initial={shipLine.delivery ?? (lastDelivery ? { ...lastDelivery } : emptyDelivery())}
        onBack={backToForm}
        onSave={(info) => {
          updateLine(shipLine.lineId, { delivery: info });
          setLastDelivery(info);
          if (errorLineId === shipLine.lineId) clearError();
          backToForm();
        }}
      />
    );
  }

  if (view === "ship" && shipLine?.ship === "parcel") {
    return (
      <ParcelInfoView
        key={shipLine.lineId}
        product={`${shipLine.product} · ${shipLine.qty}개`}
        initial={
          shipLine.parcel ?? {
            senderName: lastParcel?.senderName ?? profile?.name ?? "",
            senderPhone: lastParcel?.senderPhone ?? profile?.phone ?? "",
            senderAddress: lastParcel?.senderAddress ?? "",
            senderAddressDetail: lastParcel?.senderAddressDetail ?? "",
            receiverName: lastParcel?.receiverName ?? "",
            receiverPhone: lastParcel?.receiverPhone ?? "",
            receiverAddress: lastParcel?.receiverAddress ?? "",
            receiverAddressDetail: lastParcel?.receiverAddressDetail ?? "",
            // 명단 파일은 줄(주문)마다 따로 올린다
            photos: [],
          }
        }
        initialMemo={shipLine.memo}
        existingPhotoCount={shipLine.existingPhotoCount}
        onBack={backToForm}
        onSave={(info, memo) => {
          updateLine(shipLine.lineId, { parcel: info, memo });
          setLastParcel(info);
          if (errorLineId === shipLine.lineId) clearError();
          backToForm();
        }}
      />
    );
  }

  if (view === "confirm") {
    return (
      <div className="jy-wrap">
        <V2Header title="주문 확인" onBack={() => setView("form")} />
        <section className="jy-card">
          <h2>{isEdit ? "아래 내용으로 수정할까요?" : "아래 내용으로 주문할까요?"}</h2>
          <dl className="jy-dl">
            <dt>날짜</dt>
            <dd>{dateLabel(date)}</dd>
            <dt>작업매장</dt>
            <dd>{branchInfo?.name ?? "-"}</dd>
            <dt>주문자</dt>
            <dd>
              {ordererDisplay}
              {isProxy ? ` (대신 주문 · ${ordererPhone})` : ""}
            </dd>
          </dl>
        </section>
        <section className="jy-card">
          <h2>주문 상품</h2>
          {lines.map((line) => {
            const delivery = line.delivery;
            const parcel = line.parcel;
            return (
              <div key={line.lineId} className="jy-confirm-line">
                <div className="jy-confirm-line-head">
                  <strong>{line.product}</strong>
                  <span className="jy-num">
                    {line.qty}개 · {formatWon(displayUnitPrice(line) * line.qty)}
                  </span>
                </div>
                <dl className="jy-dl">
                  <dt>배송방법</dt>
                  <dd>{shipLabelOf(line.ship)}</dd>
                  {line.ship === "delivery" && delivery ? (
                    <>
                      <dt>배달 주소</dt>
                      <dd>{joinAddress(delivery.address, delivery.addressDetail)}</dd>
                      <dt>연락처</dt>
                      <dd>{delivery.phone || ordererPhone || "-"}</dd>
                      <dt>요청사항</dt>
                      <dd>{delivery.request}</dd>
                      {delivery.remark.trim() ? (
                        <>
                          <dt>비고</dt>
                          <dd>{delivery.remark.trim()}</dd>
                        </>
                      ) : null}
                    </>
                  ) : null}
                  {line.ship === "pickup" ? (
                    <>
                      <dt>수령 매장</dt>
                      <dd>{branchInfo?.name ?? "-"}</dd>
                    </>
                  ) : null}
                  {line.ship === "parcel" && parcel ? (
                    <>
                      <dt>보내는 사람</dt>
                      <dd>
                        {parcel.senderName} / {parcel.senderPhone} /{" "}
                        {joinAddress(parcel.senderAddress, parcel.senderAddressDetail)}
                      </dd>
                      <dt>받는 사람</dt>
                      <dd>
                        {parcel.receiverName.trim() || parcel.receiverAddress.trim()
                          ? `${parcel.receiverName} / ${parcel.receiverPhone} / ${joinAddress(parcel.receiverAddress, parcel.receiverAddressDetail)}`
                          : "명단 파일 참고"}
                      </dd>
                      {parcel.photos.length + line.existingPhotoCount ? (
                        <>
                          <dt>명단 파일</dt>
                          <dd>{parcel.photos.length + line.existingPhotoCount}개</dd>
                        </>
                      ) : null}
                    </>
                  ) : null}
                  {line.ship !== "delivery" && line.memo.trim() ? (
                    <>
                      <dt>메모</dt>
                      <dd>{line.memo.trim()}</dd>
                    </>
                  ) : null}
                </dl>
              </div>
            );
          })}
          <div className="jy-total">
            <span>총금액</span>
            <strong className="jy-num">{formatWon(totalDisplayAmount)}</strong>
          </div>
          {isEdit && lines.length > 1 ? (
            <p className="jy-hint">
              첫 상품은 이 주문({editOrder?.orderNumber})에 저장되고, 더한 상품{" "}
              {lines.length - 1}건은 새 주문번호로 접수돼요.
            </p>
          ) : null}
          {isEdit ? null : (
            <p className="jy-hint">
              상품 줄마다 주문서가 따로 만들어져요 (총 {lines.length}건).
            </p>
          )}
        </section>
        {formError ? <div className="jy-err">{formError}</div> : null}
        <V2Dock>
          <div className="jy-two">
            <button
              type="button"
              className="jy-btn jy-big"
              style={{ flex: "0 0 34%" }}
              disabled={isSubmitting}
              onClick={() => setView("form")}
            >
              수정하기
            </button>
            <button
              type="button"
              className="jy-btn jy-primary jy-big"
              disabled={isSubmitting}
              aria-busy={isSubmitting}
              onClick={() => void handleSubmit()}
            >
              {isEdit
                ? isSubmitting
                  ? "저장 중…"
                  : "수정 완료"
                : isSubmitting
                  ? "접수 중…"
                  : "주문 완료"}
            </button>
          </div>
        </V2Dock>
      </div>
    );
  }

  if (view === "done" && result) {
    return (
      <div className="jy-wrap">
        <div className="jy-logo">✓</div>
        <p className="jy-title-c">{isEdit ? "주문이 수정됐어요" : "주문이 접수됐어요"}</p>
        <p className="jy-sub">
          주문번호 {result.orderNumbers.filter(Boolean).join(", ") || "-"}
        </p>
        {result.failedUploads.length ? (
          <div className="jy-info">
            <b>!</b>
            <span>
              주문은 {isEdit ? "수정됐" : "접수됐"}지만 명단 파일을 올리지 못했어요.{" "}
              <button
                type="button"
                className="jy-btn"
                style={{ height: 34, marginTop: 6 }}
                disabled={isRetryingUpload}
                onClick={() => void retryUpload()}
              >
                {isRetryingUpload ? "올리는 중…" : "파일 다시 올리기"}
              </button>
            </span>
          </div>
        ) : null}
        <div className="jy-stack">
          <button type="button" className="jy-btn jy-primary jy-big" onClick={onBackToList}>
            주문 달력 보기
          </button>
          {isEdit ? null : (
            <button type="button" className="jy-btn jy-big" onClick={resetForNewOrder}>
              새 주문 등록
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="jy-wrap">
      <V2Header title={isEdit ? "주문 수정" : "새 주문"} onBack={onBackToList} />

      {profileError ? <div className="jy-err">{profileError}</div> : null}

      <section className="jy-card">
        <h2>주문 정보</h2>
        <div className="jy-row">
          <div>
            <label className="jy-label" htmlFor="jy-date">
              날짜
            </label>
            <input
              id="jy-date"
              type="date"
              className="jy-input"
              min={todayIso()}
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </div>
          <div>
            <label className="jy-label" htmlFor="jy-name">
              주문자 성명
            </label>
            <input
              id="jy-name"
              className="jy-input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="홍길동"
            />
          </div>
        </div>
        {isProxy ? (
          <div>
            <label className="jy-label" htmlFor="jy-proxy-phone">
              주문자 연락처
            </label>
            <input
              id="jy-proxy-phone"
              className="jy-input"
              type="tel"
              inputMode="tel"
              value={proxyPhone}
              onChange={(event) => setProxyPhone(formatPhone(event.target.value))}
              placeholder="010-0000-0000"
            />
            <p className="jy-hint" style={{ marginTop: 4 }}>
              본인 이름이 아니면 대신 주문으로 접수돼요.
            </p>
          </div>
        ) : null}
        <div>
          <span className="jy-label">작업매장</span>
          <div className="jy-chips">
            {BRANCH_ORDER.map((id) => BRANCH_STORES.find((store) => store.id === id)!).map((store) => (
              <button
                key={store.id}
                type="button"
                className="jy-btn jy-chip"
                aria-pressed={store.id === branch}
                onClick={() => {
                  setBranch(store.id);
                  if (formError === BRANCH_ERROR) clearError();
                }}
              >
                {store.name.slice(0, 2)}
              </button>
            ))}
          </div>
        </div>
        {isInfoError ? (
          <div ref={infoErrorRef} className="jy-err" role="alert">
            {formError}
          </div>
        ) : null}
      </section>

      <section className="jy-card">
        <h2>{isEdit ? "주문 상품" : "상품 등록"}</h2>
        {/* 수정 모드: 첫 줄은 이 주문, 더 담은 상품은 같은 그룹의 새 주문이 된다 */}
        {isEdit ? (
          <button
            type="button"
            className="jy-btn jy-dark"
            style={{ height: 50 }}
            onClick={() => setProductDialogOpen(true)}
          >
            상품 변경 및 추가
          </button>
        ) : (
          <>
            <div>
              <span className="jy-label">구분</span>
              <div className="jy-chips jy-half">
                {PRODUCT_CATEGORIES.map((category) => (
                  <button
                    key={category}
                    type="button"
                    className="jy-btn jy-chip"
                    aria-pressed={category === productCategory}
                    onClick={() => setProductCategory(category)}
                  >
                    {category}
                  </button>
                ))}
              </div>
            </div>
            <button
              type="button"
              className="jy-btn jy-dark"
              style={{ height: 50 }}
              onClick={() => setProductDialogOpen(true)}
            >
              + 상품 담기
            </button>
          </>
        )}
        {lines.length ? (
          lines.map((line, index) => {
            const qtyInvalid = isQtyInvalid(line.lineId);
            const qtyErrorId = `jy-qty-err-${index}`;
            const sibling = siblingOf(lines, line);
            const shipDone = isLineShipDone(line);
            const summary = lineShipSummary(line);
            return (
              <div key={line.lineId} id={`jy-line-${line.lineId}`} className="jy-line">
                <div className="jy-item-line">
                  <div className="jy-item-name">
                    <span>{line.product}</span>
                    {qtyInvalid ? (
                      <div id={qtyErrorId} className="jy-err" role="alert">
                        {QTY_ERROR}
                      </div>
                    ) : (
                      <div className="jy-meta jy-num">
                        {formatWon(displayUnitPrice(line))} × {line.qty} ={" "}
                        {formatWon(displayUnitPrice(line) * line.qty)}
                      </div>
                    )}
                    {sibling ? (
                      <div className="jy-meta">총 {line.baseQty}개를 나눠 보내요</div>
                    ) : null}
                  </div>
                  <span className="jy-qty">
                    <button
                      type="button"
                      className="jy-btn"
                      aria-label={`${line.product} 수량 줄이기`}
                      disabled={line.qty <= 1}
                      onClick={() => setLineQty(line.lineId, line.qty - 1)}
                    >
                      −
                    </button>
                    <input
                      type="number"
                      min={1}
                      inputMode="numeric"
                      aria-label={`${line.product} 수량`}
                      value={qtyDrafts[line.lineId] ?? String(line.qty)}
                      aria-invalid={qtyInvalid || undefined}
                      aria-describedby={qtyInvalid ? qtyErrorId : undefined}
                      onChange={(event) => typeLineQty(line.lineId, event.target.value)}
                      // 빈칸·0 이면 에러와 함께 그대로 두고, 올바른 값이면 수량에 넣는다
                      onBlur={() => commitQtyDraft(line.lineId)}
                    />
                    <button
                      type="button"
                      className="jy-btn"
                      aria-label={`${line.product} 수량 늘리기`}
                      // 나뉜 줄은 합계가 고정이라 형제 줄을 1개는 남긴다
                      disabled={Boolean(sibling) && line.qty >= line.baseQty - 1}
                      onClick={() => setLineQty(line.lineId, line.qty + 1)}
                    >
                      +
                    </button>
                    {/* 수정 모드는 상품이 0개가 되지 않게 2줄 이상일 때만 */}
                    {isEdit && lines.length < 2 ? null : (
                      <button
                        type="button"
                        className="jy-btn jy-link"
                        onClick={() => removeLine(line.lineId)}
                      >
                        삭제
                      </button>
                    )}
                  </span>
                </div>

                <div className="jy-line-ship">
                  <div className="jy-chips">
                    {SHIP_OPTIONS.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        className="jy-btn jy-chip"
                        aria-pressed={option.id === line.ship}
                        aria-label={`${line.product} ${option.label}`}
                        disabled={option.id === "parcel" && line.deliveryOnly}
                        onClick={() => chooseLineShip(line, option.id)}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                  {line.ship === "delivery" || line.ship === "parcel" ? (
                    <button
                      type="button"
                      className={`jy-btn jy-mini${shipDone ? " jy-ok" : ""}`}
                      onClick={() => openShipView(line.lineId)}
                    >
                      {shipDone ? "배송정보 수정" : "배송정보 입력"}
                    </button>
                  ) : null}
                </div>
                {line.deliveryOnly ? (
                  <div className="jy-meta">선물세트 박스는 택배로 보낼 수 없어요.</div>
                ) : null}
                {summary ? <div className="jy-meta">{summary}</div> : null}
                {line.ship === "pickup" ? (
                  <input
                    className="jy-input"
                    aria-label={`${line.product} 메모`}
                    value={line.memo}
                    onChange={(event) => updateLine(line.lineId, { memo: event.target.value })}
                    placeholder="메모 (선택)"
                  />
                ) : null}
                {errorLineId === line.lineId && formError ? (
                  <div className="jy-err" role="alert">
                    {formError}
                  </div>
                ) : null}
              </div>
            );
          })
        ) : (
          <div className="jy-hint">
            구분을 고르고 상품 담기를 누른 뒤 수량을 넣어 주세요. 일반품과 선물세트를
            함께 담을 수 있어요.
          </div>
        )}
        {lines.length ? (
          <>
            {isEdit ? null : (
              <p className="jy-hint">
                상품마다 배송방식을 고르세요. 배달·택배를 고른 뒤 수량을 줄이면 나머지는
                반대 방식으로 나눠져요.
              </p>
            )}
            <div className="jy-total">
              <span>총금액</span>
              <strong className="jy-num">{formatWon(totalDisplayAmount)}</strong>
            </div>
          </>
        ) : null}
      </section>

      {/* 주문 정보 칸·상품 줄의 오류는 그 자리에 보인다 */}
      {formError && !isInfoError && !errorLineId ? (
        <div ref={bottomErrorRef} className="jy-err" role="alert">
          {formError}
        </div>
      ) : null}

      <V2Dock>
        <div className="jy-cartbar">
          <div>
            <div className="jy-meta">담은 상품 {lines.length}개</div>
            <div className="jy-t jy-num">총 {totalQty}개</div>
          </div>
          <button type="button" className="jy-btn jy-primary" onClick={goConfirm}>
            주문 내역 확인
          </button>
        </div>
      </V2Dock>

      <ProductAddDialog
        open={productDialogOpen}
        onClose={() => setProductDialogOpen(false)}
        onAddItems={(added) => addItems(added)}
        defaultOrderKind="delivery"
        showOrderKind={false}
        openStockOnly
        presentation="sheet"
        unifiedCatalog
        fixedCategory={isEdit ? undefined : productCategory}
      />
    </div>
  );
}
