"use client";

import { Bell, Menu, Settings, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { apiFetch } from "@/lib/api";
import {
  formatAdminPrivilegeLabel,
  getAuthUser,
  type AdminRegion,
} from "@/lib/auth";
import { cn } from "@/lib/utils";

type AdminActivity = {
  id: number;
  actorName: string;
  actorRegion: AdminRegion | null;
  action: string;
  orderNumber: string;
  summary: string;
  createdAt: string;
};

function regionShort(region: AdminRegion | null | undefined) {
  if (region === "NAMBU") return "남부";
  if (region === "JUNGBU") return "중부";
  if (region === "SEOBU") return "서부";
  return "최고";
}

export function formatAdminHeaderLabel(user = getAuthUser()) {
  if (!user) {
    return "관리자";
  }
  if (user.role === "factory") {
    const name = user.name?.trim() || user.username;
    if (user.canApproveGreeting || user.username === "01029647088") {
      return `인사장 승인 ${name}님`;
    }
    return `공장관리자 ${name}님`;
  }
  const privilege = formatAdminPrivilegeLabel(
    user.adminRegion,
    user.isSuperAdmin,
  );
  const name = user.name?.trim() || user.username;
  if (privilege === "최고관리자") {
    return `최고관리자 ${name}님`;
  }
  const region = regionShort(user.adminRegion);
  return `${region}매장 관리자 ${name}님`;
}

function formatWhoParts(user = getAuthUser()) {
  const label = formatAdminHeaderLabel(user);
  // "남부매장 관리자 홍길동님" → prefix + bold name
  const match = label.match(/^(.*)\s+(\S+님)$/);
  if (match) {
    return { prefix: match[1], name: match[2] };
  }
  return { prefix: label, name: "" };
}

export function AdminTopBar({
  className,
  onOpenProfile,
  onToggleMobileNav,
  mobileNavOpen,
}: {
  className?: string;
  onOpenProfile?: () => void;
  onToggleMobileNav?: () => void;
  mobileNavOpen?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [activities, setActivities] = useState<AdminActivity[]>([]);
  const [hasUnread, setHasUnread] = useState(false);
  const [seenId, setSeenId] = useState<number | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const who = formatWhoParts();
  const region = regionShort(getAuthUser()?.adminRegion);

  const loadActivities = useCallback(async () => {
    try {
      const response = await apiFetch("/api/orders/admin-activities?limit=40");
      if (!response.ok) {
        return;
      }
      const data = (await response.json()) as AdminActivity[];
      setActivities(Array.isArray(data) ? data : []);
      const latestId = Array.isArray(data) && data[0] ? data[0].id : null;
      if (latestId != null && seenId != null && latestId > seenId) {
        setHasUnread(true);
      } else if (seenId == null && latestId != null) {
        setHasUnread(true);
      }
    } catch {
      // ignore polling errors
    }
  }, [seenId]);

  useEffect(() => {
    void loadActivities();
    const timer = window.setInterval(() => {
      void loadActivities();
    }, 8000);
    return () => window.clearInterval(timer);
  }, [loadActivities]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onDocClick = (event: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const toggleOpen = () => {
    const next = !open;
    setOpen(next);
    if (next) {
      setHasUnread(false);
      if (activities[0]) {
        setSeenId(activities[0].id);
      }
    }
  };

  return (
    <header
      className={cn(
        "flex h-14 shrink-0 items-center justify-between border-b border-white/10 bg-[#1A365D] px-4 text-white min-[1040px]:px-[22px]",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        {onToggleMobileNav ? (
          <button
            type="button"
            aria-label={mobileNavOpen ? "메뉴 닫기" : "메뉴 열기"}
            aria-expanded={mobileNavOpen}
            onClick={onToggleMobileNav}
            className="mr-0.5 rounded-lg p-1.5 text-[#DDE7F3] hover:bg-white/10 min-[1040px]:hidden"
          >
            {mobileNavOpen ? (
              <X className="size-[18px]" />
            ) : (
              <Menu className="size-[18px]" />
            )}
          </button>
        ) : null}
        <div className="flex size-7 shrink-0 items-center justify-center rounded-[7px] bg-[#3182CE] text-[13px] font-black tracking-tight">
          B2B
        </div>
        <div className="min-w-0 truncate text-[15px] font-bold tracking-tight">
          통합 물류·주문 관리 시스템
          <span className="ml-1.5 hidden font-normal text-[#9DC3EE] sm:inline text-xs">
            Admin Console
          </span>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 min-[1040px]:gap-[18px]">
        <div className="hidden items-center gap-2 rounded-full border border-white/14 bg-white/8 py-[5px] pr-3 pl-1.5 sm:flex">
          <span className="flex size-[22px] items-center justify-center rounded-full bg-[#F6AD55] text-[10px] font-bold text-[#7C2D12]">
            {region.slice(0, 2)}
          </span>
          <span className="text-[12.5px] font-medium">
            {who.prefix}{" "}
            {who.name ? <b className="font-bold">{who.name}</b> : null}
          </span>
        </div>

        {onOpenProfile ? (
          <button
            type="button"
            aria-label="프로필 설정"
            onClick={onOpenProfile}
            className="flex size-8 items-center justify-center rounded-lg text-[#DDE7F3] hover:bg-white/10"
          >
            <Settings className="size-[17px]" strokeWidth={1.75} />
          </button>
        ) : null}

        <div className="relative" ref={panelRef}>
          <button
            type="button"
            aria-label="알림"
            onClick={toggleOpen}
            className="relative flex size-8 items-center justify-center rounded-lg text-[#DDE7F3] hover:bg-white/10"
          >
            <Bell className="size-[17px]" strokeWidth={1.75} />
            {hasUnread ? (
              <span className="absolute top-1.5 right-[7px] size-[7px] rounded-full border-[1.5px] border-[#1A365D] bg-[#E53E3E]" />
            ) : null}
          </button>

          {open ? (
            <div className="absolute right-0 z-50 mt-2 w-[min(420px,92vw)] overflow-hidden rounded-lg border border-[#E2E8F0] bg-white text-[#1A202C] shadow-lg">
              <div className="border-b border-[#E2E8F0] px-3 py-2 text-sm font-semibold">
                알림
              </div>
              <ul className="max-h-80 overflow-y-auto">
                {activities.length === 0 ? (
                  <li className="px-3 py-4 text-sm text-[#64748b]">
                    알림이 없습니다.
                  </li>
                ) : (
                  activities.map((item) => (
                    <li
                      key={item.id}
                      className="border-b border-[#eef2f7] px-3 py-2.5 text-[13px] leading-snug last:border-b-0"
                    >
                      {item.summary}
                    </li>
                  ))
                )}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
