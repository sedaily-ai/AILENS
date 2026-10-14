import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getCurrentUser, signInWithRedirect, signOut as amplifySignOut, fetchUserAttributes } from 'aws-amplify/auth';
import { Hub } from 'aws-amplify/utils';

export type AuthState =
  | { status: 'loading' }
  | { status: 'signedOut' }
  | { status: 'signedIn'; email?: string };

interface AuthContextValue {
  state: AuthState;
  /** Google 로그인(Cognito Hosted UI, 시스템 브라우저). */
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  /** 이메일 로그인·인증 직후 등 세션이 바뀐 뒤 상태를 다시 읽는다. */
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  const refresh = useCallback(async () => {
    try {
      await getCurrentUser();
      const attrs = await fetchUserAttributes().catch(() => undefined);
      setState({ status: 'signedIn', email: attrs?.email });
    } catch {
      setState({ status: 'signedOut' });
    }
  }, []);

  useEffect(() => {
    void refresh();
    // 리다이렉트 복귀·로그아웃·토큰 갱신 실패를 Hub 로 받는다.
    return Hub.listen('auth', ({ payload }) => {
      if (payload.event === 'signInWithRedirect' || payload.event === 'signedIn') void refresh();
      if (payload.event === 'signedOut' || payload.event === 'signInWithRedirect_failure') void refresh();
    });
  }, [refresh]);

  const value = useMemo<AuthContextValue>(
    () => ({
      state,
      signIn: () => signInWithRedirect({ provider: 'Google' }),
      refresh,
      signOut: async () => {
        await amplifySignOut();
        setState({ status: 'signedOut' });
      },
    }),
    [state, refresh]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth 는 <AuthProvider> 안에서만 쓸 수 있습니다.');
  return ctx;
}
