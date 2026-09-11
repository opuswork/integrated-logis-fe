"use client";

import { useEffect, useState } from "react";

export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

let captureStarted = false;

const PWA_INSTALLED_KEY = "sanc-logistics-pwa-installed";

export function capturePwaInstallPrompt() {
  if (typeof window === "undefined" || captureStarted) return;
  captureStarted = true;
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    // 앱을 지우면 이 이벤트가 다시 옴 → 바로가기추가 메뉴 복원
    clearPwaInstalledFlag();
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    markPwaInstalled();
  });
}

export function getDeferredInstallPrompt() {
  return deferredPrompt;
}

export function clearDeferredInstallPrompt() {
  deferredPrompt = null;
  notify();
}

export function subscribePwaInstall(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function markPwaInstalled() {
  if (typeof window === "undefined") return;
  try {
    if (window.localStorage.getItem(PWA_INSTALLED_KEY) === "1") return;
    window.localStorage.setItem(PWA_INSTALLED_KEY, "1");
  } catch {
    /* ignore quota / private mode */
  }
  notify();
}

function clearPwaInstalledFlag() {
  if (typeof window === "undefined") return;
  try {
    if (window.localStorage.getItem(PWA_INSTALLED_KEY) == null) return;
    window.localStorage.removeItem(PWA_INSTALLED_KEY);
  } catch {
    /* ignore */
  }
  notify();
}

export function isStandaloneDisplay() {
  if (typeof window === "undefined") return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  if (nav.standalone) return true;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: minimal-ui)").matches
  );
}

export function isIosDevice() {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  const iOS = /iPad|iPhone|iPod/.test(ua);
  const iPadOs =
    window.navigator.platform === "MacIntel" &&
    window.navigator.maxTouchPoints > 1;
  return iOS || iPadOs;
}

/** 홈 화면에 물류관리 앱이 있으면 true. 지우면 false. */
export function isPwaInstalled() {
  if (isStandaloneDisplay()) return true;
  // iPhone: 아이콘으로 연 앱에서만 숨김. Safari(아이콘 삭제 후 포함)에서는 메뉴 복원
  if (isIosDevice()) return false;
  // Chrome: 설치 가능 창이 다시 뜨면 앱이 없는 상태
  if (getDeferredInstallPrompt()) return false;
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(PWA_INSTALLED_KEY) === "1";
  } catch {
    return false;
  }
}

export function usePwaInstalled() {
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const update = () => {
      if (isStandaloneDisplay()) {
        markPwaInstalled();
      } else if (isIosDevice()) {
        clearPwaInstalledFlag();
      }
      setInstalled(isPwaInstalled());
    };

    update();
    const unsubscribe = subscribePwaInstall(update);
    const standaloneMedia = window.matchMedia("(display-mode: standalone)");
    const minimalUiMedia = window.matchMedia("(display-mode: minimal-ui)");
    const onDisplayMode = () => update();
    standaloneMedia.addEventListener("change", onDisplayMode);
    minimalUiMedia.addEventListener("change", onDisplayMode);
    window.addEventListener("visibilitychange", update);
    window.addEventListener("pageshow", update);

    return () => {
      unsubscribe();
      standaloneMedia.removeEventListener("change", onDisplayMode);
      minimalUiMedia.removeEventListener("change", onDisplayMode);
      window.removeEventListener("visibilitychange", update);
      window.removeEventListener("pageshow", update);
    };
  }, []);

  return installed;
}
