"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  clearDeferredInstallPrompt,
  getDeferredInstallPrompt,
  isIosDevice,
  isStandaloneDisplay,
  subscribePwaInstall,
} from "@/lib/pwa-install";

export function MemberHomeInstallMng() {
  const [standalone, setStandalone] = useState(false);
  const [ios, setIos] = useState(false);
  const [canPrompt, setCanPrompt] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [message, setMessage] = useState("");

  const refresh = useCallback(() => {
    setStandalone(isStandaloneDisplay());
    setIos(isIosDevice());
    setCanPrompt(Boolean(getDeferredInstallPrompt()));
  }, []);

  useEffect(() => {
    refresh();
    return subscribePwaInstall(refresh);
  }, [refresh]);

  const handleInstall = async () => {
    const promptEvent = getDeferredInstallPrompt();
    if (!promptEvent) {
      setMessage("이 브라우저에서는 자동 설치 창이 지원되지 않습니다.");
      return;
    }
    setInstalling(true);
    setMessage("");
    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (choice.outcome === "accepted") {
        clearDeferredInstallPrompt();
        setMessage("홈 화면에 물류관리시스템 앱이 추가되었습니다.");
      } else {
        setMessage("설치가 취소되었습니다. 다시 시도할 수 있습니다.");
      }
      refresh();
    } catch {
      setMessage("설치 창을 열지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setInstalling(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[#E2E8F0] bg-white p-4">
        <div className="mb-3 flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/icons/icon-192.png"
            alt="물류관리시스템"
            className="size-14 rounded-[14px] border border-[#E2E8F0]"
          />
          <div>
            <p className="text-[15px] font-semibold text-[#1A202C]">
              물류관리시스템
            </p>
            <p className="text-[12px] text-[#64748B]">개인회원 모바일 앱</p>
          </div>
        </div>
        <p className="text-[13px] leading-6 text-[#475569]">
          홈 화면에 아이콘을 추가하면, 아이콘을 눌렀을 때 브라우저 주소창 없이
          물류관리시스템 앱으로 열립니다.
        </p>
      </div>

      <div className="rounded-xl border border-[#E2E8F0] bg-white p-4">
        {standalone ? (
          <p className="text-[13px] font-semibold text-[#1A365D]">
            이미 홈 화면 앱으로 실행 중입니다.
          </p>
        ) : ios ? (
          <div className="space-y-2 text-[13px] leading-6 text-[#1A202C]">
            <p className="font-semibold">아이폰 / 아이패드 (Safari)</p>
            <ol className="list-decimal space-y-1 pl-5 text-[#475569]">
              <li>화면 아래 공유 버튼(□↑)을 누릅니다.</li>
              <li>
                <strong>홈 화면에 추가</strong>를 선택합니다.
              </li>
              <li>추가를 누르면 홈에 물류관리시스템 아이콘이 생깁니다.</li>
            </ol>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-[13px] leading-6 text-[#475569]">
              Android Chrome 또는 설치를 지원하는 브라우저에서 아래 버튼을
              누르면 홈 화면에 앱 아이콘이 추가됩니다.
            </p>
            <Button
              type="button"
              disabled={installing || !canPrompt}
              onClick={() => void handleInstall()}
            >
              {installing ? "추가 중..." : "홈 화면에 앱 추가"}
            </Button>
            {!canPrompt ? (
              <p className="text-[12px] leading-5 text-[#64748B]">
                설치 버튼이 보이지 않으면 Chrome 메뉴(⋮)에서{" "}
                <strong>홈 화면에 추가</strong> 또는{" "}
                <strong>앱 설치</strong>를 선택해 주세요. HTTPS로 접속해야
                합니다.
              </p>
            ) : null}
          </div>
        )}
        {message ? (
          <p className="mt-3 text-[13px] text-[#1A365D]">{message}</p>
        ) : null}
      </div>
    </div>
  );
}
