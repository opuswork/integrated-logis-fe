"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

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
      {idleTimeoutMs != null && idleTimeoutMs > 0 ? (
        <IdleLogoutEffect timeoutMs={idleTimeoutMs} />
      ) : null}
      {children}
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
