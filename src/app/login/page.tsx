"use client";

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
        // Keep spinner until navigation unmounts this page.
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
    <main className="relative min-h-screen bg-[#e9edf3] px-6 pb-12 pt-[86px] md:pt-[96px] lg:pt-[120px]">
      <div className="mx-auto flex w-full max-w-md flex-col items-center gap-6 rounded-[10px] border border-[#cbd3df] bg-white px-6 py-8 shadow-[0_14px_34px_rgba(18,38,63,0.08)]">
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-ink">물류부 주문 관리 시스템</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            관리자, 공장, 또는 개인회원 계정으로 로그인하세요.
          </p>
        </div>

        {signupSuccess ? (
          <p className="w-full rounded-[7px] border border-green/30 bg-[#e8f8ef] px-3 py-2 text-sm text-green">
            회원가입이 완료되었습니다. 로그인해 주세요.
          </p>
        ) : null}

        <form className="flex w-full flex-col gap-5" noValidate onSubmit={handleSubmit}>
          <div className="flex flex-col gap-2">
            <label htmlFor="username" className="text-sm font-medium text-[#475569]">
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
            <label htmlFor="password" className="text-sm font-medium text-[#475569]">
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
            {isSubmitting ? <Spinner size="sm" label="로그인 중" /> : "로그인"}
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
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-[#e9edf3] text-sm text-muted-foreground">
          로그인 화면을 불러오는 중...
        </main>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
