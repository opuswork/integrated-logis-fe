"use client";

import { MessageSquare, Minus, Send, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { apiFetch } from "@/lib/api";
import { getAuthUser } from "@/lib/auth";
import { cn } from "@/lib/utils";

type ChatMessage = {
  id: number;
  kind: "MESSAGE" | "SYSTEM";
  body: string;
  senderId: number | null;
  senderName: string;
  senderLabel: string;
  createdAt: string;
};

type Position = { x: number; y: number };

const POLL_MS = 3000;
const PANEL_WIDTH = 330;
const DEFAULT_HEIGHT = 440;
const MIN_HEIGHT = 280;
const EDGE_GAP = 16;
const UI_STORAGE_KEY = "sanc-chat-ui";
const DRAG_MIN_WIDTH = 640;

function maxHeightForViewport() {
  return Math.max(MIN_HEIGHT, window.innerHeight - EDGE_GAP * 2);
}

function clampHeight(height: number, top?: number) {
  const maxByViewport = maxHeightForViewport();
  const maxFromTop =
    top != null
      ? Math.max(MIN_HEIGHT, window.innerHeight - top - EDGE_GAP)
      : maxByViewport;
  return Math.min(Math.max(height, MIN_HEIGHT), Math.min(maxByViewport, maxFromTop));
}

function clampPosition(position: Position, height: number): Position {
  const maxX = Math.max(EDGE_GAP, window.innerWidth - PANEL_WIDTH - EDGE_GAP);
  const maxY = Math.max(EDGE_GAP, window.innerHeight - height - EDGE_GAP);
  return {
    x: Math.min(Math.max(position.x, EDGE_GAP), maxX),
    y: Math.min(Math.max(position.y, EDGE_GAP), maxY),
  };
}

function defaultPosition(height: number): Position {
  return clampPosition(
    {
      x: window.innerWidth - PANEL_WIDTH - EDGE_GAP,
      y: window.innerHeight - height - EDGE_GAP,
    },
    height,
  );
}

function readStoredUi() {
  try {
    const raw = window.localStorage.getItem(UI_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Position> & {
      open?: boolean;
      height?: number;
    };
    return {
      position:
        typeof parsed.x === "number" && typeof parsed.y === "number"
          ? { x: parsed.x, y: parsed.y }
          : null,
      height: typeof parsed.height === "number" ? parsed.height : null,
      open: parsed.open === true,
    };
  } catch {
    return null;
  }
}

function storeUi(
  position: Position | null,
  open: boolean,
  height: number,
) {
  try {
    window.localStorage.setItem(
      UI_STORAGE_KEY,
      JSON.stringify({ ...(position ?? {}), open, height }),
    );
  } catch {
    // 저장 실패는 무시 (시크릿 모드 등)
  }
}

function formatTime(iso: string) {
  const date = new Date(iso);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function formatDateKey(iso: string) {
  const date = new Date(iso);
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

function formatDateLabel(iso: string) {
  const date = new Date(iso);
  return `${date.getMonth() + 1}월 ${date.getDate()}일`;
}

export function LiveChatWidget() {
  const me = getAuthUser();
  const myId = me?.id ?? null;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isOpen, setIsOpen] = useState(
    () => typeof window !== "undefined" && readStoredUi()?.open === true,
  );
  const [height, setHeight] = useState(() => {
    if (typeof window === "undefined") {
      return DEFAULT_HEIGHT;
    }
    const stored = readStoredUi()?.height;
    return stored != null ? clampHeight(stored) : DEFAULT_HEIGHT;
  });
  const [position, setPosition] = useState<Position | null>(() => {
    if (typeof window === "undefined") {
      return null;
    }
    const stored = readStoredUi();
    const nextHeight =
      stored?.height != null ? clampHeight(stored.height) : DEFAULT_HEIGHT;
    return stored?.position
      ? clampPosition(stored.position, nextHeight)
      : defaultPosition(nextHeight);
  });
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [unread, setUnread] = useState(0);
  const [blocked, setBlocked] = useState(false);
  const [canDrag, setCanDrag] = useState(
    () => typeof window !== "undefined" && window.innerWidth >= DRAG_MIN_WIDTH,
  );

  const lastIdRef = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);
  const dragOffsetRef = useRef<Position | null>(null);
  const resizeStartRef = useRef<{ y: number; height: number } | null>(null);
  const isOpenRef = useRef(false);
  const heightRef = useRef(height);
  const positionRef = useRef(position);

  useEffect(() => {
    isOpenRef.current = isOpen;
  }, [isOpen]);

  useEffect(() => {
    heightRef.current = height;
  }, [height]);

  useEffect(() => {
    positionRef.current = position;
  }, [position]);

  useEffect(() => {
    const handleResize = () => {
      setCanDrag(window.innerWidth >= DRAG_MIN_WIDTH);
      setHeight((current) => {
        const next = clampHeight(current);
        setPosition((pos) => (pos ? clampPosition(pos, next) : pos));
        return next;
      });
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const loadMessages = useCallback(async () => {
    const since = lastIdRef.current;
    const query = since > 0 ? `?since=${since}` : "";

    try {
      const response = await apiFetch(`/api/chat/messages${query}`);
      if (response.status === 403) {
        setBlocked(true);
        return;
      }
      if (!response.ok) {
        return;
      }

      const data = (await response.json()) as ChatMessage[];
      if (!Array.isArray(data) || data.length === 0) {
        return;
      }

      lastIdRef.current = data[data.length - 1].id;
      setMessages((current) => {
        const merged = since > 0 ? [...current, ...data] : data;
        return merged.slice(-300);
      });

      if (!isOpenRef.current && since > 0) {
        const fromOthers = data.filter(
          (message) => message.senderId !== myId,
        ).length;
        if (fromOthers > 0) {
          setUnread((count) => count + fromOthers);
        }
      }
    } catch {
      // 폴링 오류는 무시
    }
  }, [myId]);

  useEffect(() => {
    if (blocked) {
      return;
    }

    const initial = window.setTimeout(() => {
      void loadMessages();
    }, 0);
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      void loadMessages();
    }, POLL_MS);

    const handleVisibility = () => {
      if (!document.hidden) void loadMessages();
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [blocked, loadMessages]);

  useEffect(() => {
    if (!isOpen) return;
    const list = listRef.current;
    if (list) {
      list.scrollTop = list.scrollHeight;
    }
  }, [isOpen, messages]);

  const persistUi = (nextOpen: boolean, nextPosition = position, nextHeight = height) => {
    storeUi(nextPosition, nextOpen, nextHeight);
  };

  const openPanel = () => {
    setIsOpen(true);
    setUnread(0);
    persistUi(true);
  };

  const minimizePanel = () => {
    setIsOpen(false);
    persistUi(false);
  };

  const handleDragStart = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!canDrag || !position) return;
    if ((event.target as HTMLElement).closest("button")) return;

    dragOffsetRef.current = {
      x: event.clientX - position.x,
      y: event.clientY - position.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleDragMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const offset = dragOffsetRef.current;
    if (!offset) return;
    setPosition(
      clampPosition(
        {
          x: event.clientX - offset.x,
          y: event.clientY - offset.y,
        },
        height,
      ),
    );
  };

  const handleDragEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragOffsetRef.current) return;
    dragOffsetRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
    persistUi(true, positionRef.current, heightRef.current);
  };

  const handleResizeStart = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    resizeStartRef.current = { y: event.clientY, height: heightRef.current };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleResizeMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = resizeStartRef.current;
    if (!start) return;

    const raw = start.height + (event.clientY - start.y);
    const maxHeight = maxHeightForViewport();
    const nextHeight = Math.min(Math.max(raw, MIN_HEIGHT), maxHeight);
    const currentPos = positionRef.current;

    if (currentPos) {
      const overflow =
        currentPos.y + nextHeight + EDGE_GAP - window.innerHeight;
      const nextPos =
        overflow > 0
          ? clampPosition(
              { x: currentPos.x, y: currentPos.y - overflow },
              nextHeight,
            )
          : clampPosition(currentPos, nextHeight);
      setPosition(nextPos);
    }

    setHeight(nextHeight);
  };

  const handleResizeEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!resizeStartRef.current) return;
    resizeStartRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
    persistUi(true, positionRef.current, heightRef.current);
  };

  const sendMessage = async () => {
    const body = input.trim();
    if (!body || isSending) return;

    setIsSending(true);
    try {
      const response = await apiFetch("/api/chat/messages", {
        method: "POST",
        body: JSON.stringify({ body }),
      });

      if (!response.ok) {
        return;
      }

      const created = (await response.json()) as ChatMessage;
      setInput("");
      lastIdRef.current = Math.max(lastIdRef.current, created.id);
      setMessages((current) =>
        current.some((message) => message.id === created.id)
          ? current
          : [...current, created],
      );
    } catch {
      // 전송 실패 시 입력값을 남겨 다시 시도할 수 있게 둡니다.
    } finally {
      setIsSending(false);
    }
  };

  if (blocked || !me || (me.role !== "admin" && me.role !== "factory")) {
    return null;
  }

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={openPanel}
        aria-label="관리자 채팅 열기"
        className="fixed right-5 bottom-5 z-[60] flex items-center gap-2 rounded-full border border-[#1A365D] bg-[#1A365D] px-4 py-3 text-[13px] font-bold text-white shadow-[0_12px_28px_rgba(18,38,63,0.28)] hover:bg-[#22456f]"
      >
        <MessageSquare className="size-4" />
        관리자 채팅
        {unread > 0 ? (
          <span className="ml-0.5 inline-flex min-w-5 items-center justify-center rounded-full bg-[#E53E3E] px-1.5 py-0.5 text-[11px] leading-none font-bold text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </button>
    );
  }

  const panelStyle = canDrag && position
    ? {
        left: position.x,
        top: position.y,
        width: PANEL_WIDTH,
        height,
      }
    : {
        height:
          typeof window === "undefined"
            ? height
            : Math.min(height, Math.round(window.innerHeight * 0.85)),
      };

  return (
    <section
      aria-label="관리자 라이브 채팅"
      style={panelStyle}
      className={cn(
        "fixed z-[60] flex flex-col overflow-hidden rounded-xl border border-[#CBD5E0] bg-white shadow-[0_18px_44px_rgba(18,38,63,0.22)]",
        canDrag ? "" : "inset-x-3 bottom-3",
      )}
    >
      <div
        onPointerDown={handleDragStart}
        onPointerMove={handleDragMove}
        onPointerUp={handleDragEnd}
        onPointerCancel={handleDragEnd}
        className={cn(
          "flex items-center justify-between gap-2 border-b border-[#CBD5E0] bg-[#1A365D] px-3 py-2 text-white select-none",
          canDrag ? "cursor-move" : "",
        )}
      >
        <p className="flex items-center gap-1.5 text-[13px] font-bold">
          <MessageSquare className="size-4" />
          관리자 채팅
        </p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={minimizePanel}
            aria-label="채팅 최소화"
            className="rounded p-1 hover:bg-white/15"
          >
            <Minus className="size-4" />
          </button>
          <button
            type="button"
            onClick={minimizePanel}
            aria-label="채팅 닫기"
            className="rounded p-1 hover:bg-white/15"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      <div
        ref={listRef}
        className="flex-1 space-y-2 overflow-y-auto bg-[#EDF2F7] px-3 py-3"
      >
        {messages.length === 0 ? (
          <p className="mt-6 text-center text-[12px] text-[#64748B]">
            아직 대화가 없습니다.
          </p>
        ) : (
          messages.map((message, index) => {
            const previous = index > 0 ? messages[index - 1] : null;
            const showDate =
              !previous ||
              formatDateKey(previous.createdAt) !==
                formatDateKey(message.createdAt);

            if (message.kind === "SYSTEM") {
              return (
                <div key={message.id}>
                  {showDate ? <DateDivider iso={message.createdAt} /> : null}
                  <p className="text-center text-[11px] text-[#64748B]">
                    {message.body}
                  </p>
                </div>
              );
            }

            const mine = message.senderId != null && message.senderId === myId;

            return (
              <div key={message.id}>
                {showDate ? <DateDivider iso={message.createdAt} /> : null}
                <div
                  className={cn(
                    "flex flex-col gap-0.5",
                    mine ? "items-start" : "items-end",
                  )}
                >
                  {mine ? null : (
                    <p className="px-1 text-[11px] font-semibold text-[#4A5568]">
                      {message.senderLabel} {message.senderName}님
                    </p>
                  )}
                  <div
                    className={cn(
                      "flex max-w-[85%] items-end gap-1",
                      mine ? "flex-row" : "flex-row-reverse",
                    )}
                  >
                    <p
                      className={cn(
                        "rounded-2xl px-3 py-2 text-[13px] leading-snug break-words whitespace-pre-wrap",
                        mine
                          ? "bg-[#3182CE] text-white"
                          : "bg-white text-[#1A202C]",
                      )}
                    >
                      {message.body}
                    </p>
                    <span className="shrink-0 text-[10px] text-[#718096]">
                      {formatTime(message.createdAt)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="flex items-end gap-2 border-t border-[#CBD5E0] bg-white p-2">
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void sendMessage();
            }
          }}
          rows={2}
          maxLength={1000}
          placeholder="메시지를 입력하세요 (Enter 전송, Shift+Enter 줄바꿈)"
          className="min-h-[42px] flex-1 resize-none rounded-lg border border-[#E2E8F0] px-2.5 py-2 text-[13px] text-[#1A202C] placeholder:text-[#A0AEC0] focus:border-[#3182CE] focus:outline-none"
        />
        <button
          type="button"
          onClick={() => void sendMessage()}
          disabled={isSending || !input.trim()}
          aria-label="메시지 전송"
          className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[#1A365D] text-white disabled:bg-[#A0AEC0]"
        >
          <Send className="size-4" />
        </button>
      </div>

      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="채팅창 길이 조절"
        onPointerDown={handleResizeStart}
        onPointerMove={handleResizeMove}
        onPointerUp={handleResizeEnd}
        onPointerCancel={handleResizeEnd}
        className="flex h-3 shrink-0 cursor-ns-resize items-center justify-center bg-[#F7FAFC] hover:bg-[#E2E8F0]"
      >
        <span className="block h-1 w-10 rounded-full bg-[#CBD5E0]" />
      </div>
    </section>
  );
}

function DateDivider({ iso }: { iso: string }) {
  return (
    <p className="my-2 text-center text-[11px] font-semibold text-[#718096]">
      {formatDateLabel(iso)}
    </p>
  );
}
