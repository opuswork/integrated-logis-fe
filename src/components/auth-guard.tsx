"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import {
  clearAuthUser,
  getAuthUser,
  getHomePathForRole,
  type AuthUser,
  type UserRole,
} from "@/lib/auth";

export function AuthGuard({
  children,
  allow,
}: {
  children: ReactNode;
  allow: UserRole | UserRole[];
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
      // Factory-G(인사장 승인)는 관리자 주문목록에서 인사장을 처리합니다.
      const factoryGreetingOnAdmin =
        current.role === "factory" &&
        current.canApproveGreeting === true &&
        allowedRoles.includes("admin");
      if (!factoryGreetingOnAdmin) {
        router.replace(
          getHomePathForRole(current.role, {
            canApproveGreeting: current.canApproveGreeting,
          }),
        );
        return;
      }
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

  return <>{children}</>;
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
