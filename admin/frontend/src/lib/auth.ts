// Localized JWT management — Cognito 안 씀 (Admin-1 결정).
// 8h 만료 → 만료 후 첫 호출에서 401 → /login redirect (adminClient 가 처리).

const TOKEN_KEY = "admin_jwt";
const EXPIRES_KEY = "admin_jwt_expires";

export function saveAuth(token: string, expiresAt: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(EXPIRES_KEY, expiresAt);
}

export function clearAuth(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(EXPIRES_KEY);
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  const token = localStorage.getItem(TOKEN_KEY);
  const expires = localStorage.getItem(EXPIRES_KEY);
  if (!token || !expires) return null;
  // 만료된 토큰은 즉시 폐기 — server-side 검증 전에 client-side cleanup.
  if (new Date(expires).getTime() <= Date.now()) {
    clearAuth();
    return null;
  }
  return token;
}

export function isAuthenticated(): boolean {
  return getToken() !== null;
}
