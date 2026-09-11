"use client";

import { X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  getAuthUser,
  getHomePathForRole,
  saveAuthUser,
  type AuthUser,
} from "@/lib/auth";
import { API_BASE_URL } from "@/lib/env";

function closeLoginWindow() {
  window.close();
  window.setTimeout(() => {
    if (!window.closed) {
      window.history.back();
    }
  }, 80);
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const signupSuccess = searchParams.get("signup") === "success";

  useEffect(() => {
    const existing = getAuthUser();
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
    <div className="relative min-h-[100dvh] bg-[#1a365d]">
      <header className="fixed inset-x-0 top-0 z-30 flex h-12 items-center bg-[#492484] px-2 pt-[env(safe-area-inset-top)]">
        <button
          type="button"
          aria-label="로그인 창 닫기"
          onClick={closeLoginWindow}
          className="inline-flex size-10 items-center justify-center rounded-full text-white hover:bg-white/10"
        >
          <X className="size-6" strokeWidth={2.25} />
        </button>
      </header>

      <main className="px-6 pb-[max(3rem,env(safe-area-inset-bottom))] pt-[max(4.5rem,calc(env(safe-area-inset-top)+3.25rem))]">
        <div className="mx-auto flex w-full max-w-md flex-col items-center">
          <div
            className="mb-4 flex size-16 items-center justify-center rounded-2xl bg-[#3182ce] text-[1.35rem] font-bold tracking-tight text-white shadow-[0_8px_20px_rgba(0,0,0,0.25)]"
            aria-hidden
          >
            B2B
          </div>
          <h1 className="mb-8 text-center font-['S-Core_Dream'] text-[1.35rem] font-semibold leading-snug text-white">
            통합 물류·주문 관리 시스템
          </h1>
          <h2 className="sr-only">B2B통합 물류·주문 관리 시스템</h2>

          <div className="flex w-full flex-col items-center gap-6 rounded-[10px] border border-[#cbd3df] bg-white px-6 py-8 shadow-[0_14px_34px_rgba(18,38,63,0.18)]">
            <p className="text-center text-sm text-muted-foreground">
              개인회원 모바일 앱 · 관리자·공장 계정으로도 로그인할 수 있습니다.
            </p>

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
                  아이디 (연락처)
                </label>
                <Input
                  id="username"
                  type="text"
                  placeholder="01012345678"
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
                  placeholder="비밀번호를 입력해 주세요"
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

            <p className="text-center text-xs text-[#64748b]">
              개인회원이시면 가입하기 버튼을 클릭하여 가입해 주세요.{" "}
              <Link
                href="/members/signup"
                className="font-semibold text-[#F97B22] underline underline-offset-2"
              >
                가입하기
              </Link>
            </p>
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
