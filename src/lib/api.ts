import { API_BASE_URL } from "@/lib/env";
import { clearAuthUser, getAccessToken } from "@/lib/auth";

// 세션 만료: 토큰을 보냈는데 401이면 로그인 화면으로 보낸다.
// (화면 안에 빨간 "Unauthorized"만 뜨고 헤더·사이드바가 남던 문제)
// 토큰 없이 나간 요청(로그아웃 직후 남은 폴링 등)은 만료가 아니므로 건너뛴다.
let redirectingToLogin = false;
function handleUnauthorized(
  path: string,
  response: Response,
  sentToken: string | null,
) {
  if (
    response.status !== 401 ||
    !sentToken ||
    getAccessToken() !== sentToken ||
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
  handleUnauthorized(path, response, token);
  if (redirectingToLogin) {
    // 로그인 화면으로 이동 중: 응답을 넘기지 않아 화면에 "Unauthorized"가 잠깐 뜨지 않게 한다.
    return new Promise<Response>(() => {});
  }
  return response;
}
