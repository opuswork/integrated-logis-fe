"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Spinner } from "@/components/ui/spinner";
import { clearAuthUser } from "@/lib/auth";

/** "행복한 하루 되세요!" 메시지 + 스피너 표시 시간 */
const FAREWELL_DELAY_MS = 2000;

/**
 * 개인회원 앱 헤더의 "나가기" 버튼.
 * 누르면 확인 창 → 확인 시 인사 메시지와 스피너를 2초 보여준 뒤 로그인 화면으로 이동한다.
 */
export function MemberLogoutButton({ className }: { className?: string }) {
  const router = useRouter();
  const [step, setStep] = useState<"idle" | "confirm" | "farewell">("idle");
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  const handleConfirm = () => {
    setStep("farewell");
    timerRef.current = window.setTimeout(() => {
      clearAuthUser();
      router.replace("/login");
    }, FAREWELL_DELAY_MS);
  };

  return (
    <>
      <button
        type="button"
        className={className}
        onClick={() => setStep("confirm")}
      >
        나가기
      </button>

      {step !== "idle" ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6">
          <div
            role="dialog"
            aria-modal="true"
            aria-label={
              step === "confirm" ? "주문 앱에서 나가시나요?" : "행복한 하루 되세요!"
            }
            className="w-full max-w-sm rounded-2xl bg-white px-6 py-8 text-center shadow-xl"
          >
            {step === "confirm" ? (
              <>
                <p className="text-[22px] font-bold leading-snug text-[#1e293b]">
                  주문 앱에서 나가시나요?
                </p>
                <div className="mt-7 grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    className="h-14 rounded-xl border-2 border-[#cbd5e1] bg-white text-[18px] font-bold text-[#334155]"
                    onClick={() => setStep("idle")}
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    autoFocus
                    className="h-14 rounded-xl bg-[#1e2a5b] text-[18px] font-bold text-white"
                    onClick={handleConfirm}
                  >
                    확인
                  </button>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center gap-5 text-[#1e293b]">
                <p className="text-[22px] font-bold leading-snug">
                  행복한 하루 되세요!
                </p>
                <Spinner size="xl" label="로그아웃 중" className="text-[#7c3aed]" />
              </div>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
