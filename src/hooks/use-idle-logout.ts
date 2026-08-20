"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import { clearAuthUser } from "@/lib/auth";

const DEFAULT_TIMEOUT_MS = 60 * 60 * 1000;
const RESET_THROTTLE_MS = 1000;

const ACTIVITY_EVENTS = [
  "mousedown",
  "mousemove",
  "keydown",
  "touchstart",
  "scroll",
  "click",
] as const;

/**
 * Logs out after `timeoutMs` of no user activity (client-side idle).
 * Timer keeps running while the tab is hidden.
 */
export function useIdleLogout(timeoutMs: number = DEFAULT_TIMEOUT_MS) {
  const router = useRouter();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastResetRef = useRef(0);

  useEffect(() => {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      return;
    }

    const clearTimer = () => {
      if (timerRef.current != null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    const logout = () => {
      clearTimer();
      clearAuthUser();
      window.alert("장시간 미사용으로 로그아웃되었습니다.");
      router.replace("/login");
    };

    const arm = () => {
      clearTimer();
      timerRef.current = setTimeout(logout, timeoutMs);
    };

    const onActivity = () => {
      const now = Date.now();
      if (now - lastResetRef.current < RESET_THROTTLE_MS) {
        return;
      }
      lastResetRef.current = now;
      arm();
    };

    arm();

    for (const eventName of ACTIVITY_EVENTS) {
      window.addEventListener(eventName, onActivity, { passive: true });
    }

    return () => {
      clearTimer();
      for (const eventName of ACTIVITY_EVENTS) {
        window.removeEventListener(eventName, onActivity);
      }
    };
  }, [router, timeoutMs]);
}
