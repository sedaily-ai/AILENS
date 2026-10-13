/**
 * authFetch — Cognito ID token 을 붙여 호출하는 fetch wrapper (플랫폼 중립).
 *
 * 백엔드는 core/auth.py:verify_cognito_token 으로 Cognito JWT 를 검증하므로, 인증이 필요한
 * 모든 요청은 이 헬퍼를 거쳐 `Authorization: Bearer <idToken>` 헤더가 붙는다.
 *
 * 플랫폼 결합 제거: idToken 획득은 AuthProvider 로 주입받는다.
 *   - 웹:  Amplify fetchAuthSession 기반 provider
 *   - 앱:  aws-amplify RN(expo-secure-store 저장) 기반 provider
 * authFetch 자체는 Amplify 를 import 하지 않는다.
 */

/** idToken 공급자. 플랫폼(웹/앱)이 구현해 주입한다. */
export interface AuthProvider {
  /** 유효 세션의 Cognito ID token. 미로그인/실패 시 undefined. */
  getIdToken(): Promise<string | undefined>;
}

export interface AuthFetchOptions extends RequestInit {
  /** true(기본)이면 유효한 Cognito 세션이 없을 때 throw 한다. */
  requireAuth?: boolean;
}

export class NotSignedInError extends Error {
  constructor(message = 'Not signed in. This action requires authentication.') {
    super(message);
    this.name = 'NotSignedInError';
  }
}

/**
 * provider 를 바인딩해 authFetch 함수를 만든다. 호출부는 이 결과를 기존 authFetch 처럼 쓴다.
 */
export function createAuthFetch(provider: AuthProvider) {
  return async function authFetch(
    input: RequestInfo | URL,
    options: AuthFetchOptions = {}
  ): Promise<Response> {
    const { requireAuth = true, headers, ...rest } = options;

    const idToken = await provider.getIdToken();

    if (!idToken && requireAuth) {
      throw new NotSignedInError();
    }

    const merged = new Headers(headers as HeadersInit | undefined);
    if (idToken) {
      merged.set('Authorization', `Bearer ${idToken}`);
    }

    return fetch(input, { ...rest, headers: merged });
  };
}
