"use client";

import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type FormEvent } from "react";

import { LoginChromeHeader } from "@/components/login-chrome-header";
import { Button } from "@/components/ui/button";
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

const LABEL_CLASS = "mb-1.5 block text-[13px] text-[#7A6F66]";
const INPUT_CLASS =
  "h-[50px] w-full rounded-xl border border-[#E6DED4] bg-white px-3.5 text-[15px] text-[#2B2622] placeholder:text-[#7A6F66]/80 focus:outline-2 focus:outline-offset-1 focus:outline-[#D9663A]";

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
    <div className="min-h-[100dvh] bg-[#FAF7F2] font-[family-name:var(--font-noto-sans-kr)] text-[#2B2622]">
      <LoginChromeHeader />
      <main className="px-5 pb-[max(3rem,env(safe-area-inset-bottom))] pt-[max(4.5rem,calc(env(safe-area-inset-top)+4.25rem))]">
        <div className="mx-auto flex w-full max-w-[480px] flex-col gap-3.5">
          <section className="relative overflow-hidden rounded-[28px] bg-[radial-gradient(120%_90%_at_50%_15%,#FBEFE2_0%,#F7DFC6_100%)] px-5 pb-[22px] pt-7 text-center">
            <div
              aria-hidden
              className="absolute -right-[60px] -top-[70px] size-[220px] rounded-full bg-[#D9663A] opacity-10"
            />
            <div
              aria-hidden
              className="absolute -bottom-[50px] -left-10 size-[140px] rounded-full bg-[#D9663A] opacity-[0.08]"
            />
            <span className="relative z-[1] inline-block rounded-full bg-white px-3 py-[5px] text-xs font-bold text-[#D9663A]">
              생명물간장 주문
            </span>
            <div className="relative z-[1] mx-auto mt-3.5 w-[min(78%,300px)]">
              <Image
                src="/assets/images/login-truck.webp"
                alt="간장병 캐릭터가 트럭을 몰며 손을 흔드는 그림"
                width={640}
                height={566}
                priority
                className="login-drive block h-auto w-full"
              />
            </div>
            <div
              aria-hidden
              className="relative mx-auto -mt-2.5 h-3.5 w-[62%] rounded-[50%] bg-[rgba(120,70,30,0.18)] blur-[6px]"
            />
            <h1 className="relative z-[1] mt-4 text-2xl font-bold">장유 주문앱</h1>
            <p className="relative z-[1] mt-1 text-sm text-[#7A6F66]">
              로그인하고 주문을 시작하세요
            </p>
            <h2 className="sr-only">B2B통합 물류·주문 관리 시스템</h2>
          </section>

          <div className="flex flex-col gap-3 rounded-2xl border border-[#EFE8DF] bg-white p-4">
            {loggedOutByUser && !signupSuccess && logoutMsg !== "hidden" ? (
              <p
                className={cn(
                  "rounded-xl border border-green/30 bg-[#e8f8ef] px-3 py-2 text-sm text-green transition-opacity duration-500",
                  logoutMsg === "fading" && "opacity-0",
                )}
              >
                성공적으로 로그아웃 되었습니다.
              </p>
            ) : null}

            {logoutNotice && !signupSuccess ? (
              <p className="rounded-xl border border-[#f2b620]/40 bg-[#fff8e6] px-3 py-2 text-sm text-[#8a5a00]">
                {logoutNotice}
              </p>
            ) : null}

            {signupSuccess ? (
              <p className="rounded-xl border border-green/30 bg-[#e8f8ef] px-3 py-2 text-sm text-green">
                회원가입이 완료되었습니다. 로그인해 주세요.
              </p>
            ) : null}

            <form
              className="flex flex-col gap-3"
              noValidate
              onSubmit={handleSubmit}
            >
              <div>
                <label htmlFor="username" className={LABEL_CLASS}>
                  아이디
                </label>
                <input
                  id="username"
                  type="text"
                  placeholder="(휴대폰 가운데 4자리)"
                  className={INPUT_CLASS}
                  autoComplete="username"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                />
              </div>

              <div>
                <label htmlFor="password" className={LABEL_CLASS}>
                  비밀번호
                </label>
                <input
                  id="password"
                  type="password"
                  placeholder="휴대폰 가운데+뒷자리 8자리"
                  className={INPUT_CLASS}
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </div>

              {error ? (
                <p role="alert" className="text-[13px] text-[#B3261E]">
                  {error}
                </p>
              ) : null}

              <Button
                type="submit"
                variant="default"
                disabled={!username || !password || isSubmitting}
                aria-busy={isSubmitting}
                className="h-14 w-full rounded-2xl border-[#D9663A] bg-[#D9663A] text-base font-bold text-white hover:bg-[#c55a31] disabled:cursor-not-allowed disabled:opacity-60"
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
        <main className="flex min-h-screen items-center justify-center bg-[#FAF7F2] text-sm text-[#7A6F66]">
          로그인 화면을 불러오는 중...
        </main>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
