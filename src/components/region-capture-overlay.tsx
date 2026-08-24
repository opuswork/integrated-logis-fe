"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";

import { cn } from "@/lib/utils";

export type RegionRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type Props = {
  /** Full captured frame as data URL or object URL */
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  onComplete: (imageRect: RegionRect) => void;
  onCancel: () => void;
};

type Box = { left: number; top: number; width: number; height: number };

function containBox(
  containerW: number,
  containerH: number,
  imageW: number,
  imageH: number,
): Box {
  if (!containerW || !containerH || !imageW || !imageH) {
    return { left: 0, top: 0, width: containerW, height: containerH };
  }
  const scale = Math.min(containerW / imageW, containerH / imageH);
  const width = imageW * scale;
  const height = imageH * scale;
  return {
    left: (containerW - width) / 2,
    top: (containerH - height) / 2,
    width,
    height,
  };
}

/**
 * Fullscreen snipping overlay: drag to select a region on the captured frame.
 * Selection is reported in source-image pixel coordinates.
 */
export function RegionCaptureOverlay({
  imageUrl,
  imageWidth,
  imageHeight,
  onComplete,
  onCancel,
}: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [dragCurrent, setDragCurrent] = useState<{
    x: number;
    y: number;
  } | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCancel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const getImageBox = useCallback((): Box => {
    const stage = stageRef.current;
    if (!stage) {
      return { left: 0, top: 0, width: 0, height: 0 };
    }
    const rect = stage.getBoundingClientRect();
    return containBox(rect.width, rect.height, imageWidth, imageHeight);
  }, [imageHeight, imageWidth]);

  const toImageLocal = useCallback(
    (clientX: number, clientY: number) => {
      const stage = stageRef.current;
      if (!stage) return { x: 0, y: 0 };
      const stageRect = stage.getBoundingClientRect();
      const box = getImageBox();
      const x = clientX - stageRect.left - box.left;
      const y = clientY - stageRect.top - box.top;
      return {
        x: Math.min(Math.max(x, 0), box.width),
        y: Math.min(Math.max(y, 0), box.height),
      };
    },
    [getImageBox],
  );

  const selectionCss = (() => {
    if (!dragStart || !dragCurrent) return null;
    const box = getImageBox();
    const left = box.left + Math.min(dragStart.x, dragCurrent.x);
    const top = box.top + Math.min(dragStart.y, dragCurrent.y);
    const width = Math.abs(dragCurrent.x - dragStart.x);
    const height = Math.abs(dragCurrent.y - dragStart.y);
    return { left, top, width, height };
  })();

  const finish = useCallback(
    (end: { x: number; y: number }) => {
      if (!dragStart) return;
      const box = getImageBox();
      const left = Math.min(dragStart.x, end.x);
      const top = Math.min(dragStart.y, end.y);
      const width = Math.abs(end.x - dragStart.x);
      const height = Math.abs(end.y - dragStart.y);

      setDragStart(null);
      setDragCurrent(null);

      if (width < 4 || height < 4 || !box.width || !box.height) {
        return;
      }

      const scaleX = imageWidth / box.width;
      const scaleY = imageHeight / box.height;

      onComplete({
        x: left * scaleX,
        y: top * scaleY,
        width: width * scaleX,
        height: height * scaleY,
      });
    },
    [dragStart, getImageBox, imageHeight, imageWidth, onComplete],
  );

  const onMouseDown = (event: ReactMouseEvent) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const point = toImageLocal(event.clientX, event.clientY);
    setDragStart(point);
    setDragCurrent(point);
  };

  const onMouseMove = (event: ReactMouseEvent) => {
    if (!dragStart) return;
    setDragCurrent(toImageLocal(event.clientX, event.clientY));
  };

  const onMouseUp = (event: ReactMouseEvent) => {
    if (!dragStart) return;
    finish(toImageLocal(event.clientX, event.clientY));
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-black/70"
      role="dialog"
      aria-modal="true"
      aria-label="화면 영역 선택"
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3 text-sm text-white">
        <p>드래그하여 캡처할 영역을 선택하세요. Esc로 취소합니다.</p>
        <button
          type="button"
          className="rounded-md border border-white/40 px-3 py-1.5 font-semibold hover:bg-white/10"
          onClick={onCancel}
        >
          취소
        </button>
      </div>
      <div className="relative min-h-0 flex-1 px-3 pb-3">
        <div
          ref={stageRef}
          className={cn(
            "relative h-full w-full cursor-crosshair overflow-hidden rounded-lg bg-black",
            "select-none",
          )}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={() => {
            if (dragStart && dragCurrent) {
              finish(dragCurrent);
            }
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt=""
            draggable={false}
            className="pointer-events-none h-full w-full object-contain"
          />
          {selectionCss ? (
            <div
              className="pointer-events-none absolute border-2 border-[#63B3ED] bg-[#63B3ED]/20"
              style={{
                left: selectionCss.left,
                top: selectionCss.top,
                width: selectionCss.width,
                height: selectionCss.height,
              }}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
