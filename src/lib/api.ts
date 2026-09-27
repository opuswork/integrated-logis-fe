import { API_BASE_URL } from "@/lib/env";
import { clearAuthUser, getAccessToken } from "@/lib/auth";

// 세션 만료: 로그인 요청이 아닌 API가 401이면 로그인 화면으로 보낸다.
// (화면 안에 빨간 "Unauthorized"만 뜨고 헤더·사이드바가 남던 문제)
let redirectingToLogin = false;
function handleUnauthorized(path: string, response: Response) {
  if (
    response.status !== 401 ||
    path.includes("/api/auth/login") ||
    redirectingToLogin ||
    typeof window === "undefined"
  ) {
    return;
  }
  redirectingToLogin = true;
  clearAuthUser();
  window.location.replace("/login?reason=expired");
}

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

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
  });
  handleUnauthorized(path, response);
  if (redirectingToLogin) {
    // 로그인 화면으로 이동 중: 응답을 넘기지 않아 화면에 "Unauthorized"가 잠깐 뜨지 않게 한다.
    return new Promise<Response>(() => {});
  }
  return response;
}
