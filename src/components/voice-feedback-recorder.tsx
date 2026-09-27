"use client";

import { Loader2, Mic, Pause, Play, Square } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";

/** 녹음 최대 길이 (초) — 넘으면 자동으로 멈추고 저장한다. */
const MAX_RECORD_SEC = 5 * 60;
const THANKS_MESSAGE = "피드백, 감사합니다.";

// m4a(AAC)를 우선 사용하고, 지원하지 않는 브라우저(안드로이드 크롬 등)는 webm 으로 녹음 → 서버에서 m4a 로 변환한다.
const PREFERRED_MIME_TYPES = [
  "audio/mp4;codecs=mp4a.40.2",
  "audio/mp4",
  "audio/webm;codecs=opus",
  "audio/webm",
];

type RecorderState = "idle" | "recording" | "paused" | "saving" | "done";

function pickMimeType() {
  if (typeof MediaRecorder === "undefined") return undefined;
  return PREFERRED_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
}

function formatElapsed(sec: number) {
  return `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
}

/**
 * 화면 우측 상단에 두는 음성 불편·오류 신고 녹음기.
 * 마이크 → 녹음(정지/일시정지) → 저장 → "피드백, 감사합니다." → 다시 마이크.
 */
export function VoiceFeedbackRecorder({
  screen,
  title = "불편 오류 신고",
  className,
}: {
  /** 녹음한 화면 이름 (파일관리에 함께 저장) */
  screen: string;
  title?: string;
  className?: string;
}) {
  const [state, setState] = useState<RecorderState>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState("");

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const elapsedRef = useRef(0);
  const doneTimerRef = useRef<number | null>(null);

  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  // 녹음 중일 때만 1초씩 증가 (일시정지 동안은 멈춤)
  useEffect(() => {
    if (state !== "recording") return;
    const id = window.setInterval(() => {
      elapsedRef.current += 1;
      setElapsed(elapsedRef.current);
      if (elapsedRef.current >= MAX_RECORD_SEC) {
        recorderRef.current?.stop();
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [state]);

  useEffect(() => {
    return () => {
      if (doneTimerRef.current) window.clearTimeout(doneTimerRef.current);
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        recorder.onstop = null;
        recorder.stop();
      }
      releaseStream();
    };
  }, [releaseStream]);

  const upload = useCallback(
    async (blob: Blob, durationSec: number) => {
      setState("saving");
      try {
        const ext = blob.type.startsWith("audio/mp4") ? "m4a" : "webm";
        const form = new FormData();
        form.append("audio", blob, `recording.${ext}`);
        form.append("screen", screen);
        form.append("durationSec", String(durationSec));
        const res = await apiFetch("/api/voice-recordings", {
          method: "POST",
          body: form,
        });
        if (!res.ok) {
          // 원인을 휴대폰 화면에서도 알 수 있게 서버 메시지(없으면 상태코드)를 보여준다.
          let serverMessage = "";
          try {
            const data = (await res.json()) as { message?: string | string[] };
            serverMessage = Array.isArray(data.message)
              ? data.message.join(" ")
              : (data.message ?? "");
          } catch {
            // JSON 이 아닌 응답
          }
          setError(
            /[가-힣]/.test(serverMessage)
              ? serverMessage
              : `저장에 실패했습니다. (${res.status}) 다시 시도해 주세요.`,
          );
          setState("idle");
          return;
        }
        setState("done");
        doneTimerRef.current = window.setTimeout(() => {
          setState("idle");
        }, 3000);
      } catch {
        setError("저장에 실패했습니다. (네트워크) 다시 시도해 주세요.");
        setState("idle");
      }
    },
    [screen],
  );

  const start = async () => {
    setError("");
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("이 브라우저는 녹음을 지원하지 않습니다.");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("마이크 권한을 허용해 주세요.");
      return;
    }

    const mimeType = pickMimeType();
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    streamRef.current = stream;
    recorderRef.current = recorder;
    chunksRef.current = [];
    elapsedRef.current = 0;
    setElapsed(0);

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.onstop = () => {
      releaseStream();
      recorderRef.current = null;
      const blob = new Blob(chunksRef.current, {
        type: recorder.mimeType || mimeType || "audio/webm",
      });
      chunksRef.current = [];
      if (blob.size === 0) {
        setError("녹음된 내용이 없습니다.");
        setState("idle");
        return;
      }
      void upload(blob, elapsedRef.current);
    };

    recorder.start(1000);
    setState("recording");
  };

  const stop = () => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
  };

  const togglePause = () => {
    const recorder = recorderRef.current;
    if (!recorder) return;
    if (recorder.state === "recording") {
      recorder.pause();
      setState("paused");
    } else if (recorder.state === "paused") {
      recorder.resume();
      setState("recording");
    }
  };

  const isActive = state === "recording" || state === "paused";

  return (
    <div
      className={cn(
        "flex min-w-[168px] flex-col items-center gap-1.5 rounded-xl border border-[#B794F4] bg-[#FAF5FF] px-3 py-2",
        className,
      )}
    >
      <p className="text-[13px] font-bold text-[#E53E3E]">{title}</p>

      {state === "idle" ? (
        <button
          type="button"
          onClick={() => void start()}
          aria-label="녹음 시작"
          className="flex size-9 items-center justify-center rounded-full bg-[#E53E3E] text-white shadow-sm transition hover:bg-[#C53030]"
        >
          <Mic className="size-[18px]" strokeWidth={2.5} />
        </button>
      ) : null}

      {isActive ? (
        <div className="flex items-center gap-2 rounded-md bg-[#1A365D] px-2 py-1.5">
          <button
            type="button"
            onClick={stop}
            aria-label="녹음 멈추고 저장"
            className="flex items-center gap-1.5 rounded-full bg-[#0F2440] py-1 pl-1 pr-2.5"
          >
            <span className="flex size-6 items-center justify-center rounded-full bg-[#E53E3E]">
              <Square className="size-2.5 fill-white text-white" />
            </span>
            <span
              className={cn(
                "text-[11px] tabular-nums text-[#FC8181]",
                state === "paused" && "animate-pulse",
              )}
            >
              {formatElapsed(elapsed)}
            </span>
          </button>
          <button
            type="button"
            onClick={togglePause}
            aria-label={state === "paused" ? "녹음 계속" : "일시정지"}
            className="flex size-7 items-center justify-center rounded-full bg-[#0F2440] text-white"
          >
            {state === "paused" ? (
              <Play className="size-3 fill-white" />
            ) : (
              <Pause className="size-3 fill-white" />
            )}
          </button>
        </div>
      ) : null}

      {state === "saving" ? (
        <p className="flex h-9 items-center gap-1.5 text-[12px] text-[#553C9A]">
          <Loader2 className="size-3.5 animate-spin" />
          저장 중…
        </p>
      ) : null}

      {state === "done" ? (
        <p className="flex h-9 items-center text-[13px] font-semibold text-[#2F855A]">
          {THANKS_MESSAGE}
        </p>
      ) : null}

      {error && state === "idle" ? (
        <p className="max-w-[180px] text-center text-[11px] text-[#C53030]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
