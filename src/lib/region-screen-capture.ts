/** Capture one frame from getDisplayMedia (Snipping Tool–like first step). */

export type CapturedFrame = {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
};

export class CaptureCancelledError extends Error {
  constructor() {
    super("CAPTURE_CANCELLED");
    this.name = "CaptureCancelledError";
  }
}

export class CaptureUnsupportedError extends Error {
  constructor() {
    super("CAPTURE_UNSUPPORTED");
    this.name = "CaptureUnsupportedError";
  }
}

export async function captureDisplayFrame(): Promise<CapturedFrame> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getDisplayMedia) {
    throw new CaptureUnsupportedError();
  }

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: false,
      // Chromium: prefer this tab when available
      preferCurrentTab: true,
    } as DisplayMediaStreamOptions);
  } catch (error) {
    const name = error instanceof DOMException ? error.name : "";
    if (name === "NotAllowedError" || name === "AbortError") {
      throw new CaptureCancelledError();
    }
    throw error;
  }

  const video = document.createElement("video");
  video.playsInline = true;
  video.muted = true;
  video.srcObject = stream;

  try {
    await video.play();
    await waitForVideoFrame(video);

    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!width || !height) {
      throw new Error("빈 화면을 캡처했습니다.");
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("캔버스를 초기화하지 못했습니다.");
    }
    ctx.drawImage(video, 0, 0, width, height);

    return { canvas, width, height };
  } finally {
    stream.getTracks().forEach((track) => track.stop());
    video.srcObject = null;
  }
}

function waitForVideoFrame(video: HTMLVideoElement) {
  return new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      reject(new Error("화면 캡처 준비에 실패했습니다."));
    }, 8000);

    const done = () => {
      window.clearTimeout(timeout);
      // Allow first painted frame
      window.setTimeout(() => resolve(), 120);
    };

    if (video.readyState >= 2 && video.videoWidth > 0) {
      done();
      return;
    }

    video.onloadeddata = () => done();
    video.onerror = () => {
      window.clearTimeout(timeout);
      reject(new Error("화면 스트림을 재생하지 못했습니다."));
    };
  });
}

export function cropCanvas(
  source: HTMLCanvasElement,
  rect: { x: number; y: number; width: number; height: number },
): HTMLCanvasElement {
  const x = Math.max(0, Math.floor(rect.x));
  const y = Math.max(0, Math.floor(rect.y));
  const width = Math.max(1, Math.floor(rect.width));
  const height = Math.max(1, Math.floor(rect.height));

  const cropped = document.createElement("canvas");
  cropped.width = width;
  cropped.height = height;
  const ctx = cropped.getContext("2d");
  if (!ctx) {
    throw new Error("크롭 캔버스를 초기화하지 못했습니다.");
  }
  ctx.drawImage(source, x, y, width, height, 0, 0, width, height);
  return cropped;
}

export function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("PNG 변환에 실패했습니다."));
        return;
      }
      resolve(blob);
    }, "image/png");
  });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function copyPngBlobToClipboard(blob: Blob): Promise<boolean> {
  try {
    if (!navigator.clipboard || typeof ClipboardItem === "undefined") {
      return false;
    }
    await navigator.clipboard.write([
      new ClipboardItem({ "image/png": blob }),
    ]);
    return true;
  } catch {
    return false;
  }
}

export function packagingCaptureFilename(now = new Date()) {
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    "_",
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join("");
  return `포장관리_캡쳐_${stamp}.png`;
}
