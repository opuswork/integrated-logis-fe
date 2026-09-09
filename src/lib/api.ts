import { API_BASE_URL } from "@/lib/env";
import { getAccessToken } from "@/lib/auth";

// 중복로그인 방지 (비활성): 401 + "중복 로그인"이면 강제 로그아웃
// const DUPLICATE_LOGIN_MESSAGE = "중복 로그인을 허용하지 않습니다";
// let forcingDuplicateLogout = false;
// async function handleDuplicateLoginIfNeeded(path: string, response: Response) {
//   if (response.status !== 401 || path.includes("/api/auth/login") || forcingDuplicateLogout) {
//     return;
//   }
//   let message = "";
//   try {
//     const data = (await response.clone().json()) as { message?: string | string[] };
//     if (Array.isArray(data.message)) message = data.message.join(" ");
//     else if (typeof data.message === "string") message = data.message;
//   } catch {
//     return;
//   }
//   if (!message.includes("중복 로그인")) return;
//   forcingDuplicateLogout = true;
//   clearAuthUser();
//   alert(DUPLICATE_LOGIN_MESSAGE);
//   window.location.replace("/login");
// }

export async function apiFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = getAccessToken();

  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  // Let the browser set multipart boundary for FormData.
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  return fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
  });
}
