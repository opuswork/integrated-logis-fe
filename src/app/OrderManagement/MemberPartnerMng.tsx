"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { openDaumPostcode } from "@/lib/daum-postcode";

export type PartnerRow = {
  id: number;
  name: string;
  contactName: string;
  phone: string;
  address: string;
  email: string | null;
};

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

function formatPhoneInput(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

function joinAddress(address: string, detail: string) {
  return [address.trim(), detail.trim()].filter(Boolean).join(" ");
}

const labelClass = "mb-[5px] block text-[12px] font-bold text-[#64748B]";
const inputClass =
  "mb-3 w-full rounded-lg border border-[#E2E8F0] bg-white px-[11px] py-[9px] text-[13px] text-[#1A202C] disabled:bg-[#EDF2F7]";

export function MemberPartnerMng() {
  const [partners, setPartners] = useState<PartnerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<PartnerForm>(EMPTY_FORM);
  const [searchingAddress, setSearchingAddress] = useState(false);

  const loadPartners = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "거래처 목록을 불러오지 못했습니다.");
      setPartners([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPartners();
  }, [loadPartners]);

  const resetForm = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError("");
  };

  const startEdit = (row: PartnerRow) => {
    setEditingId(row.id);
    setForm({
      name: row.name,
      contactName: row.contactName,
      phone: formatPhoneInput(row.phone),
      address: row.address,
      addressDetail: "",
      email: row.email ?? "",
    });
    setError("");
  };

  const validate = (): string | null => {
    if (!form.name.trim()) return "거래처명을 입력해 주세요.";
    if (!form.contactName.trim()) return "담당자명을 입력해 주세요.";
    if (!form.phone.trim()) return "연락처를 입력해 주세요.";
    if (!form.address.trim()) return "주소를 입력해 주세요.";
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
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
      address: joinAddress(form.address, form.addressDetail),
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
    setError("");
    try {
      const res = await apiFetch(`/api/partners/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = (await res.json()) as { message?: string };
        throw new Error(data.message || "삭제에 실패했습니다.");
      }
      if (editingId === id) resetForm();
      await loadPartners();
    } catch (err) {
      setError(err instanceof Error ? err.message : "삭제에 실패했습니다.");
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
      window.alert("주소 검색을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setSearchingAddress(false);
    }
  };

  return (
    <div className="space-y-4">
      <form
        onSubmit={handleSubmit}
        className="rounded-xl border border-[#E2E8F0] bg-white p-4"
      >
        <h4 className="mb-3 text-[15px] font-semibold text-[#1A202C]">
          {editingId != null ? "거래처 수정" : "거래처 등록"}
        </h4>
        <label className={labelClass}>거래처명 *</label>
        <input
          className={inputClass}
          value={form.name}
          onChange={(e) => setForm((c) => ({ ...c, name: e.target.value }))}
          required
        />
        <label className={labelClass}>담당자명 *</label>
        <input
          className={inputClass}
          value={form.contactName}
          onChange={(e) =>
            setForm((c) => ({ ...c, contactName: e.target.value }))
          }
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
          onChange={(e) =>
            setForm((c) => ({ ...c, addressDetail: e.target.value }))
          }
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
        {error ? (
          <p className="mb-3 text-[13px] text-red-600">{error}</p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={saving}>
            {saving ? "저장 중..." : editingId != null ? "수정 저장" : "등록"}
          </Button>
          {editingId != null ? (
            <Button type="button" variant="outline" onClick={resetForm}>
              취소
            </Button>
          ) : null}
        </div>
      </form>

      <div className="rounded-xl border border-[#E2E8F0] bg-white p-4">
        <h4 className="mb-3 text-[15px] font-semibold text-[#1A202C]">
          등록된 거래처
        </h4>
        {loading ? (
          <p className="text-[13px] text-[#64748B]">불러오는 중...</p>
        ) : partners.length === 0 ? (
          <p className="text-[13px] text-[#64748B]">등록된 거래처가 없습니다.</p>
        ) : (
          <ul className="divide-y divide-[#E2E8F0]">
            {partners.map((row) => (
              <li
                key={row.id}
                className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="min-w-0 text-[13px] text-[#1A202C]">
                  <p className="font-semibold">{row.name}</p>
                  <p className="text-[#64748B]">
                    {row.contactName} · {row.phone}
                  </p>
                  <p className="mt-0.5 break-words text-[#64748B]">
                    {row.address}
                  </p>
                  {row.email ? (
                    <p className="text-[#64748B]">{row.email}</p>
                  ) : null}
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => startEdit(row)}
                  >
                    수정
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void handleDelete(row.id)}
                  >
                    삭제
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
