"use client";

import { useEffect, useRef, useState } from "react";

import { apiFetch } from "@/lib/api";

/** 고객사(거래처) 검색 결과 한 건 */
export type PartnerHit = {
  id: number;
  name: string;
  phone: string | null;
  address: string;
  category?: string | null;
  subCategory?: string | null;
};

/** 고객사를 골랐을 때 배송정보 칸에 넣을 값 */
export type PartnerFill = {
  name: string;
  address: string;
  addressDetail: string;
  phone: string;
};

/**
 * 거래처 주소 문자열을 주소 / 상세주소로 나눈다.
 * 도로명 주소의 건물번호("…로 123", "…길 45-6")까지를 주소로, 나머지를 상세주소로 본다.
 * 예: "강원 강릉시 강릉대로419번길 42 동인병원" → ["강원 강릉시 강릉대로419번길 42", "동인병원"]
 */
export function splitPartnerAddress(raw: string): [string, string] {
  const text = raw.replace(/\s+/g, " ").trim();
  const match = text.match(/^(.*?(?:로|길)\s?\d+(?:-\d+)?)(?=\s|$)\s*(.*)$/);
  if (!match) return [text, ""];
  return [match[1].trim(), match[2].trim()];
}

/** "033-641-3811", "1566-2210/콜센터:1566-2210" 같은 값에서 전화번호 하나를 뽑는다 */
export function pickPartnerPhone(raw: string | null | undefined): string {
  if (!raw) return "";
  const match = raw.match(/\d{2,4}-\d{3,4}-\d{4}|\d{4}-\d{4}/);
  if (match) return match[0];
  const digits = raw.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

/**
 * 거래처명으로 고객사를 찾아 고르는 입력칸.
 * 고르면 주소·상세주소·연락처를 onSelect 로 넘긴다.
 */
export function PartnerSearch({
  id,
  onSelect,
}: {
  id: string;
  onSelect: (fill: PartnerFill) => void;
}) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<PartnerHit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [picked, setPicked] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = query.trim();
    // 2글자 미만이거나 방금 고른 이름이면 검색하지 않는다 (목록은 showList 로 숨김)
    if (q.length < 2 || q === picked) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const res = await apiFetch(`/api/partners?q=${encodeURIComponent(q)}`);
        const data = (await res.json()) as PartnerHit[] | { message?: string };
        if (!cancelled) setHits(res.ok && Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) setHits([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, picked]);

  // 바깥을 누르면 목록을 닫는다
  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const choose = (hit: PartnerHit) => {
    const [address, addressDetail] = splitPartnerAddress(hit.address);
    onSelect({
      name: hit.name,
      address,
      addressDetail,
      phone: pickPartnerPhone(hit.phone),
    });
    setPicked(hit.name);
    setQuery(hit.name);
    setHits([]);
    setOpen(false);
  };

  const q = query.trim();
  const showList = open && q.length >= 2 && q !== picked;

  return (
    <div ref={boxRef} className="jy-partner-search">
      <label className="jy-label" htmlFor={id}>
        고객사 검색
      </label>
      <input
        id={id}
        className="jy-input"
        value={query}
        autoComplete="off"
        role="combobox"
        aria-expanded={showList}
        aria-controls={`${id}-list`}
        onChange={(event) => {
          setQuery(event.target.value);
          setPicked("");
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
          if (event.key === "Enter" && showList && hits.length > 0) {
            event.preventDefault();
            choose(hits[0]);
          }
        }}
        placeholder="거래처명으로 검색 (2글자 이상)"
      />
      {showList ? (
        <ul id={`${id}-list`} className="jy-partner-list" role="listbox">
          {loading ? (
            <li className="jy-partner-empty">검색 중…</li>
          ) : hits.length === 0 ? (
            <li className="jy-partner-empty">검색된 고객사가 없어요.</li>
          ) : (
            hits.map((hit) => (
              <li key={hit.id} role="option" aria-selected={false}>
                <button
                  type="button"
                  className="jy-partner-item"
                  onClick={() => choose(hit)}
                >
                  <span className="jy-partner-name">{hit.name}</span>
                  <span className="jy-partner-sub">
                    {[hit.address, hit.phone].filter(Boolean).join(" · ")}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
      <p className="jy-hint" style={{ marginTop: 4 }}>
        고르면 주소·상세주소·받는 분 연락처가 채워져요.
      </p>
    </div>
  );
}
