/** PNG save / clipboard helpers for packaging screen capture. */

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

/**
 * 브라우저의 다운로드 폴더로 바로 내려받는다.
 *
 * 앵커를 DOM 에 붙였다 떼는 이유: 문서에 붙지 않은 앵커의 click() 을 무시하는
 * 브라우저가 있다. 이 경로가 캡처 이미지를 저장하는 유일한 수단이라 확실하게 둔다.
 */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
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

/**
 * 캡처 PNG 를 저장한다. 저장 위치를 묻지 않고 바로 다운로드 폴더에 내려받는다.
 *
 * 예전에는 File System Access API(`showSaveFilePicker`)를 먼저 썼는데, 그러면
 * Chromium 계열에서 매번 저장 위치를 고르는 창이 떴다. 캡처는 반복 작업이라
 * 그 단계가 불필요해서 일반 다운로드만 쓴다.
 *
 * 참고: 브라우저 설정의 '다운로드하기 전에 각 파일의 저장 위치 확인'이 켜져 있으면
 * 브라우저가 자체 저장창을 띄운다. 이건 페이지에서 끌 수 있는 값이 아니다.
 */
export function savePngBlob(blob: Blob, filename: string) {
  downloadBlob(blob, filename);
}
