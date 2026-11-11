"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";

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
  phone: string | null;
  address: string;
  /** 상세주소 (층·호수·건물명) */
  addressDetail?: string | null;
  email: string | null;
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
  contactName: string;
  phone: string;
  address: string;
  addressDetail: string;
  email: string;
};

const EMPTY_FORM: PartnerForm = {
  name: "",
  contactName: "",
  phone: "",
  address: "",
  addressDetail: "",
  email: "",
};

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
    setError("");
    setSheetOpen(true);
  };

  const startEdit = (row: PartnerRow) => {
    setEditingId(row.id);
    setForm({
      name: row.name,
      contactName: row.contactName,
      phone: formatPhoneInput(row.phone ?? ""),
      address: row.address,
      addressDetail: row.addressDetail ?? "",
      email: row.email ?? "",
    });
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
    if (!form.phone.trim()) return "연락처를 입력해 주세요.";
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
      contactName: form.contactName.trim(),
      phone: form.phone.trim(),
      address: form.address.trim(),
      addressDetail: form.addressDetail.trim() || null,
      email: form.email.trim() || null,
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
      if (!res.ok) {
        throw new Error(
          typeof data === "object" && data && "message" in data && data.message
            ? String(data.message)
            : "저장에 실패했습니다.",
        );
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
      className: "w-[120px]",
      render: (row) => row.phone || "-",
    },
    {
      key: "address",
      header: "주소",
      className: "break-words",
      render: (row) => joinAddress(row.address, row.addressDetail ?? "") || "-",
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
          {row.contactName || "-"} · {row.phone || "-"}
          {row.centerName ? ` · 중앙 ${row.centerName}` : ""}
        </p>
        <p className="mt-0.5 break-words text-[#64748B]">
          {joinAddress(row.address, row.addressDetail ?? "")}
        </p>
        {row.email ? <p className="text-[#64748B]">{row.email}</p> : null}
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
      <label className={labelClass}>연락처 *</label>
      <input
        className={inputClass}
        inputMode="numeric"
        maxLength={13}
        value={form.phone}
        onChange={(e) =>
          setForm((c) => ({
            ...c,
            phone: formatPhoneInput(e.target.value),
          }))
        }
        required
      />
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
          <Button type="button" className="shrink-0" onClick={openCreateForm}>
            거래처 등록
          </Button>
        </div>
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
                columns={7}
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
