import { hasLatinLetters, qwertyToHangul } from "@/lib/hangul-typing";

type DaumPostcodeData = {
  address: string;
  roadAddress: string;
  jibunAddress: string;
  userSelectedType: "R" | "J";
  buildingName?: string;
};

type DaumPostcodeInstance = {
  open: () => void;
  /** q: 처음부터 이 검색어로 검색한 화면을 띄운다 */
  embed: (element: HTMLElement, options?: { q?: string }) => void;
};

declare global {
  interface Window {
    daum?: {
      Postcode: new (options: {
        oncomplete: (data: DaumPostcodeData) => void;
        onresize?: (size: { width: number; height: number }) => void;
        width?: string;
        height?: string;
        animation?: boolean;
        /** false: 열릴 때 카카오 검색칸에 커서를 두지 않는다 */
        focusInput?: boolean;
      }) => DaumPostcodeInstance;
    };
  }
}

/** 카카오 우편번호 화면 맨 위 검색칸 높이(px). 이만큼 잘라 숨긴다 */
const KAKAO_SEARCH_BAR_HEIGHT = 52;

let scriptPromise: Promise<void> | null = null;
let activeOverlay: HTMLElement | null = null;

function loadDaumPostcodeScript() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Daum Postcode is only available in the browser."));
  }

  if (window.daum?.Postcode) {
    return Promise.resolve();
  }

  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src =
        "https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js";
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () =>
        reject(new Error("Daum 우편번호 서비스를 불러오지 못했습니다."));
      document.head.appendChild(script);
    });
  }

  return scriptPromise;
}

function formatAddress(data: DaumPostcodeData) {
  const base =
    data.userSelectedType === "R" ? data.roadAddress : data.jibunAddress;
  const extra = data.buildingName ? ` ${data.buildingName}` : "";
  return `${base}${extra}`.trim();
}

function closeActiveOverlay() {
  activeOverlay?.remove();
  activeOverlay = null;
}

export async function openDaumPostcode(onComplete: (address: string) => void) {
  await loadDaumPostcodeScript();
  closeActiveOverlay();

  const overlay = document.createElement("div");
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-labelledby", "daum-postcode-title");
  overlay.className =
    "fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4";

  const panel = document.createElement("div");
  panel.className =
    "flex max-h-[90vh] w-full max-w-[520px] flex-col overflow-hidden rounded-xl border border-[#d8e0ea] bg-white p-5 shadow-[0_14px_34px_rgba(18,38,63,0.08)]";

  const header = document.createElement("div");
  header.className = "mb-3 flex items-start justify-between gap-3";

  const title = document.createElement("h2");
  title.id = "daum-postcode-title";
  title.className = "text-lg font-semibold text-[#17202a]";
  title.textContent = "주소 검색";

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.setAttribute("aria-label", "닫기");
  closeButton.className =
    "shrink-0 rounded-[7px] border border-[#cbd5e1] bg-white px-2.5 py-1 text-sm text-[#64748b]";
  closeButton.textContent = "닫기";

  /*
   * 카카오 검색칸은 iframe(다른 사이트) 안이라 글자를 바꿀 수 없다.
   * 그래서 위에 우리 검색칸을 두고, 영문 상태로 친 글자를 바로 한글로 바꾼 뒤
   * Enter/검색 때 카카오 검색을 그 검색어(q)로 다시 띄운다.
   */
  const searchForm = document.createElement("form");
  searchForm.className = "mb-3 flex gap-2";
  const searchInput = document.createElement("input");
  searchInput.type = "search";
  searchInput.setAttribute("aria-label", "주소 검색어");
  searchInput.placeholder = "도로명, 건물명, 지번 입력";
  searchInput.autocomplete = "off";
  searchInput.className =
    "min-w-0 flex-1 rounded-lg border border-[#cbd5e1] bg-white px-3 py-2 text-[15px] text-[#17202a] placeholder:text-[#94a3b8] focus:border-[#2563eb] focus:outline-none focus:ring-2 focus:ring-[#2563eb]/20";
  const searchButton = document.createElement("button");
  searchButton.type = "submit";
  searchButton.className =
    "shrink-0 rounded-lg bg-[#1e293b] px-4 py-2 text-sm font-bold text-white";
  searchButton.textContent = "검색";
  searchForm.append(searchInput, searchButton);

  searchInput.addEventListener("input", (event) => {
    const raw = searchInput.value;
    if ((event as InputEvent).isComposing || !hasLatinLetters(raw)) {
      return;
    }
    const caret = searchInput.selectionStart ?? raw.length;
    const converted = qwertyToHangul(raw);
    if (converted === raw) return;
    const nextCaret = qwertyToHangul(raw.slice(0, caret)).length;
    searchInput.value = converted;
    searchInput.setSelectionRange(nextCaret, nextCaret);
  });

  /*
   * 카카오 검색칸은 숨기는 옵션이 없어서, 카카오 화면을 검색칸 높이만큼 위로 올리고
   * 바깥 상자에서 잘라 낸다 (검색은 위의 우리 검색칸으로 한다).
   */
  const clip = document.createElement("div");
  clip.className = "min-h-[340px] w-full overflow-hidden rounded-lg bg-white";
  clip.style.height = "min(380px, 70vh)";
  const frame = document.createElement("div");
  frame.className = "w-full";
  frame.style.marginTop = `-${KAKAO_SEARCH_BAR_HEIGHT}px`;
  frame.style.height = `calc(100% + ${KAKAO_SEARCH_BAR_HEIGHT}px)`;
  clip.append(frame);

  header.append(title, closeButton);
  panel.append(header, searchForm, clip);
  overlay.append(panel);
  document.body.append(overlay);
  activeOverlay = overlay;

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      cleanup();
    }
  };

  const cleanup = () => {
    document.removeEventListener("keydown", handleKeyDown);
    if (activeOverlay === overlay) {
      closeActiveOverlay();
    } else {
      overlay.remove();
    }
  };

  closeButton.addEventListener("click", cleanup);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) {
      cleanup();
    }
  });
  document.addEventListener("keydown", handleKeyDown);

  const mountPostcode = (query?: string) => {
    frame.replaceChildren();
    new window.daum!.Postcode({
      oncomplete(data) {
        onComplete(formatAddress(data));
        cleanup();
      },
      onresize(size) {
        if (size.height > 0) {
          clip.style.height = `${Math.min(
            size.height - KAKAO_SEARCH_BAR_HEIGHT,
            window.innerHeight * 0.7,
          )}px`;
        }
      },
      width: "100%",
      height: "100%",
      animation: false,
      focusInput: false,
    }).embed(frame, query ? { q: query } : undefined);
  };

  searchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const query = qwertyToHangul(searchInput.value).trim();
    searchInput.value = query;
    if (query) mountPostcode(query);
  });

  mountPostcode();
  searchInput.focus();
}
