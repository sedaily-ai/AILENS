/**
 * `authFetch` — Cognito ID token을 붙여 호출하는 `fetch` wrapper.
 *
 * 백엔드는 `core/auth.py:verify_cognito_token`으로 Cognito JWT를 검증하므로, 인증이 필요한 모든 프런트엔드 요청은
 * 이 헬퍼를 거쳐 `Authorization: Bearer <idToken>` 헤더가 항상 붙도록 한다.
 *
 * 사용 예
 *   // 인증 필수(기본): 로그인하지 않았으면 throw한다.
 *   const res = await authFetch(`${API_URL}/api/user/profile`, {
 *     method: 'POST',
 *     headers: { 'Content-Type': 'application/json' },
 *     body: JSON.stringify({ ...payload }),
 *   });
 *
 *   // 선택 인증: 로그인했으면 토큰을 보내고 아니면 생략한다.
 *   // 로그인 시 개인화되지만 계정 없이도 동작하는 엔드포인트(추천 피드, 공개 아카이브 검색 등)에만 쓴다.
 *   const res = await authFetch(url, { requireAuth: false });
 */
import { loadAmplifyAuth } from '@/shared/lib/auth/amplifyLoader';

export interface AuthFetchOptions extends RequestInit {
  /** true(기본)이면 유효한 Cognito 세션이 없을 때 throw한다. */
  requireAuth?: boolean;
}

class NotSignedInError extends Error {
  constructor(message = 'Not signed in. This action requires authentication.') {
    super(message);
    this.name = 'NotSignedInError';
  }
}

async function getIdToken(): Promise<string | undefined> {
  try {
    const { auth } = await loadAmplifyAuth();
    const session = await auth.fetchAuthSession();
    return session.tokens?.idToken?.toString();
  } catch {
    return undefined;
  }
}

export async function authFetch(
  input: RequestInfo | URL,
  options: AuthFetchOptions = {}
): Promise<Response> {
  const { requireAuth = true, headers, ...rest } = options;

  const idToken = await getIdToken();

  if (!idToken && requireAuth) {
    throw new NotSignedInError();
  }

  // 호출자가 Headers, [string, string][], Record<string, string> 중 무엇을 넘겨도 평범한 Record로 합쳐, 겹칠 때 Authorization 키가 우선하게 한다.
  const merged = new Headers(headers as HeadersInit | undefined);
  if (idToken) {
    merged.set('Authorization', `Bearer ${idToken}`);
  }

  return fetch(input, { ...rest, headers: merged });
}
