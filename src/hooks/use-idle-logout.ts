"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { apiFetch } from "@/lib/api";
import {
  clearAuthUser,
  getAccessToken,
  getAuthUser,
  getLastActivity,
  getTokenTimes,
  idleReason,
  isAccessTokenExpired,
  isAuthStorageKey,
  isIdleExpired,
  markActivity,
  MEMBER_IDLE_TIMEOUT_MS,
  setAccessToken,
  type LogoutReason,
} from "@/lib/auth";

/** 만료 여부를 확인하는 주기 */
const CHECK_INTERVAL_MS = 60 * 1000;
/** 활동 시각을 localStorage에 쓰는 최소 간격 */
const MARK_THROTTLE_MS = 5 * 1000;
/** 토큰이 이만큼 지났고 사용자가 활동 중이면 새 토큰을 받는다 (슬라이딩 세션) */
const REFRESH_AFTER_MS = 60 * 60 * 1000;
/** 재발급 실패 후 다시 시도하기까지의 간격 */
const REFRESH_RETRY_MS = 5 * 60 * 1000;

const ACTIVITY_EVENTS = [
  "mousedown",
  "mousemove",
  "keydown",
  "touchstart",
  "scroll",
  "click",
] as const;

/**
 * Logs out after `timeoutMs` without user activity.
 * The last activity time lives in localStorage, so it is shared between tabs and
 * survives reloads and sleep (checked on an interval and whenever the tab/PWA
 * comes back to the foreground). While the user is active, the access token is
 * renewed so the server-side expiry also counts from the last activity.
 * Background polling does not count as activity.
 */
export function useIdleLogout(timeoutMs: number = MEMBER_IDLE_TIMEOUT_MS) {
  const router = useRouter();

  useEffect(() => {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      return;
    }

    let loggedOut = false;
    let lastMark = 0;
    let refreshing = false;
    let lastRefreshAttempt = 0;

    const logout = (reason: LogoutReason) => {
      if (loggedOut) {
        return;
      }
      loggedOut = true;
      clearAuthUser();
      router.replace(`/login?reason=${reason}`);
    };

    /** true면 세션이 끝나 로그아웃 처리됨 */
    const checkExpired = () => {
      if (loggedOut) {
        return true;
      }
      if (!getAuthUser()) {
        logout("logout");
      } else if (isIdleExpired(timeoutMs)) {
        logout(idleReason(timeoutMs));
      } else if (isAccessTokenExpired()) {
        logout("expired");
      }
      return loggedOut;
    };

    const refreshIfDue = () => {
      const now = Date.now();
      const { issuedAt } = getTokenTimes(getAccessToken());
      if (
        refreshing ||
        issuedAt == null ||
        now - issuedAt < REFRESH_AFTER_MS ||
        now - lastRefreshAttempt < REFRESH_RETRY_MS
      ) {
        return;
      }
      refreshing = true;
      lastRefreshAttempt = now;
      void apiFetch("/api/auth/refresh", { method: "POST" })
        .then(async (response) => {
          if (!response.ok) {
            return;
          }
          const data = (await response.json()) as { accessToken?: string };
          if (data.accessToken && !loggedOut) {
            setAccessToken(data.accessToken);
          }
        })
        .catch(() => {})
        .finally(() => {
          refreshing = false;
        });
    };

    const onActivity = () => {
      const now = Date.now();
      if (now - lastMark < MARK_THROTTLE_MS) {
        return;
      }
      lastMark = now;
      // 오래 쉬었다가 돌아온 첫 움직임은 활동으로 치지 않고 먼저 만료를 확인한다.
      if (checkExpired()) {
        return;
      }
      markActivity();
      refreshIfDue();
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        checkExpired();
      }
    };

    const onStorage = (event: StorageEvent) => {
      // 다른 탭에서 로그아웃하면 이 탭도 로그인 화면으로
      if (event.key === null || isAuthStorageKey(event.key)) {
        if (!getAuthUser()) {
          logout("logout");
        }
      }
    };

    // 이 기능이 생기기 전에 로그인한 세션은 지금부터 계산한다.
    if (getLastActivity() == null) {
      markActivity();
    }
    checkExpired();

    const intervalId = window.setInterval(checkExpired, CHECK_INTERVAL_MS);
    for (const eventName of ACTIVITY_EVENTS) {
      window.addEventListener(eventName, onActivity, { passive: true });
    }
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    window.addEventListener("storage", onStorage);

    return () => {
      window.clearInterval(intervalId);
      for (const eventName of ACTIVITY_EVENTS) {
        window.removeEventListener(eventName, onActivity);
      }
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.removeEventListener("storage", onStorage);
    };
  }, [router, timeoutMs]);
}
