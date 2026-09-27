"use client";

import { EllipsisVertical, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

const LOGIN_TITLE = "B2B통합 물류·주문관리-로그인";
/** 앱 닫기가 막혔을 때 안내 문구 표시 시간 */
const CLOSE_NOTICE_MS = 3000;

export function LoginChromeHeader() {
  const [host, setHost] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [closeBlocked, setCloseBlocked] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const closeTimersRef = useRef<number[]>([]);

  useEffect(() => {
    setHost(window.location.host);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  useEffect(() => {
    const timers = closeTimersRef.current;
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, []);

  // window.close()는 방문 기록이 1개일 때(앱을 막 연 상태)만 허용된다.
  // 로그아웃 후처럼 기록이 쌓여 있으면 폰이 막으므로, 아무 반응 없는 대신 안내를 보여준다.
  const closeLoginWindow = () => {
    closeTimersRef.current.forEach((id) => window.clearTimeout(id));
    window.close();
    closeTimersRef.current = [
      window.setTimeout(() => {
        if (!window.closed) setCloseBlocked(true);
      }, 150),
      window.setTimeout(() => setCloseBlocked(false), 150 + CLOSE_NOTICE_MS),
    ];
  };

  const handleRefresh = () => {
    setMenuOpen(false);
    window.location.reload();
  };

  const handleShare = async () => {
    setMenuOpen(false);
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: LOGIN_TITLE, url });
        return;
      }
    } catch {
      /* user cancelled or share failed */
    }
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      /* ignore */
    }
  };

  const handleOpenInBrowser = () => {
    setMenuOpen(false);
    window.open(window.location.href, "_blank", "noopener,noreferrer");
  };

  if (host == null) {
    return (
      <header className="fixed inset-x-0 top-0 z-30 h-[calc(3.5rem+env(safe-area-inset-top))] bg-[#492484] pt-[env(safe-area-inset-top)]" />
    );
  }

  return (
    <header className="fixed inset-x-0 top-0 z-30 bg-[#492484] pt-[env(safe-area-inset-top)] text-white">
      <div className="flex h-14 items-center gap-0.5 px-1">
        <button
          type="button"
          aria-label="닫기"
          onClick={closeLoginWindow}
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-full hover:bg-white/10"
        >
          <X className="size-6" strokeWidth={2.25} />
        </button>

        <div className="min-w-0 flex-1 pr-1">
          <p className="truncate text-[13px] font-medium leading-4">{LOGIN_TITLE}</p>
          <p className="truncate text-[12px] leading-4 text-white/70">{host}</p>
        </div>

        <div className="relative shrink-0" ref={menuRef}>
          <button
            type="button"
            aria-label="더보기"
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            onClick={() => setMenuOpen((open) => !open)}
            className="inline-flex size-11 items-center justify-center rounded-full hover:bg-white/10"
          >
            <EllipsisVertical className="size-5" strokeWidth={2.25} />
          </button>

          {menuOpen ? (
            <div
              role="menu"
              className="absolute right-1 top-12 z-40 min-w-[11.5rem] overflow-hidden rounded-lg bg-white py-1 text-[#1A202C] shadow-[0_8px_24px_rgba(0,0,0,0.28)]"
            >
              <button
                type="button"
                role="menuitem"
                className="flex w-full px-4 py-2.5 text-left text-[14px] hover:bg-[#F1F5F9]"
                onClick={handleRefresh}
              >
                새로고침
              </button>
              <button
                type="button"
                role="menuitem"
                className="flex w-full px-4 py-2.5 text-left text-[14px] hover:bg-[#F1F5F9]"
                onClick={() => void handleShare()}
              >
                공유
              </button>
              <button
                type="button"
                role="menuitem"
                className="flex w-full px-4 py-2.5 text-left text-[14px] hover:bg-[#F1F5F9]"
                onClick={handleOpenInBrowser}
              >
                브라우저에서 열기
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <div
        role="status"
        aria-hidden={!closeBlocked}
        className={cn(
          "pointer-events-none absolute inset-x-0 top-full flex justify-center px-4 pt-2 transition-opacity duration-500",
          closeBlocked ? "opacity-100" : "opacity-0",
        )}
      >
        <p className="rounded-full bg-[#1A202C]/90 px-4 py-2 text-center text-[13px] font-medium text-white shadow-lg">
          앱을 닫으려면 휴대폰의 홈(○) 버튼을 눌러 주세요.
        </p>
      </div>
    </header>
  );
}
