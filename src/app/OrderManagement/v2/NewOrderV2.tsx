"use client";

import { useEffect, useRef, useState } from "react";

import { apiFetch } from "@/lib/api";
import { getAuthUser } from "@/lib/auth";
import { openDaumPostcode } from "@/lib/daum-postcode";
import { isSundayIso } from "@/lib/date-format";
import {
  emptyLineShipInfo,
  encodeLineShipments,
  type LineShipInfo,
} from "@/lib/order-notes";

import {
  BRANCH_STORES,
  ProductAddDialog,
  type ProductDialogItem,
} from "../OrderListInput";
import { V2Dock, V2Header, dateLabel, todayIso } from "./order-v2-shared";

type ShipMethod = "delivery" | "pickup" | "parcel";
type BranchStoreId = (typeof BRANCH_STORES)[number]["id"];
type View = "form" | "delivery" | "confirm" | "done";

const SHIP_OPTIONS: Array<{ id: ShipMethod; label: string }> = [
  { id: "delivery", label: "배달" },
  { id: "pickup", label: "직접수령" },
  { id: "parcel", label: "개별택배" },
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

const MAX_PHOTOS = 5;
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

type CartItem = ProductDialogItem;

type Profile = {
  name: string;
  phone: string;
  churchName: string;
  memberType: string;
};

type Photo = { file: File; url: string };

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
  return (
    <div>
      <label className="jy-label" htmlFor={id}>
        {label}
      </label>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          id={id}
          className="jy-input"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          autoComplete="street-address"
        />
        <button
          type="button"
          className="jy-btn"
          style={{ height: 50, flex: "none" }}
          disabled={searching}
          onClick={async () => {
            setSearching(true);
            try {
              await openDaumPostcode((address) => onChange(address));
            } catch {
              window.alert("주소 검색을 불러오지 못했습니다. 직접 입력해 주세요.");
            } finally {
              setSearching(false);
            }
          }}
        >
          주소 검색
        </button>
      </div>
    </div>
  );
}

export function NewOrderV2({
  initialDate,
  onBackToList,
  onSubmitted,
}: {
  initialDate: string;
  onBackToList: () => void;
  /** 주문이 하나라도 접수되면 목록을 다시 불러오도록 알린다 */
  onSubmitted: (date: string) => void;
}) {
  const [view, setView] = useState<View>("form");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileError, setProfileError] = useState("");

  const [date, setDate] = useState(initialDate);
  const [name, setName] = useState("");
  const [proxyPhone, setProxyPhone] = useState("");
  const [branch, setBranch] = useState<BranchStoreId | "">("");
  const [items, setItems] = useState<CartItem[]>([]);
  const [productDialogOpen, setProductDialogOpen] = useState(false);
  /** 상품 담기 창에 보일 구분 */
  const [productCategory, setProductCategory] =
    useState<ProductCategory>("일반품");
  const [ship, setShip] = useState<ShipMethod | "">("");

  // 배달
  const [address, setAddress] = useState("");
  const [addressDetail, setAddressDetail] = useState("");
  const [deliveryPhone, setDeliveryPhone] = useState("");
  const [deliveryRequest, setDeliveryRequest] = useState(DELIVERY_REQUESTS[0]);
  const [remark, setRemark] = useState("");
  /** 직접수령·개별택배 메모 (배달은 주소 화면의 비고를 쓴다) */
  const [memo, setMemo] = useState("");
  const [addressSaved, setAddressSaved] = useState(false);
  const [addressError, setAddressError] = useState("");

  // 개별택배
  const [senderName, setSenderName] = useState("");
  const [senderPhone, setSenderPhone] = useState("");
  const [senderAddress, setSenderAddress] = useState("");
  const [senderAddressDetail, setSenderAddressDetail] = useState("");
  const [receiverName, setReceiverName] = useState("");
  const [receiverPhone, setReceiverPhone] = useState("");
  const [receiverAddress, setReceiverAddress] = useState("");
  const [receiverAddressDetail, setReceiverAddressDetail] = useState("");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [photoError, setPhotoError] = useState("");
  const photoInputRef = useRef<HTMLInputElement>(null);
  const photosRef = useRef<Photo[]>([]);

  const [formError, setFormError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<{
    orderNumbers: string[];
    orderIds: number[];
    uploadFailed: boolean;
  } | null>(null);
  const [isRetryingUpload, setIsRetryingUpload] = useState(false);

  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);

  // 화면을 떠날 때 미리보기 URL 정리
  useEffect(
    () => () => photosRef.current.forEach((photo) => URL.revokeObjectURL(photo.url)),
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
        setName((current) => current || next.name);
        setSenderName((current) => current || next.name);
        setSenderPhone((current) => current || next.phone);
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
  }, []);

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
  const hasDeliveryOnly = items.some((item) => item.deliveryOnly);
  const totalQty = items.reduce((sum, item) => sum + item.qty, 0);

  const addItems = (added: ProductDialogItem[]) => {
    setItems((current) => {
      const next = [...current];
      for (const item of added) {
        const existing = next.findIndex((row) => row.product === item.product);
        if (existing >= 0) {
          next[existing] = {
            ...next[existing],
            qty: next[existing].qty + item.qty,
          };
        } else {
          next.push({ ...item });
        }
      }
      return next;
    });
  };

  const setItemQty = (product: string, qty: number) => {
    setItems((current) =>
      current.map((row) =>
        row.product === product ? { ...row, qty: Math.max(1, qty) } : row,
      ),
    );
  };

  const chooseShip = (next: ShipMethod) => {
    setFormError("");
    setShip(next);
    if (next === "delivery" && !addressSaved) {
      setView("delivery");
      window.scrollTo(0, 0);
    }
  };

  const addPhotos = (files: FileList | null) => {
    setPhotoError("");
    if (!files || files.length === 0) return;
    const accepted: Photo[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) {
        setPhotoError("사진(이미지) 파일만 첨부할 수 있어요.");
        continue;
      }
      if (file.size > MAX_PHOTO_BYTES) {
        setPhotoError("사진 한 장은 10MB 이하만 첨부할 수 있어요.");
        continue;
      }
      accepted.push({ file, url: URL.createObjectURL(file) });
    }
    setPhotos((current) => {
      const room = MAX_PHOTOS - current.length;
      if (accepted.length > room) {
        setPhotoError(`사진은 최대 ${MAX_PHOTOS}장까지 첨부할 수 있어요.`);
        accepted.slice(room).forEach((photo) => URL.revokeObjectURL(photo.url));
      }
      return [...current, ...accepted.slice(0, Math.max(0, room))];
    });
  };

  const removePhoto = (url: string) => {
    URL.revokeObjectURL(url);
    setPhotos((current) => current.filter((photo) => photo.url !== url));
  };

  const validate = () => {
    if (!profile) return profileError || "회원 정보를 불러오는 중이에요.";
    if (!profile.churchName) {
      return "회원 정보에 중앙이 없어 주문할 수 없어요. 기본 버전 주문서를 이용해 주세요.";
    }
    if (!date) return "날짜를 선택해 주세요.";
    if (date < todayIso()) return "지난 날짜에는 주문할 수 없어요.";
    if (isSundayIso(date)) return "일요일에는 주문할 수 없어요.";
    if (!name.trim()) return "주문자 성명을 입력해 주세요.";
    if (isProxy && proxyPhone.replace(/\D/g, "").length < 10) {
      return "대신 주문하는 분의 연락처를 입력해 주세요.";
    }
    if (!branch) return "작업매장(중부·서부·남부)을 선택해 주세요.";
    if (items.length === 0) return "상품을 1개 이상 담아 주세요.";
    if (!ship) return "배송 방법을 선택해 주세요.";
    if (ship === "delivery" && !addressSaved) return "배달 주소를 입력해 주세요.";
    if (ship === "parcel") {
      if (hasDeliveryOnly) {
        return "선물세트 박스 상품은 개별택배로 보낼 수 없어요. 배달 또는 직접수령을 선택해 주세요.";
      }
      if (!senderName.trim() || !senderPhone.trim() || !senderAddress.trim()) {
        return "보내는 사람의 이름·연락처·주소를 입력해 주세요.";
      }
      if (
        photos.length === 0 &&
        (!receiverName.trim() || !receiverPhone.trim() || !receiverAddress.trim())
      ) {
        return "받는 사람의 이름·연락처·주소를 입력하거나 대량 택배 명단 사진을 첨부해 주세요.";
      }
    }
    return "";
  };

  const goConfirm = () => {
    const message = validate();
    setFormError(message);
    if (message) return;
    setView("confirm");
    window.scrollTo(0, 0);
  };

  const buildLineShip = (): LineShipInfo => {
    if (ship === "parcel") {
      return {
        ...emptyLineShipInfo("parcel"),
        companyName: "-",
        parcelShipDate: date,
        senderName: senderName.trim(),
        senderPhone: senderPhone.trim(),
        senderAddress: senderAddress.trim(),
        senderAddressDetail: senderAddressDetail.trim(),
        recipientName: receiverName.trim(),
        recipientPhone: receiverPhone.trim(),
        recipientAddress: receiverAddress.trim(),
        recipientAddressDetail: receiverAddressDetail.trim(),
      };
    }
    if (ship === "pickup") {
      return {
        ...emptyLineShipInfo("delivery"),
        companyName: "직접수령",
        deliveryDate: date,
        recipientName: ordererDisplay,
        recipientPhone: ordererPhone,
        recipientAddress: branchInfo?.name ?? "",
      };
    }
    return {
      ...emptyLineShipInfo("delivery"),
      companyName: "-",
      deliveryDate: date,
      recipientName: ordererDisplay,
      recipientPhone: deliveryPhone.trim() || ordererPhone,
      recipientAddress: address.trim(),
      recipientAddressDetail: addressDetail.trim(),
    };
  };

  /** 기존 제품주문서와 같은 notes 형식으로 상품 줄 하나 = 주문 하나를 만든다 */
  const buildOrderBody = (item: CartItem) => {
    const branchName = branchInfo?.name ?? "";
    const lineShip = buildLineShip();
    const tag = ship === "parcel" ? "택배" : ship === "pickup" ? "직접수령" : "배달";
    // 메모는 줄 note 괄호 안에 들어가므로 괄호도 바꿔 둔다
    const memoNote = memo.trim()
      ? `메모: ${clean(memo.replace(/[()]/g, " "))}`
      : "";
    const lineNote = (
      ship === "delivery"
        ? [clean(deliveryRequest), remark.trim() ? `비고: ${clean(remark)}` : ""]
        : [
            ship === "parcel" && photos.length > 0
              ? "대량 택배 명단 사진 첨부"
              : "",
            memoNote,
          ]
    )
      .filter(Boolean)
      .join(", ");

    const deliveryAddress = joinAddress(address, addressDetail);
    const senderFull = joinAddress(senderAddress, senderAddressDetail);
    const receiverFull = joinAddress(receiverAddress, receiverAddressDetail);

    const shipSegments =
      ship === "parcel"
        ? [
            `택배업체명:-`,
            `택배발송일:${date}`,
            `보내는사람:${clean(senderName)} / ${clean(senderPhone)} / ${clean(senderFull)}`,
            senderAddressDetail.trim()
              ? `보내는분상세주소:${clean(senderAddressDetail)}`
              : null,
            `수취연락:주소`,
            receiverFull ? `받는분주소:${clean(receiverFull)}` : null,
            receiverAddressDetail.trim()
              ? `받는분상세주소:${clean(receiverAddressDetail)}`
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
              addressDetail.trim()
                ? `받는분상세주소:${clean(addressDetail)}`
                : null,
            ];

    const notes = [
      `주문자:${clean(ordererDisplay)}`,
      `연락처:${clean(ordererPhone)}`,
      `주문일자:${todayIso()}`,
      `중앙:${clean(profile?.churchName ?? "")}`,
      ...shipSegments,
      `주문작업지역:${branchName}`,
      `지부매장:${branchName}`,
      `인사장종류:없음`,
      `[${tag}] ${item.product} ${item.qty}개${lineNote ? `(${lineNote})` : ""}`,
      encodeLineShipments([
        {
          product: item.product,
          qty: item.qty,
          baseQty: item.qty,
          note: lineNote,
          unitPrice: item.unitPrice || 0,
          lineSection: item.lineSection,
          deliveryOnly: item.deliveryOnly,
          ship: lineShip,
        },
      ]),
    ]
      .filter(Boolean)
      .join(" / ");

    return {
      totalAmount: item.qty * (item.unitPrice || 0),
      notes,
      extraNote: "",
      items: [
        {
          productName: item.product,
          quantity: item.qty,
          price: item.unitPrice || 0,
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

  const uploadPhotos = async (orderIds: number[]) => {
    const form = new FormData();
    form.append("orderIds", orderIds.join(","));
    for (const photo of photos) {
      form.append("images", photo.file, photo.file.name);
    }
    const response = await apiFetch("/api/orders/attachments", {
      method: "POST",
      body: form,
    });
    return response.ok;
  };

  const handleSubmit = async () => {
    if (isSubmitting) return;
    const message = validate();
    if (message) {
      setFormError(message);
      setView("form");
      return;
    }
    const auth = getAuthUser();
    if (!auth?.id) {
      setFormError("로그인이 필요합니다.");
      return;
    }

    setIsSubmitting(true);
    setFormError("");
    const created: Array<{ id: number; orderNumber: string }> = [];

    try {
      const keyResponse = await apiFetch("/api/orders/new-group-key");
      const issued = (await keyResponse.json().catch(() => null)) as {
        orderGroupKey?: string;
      } | null;
      if (!keyResponse.ok || !issued?.orderGroupKey) {
        throw new Error("주문번호를 발급하지 못했습니다. 다시 시도해 주세요.");
      }

      for (const [index, item] of items.entries()) {
        const response = await apiFetch("/api/orders", {
          method: "POST",
          body: JSON.stringify({
            orderGroupKey: issued.orderGroupKey,
            splitIndex: index + 1,
            splitCount: items.length,
            userId: auth.id,
            status: "PLACED",
            ...buildOrderBody(item),
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

    const orderIds = created.map((order) => order.id);
    let uploadFailed = false;
    if (ship === "parcel" && photos.length > 0) {
      uploadFailed = !(await uploadPhotos(orderIds).catch(() => false));
    }

    setResult({
      orderNumbers: created.map((order) => order.orderNumber),
      orderIds,
      uploadFailed,
    });
    setIsSubmitting(false);
    onSubmitted(date);
    setView("done");
    window.scrollTo(0, 0);
  };

  const retryUpload = async () => {
    if (!result || isRetryingUpload) return;
    setIsRetryingUpload(true);
    const ok = await uploadPhotos(result.orderIds).catch(() => false);
    setIsRetryingUpload(false);
    if (ok) {
      setResult({ ...result, uploadFailed: false });
      onSubmitted(date);
    }
  };

  const resetForNewOrder = () => {
    photos.forEach((photo) => URL.revokeObjectURL(photo.url));
    setPhotos([]);
    setItems([]);
    setShip("");
    setAddressSaved(false);
    setAddress("");
    setAddressDetail("");
    setDeliveryPhone("");
    setRemark("");
    setMemo("");
    setReceiverName("");
    setReceiverPhone("");
    setReceiverAddress("");
    setReceiverAddressDetail("");
    setResult(null);
    setFormError("");
    setView("form");
    window.scrollTo(0, 0);
  };

  const shipLabel = SHIP_OPTIONS.find((option) => option.id === ship)?.label ?? "-";

  if (view === "delivery") {
    return (
      <div className="jy-wrap">
        <V2Header title="배달 주소" onBack={() => setView("form")} />
        <AddressInput
          id="jy-addr"
          label="도로명 · 지번 주소"
          value={address}
          onChange={setAddress}
          placeholder="예: 김해시 장유로 123"
        />
        <div>
          <label className="jy-label" htmlFor="jy-addr2">
            상세 주소
          </label>
          <input
            id="jy-addr2"
            className="jy-input"
            value={addressDetail}
            onChange={(event) => setAddressDetail(event.target.value)}
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
            value={deliveryPhone}
            onChange={(event) => setDeliveryPhone(formatPhone(event.target.value))}
            placeholder={ordererPhone || "010-0000-0000"}
          />
        </div>
        <div>
          <label className="jy-label" htmlFor="jy-areq">
            배달 요청사항
          </label>
          <select
            id="jy-areq"
            className="jy-input"
            value={deliveryRequest}
            onChange={(event) => setDeliveryRequest(event.target.value)}
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
            value={remark}
            onChange={(event) => setRemark(event.target.value)}
            placeholder="배송 관련 요청 사항"
          />
        </div>
        <div className="jy-info">
          <b>i</b>
          <span>배달 가능 지역과 배달 일정은 주문 확인 후 지점에서 따로 안내해요.</span>
        </div>
        {addressError ? <div className="jy-err">{addressError}</div> : null}
        <V2Dock>
          <button
            type="button"
            className="jy-btn jy-primary jy-big"
            onClick={() => {
              if (!address.trim()) {
                setAddressError("주소를 입력해 주세요.");
                return;
              }
              setAddressError("");
              setAddressSaved(true);
              setShip("delivery");
              setView("form");
              window.scrollTo(0, 0);
            }}
          >
            이 주소로 배달하기
          </button>
        </V2Dock>
      </div>
    );
  }

  if (view === "confirm") {
    return (
      <div className="jy-wrap">
        <V2Header title="주문 확인" onBack={() => setView("form")} />
        <section className="jy-card">
          <h2>아래 내용으로 주문할까요?</h2>
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
            <dt>배송방법</dt>
            <dd>{shipLabel}</dd>
            {ship === "delivery" ? (
              <>
                <dt>배달 주소</dt>
                <dd>{joinAddress(address, addressDetail)}</dd>
                <dt>연락처</dt>
                <dd>{deliveryPhone || ordererPhone || "-"}</dd>
                <dt>요청사항</dt>
                <dd>{deliveryRequest}</dd>
                {remark.trim() ? (
                  <>
                    <dt>비고</dt>
                    <dd>{remark.trim()}</dd>
                  </>
                ) : null}
              </>
            ) : null}
            {ship === "pickup" ? (
              <>
                <dt>수령 매장</dt>
                <dd>{branchInfo?.name ?? "-"}</dd>
              </>
            ) : null}
            {ship === "parcel" ? (
              <>
                <dt>보내는 사람</dt>
                <dd>
                  {senderName} / {senderPhone} /{" "}
                  {joinAddress(senderAddress, senderAddressDetail)}
                </dd>
                <dt>받는 사람</dt>
                <dd>
                  {receiverName.trim() || receiverAddress.trim()
                    ? `${receiverName} / ${receiverPhone} / ${joinAddress(receiverAddress, receiverAddressDetail)}`
                    : "명단 사진 참고"}
                </dd>
                {photos.length ? (
                  <>
                    <dt>명단 사진</dt>
                    <dd>{photos.length}장</dd>
                  </>
                ) : null}
              </>
            ) : null}
            {(ship === "pickup" || ship === "parcel") && memo.trim() ? (
              <>
                <dt>메모</dt>
                <dd>{memo.trim()}</dd>
              </>
            ) : null}
          </dl>
        </section>
        <section className="jy-card">
          <h2>주문 상품</h2>
          <table className="jy-table">
            <thead>
              <tr>
                <th>상품</th>
                <th>수량</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.product}>
                  <td>{item.product}</td>
                  <td className="jy-num">{item.qty}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="jy-hint">
            상품마다 주문서가 따로 만들어져요 (총 {items.length}건).
          </p>
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
              {isSubmitting ? "접수 중…" : "주문 완료"}
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
        <p className="jy-title-c">주문이 접수됐어요</p>
        <p className="jy-sub">
          주문번호 {result.orderNumbers.filter(Boolean).join(", ") || "-"}
        </p>
        {result.uploadFailed ? (
          <div className="jy-info">
            <b>!</b>
            <span>
              주문은 접수됐지만 명단 사진을 올리지 못했어요.{" "}
              <button
                type="button"
                className="jy-btn"
                style={{ height: 34, marginTop: 6 }}
                disabled={isRetryingUpload}
                onClick={() => void retryUpload()}
              >
                {isRetryingUpload ? "올리는 중…" : "사진 다시 올리기"}
              </button>
            </span>
          </div>
        ) : null}
        <div className="jy-stack">
          <button type="button" className="jy-btn jy-primary jy-big" onClick={onBackToList}>
            주문 달력 보기
          </button>
          <button type="button" className="jy-btn jy-big" onClick={resetForNewOrder}>
            새 주문 등록
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="jy-wrap">
      <V2Header title="새 주문" onBack={onBackToList} />

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
                onClick={() => setBranch(store.id)}
              >
                {store.name.slice(0, 2)}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="jy-card">
        <h2>상품 등록</h2>
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
        {items.length ? (
          items.map((item) => (
            <div key={item.product} className="jy-item-line">
              <span>{item.product}</span>
              <span className="jy-qty">
                <button
                  type="button"
                  className="jy-btn"
                  aria-label={`${item.product} 수량 줄이기`}
                  onClick={() => setItemQty(item.product, item.qty - 1)}
                >
                  −
                </button>
                <input
                  type="number"
                  min={1}
                  inputMode="numeric"
                  aria-label={`${item.product} 수량`}
                  value={item.qty}
                  onChange={(event) =>
                    setItemQty(item.product, Number(event.target.value) || 1)
                  }
                />
                <button
                  type="button"
                  className="jy-btn"
                  aria-label={`${item.product} 수량 늘리기`}
                  onClick={() => setItemQty(item.product, item.qty + 1)}
                >
                  +
                </button>
                <button
                  type="button"
                  className="jy-btn jy-link"
                  onClick={() =>
                    setItems((current) =>
                      current.filter((row) => row.product !== item.product),
                    )
                  }
                >
                  삭제
                </button>
              </span>
            </div>
          ))
        ) : (
          <div className="jy-hint">
            구분을 고르고 상품 담기를 누른 뒤 수량을 넣어 주세요. 일반품과 선물세트를
            함께 담을 수 있어요.
          </div>
        )}
      </section>

      <section className="jy-card">
        <h2>배송</h2>
        <div className="jy-chips">
          {SHIP_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              className="jy-btn jy-chip"
              aria-pressed={option.id === ship}
              onClick={() => chooseShip(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>

        {ship === "delivery" && addressSaved ? (
          <div className="jy-addr-sum">
            <div>
              <strong>{address}</strong> {addressDetail}
              <div className="jy-meta">
                {deliveryPhone || ordererPhone || "연락처 없음"} · {deliveryRequest}
                {remark.trim() ? ` · 비고: ${remark.trim()}` : ""}
              </div>
            </div>
            <button
              type="button"
              className="jy-btn"
              style={{ flex: "none", height: 36, fontSize: 13 }}
              onClick={() => setView("delivery")}
            >
              수정
            </button>
          </div>
        ) : null}

        {ship === "pickup" ? (
          <div className="jy-info">
            <b>i</b>
            <span>
              {branchInfo
                ? `${branchInfo.name} 매장에서 ${dateLabel(date)}에 직접 수령해요.`
                : "작업매장을 선택하면 그 매장에서 직접 수령해요."}
            </span>
          </div>
        ) : null}

        {ship === "parcel" ? (
          <>
            {hasDeliveryOnly ? (
              <div className="jy-err">
                선물세트 박스 상품은 개별택배로 보낼 수 없어요.
              </div>
            ) : null}
            <h2 style={{ fontSize: 14 }}>보내는 사람</h2>
            <div className="jy-row">
              <input
                className="jy-input"
                aria-label="보내는 사람 이름"
                value={senderName}
                onChange={(event) => setSenderName(event.target.value)}
                placeholder="이름"
              />
              <input
                className="jy-input"
                aria-label="보내는 사람 연락처"
                type="tel"
                inputMode="tel"
                value={senderPhone}
                onChange={(event) => setSenderPhone(formatPhone(event.target.value))}
                placeholder="연락처"
              />
            </div>
            <AddressInput
              id="jy-send-addr"
              label="보내는 사람 주소"
              value={senderAddress}
              onChange={setSenderAddress}
              placeholder="주소"
            />
            <input
              className="jy-input"
              aria-label="보내는 사람 상세 주소"
              value={senderAddressDetail}
              onChange={(event) => setSenderAddressDetail(event.target.value)}
              placeholder="상세 주소"
            />

            <h2 style={{ fontSize: 14 }}>
              받는 사람{" "}
              {photos.length ? (
                <span className="jy-meta">(명단 사진이 있으면 선택)</span>
              ) : null}
            </h2>
            <div className="jy-row">
              <input
                className="jy-input"
                aria-label="받는 사람 이름"
                value={receiverName}
                onChange={(event) => setReceiverName(event.target.value)}
                placeholder="이름"
              />
              <input
                className="jy-input"
                aria-label="받는 사람 연락처"
                type="tel"
                inputMode="tel"
                value={receiverPhone}
                onChange={(event) => setReceiverPhone(formatPhone(event.target.value))}
                placeholder="연락처"
              />
            </div>
            <AddressInput
              id="jy-recv-addr"
              label="받는 사람 주소"
              value={receiverAddress}
              onChange={setReceiverAddress}
              placeholder="주소"
            />
            <input
              className="jy-input"
              aria-label="받는 사람 상세 주소"
              value={receiverAddressDetail}
              onChange={(event) => setReceiverAddressDetail(event.target.value)}
              placeholder="상세 주소"
            />

            <div>
              <span className="jy-label">대량 택배 명단 첨부 (사진촬영)</span>
              <div className="jy-photos">
                {photos.map((photo) => (
                  <div key={photo.url} className="jy-photo">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photo.url} alt="첨부한 명단 사진" />
                    <button
                      type="button"
                      aria-label="사진 삭제"
                      onClick={() => removePhoto(photo.url)}
                    >
                      ×
                    </button>
                  </div>
                ))}
                {photos.length < MAX_PHOTOS ? (
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
              <p className="jy-hint" style={{ marginTop: 6 }}>
                명단 종이를 찍어 올리면 받는 사람 입력을 생략할 수 있어요. 최대{" "}
                {MAX_PHOTOS}장.
              </p>
              {photoError ? <div className="jy-err">{photoError}</div> : null}
            </div>
          </>
        ) : null}

        {ship === "pickup" || ship === "parcel" ? (
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
        ) : null}
      </section>

      {formError ? <div className="jy-err">{formError}</div> : null}

      <V2Dock>
        <div className="jy-cartbar">
          <div>
            <div className="jy-meta">담은 상품 {items.length}개</div>
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
        fixedCategory={productCategory}
      />
    </div>
  );
}
