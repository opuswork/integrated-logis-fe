"use client";

import { Bell } from "lucide-react";
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
  if (user.role === "factory" && user.canApproveGreeting) {
    const name = user.name?.trim() || user.username;
    return `인사장 승인 ${name}님`;
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

export function AdminTopBar({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [activities, setActivities] = useState<AdminActivity[]>([]);
  const [hasUnread, setHasUnread] = useState(false);
  const [seenId, setSeenId] = useState<number | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const label = formatAdminHeaderLabel();
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
    <div
      className={cn(
        "mb-3 flex flex-wrap items-center justify-end gap-3",
        className,
      )}
    >
      <div className="flex items-center gap-2 rounded-full border border-[#d7dee8] bg-white px-3 py-1.5 shadow-sm">
        <span className="flex size-7 items-center justify-center rounded-full bg-[#334155] text-[11px] font-bold text-white">
          {region.slice(0, 2)}
        </span>
        <span className="text-sm font-semibold text-ink">{label}</span>
      </div>

      <div className="relative" ref={panelRef}>
        <button
          type="button"
          aria-label="알림"
          onClick={toggleOpen}
          className="relative rounded-full border border-[#d7dee8] bg-white p-2 text-ink shadow-sm hover:bg-soft"
        >
          <Bell className="size-4" />
          {hasUnread ? (
            <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-[#ef4444]" />
          ) : null}
        </button>

        {open ? (
          <div className="absolute right-0 z-50 mt-2 w-[min(420px,92vw)] overflow-hidden rounded-lg border border-line bg-white shadow-lg">
            <div className="border-b border-line px-3 py-2 text-sm font-semibold text-ink">
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
                    className="border-b border-[#eef2f7] px-3 py-2.5 text-[13px] leading-snug text-ink last:border-b-0"
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
  );
}
