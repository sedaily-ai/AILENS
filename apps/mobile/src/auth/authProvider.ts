import { fetchAuthSession } from 'aws-amplify/auth';
import { createAuthFetch, type AuthProvider } from '@ailens/auth';

/** 웹과 같은 계약: 유효 세션이면 Cognito idToken, 아니면 undefined(만료 시 Amplify 가 refresh token 으로 갱신). */
export const nativeAuthProvider: AuthProvider = {
  async getIdToken() {
    try {
      const session = await fetchAuthSession();
      return session.tokens?.idToken?.toString();
    } catch {
      return undefined;
    }
  },
};

/** 인증이 필요한 API 호출용 fetch. `Authorization: Bearer <idToken>` 을 붙인다. */
export const authFetch = createAuthFetch(nativeAuthProvider);
