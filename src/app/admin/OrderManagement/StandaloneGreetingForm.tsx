"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Dropdown } from "@/components/ui/dropdown";
import { Input } from "@/components/ui/input";
import {
  GreetingNumberChipPicker,
  GREETING_CATALOG_NUMBERS,
} from "@/components/greeting-number-picker";
import { apiFetch } from "@/lib/api";
import { getAuthUser } from "@/lib/auth";
import { cn } from "@/lib/utils";

const GREETING_SIZES = ["8칸", "6칸", "4칸", "자체"] as const;
const GREETING_RECEIVE_PLACES = [
  "공장작업",
  "소사매장",
  "덕소매장",
  "남부매장",
  "방문",
] as const;

type ChurchOption = {
  id: number;
  name: string;
  region: string;
  branchCode: string | null;
  assigner: string;
};

function formatPhoneInput(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) {
    return digits;
  }
  if (digits.length <= 7) {
    return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  }
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

function ChoiceGrid({
  label,
  items,
  value,
  onChange,
}: {
  label: string;
  items: readonly string[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="mt-2.5">
      <label className="mb-1.5 block text-2xl font-bold text-ink">{label}</label>
      <div
        className="grid overflow-hidden rounded-[7px] border border-line"
        style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
      >
        {items.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => onChange(item)}
            className={cn(
              "border-r border-line px-1 py-2 text-center text-xs font-bold last:border-r-0",
              value === item
                ? "bg-[#e9f1ff] text-brand"
                : "bg-white text-ink hover:bg-soft",
            )}
          >
            {item}
          </button>
        ))}
      </div>
    </div>
  );
}

function ChurchSearchField({
  churches,
  isLoading,
  query,
  selectedId,
  onQueryChange,
  onSelect,
}: {
  churches: ChurchOption[];
  isLoading: boolean;
  query: string;
  selectedId: number | null;
  onQueryChange: (value: string) => void;
  onSelect: (church: ChurchOption) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) {
      return churches.slice(0, 20);
    }
    return churches
      .filter((church) => {
        const haystack = [
          church.name,
          church.region,
          church.branchCode ?? "",
          church.assigner,
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(keyword);
      })
      .slice(0, 30);
  }, [churches, query]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  return (
    <div ref={containerRef} className="relative w-full">
      <label
        htmlFor="standalone-greeting-church"
        className="mb-1.5 block text-2xl font-bold text-ink"
      >
        중앙 *
      </label>
      <input
        id="standalone-greeting-church"
        type="text"
        role="combobox"
        aria-expanded={isOpen}
        aria-controls="standalone-greeting-church-suggestions"
        aria-autocomplete="list"
        value={query}
        onChange={(event) => {
          onQueryChange(event.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        placeholder="예: 5, 서울, 원주"
        autoComplete="off"
        required
        className={cn(
          "min-h-9 w-full rounded-[7px] border border-[#cbd5e1] bg-white px-2.5 py-2 text-lg text-ink",
          "placeholder:text-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20",
        )}
      />
      {isOpen ? (
        <ul
          id="standalone-greeting-church-suggestions"
          role="listbox"
          className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-[7px] border border-line bg-white shadow-lg"
        >
          {isLoading ? (
            <li className="px-3 py-2.5 text-sm text-[#64748b]">
              중앙 목록 불러오는 중...
            </li>
          ) : filtered.length === 0 ? (
            <li className="px-3 py-2.5 text-sm text-[#64748b]">검색 결과가 없습니다.</li>
          ) : (
            filtered.map((church) => {
              const selected = selectedId === church.id;
              return (
                <li key={church.id} role="option" aria-selected={selected}>
                  <button
                    type="button"
                    className={cn(
                      "flex w-full flex-col items-start gap-0.5 px-3 py-2.5 text-left hover:bg-[#eff6ff]",
                      selected ? "bg-[#eff6ff]" : "bg-white",
                    )}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      onSelect(church);
                      setIsOpen(false);
                    }}
                  >
                    <span className="text-sm font-semibold text-ink">{church.name}</span>
                    <span className="text-xs text-[#64748b]">
                      {church.region}
                      {church.branchCode ? ` · ${church.branchCode}` : ""}
                      {church.assigner ? ` · ${church.assigner}` : ""}
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      ) : null}
      {selectedId ? (
        <p className="mt-1 text-xs text-green">중앙이 선택되었습니다.</p>
      ) : (
        <p className="mt-1 text-xs text-[#64748b]">
          키워드를 입력해 중앙을 검색한 뒤 목록에서 선택해 주세요.
        </p>
      )}
    </div>
  );
}

export function StandaloneGreetingForm({
  onCancel,
  onSubmitted,
}: {
  onCancel: () => void;
  onSubmitted: () => void;
}) {
  const [ordererName, setOrdererName] = useState("");
  const [phone, setPhone] = useState("");
  const [churchQuery, setChurchQuery] = useState("");
  const [churchId, setChurchId] = useState<number | null>(null);
  const [churches, setChurches] = useState<ChurchOption[]>([]);
  const [isChurchesLoading, setIsChurchesLoading] = useState(true);
  const [greetingNumber, setGreetingNumber] = useState<
    (typeof GREETING_CATALOG_NUMBERS)[number] | ""
  >("1");
  const [includeSelf, setIncludeSelf] = useState(false);
  const [businessCardIncluded, setBusinessCardIncluded] = useState(false);
  const [greetingSize, setGreetingSize] = useState("");
  const [content, setContent] = useState("");
  const [quantity, setQuantity] = useState("");
  const [receivePlace, setReceivePlace] = useState("");
  const [specialNote, setSpecialNote] = useState("");
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [resultOpen, setResultOpen] = useState(false);
  const [resultSuccess, setResultSuccess] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const loadChurches = async () => {
      setIsChurchesLoading(true);
      try {
        const response = await apiFetch("/api/churches");
        const data = (await response.json()) as
          | ChurchOption[]
          | { message?: string };
        if (!response.ok || !Array.isArray(data) || cancelled) {
          return;
        }
        setChurches(data);
      } catch {
        // Leave empty; user will see no results until retry.
      } finally {
        if (!cancelled) {
          setIsChurchesLoading(false);
        }
      }
    };
    void loadChurches();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedChurchName =
    churches.find((church) => church.id === churchId)?.name ?? churchQuery;

  const validate = () => {
    if (!ordererName.trim()) {
      return "성명을 입력해 주세요.";
    }
    if (!phone.trim()) {
      return "연락처를 입력해 주세요.";
    }
    if (!churchId) {
      return "중앙을 검색한 뒤 목록에서 선택해 주세요.";
    }
    const hasCatalog = GREETING_CATALOG_NUMBERS.includes(
      greetingNumber as (typeof GREETING_CATALOG_NUMBERS)[number],
    );
    if (!hasCatalog && !includeSelf && !businessCardIncluded) {
      return "인사장번호, 자체, 명함 중 하나 이상을 선택해 주세요.";
    }
    if (hasCatalog && !content.trim()) {
      return "인사장내용을 입력해 주세요.";
    }
    if (!quantity.trim()) {
      return "수량을 입력해 주세요.";
    }
    if (!greetingSize) {
      return "크기를 선택해 주세요.";
    }
    if (!receivePlace.trim()) {
      return "받을 곳을 선택해 주세요.";
    }
    return "";
  };

  const handleSubmit = async () => {
    const error = validate();
    setFormError(error);
    if (error || isSaving) {
      if (error) {
        setResultSuccess(false);
        setResultOpen(true);
      }
      return;
    }

    setIsSaving(true);
    try {
      const auth = getAuthUser();
      const formData = new FormData();
      formData.append("greetingNumber", greetingNumber);
      formData.append("includeSelf", String(includeSelf));
      formData.append(
        "businessCard",
        businessCardIncluded ? "동봉" : "미동봉",
      );
      formData.append("content", content.trim());
      formData.append("quantity", quantity.trim());
      formData.append("size", greetingSize);
      formData.append("receivePlace", receivePlace.trim());
      formData.append("linkedToOrder", "false");
      formData.append("submitted", "true");
      formData.append("ordererName", ordererName.trim());
      formData.append("churchName", selectedChurchName.trim());
      formData.append("phone", phone.trim());
      if (specialNote.trim()) {
        formData.append("specialNote", specialNote.trim());
      }
      if (auth?.id) {
        formData.append("userId", String(auth.id));
      }

      const response = await apiFetch("/api/greeting-forms", {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          message?: string | string[];
        } | null;
        const message = Array.isArray(payload?.message)
          ? payload.message.join(", ")
          : payload?.message;
        throw new Error(message || "인사장 접수에 실패하였습니다.");
      }

      setFormError("");
      setResultSuccess(true);
      setResultOpen(true);
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "인사장 접수에 실패하였습니다.",
      );
      setResultSuccess(false);
      setResultOpen(true);
    } finally {
      setIsSaving(false);
    }
  };

  const closeResult = () => {
    setResultOpen(false);
    if (resultSuccess) {
      onSubmitted();
    }
  };

  return (
    <section className="min-w-0 rounded-lg border border-line bg-panel p-3.5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-base font-semibold text-ink">인사장만 의뢰</h4>
        <Button type="button" variant="outline" onClick={onCancel}>
          목록으로
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-2.5 min-[900px]:grid-cols-3">
        <Input
          label="성명 *"
          value={ordererName}
          onChange={(event) => setOrdererName(event.target.value)}
          placeholder="주문자 성명"
          required
        />
        <Input
          label="연락처 *"
          value={phone}
          onChange={(event) => setPhone(formatPhoneInput(event.target.value))}
          placeholder="010-1234-5678"
          required
        />
        <ChurchSearchField
          churches={churches}
          isLoading={isChurchesLoading}
          query={churchQuery}
          selectedId={churchId}
          onQueryChange={(value) => {
            setChurchQuery(value);
            setChurchId(null);
          }}
          onSelect={(church) => {
            setChurchQuery(church.name);
            setChurchId(church.id);
          }}
        />
      </div>

      <GreetingNumberChipPicker
        name="standalone-greeting-number"
        value={greetingNumber || null}
        onChange={(value) => setGreetingNumber(value ?? "")}
        includeSelf={includeSelf}
        onIncludeSelfChange={setIncludeSelf}
        businessCardIncluded={businessCardIncluded}
        onBusinessCardIncludedChange={setBusinessCardIncluded}
      />

      <div className="mt-2.5 grid grid-cols-1 gap-2.5 min-[900px]:grid-cols-2">
        <Input
          label={
            GREETING_CATALOG_NUMBERS.includes(
              greetingNumber as (typeof GREETING_CATALOG_NUMBERS)[number],
            )
              ? "인사장내용 *"
              : "인사장내용"
          }
          value={content}
          onChange={(event) => setContent(event.target.value)}
          required={GREETING_CATALOG_NUMBERS.includes(
            greetingNumber as (typeof GREETING_CATALOG_NUMBERS)[number],
          )}
        />
        <Input
          label="수량 *"
          type="number"
          min={1}
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
          required
        />
      </div>

      <ChoiceGrid
        label="크기 *"
        items={GREETING_SIZES}
        value={greetingSize}
        onChange={setGreetingSize}
      />

      <div className="mt-2.5">
        <Dropdown
          label="받을 곳 *"
          value={receivePlace}
          options={[
            { value: "", label: "선택하세요" },
            ...GREETING_RECEIVE_PLACES.map((place) => ({
              value: place,
              label: place,
            })),
          ]}
          onChange={setReceivePlace}
          required
        />
      </div>

      <div className="mt-2.5">
        <label className="mb-1.5 block text-2xl font-bold text-ink">특이사항</label>
        <textarea
          value={specialNote}
          onChange={(event) => setSpecialNote(event.target.value)}
          placeholder="특이사항을 입력해 주세요"
          className="min-h-[74px] w-full resize-none rounded-[7px] border border-[#cbd5e1] bg-white px-2.5 py-2 text-lg text-ink placeholder:text-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
        />
      </div>

      {formError ? (
        <p className="mt-2.5 rounded-[7px] border border-red/30 bg-[#fff0ed] px-3 py-2 text-sm text-red">
          {formError}
        </p>
      ) : null}

      <div className="mt-3">
        <Button
          type="button"
          className="border-green bg-green text-white hover:bg-[#128a52]"
          disabled={isSaving}
          onClick={() => {
            void handleSubmit();
          }}
        >
          {isSaving ? "접수 중..." : "인사장만 접수"}
        </Button>
      </div>

      <Dialog
        open={resultOpen}
        title={resultSuccess ? "접수 완료" : "접수 실패"}
        onClose={closeResult}
      >
        <p className="text-sm leading-6 text-ink">
          {resultSuccess
            ? "인사장만 접수가 완료되었습니다."
            : formError || "처리에 실패하였습니다."}
        </p>
        <div className="mt-5 flex justify-end">
          <Button
            type="button"
            className={
              resultSuccess
                ? "border-green bg-green text-white hover:bg-[#128a52]"
                : "border-[#1f2937] bg-[#1f2937] text-white hover:bg-[#111827]"
            }
            onClick={closeResult}
          >
            확인
          </Button>
        </div>
      </Dialog>
    </section>
  );
}
