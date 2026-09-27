export type UserRole = "admin" | "member" | "factory";
export type AdminRegion = "JUNGBU" | "NAMBU" | "SEOBU";

export interface AuthUser {
  username: string;
  role: UserRole;
  name: string;
  id?: number;
  phone?: string;
  adminRegion?: AdminRegion | null;
  isSuperAdmin?: boolean;
  canApproveGreeting?: boolean;
}

const AUTH_STORAGE_KEY = "sanc-logistics-auth";
const TOKEN_STORAGE_KEY = "sanc-logistics-access-token";
/** 마지막 사용자 활동 시각(ms). 탭끼리 공유되고 새로고침해도 남는다. */
const LAST_ACTIVITY_KEY = "sanc-logistics-last-activity";

/** 관리자·공장: 24시간 동안 활동이 없으면 자동 로그아웃 */
export const ADMIN_IDLE_TIMEOUT_MS = 24 * 60 * 60 * 1000;
/** 개인회원: 1시간 동안 활동이 없으면 자동 로그아웃 */
export const MEMBER_IDLE_TIMEOUT_MS = 60 * 60 * 1000;

/**
 * 로그인 화면으로 보낼 때 붙이는 사유 (`/login?reason=...`)
 * - logout: 직접 로그아웃
 * - expired: 마지막 활동 후 24시간이 지나 세션 만료 (관리자·공장 무활동, 서버 토큰 만료)
 * - idle: 개인회원 1시간 무활동
 */
export type LogoutReason = "logout" | "expired" | "idle";

/** 무활동 자동 로그아웃의 사유: 24시간 규칙이면 expired, 더 짧으면(개인회원) idle */
export function idleReason(timeoutMs: number): LogoutReason {
  return timeoutMs >= ADMIN_IDLE_TIMEOUT_MS ? "expired" : "idle";
}

export function normalizeUserRole(role: string | undefined | null): UserRole {
  if (role === "ADMIN" || role === "admin") {
    return "admin";
  }
  if (role === "FACTORY" || role === "factory") {
    return "factory";
  }
  return "member";
}

export function normalizeAdminRegion(
  value: string | null | undefined,
): AdminRegion | null {
  if (value === "JUNGBU" || value === "NAMBU" || value === "SEOBU") {
    return value;
  }
  return null;
}

export function formatAdminPrivilegeLabel(
  adminRegion?: AdminRegion | null,
  isSuperAdmin?: boolean,
) {
  if (isSuperAdmin || !adminRegion) {
    return "최고관리자";
  }
  if (adminRegion === "NAMBU") {
    return "남부(기장) 관리자";
  }
  if (adminRegion === "SEOBU") {
    return "서부(소사) 관리자";
  }
  if (adminRegion === "JUNGBU") {
    return "중부(덕소) 관리자";
  }
  return "최고관리자";
}

/** 사이드바 표시: `홍길동 - 중부(덕소) 관리자` / `최고관리자` / 공장관리자 */
export function formatAdminSidebarTitle(user: AuthUser | null) {
  if (!user) {
    return "관리자";
  }
  if (user.role === "factory") {
    const name = user.name?.trim();
    if (user.canApproveGreeting) {
      return name ? `${name} - 인사장 승인` : "인사장 승인";
    }
    return name ? `${name} - 공장관리자` : "공장관리자";
  }
  const privilege = formatAdminPrivilegeLabel(
    user.adminRegion,
    user.isSuperAdmin,
  );
  if (privilege === "최고관리자") {
    return "최고관리자";
  }
  const name = user.name?.trim();
  if (!name) {
    return privilege;
  }
  return `${name} - ${privilege}`;
}

/** 공장 화면 표시: `[공장관리자 - 홍길동]` */
export function formatFactorySidebarTitle(user: AuthUser | null) {
  const name = user?.name?.trim();
  if (!name) {
    return "[공장관리자]";
  }
  return `[공장관리자 - ${name}]`;
}

export function getHomePathForRole(
  role: UserRole,
  _options?: { canApproveGreeting?: boolean },
) {
  if (role === "admin" || role === "factory") {
    return "/admin/OrderManagement";
  }
  return "/OrderManagement";
}

/** Factory-G: 인사장완료만 쓰기 가능 */
export const FACTORY_G_USERNAME = "01029647088";

export function isFactoryGUser(user: AuthUser | null | undefined): boolean {
  if (!user) return false;
  return (
    user.canApproveGreeting === true || user.username === FACTORY_G_USERNAME
  );
}

export function canApproveGreetingAction(
  user: AuthUser | null | undefined,
): boolean {
  return Boolean(user?.role === "factory" && isFactoryGUser(user));
}

/** 주문관리 체크리스트(확인·작업자·입금·전표) 쓰기 — 인사장 제외 */
export function canWriteOrderChecklist(
  user: AuthUser | null | undefined,
  storeRegion: AdminRegion | null,
): boolean {
  if (!user || user.role !== "admin") return false;
  if (user.isSuperAdmin || !user.adminRegion) return true;
  return storeRegion != null && storeRegion === user.adminRegion;
}

/** 배송·출고·포장 쓰기: 공장(비-G) + 최고관리자 */
export function canWriteShipmentOps(
  user: AuthUser | null | undefined,
): boolean {
  if (!user) return false;
  if (isFactoryGUser(user)) return false;
  if (user.role === "factory") return true;
  if (user.role === "admin" && (user.isSuperAdmin || !user.adminRegion)) {
    return true;
  }
  return false;
}

/**
 * 출고요청일 변경: 공장(비-G) + 최고관리자 + 관할 매장관리자.
 *
 * 포장·출고와 달리 현장 작업이 아니라 "언제까지 내보내 달라"는 요청이라
 * 주문을 받은 매장이 직접 잡는다. 관할 밖 주문은 여전히 막힌다.
 */
export function canWriteShipDate(
  user: AuthUser | null | undefined,
  storeRegion: AdminRegion | null,
): boolean {
  return (
    canWriteShipmentOps(user) || canPressShipmentFinalActions(user, storeRegion)
  );
}

/**
 * 배송관리 최종완료·최종확인:
 * 관할 매장관리자 + 최고관리자 (공장·Factory-G 불가)
 */
export function canPressShipmentFinalActions(
  user: AuthUser | null | undefined,
  storeRegion: AdminRegion | null,
): boolean {
  if (!user || isFactoryGUser(user) || user.role === "factory") return false;
  return canWriteOrderChecklist(user, storeRegion);
}

export function isSuperAdmin(user: AuthUser | null | undefined): boolean {
  if (!user || user.role !== "admin") return false;
  return Boolean(user.isSuperAdmin) || user.adminRegion == null;
}

export function canCreateAdminOrder(
  user: AuthUser | null | undefined,
): boolean {
  return user?.role === "admin";
}

export function saveAuthUser(user: AuthUser, accessToken?: string) {
  if (typeof window === "undefined") {
    return;
  }

  const role = normalizeUserRole(user.role);
  const adminRegion = normalizeAdminRegion(user.adminRegion);
  window.localStorage.setItem(
    AUTH_STORAGE_KEY,
    JSON.stringify({
      ...user,
      role,
      adminRegion,
      isSuperAdmin:
        user.isSuperAdmin ?? (role === "admin" && adminRegion === null),
      canApproveGreeting: user.canApproveGreeting === true,
    }),
  );

  if (accessToken) {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, accessToken);
  }
  markActivity();
}

export function getAuthUser(): AuthUser | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as AuthUser;
    const role = normalizeUserRole(parsed.role);
    const adminRegion = normalizeAdminRegion(parsed.adminRegion);
    return {
      ...parsed,
      role,
      adminRegion,
      isSuperAdmin:
        parsed.isSuperAdmin ?? (role === "admin" && adminRegion === null),
      canApproveGreeting: parsed.canApproveGreeting === true,
    };
  } catch {
    return null;
  }
}

export function getAccessToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function setAccessToken(accessToken: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(TOKEN_STORAGE_KEY, accessToken);
}

export function clearAuthUser() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(AUTH_STORAGE_KEY);
  window.localStorage.removeItem(TOKEN_STORAGE_KEY);
  window.localStorage.removeItem(LAST_ACTIVITY_KEY);
}

export function isAuthStorageKey(key: string | null): boolean {
  return key === AUTH_STORAGE_KEY || key === TOKEN_STORAGE_KEY;
}

/** JWT의 발급(iat)·만료(exp) 시각을 ms로 읽는다. 서명은 서버가 검증한다. */
export function getTokenTimes(
  token: string | null,
): { issuedAt: number | null; expiresAt: number | null } {
  const empty = { issuedAt: null, expiresAt: null };
  const part = token?.split(".")[1];
  if (!part) {
    return empty;
  }

  try {
    const base64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const claims = JSON.parse(atob(padded)) as { iat?: number; exp?: number };
    return {
      issuedAt: typeof claims.iat === "number" ? claims.iat * 1000 : null,
      expiresAt: typeof claims.exp === "number" ? claims.exp * 1000 : null,
    };
  } catch {
    return empty;
  }
}

/** 토큰이 없거나, 읽을 수 없거나, 만료되었으면 true */
export function isAccessTokenExpired(): boolean {
  const { expiresAt } = getTokenTimes(getAccessToken());
  return expiresAt == null || expiresAt <= Date.now();
}

export function markActivity() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
}

export function getLastActivity(): number | null {
  if (typeof window === "undefined") {
    return null;
  }

  const value = Number(window.localStorage.getItem(LAST_ACTIVITY_KEY));
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** 마지막 활동 후 timeoutMs가 지났으면 true (기록이 없으면 false) */
export function isIdleExpired(timeoutMs: number): boolean {
  const last = getLastActivity();
  return last != null && Date.now() - last > timeoutMs;
}
