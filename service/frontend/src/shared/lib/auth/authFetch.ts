/**
 * 웹용 authFetch — @ailens/auth 의 플랫폼 중립 authFetch 에 Amplify provider 를 바인딩한 것.
 *
 * 로직(idToken→Bearer, requireAuth)은 @ailens/auth 로 이동했고, 여기서는 웹 플랫폼의
 * idToken 공급자(Amplify fetchAuthSession)만 주입한다. 호출부는 기존과 동일하게
 * `import { authFetch } from '@/shared/lib/auth/authFetch'` 로 쓴다(동작 불변).
 */
import { createAuthFetch, type AuthProvider } from '@ailens/auth';
import { loadAmplifyAuth } from '@/shared/lib/auth/amplifyLoader';

export { NotSignedInError } from '@ailens/auth';
export type { AuthFetchOptions } from '@ailens/auth';

const webAuthProvider: AuthProvider = {
  async getIdToken() {
    try {
      const { auth } = await loadAmplifyAuth();
      const session = await auth.fetchAuthSession();
      return session.tokens?.idToken?.toString();
    } catch {
      return undefined;
    }
  },
};

export const authFetch = createAuthFetch(webAuthProvider);
