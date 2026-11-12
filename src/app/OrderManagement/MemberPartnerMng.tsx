"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";

import { Image as ImageIcon, Upload } from "lucide-react";

import { PartnerExcelUploadDialog } from "@/app/admin/OrderManagement/PartnerExcelUploadDialog";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { Dropdown } from "@/components/ui/dropdown";
import { Pagination } from "@/components/ui/pagination";
import { Skeleton, TableSkeleton } from "@/components/ui/skeleton";
import { Table, type TableColumn } from "@/components/ui/table";
import { apiFetch } from "@/lib/api";
import { openDaumPostcode } from "@/lib/daum-postcode";
import { hangulInputValue } from "@/lib/hangul-typing";

export type PartnerRow = {
  id: number;
  name: string;
  contactName: string;
  /** 유선전화 */
  phone: string | null;
  /** 휴대폰 */
  mobile?: string | null;
  address: string;
  /** 상세주소 (층·호수·건물명) */
  addressDetail?: string | null;
  email: string | null;
  /** 거래처 증거자료 (명함·계약서 이미지) */
  evidenceImageUrl?: string | null;
  evidenceImageName?: string | null;
  source?: string;
  category?: string | null;
  subCategory?: string | null;
  /** 고객사 구분 (은행(금융) 등) */
  customerType?: string | null;
  centerName?: string | null;
  /** 중서남부 */
  regionGroup?: string | null;
  salesRepName?: string | null;
};

type PartnerPage = {
  items: PartnerRow[];
  total: number;
  page: number;
  pageSize: number;
};

/** 관리자 목록: 거래처보기 줄 수 */
const PAGE_SIZE_OPTIONS = [20, 50, 100, 200].map((size) => ({
  value: String(size),
  label: `${size}줄`,
}));
const DEFAULT_PAGE_SIZE = 20;

const PARTNER_FORM_ID = "partner-form";

type PartnerForm = {
  name: string;
  category: string;
  subCategory: string;
  centerName: string;
  contactName: string;
  /** 휴대폰 */
  mobile: string;
  /** 유선전화 */
  phone: string;
  address: string;
  addressDetail: string;
  email: string;
};

const EMPTY_FORM: PartnerForm = {
  name: "",
  category: "",
  subCategory: "",
  centerName: "",
  contactName: "",
  mobile: "",
  phone: "",
  address: "",
  addressDetail: "",
  email: "",
};

type PartnerOptions = {
  categories: string[];
  subCategories: string[];
  centers: string[];
};

const EVIDENCE_ACCEPT = "image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif";
const EVIDENCE_MAX_BYTES = 10 * 1024 * 1024;

/** 휴대폰: 010-1234-5678 */
function formatMobileInput(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  const mid = digits.length === 10 ? 3 : 4;
  return `${digits.slice(0, 3)}-${digits.slice(3, 3 + mid)}-${digits.slice(3 + mid)}`;
}

function isMobile(value: string) {
  return /^01[016789]\d{7,8}$/.test(value.replace(/\D/g, ""));
}

/** 지역번호 길이: 02 → 2, 050x 안심번호 → 4, 그 밖의 0xx → 3, 15xx 대표번호 → 0 */
function phoneAreaLength(digits: string) {
  if (digits.startsWith("02")) return 2;
  if (/^050\d/.test(digits)) return 4;
  if (/^1[5-9]/.test(digits)) return 0;
  return 3;
}

/** 유선(02·0xx·050x)·대표번호(15xx)·휴대폰 번호에 알맞게 하이픈을 넣는다 */
function formatPhoneInput(value: string) {
  const area = phoneAreaLength(value.replace(/\D/g, ""));
  const digits = value.replace(/\D/g, "").slice(0, area === 0 ? 8 : area + 8);
  if (area === 0) {
    // 1588-0000
    return digits.length <= 4
      ? digits
      : `${digits.slice(0, 4)}-${digits.slice(4)}`;
  }
  const head = digits.slice(0, area);
  const rest = digits.slice(area);
  if (!rest) return head;
  if (rest.length <= 3) return `${head}-${rest}`;
  // 나머지 7자리 → 3-4, 8자리 → 4-4
  const mid = rest.length <= 7 ? 3 : 4;
  return `${head}-${rest.slice(0, mid)}-${rest.slice(mid)}`;
}

function joinAddress(address: string, detail: string) {
  return [address.trim(), detail.trim()].filter(Boolean).join(" ");
}

/** 연락처 칸: 휴대폰·유선전화를 두 줄로 (예전 행은 휴대폰이 유선 칸에 있을 수 있다) */
function ContactLines({ row }: { row: PartnerRow }) {
  if (!row.mobile && !row.phone) return <>-</>;
  return (
    <div className="space-y-0.5 leading-tight">
      {row.mobile ? <p>{row.mobile}</p> : null}
      {row.phone ? <p className="text-[#64748B]">{row.phone}</p> : null}
    </div>
  );
}

/** 증거자료 이미지 링크 (새 탭) */
function EvidenceLink({
  row,
  withLabel = false,
}: {
  row: PartnerRow;
  withLabel?: boolean;
}) {
  if (!row.evidenceImageUrl) {
    return <span className="text-[#CBD5E1]">-</span>;
  }
  return (
    <a
      href={row.evidenceImageUrl}
      target="_blank"
      rel="noreferrer"
      onClick={(event) => event.stopPropagation()}
      title={row.evidenceImageName ?? "증거자료 보기"}
      className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#3182CE] hover:underline"
    >
      <ImageIcon className="size-4" strokeWidth={1.8} />
      {withLabel ? "증거자료 보기" : <span className="sr-only">증거자료 보기</span>}
    </a>
  );
}

const labelClass = "mb-[5px] block text-[12px] font-bold text-[#64748B]";
const inputClass =
  "mb-3 w-full rounded-lg border border-[#E2E8F0] bg-white px-[11px] py-[9px] text-[13px] text-[#1A202C] disabled:bg-[#EDF2F7]";

export function MemberPartnerMng({
  sharedCatalog = false,
  title,
  description,
}: {
  sharedCatalog?: boolean;
  /** 관리자 화면: 제목 줄 (오른쪽에 거래처 등록 버튼) */
  title?: string;
  description?: string;
} = {}) {
  const [partners, setPartners] = useState<PartnerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  /** 등록·수정 폼 오류 */
  const [error, setError] = useState("");
  /** 목록 불러오기·삭제 오류 */
  const [listError, setListError] = useState("");
  /** 관리자 화면: 등록·수정 bottom sheet 열림 */
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<PartnerForm>(EMPTY_FORM);
  const [searchingAddress, setSearchingAddress] = useState(false);
  const [listFilter, setListFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [total, setTotal] = useState(0);
  const listTopRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  /** 구분·구분2·중앙 추천값 */
  const [options, setOptions] = useState<PartnerOptions>({
    categories: [],
    subCategories: [],
    centers: [],
  });
  /** 증거자료: 저장된 이미지, 새로 고른 파일, 지우기 */
  const [evidenceUrl, setEvidenceUrl] = useState<string | null>(null);
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [evidenceRemoved, setEvidenceRemoved] = useState(false);
  const evidenceInputRef = useRef<HTMLInputElement>(null);
  /** 관리자: 거래처 일괄 등록 다이얼로그 */
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkNotice, setBulkNotice] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await apiFetch("/api/partners/options");
        if (!res.ok) return;
        const data = (await res.json()) as PartnerOptions;
        if (!cancelled) setOptions(data);
      } catch {
        /* 추천값이 없어도 직접 입력할 수 있다 */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 새로 고른 이미지 미리보기 주소 (바뀌거나 화면을 떠나면 정리)
  const evidencePreview = useMemo(
    () => (evidenceFile ? URL.createObjectURL(evidenceFile) : null),
    [evidenceFile],
  );
  useEffect(
    () => () => {
      if (evidencePreview) URL.revokeObjectURL(evidencePreview);
    },
    [evidencePreview],
  );

  const resetEvidence = (url: string | null = null) => {
    setEvidenceUrl(url);
    setEvidenceFile(null);
    setEvidenceRemoved(false);
  };

  // 관리자(공유 목록): 검색어 입력이 멈추면 서버 검색
  useEffect(() => {
    if (!sharedCatalog) return;
    const timer = window.setTimeout(() => {
      setSearchQuery(listFilter.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [listFilter, sharedCatalog]);

  const loadPartners = useCallback(async () => {
    // 검색어·페이지를 빨리 바꾸면 이전 요청을 취소해 늦게 온 응답이 화면을 덮지 않게 한다
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setListError("");
    try {
      if (sharedCatalog) {
        // 엑셀 입력분까지 1만 건 이상이라 서버에서 페이지 단위로 받는다
        const params = new URLSearchParams({
          page: String(page),
          pageSize: String(pageSize),
        });
        if (searchQuery) params.set("search", searchQuery);
        const res = await apiFetch(`/api/partners?${params.toString()}`, {
          signal: controller.signal,
        });
        const data = (await res.json()) as PartnerPage | { message?: string };
        if (!res.ok || !("items" in data) || !Array.isArray(data.items)) {
          throw new Error(
            "message" in data && data.message
              ? String(data.message)
              : "거래처 목록을 불러오지 못했습니다.",
          );
        }
        setPartners(data.items);
        setTotal(data.total);
        return;
      }

      const res = await apiFetch("/api/partners");
      const data = (await res.json()) as PartnerRow[] | { message?: string };
      if (!res.ok || !Array.isArray(data)) {
        throw new Error(
          !Array.isArray(data) && data.message
            ? String(data.message)
            : "거래처 목록을 불러오지 못했습니다.",
        );
      }
      setPartners(data);
      setTotal(data.length);
    } catch (err) {
      if (controller.signal.aborted) return;
      setListError(
        err instanceof Error
          ? err.message
          : "거래처 목록을 불러오지 못했습니다.",
      );
      setPartners([]);
      setTotal(0);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [sharedCatalog, page, pageSize, searchQuery]);

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    void loadPartners();
  }, [loadPartners]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const resetForm = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    resetEvidence();
    setError("");
    setSheetOpen(false);
  };

  const closeSheet = () => {
    if (saving) return;
    resetForm();
  };

  const openCreateForm = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    resetEvidence();
    setError("");
    setSheetOpen(true);
  };

  const startEdit = (row: PartnerRow) => {
    setEditingId(row.id);
    // 예전 행은 휴대폰이 유선전화 칸에 있을 수 있다
    const phoneIsMobile = !row.mobile && isMobile(row.phone ?? "");
    setForm({
      name: row.name,
      category: row.category ?? "",
      subCategory: row.subCategory ?? "",
      centerName: row.centerName ?? "",
      contactName: row.contactName,
      mobile: formatMobileInput(
        (phoneIsMobile ? row.phone : row.mobile) ?? "",
      ),
      phone: phoneIsMobile ? "" : formatPhoneInput(row.phone ?? ""),
      address: row.address,
      addressDetail: row.addressDetail ?? "",
      email: row.email ?? "",
    });
    resetEvidence(row.evidenceImageUrl ?? null);
    setError("");
    if (sharedCatalog) setSheetOpen(true);
  };

  const changePage = (next: number) => {
    setPage(next);
    listTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const validate = (): string | null => {
    if (!form.name.trim()) return "거래처명을 입력해 주세요.";
    if (!form.contactName.trim()) return "담당자명을 입력해 주세요.";
    if (!form.mobile.trim() && !form.phone.trim()) {
      return "휴대폰 또는 유선전화를 입력해 주세요.";
    }
    if (form.mobile.trim() && !isMobile(form.mobile)) {
      return "휴대폰은 010-0000-0000 형식으로 입력해 주세요.";
    }
    if (form.phone.trim() && isMobile(form.phone)) {
      return "휴대폰 번호는 휴대폰 칸에 입력해 주세요.";
    }
    if (!form.address.trim()) return "주소를 입력해 주세요.";
    if (
      form.email.trim() &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())
    ) {
      return "올바른 이메일 형식이 아닙니다.";
    }
    return null;
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    setError("");
    const payload = {
      name: form.name.trim(),
      category: form.category.trim() || null,
      subCategory: form.subCategory.trim() || null,
      centerName: form.centerName.trim() || null,
      contactName: form.contactName.trim(),
      mobile: form.mobile.trim() || null,
      phone: form.phone.trim() || null,
      address: form.address.trim(),
      addressDetail: form.addressDetail.trim() || null,
      email: form.email.trim() || null,
    };
    const messageOf = (data: unknown, fallback: string) => {
      if (data && typeof data === "object" && "message" in data) {
        const message = (data as { message?: string | string[] }).message;
        if (Array.isArray(message)) return message.join(" ");
        if (message) return String(message);
      }
      return fallback;
    };

    try {
      const res = await apiFetch(
        editingId != null ? `/api/partners/${editingId}` : "/api/partners",
        {
          method: editingId != null ? "PATCH" : "POST",
          body: JSON.stringify(payload),
        },
      );
      const data = (await res.json()) as PartnerRow | { message?: string };
      if (!res.ok) throw new Error(messageOf(data, "저장에 실패했습니다."));
      const savedId = editingId ?? (data as PartnerRow).id;

      // 증거자료: 거래처를 저장한 다음 올리거나 지운다
      if (evidenceFile) {
        const formData = new FormData();
        formData.append("image", evidenceFile);
        const up = await apiFetch(`/api/partners/${savedId}/evidence`, {
          method: "POST",
          body: formData,
        });
        if (!up.ok) {
          // 거래처는 저장됐으니 수정 화면으로 이어서 다시 올릴 수 있게 한다
          setEditingId(savedId);
          setEvidenceUrl(null);
          await loadPartners();
          throw new Error(
            `거래처는 저장했지만 증거자료를 올리지 못했습니다. ${messageOf(
              await up.json().catch(() => null),
              "",
            )}`.trim(),
          );
        }
      } else if (evidenceRemoved && editingId != null) {
        await apiFetch(`/api/partners/${savedId}/evidence`, {
          method: "DELETE",
        });
      }
      resetForm();
      await loadPartners();
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm("이 거래처를 삭제하시겠습니까?")) return;
    setListError("");
    try {
      const res = await apiFetch(`/api/partners/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = (await res.json()) as { message?: string };
        throw new Error(data.message || "삭제에 실패했습니다.");
      }
      if (editingId === id) resetForm();
      await loadPartners();
    } catch (err) {
      setListError(err instanceof Error ? err.message : "삭제에 실패했습니다.");
    }
  };

  const handleAddressSearch = async () => {
    setSearchingAddress(true);
    try {
      await openDaumPostcode((address) => {
        setForm((current) => ({
          ...current,
          address,
          addressDetail: "",
        }));
      });
    } catch {
      window.alert(
        "주소 검색을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.",
      );
    } finally {
      setSearchingAddress(false);
    }
  };

  const submitLabel = saving
    ? "저장 중..."
    : editingId != null
      ? "수정 저장"
      : "등록";

  const emptyMessage = searchQuery
    ? "검색어가 포함된 거래처가 없습니다."
    : "등록된 거래처가 없습니다.";

  const actionButtons = (row: PartnerRow) => (
    <div className="flex shrink-0 gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={(event) => {
          event.stopPropagation();
          startEdit(row);
        }}
      >
        수정
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={(event) => {
          event.stopPropagation();
          void handleDelete(row.id);
        }}
      >
        삭제
      </Button>
    </div>
  );

  /** 관리자 테이블 열 (재고/상품 테이블과 같은 Table 컴포넌트) */
  const columns: TableColumn<PartnerRow>[] = [
    {
      key: "name",
      header: "거래처명",
      className: "w-[22%] font-semibold",
    },
    {
      key: "category",
      header: "구분",
      className: "w-[72px]",
      render: (row) => row.category || "-",
    },
    {
      key: "subCategory",
      header: "구분2",
      className: "w-[110px]",
      render: (row) => row.subCategory || "-",
    },
    {
      key: "centerName",
      header: "중앙",
      className: "w-[80px]",
      render: (row) => row.centerName || "-",
    },
    {
      key: "contactName",
      header: "담당자",
      className: "w-[110px]",
      render: (row) => row.contactName || "-",
    },
    {
      key: "phone",
      header: "연락처",
      className: "w-[124px]",
      render: (row) => <ContactLines row={row} />,
    },
    {
      key: "address",
      header: "주소",
      className: "break-words",
      render: (row) => joinAddress(row.address, row.addressDetail ?? "") || "-",
    },
    {
      key: "evidence",
      header: "증거자료",
      className: "w-[72px]",
      render: (row) => <EvidenceLink row={row} />,
    },
    {
      key: "action",
      header: "작업",
      className: "w-[112px]",
      render: (row) => actionButtons(row),
    },
  ];

  /** 카드형 한 줄 (회원 목록, 관리자 좁은 화면) */
  const renderPartnerCard = (row: PartnerRow) => (
    <div className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 text-[13px] text-[#1A202C]">
        <p className="flex flex-wrap items-center gap-1.5 font-semibold">
          <span>{row.name}</span>
          {row.category || row.subCategory ? (
            <span className="rounded bg-[#EDF2F7] px-1.5 py-0.5 text-[10.5px] font-bold text-[#718096]">
              {[row.category, row.subCategory].filter(Boolean).join(" · ")}
            </span>
          ) : null}
        </p>
        <p className="text-[#64748B]">
          {[
            row.contactName || "-",
            row.mobile ? `휴대폰 ${row.mobile}` : null,
            row.phone ? `유선 ${row.phone}` : null,
            row.centerName ? `중앙 ${row.centerName}` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <p className="mt-0.5 break-words text-[#64748B]">
          {joinAddress(row.address, row.addressDetail ?? "")}
        </p>
        {row.email ? <p className="text-[#64748B]">{row.email}</p> : null}
        {row.evidenceImageUrl ? (
          <div className="mt-1">
            <EvidenceLink row={row} withLabel />
          </div>
        ) : null}
      </div>
      {actionButtons(row)}
    </div>
  );

  /** 등록·수정 입력칸 (회원: 카드 안 인라인, 관리자: bottom sheet 안) */
  const formFields = (
    <>
      <label className={labelClass}>거래처명 *</label>
      <input
        className={inputClass}
        value={form.name}
        onChange={(e) => {
          // 영문 상태로 친 글자는 완성된 글자일 때 한글로 (KFC 같은 영문 이름은 그대로)
          const name = hangulInputValue(e, { syllablesOnly: true });
          setForm((c) => ({ ...c, name }));
        }}
        required
      />
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelClass}>구분</label>
          <input
            className={inputClass}
            list="partner-category-options"
            value={form.category}
            onChange={(e) => {
              const category = hangulInputValue(e, { syllablesOnly: true });
              setForm((c) => ({ ...c, category }));
            }}
            placeholder="예: 은행"
          />
        </div>
        <div>
          <label className={labelClass}>구분2</label>
          <input
            className={inputClass}
            list="partner-subcategory-options"
            value={form.subCategory}
            onChange={(e) => {
              const subCategory = hangulInputValue(e, { syllablesOnly: true });
              setForm((c) => ({ ...c, subCategory }));
            }}
            placeholder="예: NH농협은행"
          />
        </div>
      </div>
      <label className={labelClass}>중앙</label>
      <input
        className={inputClass}
        list="partner-center-options"
        value={form.centerName}
        onChange={(e) => {
          const centerName = hangulInputValue(e, { syllablesOnly: true });
          setForm((c) => ({ ...c, centerName }));
        }}
        placeholder="예: 서울5"
      />
      <datalist id="partner-category-options">
        {options.categories.map((value) => (
          <option key={value} value={value} />
        ))}
      </datalist>
      <datalist id="partner-subcategory-options">
        {options.subCategories.map((value) => (
          <option key={value} value={value} />
        ))}
      </datalist>
      <datalist id="partner-center-options">
        {options.centers.map((value) => (
          <option key={value} value={value} />
        ))}
      </datalist>
      <label className={labelClass}>담당자명 *</label>
      <input
        className={inputClass}
        value={form.contactName}
        onChange={(e) => {
          // 담당자 이름: 영문 상태로 친 글자는 바로 한글로
          const contactName = hangulInputValue(e);
          setForm((c) => ({ ...c, contactName }));
        }}
        required
      />
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelClass}>휴대폰</label>
          <input
            className={inputClass}
            type="tel"
            inputMode="numeric"
            maxLength={13}
            value={form.mobile}
            onChange={(e) =>
              setForm((c) => ({
                ...c,
                mobile: formatMobileInput(e.target.value),
              }))
            }
            placeholder="010-0000-0000"
          />
        </div>
        <div>
          <label className={labelClass}>유선전화</label>
          <input
            className={inputClass}
            type="tel"
            inputMode="numeric"
            maxLength={13}
            value={form.phone}
            onChange={(e) =>
              setForm((c) => ({
                ...c,
                phone: formatPhoneInput(e.target.value),
              }))
            }
            placeholder="02-000-0000"
          />
        </div>
      </div>
      <p className="-mt-2 mb-3 text-[11.5px] text-[#94A3B8]">
        휴대폰·유선전화 중 하나는 꼭 입력해 주세요.
      </p>
      <label className={labelClass}>주소 *</label>
      <div className="mb-2 flex gap-2">
        <input
          className={`${inputClass} mb-0`}
          value={form.address}
          readOnly
          required
          placeholder="주소 검색 버튼으로 입력해 주세요"
        />
        <Button
          type="button"
          variant="outline"
          disabled={searchingAddress}
          onClick={() => void handleAddressSearch()}
          className="shrink-0"
        >
          주소검색
        </Button>
      </div>
      <label className={labelClass}>상세주소</label>
      <input
        className={inputClass}
        value={form.addressDetail}
        onChange={(e) => {
          // 완성된 글자일 때만 한글로 (B1, A동 같은 표기는 그대로)
          const addressDetail = hangulInputValue(e, {
            syllablesOnly: true,
          });
          setForm((c) => ({ ...c, addressDetail }));
        }}
        placeholder="동/호수 등"
      />
      <label className={labelClass}>이메일</label>
      <input
        className={inputClass}
        type="email"
        value={form.email}
        onChange={(e) => setForm((c) => ({ ...c, email: e.target.value }))}
        placeholder="선택"
      />
      <label className={labelClass}>거래처 증거자료 (명함·계약서 이미지)</label>
      <div className="mb-3 flex items-center gap-3">
        {evidencePreview || (evidenceUrl && !evidenceRemoved) ? (
          <a
            href={evidencePreview ?? evidenceUrl ?? undefined}
            target="_blank"
            rel="noreferrer"
            className="block shrink-0"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- Blob·로컬 업로드 이미지 */}
            <img
              src={evidencePreview ?? evidenceUrl ?? undefined}
              alt="거래처 증거자료"
              className="size-16 rounded-md border border-[#E2E8F0] object-cover"
            />
          </a>
        ) : (
          <div className="flex size-16 shrink-0 items-center justify-center rounded-md border border-dashed border-[#CBD5E1] text-[#CBD5E1]">
            <ImageIcon className="size-5" strokeWidth={1.5} />
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => evidenceInputRef.current?.click()}
          >
            {evidencePreview || (evidenceUrl && !evidenceRemoved)
              ? "이미지 바꾸기"
              : "이미지 선택"}
          </Button>
          {evidencePreview || (evidenceUrl && !evidenceRemoved) ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setEvidenceFile(null);
                setEvidenceRemoved(true);
              }}
            >
              지우기
            </Button>
          ) : null}
        </div>
        <input
          ref={evidenceInputRef}
          type="file"
          accept={EVIDENCE_ACCEPT}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            if (file.size > EVIDENCE_MAX_BYTES) {
              setError("증거자료 이미지는 10MB 이하로 올려 주세요.");
              return;
            }
            setError("");
            setEvidenceFile(file);
            setEvidenceRemoved(false);
          }}
        />
      </div>
      {error ? <p className="mb-3 text-[13px] text-red-600">{error}</p> : null}
    </>
  );

  return (
    <div className="space-y-4">
      {sharedCatalog && title ? (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-ink min-[1040px]:text-[22px]">
              {title}
            </h3>
            {description ? (
              <p className="mt-1 text-[13px] text-muted-foreground">
                {description}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-wrap justify-end gap-2">
            <Button type="button" onClick={openCreateForm}>
              거래처 등록
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setBulkNotice("");
                setBulkOpen(true);
              }}
            >
              <Upload className="size-3.5" strokeWidth={2} />
              거래처 일괄 등록
            </Button>
          </div>
        </div>
      ) : null}

      {sharedCatalog ? (
        <PartnerExcelUploadDialog
          open={bulkOpen}
          onClose={() => setBulkOpen(false)}
          onUploaded={(saved) => {
            setBulkNotice(`거래처 ${saved.toLocaleString()}건을 일괄 등록했습니다.`);
            void loadPartners();
          }}
        />
      ) : null}
      {bulkNotice ? (
        <p className="rounded-lg border border-[#C6F6D5] bg-[#F0FFF4] px-3.5 py-2.5 text-[13px] text-[#2F855A]">
          {bulkNotice}
        </p>
      ) : null}

      {sharedCatalog ? (
        <BottomSheet
          open={sheetOpen}
          title={editingId != null ? "거래처 수정" : "거래처 등록"}
          subtitle={editingId != null ? form.name : undefined}
          onClose={closeSheet}
          footer={
            <div className="mx-auto flex max-w-[720px] justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={closeSheet}
              >
                취소
              </Button>
              <Button type="submit" form={PARTNER_FORM_ID} disabled={saving}>
                {submitLabel}
              </Button>
            </div>
          }
        >
          <form
            id={PARTNER_FORM_ID}
            onSubmit={handleSubmit}
            className="mx-auto max-w-[720px] px-5 pb-6 pt-1"
          >
            {formFields}
          </form>
        </BottomSheet>
      ) : (
        <form
          id={PARTNER_FORM_ID}
          onSubmit={handleSubmit}
          className="rounded-xl border border-[#E2E8F0] bg-white p-4"
        >
          <h4 className="mb-3 text-[15px] font-semibold text-[#1A202C]">
            {editingId != null ? "거래처 수정" : "거래처 등록"}
          </h4>
          {formFields}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={saving}>
              {submitLabel}
            </Button>
            {editingId != null ? (
              <Button type="button" variant="outline" onClick={resetForm}>
                취소
              </Button>
            ) : null}
          </div>
        </form>
      )}

      {sharedCatalog ? (
        <>
          {/* 검색·줄 수 (재고/상품과 같은 카드) */}
          <section
            ref={listTopRef}
            className="scroll-mt-4 rounded-lg border border-line bg-panel p-3.5"
          >
            <input
              className={`${inputClass} mb-0`}
              aria-label="거래처 검색"
              value={listFilter}
              onChange={(e) =>
                setListFilter(hangulInputValue(e, { syllablesOnly: true }))
              }
              placeholder="거래처명·담당자·주소·중앙으로 검색"
            />
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              {loading ? (
                <Skeleton className="h-3 w-20" />
              ) : (
                <p className="text-xs text-[#64748b]">
                  총 {total.toLocaleString()}건
                </p>
              )}
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-[#64748b]">
                  거래처보기
                </span>
                <div className="w-[96px]">
                  <Dropdown
                    aria-label="거래처보기"
                    options={PAGE_SIZE_OPTIONS}
                    value={String(pageSize)}
                    onChange={(value) => {
                      setPageSize(Number(value));
                      setPage(1);
                    }}
                  />
                </div>
              </div>
            </div>
          </section>

          {listError ? (
            <p className="rounded-lg border border-line bg-panel p-3.5 text-[13px] text-red-600">
              {listError}
            </p>
          ) : null}

          {/* 좁은 화면: 카드 목록 */}
          <div className="space-y-2.5 min-[1040px]:hidden">
            {loading ? (
              Array.from({ length: 4 }, (_, index) => (
                <div
                  key={index}
                  className="space-y-2 rounded-xl border border-line bg-white p-3.5"
                >
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-1/2" />
                  <Skeleton className="h-3 w-full" />
                </div>
              ))
            ) : partners.length === 0 ? (
              <p className="rounded-xl border border-line bg-white px-3.5 py-6 text-center text-sm text-muted-foreground">
                {emptyMessage}
              </p>
            ) : (
              partners.map((row) => (
                <div
                  key={row.id}
                  className="rounded-xl border border-line bg-white px-3.5"
                >
                  {renderPartnerCard(row)}
                </div>
              ))
            )}
          </div>

          {/* 넓은 화면: 테이블 */}
          <section className="hidden min-w-0 rounded-lg border border-line bg-panel p-3.5 min-[1040px]:block">
            {loading ? (
              <TableSkeleton
                rows={Math.min(pageSize, 12)}
                columns={9}
                className="border-0"
              />
            ) : (
              <Table
                caption="거래처 목록"
                columns={columns}
                data={partners}
                emptyMessage={emptyMessage}
                onRowClick={(row) => startEdit(row)}
                getRowClassName={() => "cursor-pointer hover:bg-[#f8fafc]"}
              />
            )}
          </section>

          {total > 0 ? (
            <div className="flex justify-center">
              <Pagination
                page={page}
                totalPages={totalPages}
                onPageChange={changePage}
              />
            </div>
          ) : null}
        </>
      ) : (
        <div className="rounded-xl border border-[#E2E8F0] bg-white p-4">
          <h4 className="mb-3 text-[15px] font-semibold text-[#1A202C]">
            등록된 거래처
          </h4>
          {listError ? (
            <p className="mb-3 text-[13px] text-red-600">{listError}</p>
          ) : null}
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }, (_, index) => (
                <div key={index} className="space-y-2 py-1">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              ))}
            </div>
          ) : partners.length === 0 ? (
            <p className="text-[13px] text-[#64748B]">
              등록된 거래처가 없습니다.
            </p>
          ) : (
            <ul className="divide-y divide-[#E2E8F0]">
              {partners.map((row) => (
                <li key={row.id}>{renderPartnerCard(row)}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
