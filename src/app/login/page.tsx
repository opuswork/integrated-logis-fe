"use client";

import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type FormEvent } from "react";

import { LoginChromeHeader } from "@/components/login-chrome-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  clearAuthUser,
  getAuthUser,
  getHomePathForRole,
  isAccessTokenExpired,
  saveAuthUser,
  type AuthUser,
} from "@/lib/auth";
import { API_BASE_URL } from "@/lib/env";
import { cn } from "@/lib/utils";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [logoutMsg, setLogoutMsg] = useState<"shown" | "fading" | "hidden">(
    "shown",
  );
  const signupSuccess = searchParams.get("signup") === "success";
  const logoutReason = searchParams.get("reason");
  const loggedOutByUser = logoutReason === "logout";
  const logoutNotice =
    logoutReason === "expired"
      ? "세션 만료: 마지막 활동 이후 24시간이 경과하여 로그아웃되었습니다. 다시 로그인해 주세요."
      : logoutReason === "idle"
        ? "1시간 동안 사용하지 않아 자동 로그아웃되었습니다. 다시 로그인해 주세요."
        : "";

  // "성공적으로 로그아웃 되었습니다."는 1초 보여준 뒤 0.5초 동안 사라진다.
  useEffect(() => {
    if (!loggedOutByUser) return;
    const fadeTimer = window.setTimeout(() => setLogoutMsg("fading"), 1000);
    const hideTimer = window.setTimeout(() => setLogoutMsg("hidden"), 1500);
    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(hideTimer);
    };
  }, [loggedOutByUser]);

  useEffect(() => {
    const existing = getAuthUser();
    // 토큰이 만료된 로그인 정보는 지우고 로그인 화면에 머문다.
    if (existing && isAccessTokenExpired()) {
      clearAuthUser();
      return;
    }
    if (existing) {
      router.replace(
        getHomePathForRole(existing.role, {
          canApproveGreeting: existing.canApproveGreeting,
        }),
      );
    }
  }, [router]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: username.trim(),
          password,
        }),
      });

      const data = (await response.json()) as {
        message?: string;
        accessToken?: string;
        user?: AuthUser;
      };

      if (response.ok && data.user && data.accessToken) {
        saveAuthUser(data.user, data.accessToken);
        router.push(
          getHomePathForRole(data.user.role, {
            canApproveGreeting: data.user.canApproveGreeting,
          }),
        );
        return;
      }

      setError(data.message ?? "아이디 또는 비밀번호가 올바르지 않습니다.");
      setIsSubmitting(false);
    } catch {
      setError("로그인에 실패했습니다. 잠시 후 다시 시도해 주세요.");
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-[#1a365d]">
      <LoginChromeHeader />
      <main className="px-6 pb-[max(3rem,env(safe-area-inset-bottom))] pt-[max(5rem,calc(env(safe-area-inset-top)+3.75rem))]">
        <div className="mx-auto flex w-full max-w-md flex-col items-center">
          <Image
            src="/assets/images/jangyu-icon.png"
            alt="장유 양조간장"
            width={88}
            height={288}
            priority
            className="mb-4 h-24 w-auto drop-shadow-[0_0_14px_rgba(255,255,255,0.35)]"
          />
          <h1 className="mb-8 text-center font-['S-Core_Dream'] text-[1.35rem] font-semibold leading-snug text-white">
            통합 물류·주문 관리 시스템
          </h1>
          <h2 className="sr-only">B2B통합 물류·주문 관리 시스템</h2>

          <div className="flex w-full flex-col items-center gap-6 rounded-[10px] border border-[#cbd3df] bg-white px-6 py-8 shadow-[0_14px_34px_rgba(18,38,63,0.18)]">
            {loggedOutByUser && !signupSuccess && logoutMsg !== "hidden" ? (
              <p
                className={cn(
                  "w-full rounded-[7px] border border-green/30 bg-[#e8f8ef] px-3 py-2 text-sm text-green transition-opacity duration-500",
                  logoutMsg === "fading" && "opacity-0",
                )}
              >
                성공적으로 로그아웃 되었습니다.
              </p>
            ) : null}

            {logoutNotice && !signupSuccess ? (
              <p className="w-full rounded-[7px] border border-[#f2b620]/40 bg-[#fff8e6] px-3 py-2 text-sm text-[#8a5a00]">
                {logoutNotice}
              </p>
            ) : null}

            {signupSuccess ? (
              <p className="w-full rounded-[7px] border border-green/30 bg-[#e8f8ef] px-3 py-2 text-sm text-green">
                회원가입이 완료되었습니다. 로그인해 주세요.
              </p>
            ) : null}

            <form
              className="flex w-full flex-col gap-5"
              noValidate
              onSubmit={handleSubmit}
            >
              <div className="flex flex-col gap-2">
                <label
                  htmlFor="username"
                  className="text-sm font-medium text-[#475569]"
                >
                  아이디 (휴대폰 가운데 4자리)
                </label>
                <Input
                  id="username"
                  type="text"
                  placeholder="예: 010-4463-1440 → 4463"
                  className="w-full"
                  autoComplete="username"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                />
              </div>

              <div className="flex flex-col gap-2">
                <label
                  htmlFor="password"
                  className="text-sm font-medium text-[#475569]"
                >
                  비밀번호
                </label>
                <Input
                  id="password"
                  type="password"
                  placeholder="휴대폰 가운데+뒷자리 8자리 (예: 44631440)"
                  className="w-full"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </div>

              {error ? (
                <p className="rounded-[7px] border border-red/30 bg-[#fff0ed] px-3 py-2 text-sm text-red">
                  {error}
                </p>
              ) : null}

              <Button
                type="submit"
                variant="default"
                disabled={!username || !password || isSubmitting}
                aria-busy={isSubmitting}
                className="h-12 w-full border-brand bg-brand text-white hover:bg-[#1856bf] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? (
                  <Spinner size="sm" label="로그인 중" />
                ) : (
                  "로그인"
                )}
              </Button>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-[#1a365d] text-sm text-white">
          로그인 화면을 불러오는 중...
        </main>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
