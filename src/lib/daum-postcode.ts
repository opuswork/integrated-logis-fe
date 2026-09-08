type DaumPostcodeData = {
  address: string;
  roadAddress: string;
  jibunAddress: string;
  userSelectedType: "R" | "J";
  buildingName?: string;
};

type DaumPostcodeInstance = {
  open: () => void;
  embed: (element: HTMLElement) => void;
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
      }) => DaumPostcodeInstance;
    };
  }
}

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

  const frame = document.createElement("div");
  frame.className = "min-h-[380px] w-full overflow-hidden rounded-lg bg-white";
  frame.style.height = "min(420px, 70vh)";

  header.append(title, closeButton);
  panel.append(header, frame);
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

  new window.daum!.Postcode({
    oncomplete(data) {
      onComplete(formatAddress(data));
      cleanup();
    },
    onresize(size) {
      if (size.height > 0) {
        frame.style.height = `${Math.min(size.height, window.innerHeight * 0.7)}px`;
      }
    },
    width: "100%",
    height: "100%",
    animation: false,
  }).embed(frame);
}
