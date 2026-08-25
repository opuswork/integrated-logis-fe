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
 * 작업자=매장 주문의 배송관리 최종확인:
 * 공장/최고관리자 + 해당 지역 매장관리자
 */
export function canFinalConfirmStoreShipment(
  user: AuthUser | null | undefined,
  storeRegion: AdminRegion | null,
): boolean {
  if (canWriteShipmentOps(user)) return true;
  return canWriteOrderChecklist(user, storeRegion);
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
  window.sessionStorage.setItem(
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
    window.sessionStorage.setItem(TOKEN_STORAGE_KEY, accessToken);
  }
}

export function getAuthUser(): AuthUser | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.sessionStorage.getItem(AUTH_STORAGE_KEY);
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

  return window.sessionStorage.getItem(TOKEN_STORAGE_KEY);
}

export function clearAuthUser() {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.removeItem(AUTH_STORAGE_KEY);
  window.sessionStorage.removeItem(TOKEN_STORAGE_KEY);
}
