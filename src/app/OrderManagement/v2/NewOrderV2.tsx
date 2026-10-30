"use client";

import { useEffect, useRef, useState } from "react";

import { apiFetch } from "@/lib/api";
import { getAuthUser } from "@/lib/auth";
import { openDaumPostcode } from "@/lib/daum-postcode";
import { isSundayIso } from "@/lib/date-format";
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

const QTY_ERROR = "수량은 1이상이어야 합니다.";

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
  const deliveryRequest =
    DELIVERY_REQUESTS.find((request) => note.startsWith(request)) ??
    DELIVERY_REQUESTS[0];
  return {
    date:
      (ship === "parcel" ? shipInfo.parcelShipDate : shipInfo.deliveryDate) ||
      parseDeliveryRequestDateFromNotes(order.notes),
    orderDate: parseOrderDateFromNotes(order.notes),
    ordererName: parseOrdererFromNotes(order.notes),
    ordererPhone,
    branch: branch as BranchStoreId | "",
    items: item
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
          } satisfies CartItem,
        ]
      : [],
    ship,
    address: ship === "delivery" ? shipInfo.recipientAddress : "",
    addressDetail: ship === "delivery" ? shipInfo.recipientAddressDetail : "",
    // 받는 분 연락처를 비워 접수했으면 주문자 연락처가 들어가 있다 → 다시 빈칸으로
    deliveryPhone:
      ship === "delivery" && formatPhone(shipInfo.recipientPhone) !== ordererPhone
        ? formatPhone(shipInfo.recipientPhone)
        : "",
    deliveryRequest,
    remark: ship === "delivery" ? noteValueAfter(note, "비고") : "",
    memo: ship === "delivery" ? "" : noteValueAfter(note, "메모"),
    senderName: ship === "parcel" ? shipInfo.senderName : "",
    senderPhone: ship === "parcel" ? shipInfo.senderPhone : "",
    senderAddress: ship === "parcel" ? shipInfo.senderAddress : "",
    senderAddressDetail: ship === "parcel" ? shipInfo.senderAddressDetail : "",
    receiverName: ship === "parcel" ? shipInfo.recipientName : "",
    receiverPhone: ship === "parcel" ? shipInfo.recipientPhone : "",
    receiverAddress: ship === "parcel" ? shipInfo.recipientAddress : "",
    receiverAddressDetail: ship === "parcel" ? shipInfo.recipientAddressDetail : "",
    existingPhotoCount: order.attachments?.length ?? 0,
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
  const existingPhotoCount = restored?.existingPhotoCount ?? 0;
  const photoLimit = Math.max(0, MAX_PHOTOS - existingPhotoCount);

  const [view, setView] = useState<View>("form");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileError, setProfileError] = useState("");

  const [date, setDate] = useState(restored?.date || initialDate);
  const [name, setName] = useState(restored?.ordererName ?? "");
  const [proxyPhone, setProxyPhone] = useState(restored?.ordererPhone ?? "");
  const [branch, setBranch] = useState<BranchStoreId | "">(restored?.branch ?? "");
  const [items, setItems] = useState<CartItem[]>(restored?.items ?? []);
  /** 수량칸을 고치는 동안의 글자 (품명 → 입력값). 실제 수량과 같아지면 지운다 */
  const [qtyDrafts, setQtyDrafts] = useState<Record<string, string>>({});
  const [productDialogOpen, setProductDialogOpen] = useState(false);
  /** 상품 담기 창에 보일 구분 */
  const [productCategory, setProductCategory] =
    useState<ProductCategory>("일반품");
  const [ship, setShip] = useState<ShipMethod | "">(restored?.ship ?? "");

  // 배달
  const [address, setAddress] = useState(restored?.address ?? "");
  const [addressDetail, setAddressDetail] = useState(restored?.addressDetail ?? "");
  const [deliveryPhone, setDeliveryPhone] = useState(restored?.deliveryPhone ?? "");
  const [deliveryRequest, setDeliveryRequest] = useState(
    restored?.deliveryRequest ?? DELIVERY_REQUESTS[0],
  );
  const [remark, setRemark] = useState(restored?.remark ?? "");
  /** 직접수령·개별택배 메모 (배달은 주소 화면의 비고를 쓴다) */
  const [memo, setMemo] = useState(restored?.memo ?? "");
  const [addressSaved, setAddressSaved] = useState(restored?.ship === "delivery");
  const [addressError, setAddressError] = useState("");

  // 개별택배
  const [senderName, setSenderName] = useState(restored?.senderName ?? "");
  const [senderPhone, setSenderPhone] = useState(restored?.senderPhone ?? "");
  const [senderAddress, setSenderAddress] = useState(restored?.senderAddress ?? "");
  const [senderAddressDetail, setSenderAddressDetail] = useState(
    restored?.senderAddressDetail ?? "",
  );
  const [receiverName, setReceiverName] = useState(restored?.receiverName ?? "");
  const [receiverPhone, setReceiverPhone] = useState(restored?.receiverPhone ?? "");
  const [receiverAddress, setReceiverAddress] = useState(
    restored?.receiverAddress ?? "",
  );
  const [receiverAddressDetail, setReceiverAddressDetail] = useState(
    restored?.receiverAddressDetail ?? "",
  );
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
        setItems((current) =>
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
  const hasDeliveryOnly = items.some((item) => item.deliveryOnly);
  const totalQty = items.reduce((sum, item) => sum + item.qty, 0);
  /** 화면에는 소매가(없으면 도매가)로 보여준다. 주문 금액은 도매가(unitPrice)로 저장한다 */
  const displayUnitPrice = (item: CartItem) => item.retailPrice ?? item.unitPrice ?? 0;
  const totalDisplayAmount = items.reduce(
    (sum, item) => sum + displayUnitPrice(item) * item.qty,
    0,
  );

  const addItems = (added: ProductDialogItem[]) => {
    added.forEach((item) => clearQtyDraft(item.product));
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

  const clearQtyDraft = (product: string) => {
    setQtyDrafts((current) => {
      if (!(product in current)) return current;
      const next = { ...current };
      delete next[product];
      return next;
    });
  };

  const setItemQty = (product: string, qty: number) => {
    clearQtyDraft(product);
    setItems((current) =>
      current.map((row) =>
        row.product === product ? { ...row, qty: Math.max(1, qty) } : row,
      ),
    );
  };

  /** 지우는 중 빈칸·0 도 칸에는 보이게 두고, 1 이상일 때만 실제 수량에 넣는다 */
  const typeItemQty = (product: string, raw: string) => {
    const digits = raw.replace(/\D/g, "");
    setQtyDrafts((current) => ({ ...current, [product]: digits }));
    const qty = Number(digits);
    if (qty >= 1) {
      setItems((current) =>
        current.map((row) => (row.product === product ? { ...row, qty } : row)),
      );
    }
  };

  const isQtyInvalid = (product: string) => {
    const draft = qtyDrafts[product];
    return draft !== undefined && !(Number(draft) >= 1);
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
      // 수정 모드는 이미 붙은 사진도 개수에 넣는다
      const room = photoLimit - current.length;
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
    if (items.some((item) => isQtyInvalid(item.product))) return QTY_ERROR;
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
        photos.length + existingPhotoCount === 0 &&
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
            ship === "parcel" && photos.length + existingPhotoCount > 0
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
      // 수정해도 처음 주문한 날짜는 그대로 둔다
      `주문일자:${restored?.orderDate || todayIso()}`,
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

  /**
   * 수정 모드 저장. 특이사항(extraNote)은 건드리지 않는다.
   * - 목록 첫 줄 → 이 주문(id)을 고친다 (상품을 바꿨으면 상품도 바뀐다, 번호 유지)
   * - 나머지 줄 → 같은 그룹에 새 형제 주문으로 만든다 (순번은 editNextSplitIndex 부터)
   */
  const saveEdit = async (order: ApiMemberOrder, first: CartItem, extras: CartItem[]) => {
    setIsSubmitting(true);
    setFormError("");
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
        for (const [offset, item] of extras.entries()) {
          const response = await apiFetch("/api/orders", {
            method: "POST",
            body: JSON.stringify({
              orderGroupKey: groupKey,
              splitIndex: startIndex + offset,
              // 2 이상이면 번호에 -순번 이 붙는다
              splitCount: Math.max(2, lastIndex),
              userId: getAuthUser()?.id,
              status: "PLACED",
              ...buildOrderBody(item),
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
    let uploadFailed = false;
    if (ship === "parcel" && photos.length > 0) {
      uploadFailed = !(await uploadPhotos(orderIds).catch(() => false));
    }
    setResult({
      orderNumbers: [order.orderNumber, ...created.map((row) => row.orderNumber)],
      orderIds,
      uploadFailed,
    });
    setIsSubmitting(false);
    onSubmitted(date);
    setView("done");
    window.scrollTo(0, 0);
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

    if (editOrder && items[0]) {
      await saveEdit(editOrder, items[0], items.slice(1));
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
                {photos.length + existingPhotoCount ? (
                  <>
                    <dt>명단 사진</dt>
                    <dd>{photos.length + existingPhotoCount}장</dd>
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
                <th>금액</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.product}>
                  <td>{item.product}</td>
                  <td className="jy-num">{item.qty}</td>
                  <td className="jy-num">{formatWon(displayUnitPrice(item) * item.qty)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="jy-total">
            <span>총금액</span>
            <strong className="jy-num">{formatWon(totalDisplayAmount)}</strong>
          </div>
          {isEdit && items.length > 1 ? (
            <p className="jy-hint">
              첫 상품은 이 주문({editOrder?.orderNumber})에 저장되고, 더한 상품{" "}
              {items.length - 1}건은 새 주문번호로 접수돼요.
            </p>
          ) : null}
          {isEdit ? null : (
            <p className="jy-hint">
              상품마다 주문서가 따로 만들어져요 (총 {items.length}건).
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
        {result.uploadFailed ? (
          <div className="jy-info">
            <b>!</b>
            <span>
              주문은 {isEdit ? "수정됐" : "접수됐"}지만 명단 사진을 올리지 못했어요.{" "}
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
                onClick={() => setBranch(store.id)}
              >
                {store.name.slice(0, 2)}
              </button>
            ))}
          </div>
        </div>
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
        {items.length ? (
          items.map((item, index) => {
            const qtyInvalid = isQtyInvalid(item.product);
            const qtyErrorId = `jy-qty-err-${index}`;
            return (
              <div key={item.product} className="jy-item-line">
                <div className="jy-item-name">
                  <span>{item.product}</span>
                  {qtyInvalid ? (
                    <div id={qtyErrorId} className="jy-err" role="alert">
                      {QTY_ERROR}
                    </div>
                  ) : (
                    <div className="jy-meta jy-num">
                      {formatWon(displayUnitPrice(item))} × {item.qty} ={" "}
                      {formatWon(displayUnitPrice(item) * item.qty)}
                    </div>
                  )}
                </div>
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
                    value={qtyDrafts[item.product] ?? String(item.qty)}
                    aria-invalid={qtyInvalid || undefined}
                    aria-describedby={qtyInvalid ? qtyErrorId : undefined}
                    onChange={(event) => typeItemQty(item.product, event.target.value)}
                    onBlur={() => {
                      // 올바른 값이면 입력 중 글자를 지우고, 빈칸·0 이면 에러와 함께 그대로 둔다
                      if (!isQtyInvalid(item.product)) clearQtyDraft(item.product);
                    }}
                  />
                  <button
                    type="button"
                    className="jy-btn"
                    aria-label={`${item.product} 수량 늘리기`}
                    onClick={() => setItemQty(item.product, item.qty + 1)}
                  >
                    +
                  </button>
                  {/* 수정 모드는 상품이 0개가 되지 않게 2줄 이상일 때만 */}
                  {isEdit && items.length < 2 ? null : (
                    <button
                      type="button"
                      className="jy-btn jy-link"
                      onClick={() => {
                        clearQtyDraft(item.product);
                        setItems((current) =>
                          current.filter((row) => row.product !== item.product),
                        );
                      }}
                    >
                      삭제
                    </button>
                  )}
                </span>
              </div>
            );
          })
        ) : (
          <div className="jy-hint">
            구분을 고르고 상품 담기를 누른 뒤 수량을 넣어 주세요. 일반품과 선물세트를
            함께 담을 수 있어요.
          </div>
        )}
        {items.length ? (
          <div className="jy-total">
            <span>총금액</span>
            <strong className="jy-num">{formatWon(totalDisplayAmount)}</strong>
          </div>
        ) : null}
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
                {photos.length < photoLimit ? (
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
              {existingPhotoCount ? (
                <p className="jy-hint" style={{ marginTop: 6 }}>
                  이미 첨부된 사진 {existingPhotoCount}장은 그대로 있어요. 새로 찍은 사진만 추가돼요.
                </p>
              ) : null}
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
        fixedCategory={isEdit ? undefined : productCategory}
      />
    </div>
  );
}
