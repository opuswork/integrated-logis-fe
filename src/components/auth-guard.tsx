"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { LiveChatWidget } from "@/components/chat/live-chat-widget";
import { useIdleLogout } from "@/hooks/use-idle-logout";
import {
  clearAuthUser,
  getAuthUser,
  getHomePathForRole,
  type AuthUser,
  type UserRole,
} from "@/lib/auth";

function IdleLogoutEffect({ timeoutMs }: { timeoutMs: number }) {
  useIdleLogout(timeoutMs);
  return null;
}

// 중복로그인 방지 (비활성): 25초마다 /api/auth/me 로 세션 유효성 확인
// const SESSION_POLL_MS = 25_000;
// function SessionPollEffect() {
//   useEffect(() => {
//     let cancelled = false;
//     const check = () => {
//       if (cancelled || !getAuthUser()) return;
//       void apiFetch("/api/auth/me").catch(() => {});
//     };
//     check();
//     const id = window.setInterval(check, SESSION_POLL_MS);
//     return () => {
//       cancelled = true;
//       window.clearInterval(id);
//     };
//   }, []);
//   return null;
// }

export function AuthGuard({
  children,
  allow,
  idleTimeoutMs,
}: {
  children: ReactNode;
  allow: UserRole | UserRole[];
  /** When set, auto-logout after this many ms of no activity. */
  idleTimeoutMs?: number;
}) {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);
  const allowedRoles = Array.isArray(allow) ? allow : [allow];
  const allowedKey = allowedRoles.join("|");

  useEffect(() => {
    const current = getAuthUser();

    if (!current) {
      router.replace("/login");
      return;
    }

    if (!allowedRoles.includes(current.role)) {
      router.replace(getHomePathForRole(current.role));
      return;
    }

    setUser(current);
    setReady(true);
  }, [router, allowedKey]);

  if (!ready || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#e9edf3] text-sm text-muted-foreground">
        로그인 확인 중...
      </div>
    );
  }

  return (
    <>
      {/* 중복로그인 방지 (비활성): <SessionPollEffect /> */}
      {idleTimeoutMs != null && idleTimeoutMs > 0 ? (
        <IdleLogoutEffect timeoutMs={idleTimeoutMs} />
      ) : null}
      {children}
      {user.role === "admin" || user.role === "factory" ? (
        <LiveChatWidget />
      ) : null}
    </>
  );
}

export function LogoutButton({ className }: { className?: string }) {
  const router = useRouter();

  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        clearAuthUser();
        router.replace("/login");
      }}
    >
      로그아웃
    </button>
  );
}
