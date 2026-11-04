"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { clearAuthUser } from "@/lib/auth";

/** 작별 영상(10초)이 늦게 받아지거나 멈춰도 이 시간이 지나면 이동한다 */
const FAREWELL_MAX_MS = 12000;
/** 영상을 못 불러왔을 때 이동까지 기다리는 시간 */
const FAREWELL_ERROR_MS = 2000;

/** 영상 속 대사 (소리 없이 재생하므로 자막으로 보여 준다). 시간은 초 */
const FAREWELL_CAPTIONS = [
  { start: 1.4, end: 2.9, text: "안녕하세요!" },
  { start: 2.9, end: 4.8, text: "반갑습니다!" },
  { start: 6.3, end: 10.1, text: "좋은 하루 보내세요!" },
];

/**
 * 개인회원 앱 헤더의 "나가기" 버튼.
 * 누르면 확인 창 → 확인 시 작별 영상을 전체화면으로 보여 준 뒤 로그인 화면으로 이동한다.
 */
export function MemberLogoutButton({ className }: { className?: string }) {
  const router = useRouter();
  const [step, setStep] = useState<"idle" | "confirm" | "farewell">("idle");
  const [caption, setCaption] = useState("");
  const timerRef = useRef<number | null>(null);
  const leftRef = useRef(false);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  const leave = () => {
    if (leftRef.current) return;
    leftRef.current = true;
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    clearAuthUser();
    router.replace("/login?reason=logout");
  };

  const leaveAfter = (ms: number) => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(leave, ms);
  };

  const handleConfirm = () => {
    setStep("farewell");
    leaveAfter(FAREWELL_MAX_MS);
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

      {step === "confirm" ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="주문 앱에서 나가시나요?"
            className="w-full max-w-sm rounded-2xl bg-white px-6 py-8 text-center shadow-xl"
          >
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
          </div>
        </div>
      ) : null}

      {step === "farewell" ? createPortal(
        // 헤더 안에 있으면 하단 고정 버튼 아래에 깔리므로 body 로 띄운다. 영상 배경과 같은 회색으로 화면 전체를 덮고, 영상은 자르지 않고 가운데에
        <div
          role="dialog"
          aria-modal="true"
          aria-label="행복한 하루 되세요!"
          className="fixed inset-0 z-[100] flex items-center justify-center bg-[#e6e8e8]"
        >
          <div className="relative aspect-[9/16] w-[min(100vw,calc(100dvh*9/16))]">
            <video
              // 첫 장면이 검은 화면이라 0.1초부터
              src="/assets/videos/have-a-nice-day.mp4#t=0.1"
              poster="/assets/images/have-a-nice-day-poster.webp"
              autoPlay
              muted
              playsInline
              preload="auto"
              aria-hidden="true"
              className="absolute inset-0 size-full object-contain"
              onTimeUpdate={(event) => {
                const time = event.currentTarget.currentTime;
                const current = FAREWELL_CAPTIONS.find(
                  (row) => time >= row.start && time < row.end,
                );
                setCaption(current?.text ?? "");
              }}
              onEnded={leave}
              onError={() => leaveAfter(FAREWELL_ERROR_MS)}
            />
            {/* 캐릭터 머리 위 자막 */}
            <p
              aria-live="polite"
              className="absolute inset-x-4 top-[1.5%] text-center"
            >
              {caption ? (
                <span className="inline-block rounded-2xl bg-white/90 px-5 py-2 text-[clamp(22px,7vw,32px)] font-bold leading-snug text-[#2b2622] shadow-md">
                  {caption}
                </span>
              ) : null}
            </p>
          </div>
        </div>,
        document.body,
      ) : null}
    </>
  );
}
