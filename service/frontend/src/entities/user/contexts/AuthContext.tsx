import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import { API_URL } from '@/shared/config/apiClient';
import { authFetch } from '@/shared/lib/auth/authFetch';
import { loadAmplifyAuth } from '@/shared/lib/auth/amplifyLoader';
import { PASSWORD_REQUIREMENT_MESSAGE } from '@/shared/lib/auth/passwordPolicy';

// aws-amplify는 처음 쓰는 순간에만 불러와 첫 번들 크기를 줄인다. 아래 얇은 래퍼는 원래 함수와 이름·인자·반환이 같아 호출부는 그대로이며, Amplify.configure()는 로더가 처음 불러올 때 한 번 호출한다.
type AuthApi = typeof import('aws-amplify/auth');
function lazyAuth<K extends keyof AuthApi>(name: K) {
  type Fn = AuthApi[K] extends (...a: infer A) => infer R ? (...a: A) => R : never;
  return (async (...args: unknown[]) => {
    const { auth } = await loadAmplifyAuth();
    return (auth[name] as unknown as (...a: unknown[]) => unknown)(...args);
  }) as unknown as Fn extends (...a: infer A) => infer R ? (...a: A) => Promise<Awaited<R>> : never;
}
const signInWithRedirect = lazyAuth('signInWithRedirect');
const signOut = lazyAuth('signOut');
const getCurrentUser = lazyAuth('getCurrentUser');
const fetchAuthSession = lazyAuth('fetchAuthSession');
const signIn = lazyAuth('signIn');
const signUp = lazyAuth('signUp');
const autoSignIn = lazyAuth('autoSignIn');
const confirmSignUp = lazyAuth('confirmSignUp');
const resendSignUpCode = lazyAuth('resendSignUpCode');
const resetPassword = lazyAuth('resetPassword');
const confirmResetPassword = lazyAuth('confirmResetPassword');
const updatePassword = lazyAuth('updatePassword');

// 이 파일이 다루는 Cognito 예외 이름 — 상수로 모아 문자열 리터럴 오타를 줄이고 자동완성으로 참조하게 한다(`err.name`은 string이라 완전한 컴파일 타임 보장은 아니다).
const COGNITO_ERROR = {
  USER_NOT_CONFIRMED: 'UserNotConfirmedException',
  NOT_AUTHORIZED: 'NotAuthorizedException',
  USER_NOT_FOUND: 'UserNotFoundException',
  USERNAME_EXISTS: 'UsernameExistsException',
  INVALID_PASSWORD: 'InvalidPasswordException',
  CODE_MISMATCH: 'CodeMismatchException',
  EXPIRED_CODE: 'ExpiredCodeException',
  INVALID_PARAMETER: 'InvalidParameterException',
  LIMIT_EXCEEDED: 'LimitExceededException',
} as const;

interface User {
  userId: string;
  email?: string;
  name?: string;
  picture?: string;
  /**
   * 구글 등 소셜 로그인으로 만들어진 계정인지 여부. 이런 계정은 Cognito에 비밀번호가 없어 비밀번호 변경 화면을 보여줄 수 없다.
   * ID 토큰의 `identities` 클레임(연동 IdP로 로그인했을 때만 존재) 유무로 판별하며, 이는 Amplify 문서가 명시한 공식 판별 방법이다.
   */
  isFederated: boolean;
}

interface AuthResult {
  success: boolean;
  error?: string;
  needsConfirmation?: boolean;
  /**
   * 이 호출로 실제 로그인 세션까지 만들어졌는지 여부. 호출자가 홈으로 보낼지 로그인 폼을 다시 보여줄지 판단하는 데 쓴다.
   * 이메일 인증(`confirmSignUpCode`)은 성공했지만 autoSignIn이 실패해 `success: true` 이면서 `signedIn: false`인 경우가 있다.
   */
  signedIn?: boolean;
  /**
   * 실패 원인이 '인증 코드'인지 여부. 비밀번호 재설정은 코드와 새 비밀번호를 하나의 API 호출(`ConfirmForgotPassword`)로 보내므로 코드 오류를 새 비밀번호 화면에서야 알게 된다.
   * 호출자가 사용자를 코드 입력 단계로 되돌리려면 원인 구분이 필요하다.
   */
  codeInvalid?: boolean;
  /** 로그인 실패 원인이 '가입 도중 이탈(UNCONFIRMED)'인지 여부. LoginClient가 이 값으로 에러 문구에 "회원가입 이어하기" 같은 이동 수단을 붙인다. */
  unconfirmedAccount?: boolean;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<AuthResult>;
  signUpWithEmail: (email: string, password: string, name: string) => Promise<AuthResult>;
  confirmSignUpCode: (email: string, code: string) => Promise<AuthResult>;
  resendConfirmationCode: (email: string) => Promise<AuthResult>;
  forgotPassword: (email: string) => Promise<AuthResult>;
  confirmForgotPassword: (email: string, code: string, newPassword: string) => Promise<AuthResult>;
  changePassword: (oldPassword: string, newPassword: string) => Promise<AuthResult>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Sync user profile with backend.
  // The backend derives `user_id` from the verified JWT (`sub` claim). The body's `user_id` is ignored server-side but kept so that earlier pipelines reading the JSON body still see a stable value.
  const syncUserProfile = useCallback(async (userData: User) => {
    try {
      await authFetch(`${API_URL}/api/user/profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userData.userId,
          email: userData.email,
          name: userData.name,
          picture: userData.picture,
        }),
      });
    } catch (error) {
      console.error('Failed to sync user profile:', error);
    }
  }, []);

  // Check current auth state
  const checkUser = useCallback(async () => {
    try {
      const currentUser = await getCurrentUser();
      const session = await fetchAuthSession();
      const idToken = session.tokens?.idToken;

      if (currentUser && idToken) {
        const userData: User = {
          userId: currentUser.userId,
          email: idToken.payload.email as string,
          name: idToken.payload.name as string,
          picture: idToken.payload.picture as string,
          // `identities` 클레임은 Google 등 연동 IdP로 로그인했을 때만 ID 토큰에 실리며, 이메일/비밀번호 직접 가입 계정에는 없다.
          isFederated: Boolean(idToken.payload.identities),
        };
        setUser(userData);
        // Sync with backend
        syncUserProfile(userData);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, [syncUserProfile]);

  useEffect(() => {
    // 로그인 확인은 화면이 뜬 직후(한가할 때)로 미룬다. aws-amplify를 첫 번들에서 제외했으므로 하이드레이션과 겹쳐 내려받지 않게 한다.
    // 헤더의 "로그인" 표시는 isLoading 동안 유지되고, 확인이 끝나면 사용자 상태로 바뀐다.
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    const run = () => {
      if (cancelled) return;
      checkUser();
      // Listen for auth events
      loadAmplifyAuth()
        .then(({ utils }) => {
          if (cancelled) return;
          unsubscribe = utils.Hub.listen('auth', ({ payload }) => {
            switch (payload.event) {
              case 'signInWithRedirect':
                checkUser();
                break;
              case 'signedOut':
                setUser(null);
                break;
            }
          });
        })
        .catch(() => {
          // 로드 실패 시 이벤트 구독만 포기한다. 로그인 확인(checkUser)은 위에서 이미 시도했다.
        });
    };
    const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    const idleId = ric ? ric(run, { timeout: 1200 }) : window.setTimeout(run, 300);

    return () => {
      cancelled = true;
      if (!ric) window.clearTimeout(idleId);
      unsubscribe?.();
    };
  }, [checkUser]);

  const signInWithGoogle = async () => {
    try {
      await signInWithRedirect({ provider: 'Google' });
    } catch (error) {
      console.error('Google sign in error:', error);
    }
  };

  // 로그인 화면에서는 이메일 인증 단계를 노출하지 않으며, 인증은 회원가입 흐름(가입 → 코드 입력 → 자동 로그인)에서만 끝낸다.
  // 따라서 로그인 중 UNCONFIRMED를 만나는 경우는 가입 도중 코드 입력을 이탈한 계정뿐이며, 이때 코드 화면으로 보내지 않고 회원가입을 다시 진행하도록 안내한다.
  //
  // 주의: 같은 이메일로 `signUp()`을 다시 호출하면 인증 코드 재발송 없이 `UsernameExistsException`이 발생한다.
  // 실제 복구는 `signUpWithEmail`의 `UsernameExistsException` 분기가 담당하며, 거기서 `resendSignUpCode`를 먼저 시도해 UNCONFIRMED면 인증 코드를 재발송하고 인증 화면으로 보낸다.
  const UNCONFIRMED_LOGIN_MESSAGE =
    '가입이 완료되지 않은 계정이에요. 회원가입을 다시 진행하면 인증 코드를 새로 보내드려요.';

  // 로그인 실패는 항상 이 문구 하나로 통일한다(계정 열거 방지). 존재 여부를 알려주는 별도 문구를 두면 이메일 목록을 대입해 가입 여부를 확인할 수 있다.
  const WRONG_CREDENTIALS_MESSAGE = '이메일 또는 비밀번호가 올바르지 않습니다.';

  // Email/Password Sign In
  const signInWithEmail = async (email: string, password: string): Promise<AuthResult> => {
    try {
      const result = await signIn({ username: email, password });

      if (result.isSignedIn) {
        await checkUser();
        return { success: true, signedIn: true };
      }

      if (result.nextStep?.signInStep === 'CONFIRM_SIGN_UP') {
        return { success: false, error: UNCONFIRMED_LOGIN_MESSAGE, unconfirmedAccount: true };
      }

      return { success: false, error: '로그인에 실패했습니다.' };
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('Email sign in error:', error);

      if (err.name === COGNITO_ERROR.USER_NOT_CONFIRMED) {
        return { success: false, error: UNCONFIRMED_LOGIN_MESSAGE, unconfirmedAccount: true };
      }
      // NotAuthorizedException(비밀번호 틀림)과 UserNotFoundException(미가입)을 같은 문구로 합쳐 계정 열거를 막는다. 그 외 알 수 없는 예외도 원본 Cognito 메시지를 노출하지 않고 이 기본 문구로 처리한다.
      return { success: false, error: WRONG_CREDENTIALS_MESSAGE };
    }
  };

  // Email/Password Sign Up
  const signUpWithEmail = async (email: string, password: string, name: string): Promise<AuthResult> => {
    try {
      const result = await signUp({
        username: email,
        password,
        options: {
          userAttributes: {
            email,
            name,
          },
          // 인증 코드 확정(confirmSignUpCode) 직후 그 자리에서 세션을 받기 위한 옵션. Amplify v6부터 autoSignIn은 자동 실행되지 않고 COMPLETE_AUTO_SIGN_IN 단계에서 직접 호출해야 한다.
          autoSignIn: true,
        },
      });

      // 정상 경로 — 유저풀 AutoVerifiedAttributes에 email이 설정되어 있어 가입은 항상 인증 코드 입력을 요구한다.
      if (result.nextStep?.signUpStep === 'CONFIRM_SIGN_UP') {
        return { success: true, needsConfirmation: true };
      }

      if (result.isSignUpComplete) {
        return { success: true };
      }

      return { success: true };
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('Sign up error:', error);

      if (err.name === COGNITO_ERROR.USERNAME_EXISTS) {
        // 이 이메일이 UNCONFIRMED 상태로 가입 도중 이탈한 계정일 수 있다. signUp()은 UNCONFIRMED여도 코드를 재발송하지 않고 UsernameExistsException만 던지므로,
        // "이미 등록된 이메일"만 보여주면 로그인↔가입을 오가는 루프에 빠진다. resendSignUpCode를 먼저 시도해 성공하면(=UNCONFIRMED) 새 가입과 동일하게 인증 화면으로 보내 루프를 끊는다.
        // CONFIRMED 계정에서는 resendSignUpCode가 InvalidParameterException("User is already confirmed")으로 실패하므로 이 분기가 가입 여부를 새로 노출하지 않는다(계정 열거 방지).
        try {
          await resendSignUpCode({ username: email });
          return { success: true, needsConfirmation: true };
        } catch (resendError: unknown) {
          console.error('Resend on existing-username signup failed:', resendError);
          return { success: false, error: '이미 등록된 이메일입니다.' };
        }
      }
      if (err.name === COGNITO_ERROR.INVALID_PASSWORD) {
        return { success: false, error: PASSWORD_REQUIREMENT_MESSAGE };
      }

      return { success: false, error: '회원가입에 실패했습니다.' };
    }
  };

  // Confirm Sign Up Code
  const confirmSignUpCode = async (email: string, code: string): Promise<AuthResult> => {
    try {
      const result = await confirmSignUp({ username: email, confirmationCode: code });

      if (result.isSignUpComplete) {
        // 인증이 끝났으면 로그인 폼으로 되돌리지 않고 그 자리에서 세션을 만든다. signUp을 autoSignIn: true로 호출했을 때만 이 단계가 온다.
        if (result.nextStep?.signUpStep === 'COMPLETE_AUTO_SIGN_IN') {
          try {
            const autoResult = await autoSignIn();
            if (autoResult.isSignedIn) {
              await checkUser();
              return { success: true, signedIn: true };
            }
          } catch (autoError) {
            // autoSignIn은 signUp을 호출한 브라우저 컨텍스트에 의존한다(중간에 새로고침/탭 이동 시 실패). 인증 자체는 성공했으므로 호출자가 로그인 폼으로 돌려보내면 된다.
            console.error('Auto sign in after confirmation failed:', autoError);
          }
        }
        return { success: true };
      }

      return { success: false, error: '인증에 실패했습니다.' };
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('Confirm sign up error:', error);

      if (err.name === COGNITO_ERROR.CODE_MISMATCH) {
        return { success: false, error: '인증 코드가 올바르지 않습니다.' };
      }
      if (err.name === COGNITO_ERROR.EXPIRED_CODE) {
        return { success: false, error: '인증 코드가 만료되었습니다. 다시 요청해주세요.' };
      }

      return { success: false, error: '인증에 실패했습니다.' };
    }
  };

  // Resend Confirmation Code
  const resendConfirmationCode = async (email: string): Promise<AuthResult> => {
    try {
      await resendSignUpCode({ username: email });
      return { success: true };
    } catch (error: unknown) {
      console.error('Resend code error:', error);
      return { success: false, error: '코드 재전송에 실패했습니다.' };
    }
  };

  // Forgot Password
  const forgotPassword = async (email: string): Promise<AuthResult> => {
    try {
      await resetPassword({ username: email });
      return { success: true };
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('Forgot password error:', error);

      // 미가입 이메일도 성공과 동일하게 처리한다(계정 열거 방지). 코드는 실제로 발송되지 않지만 화면·문구는 가입된 이메일과 구분되지 않으며, LoginClient가 그대로 resetCode 단계로 넘어간다.
      if (err.name === COGNITO_ERROR.USER_NOT_FOUND) {
        return { success: true };
      }

      return { success: false, error: '비밀번호 재설정 요청에 실패했습니다.' };
    }
  };

  // Confirm Forgot Password (Reset Password)
  const confirmForgotPassword = async (email: string, code: string, newPassword: string): Promise<AuthResult> => {
    try {
      await confirmResetPassword({
        username: email,
        confirmationCode: code,
        newPassword,
      });
      return { success: true };
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('Confirm forgot password error:', error);

      if (err.name === COGNITO_ERROR.CODE_MISMATCH) {
        return { success: false, codeInvalid: true, error: '인증 코드가 올바르지 않습니다.' };
      }
      if (err.name === COGNITO_ERROR.EXPIRED_CODE) {
        return {
          success: false,
          codeInvalid: true,
          error: '인증 코드가 만료되었습니다. 코드를 다시 받아주세요.',
        };
      }
      if (err.name === COGNITO_ERROR.INVALID_PASSWORD) {
        return { success: false, error: PASSWORD_REQUIREMENT_MESSAGE };
      }

      return { success: false, error: '비밀번호 재설정에 실패했습니다.' };
    }
  };

  // Change Password (logged-in user, knows current password).
  // "비밀번호 찾기"(이메일 왕복, forgotPassword)와 별개 기능이다. 기존 비밀번호를 요구하므로 메일이 개입하지 않고 Cognito 하루 발송 한도를 쓰지 않는다.
  const changePassword = async (oldPassword: string, newPassword: string): Promise<AuthResult> => {
    try {
      await updatePassword({ oldPassword, newPassword });
      // updatePassword는 기존 세션을 그대로 유지한다 — 재로그인 불필요.
      return { success: true };
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('Change password error:', error);

      if (err.name === COGNITO_ERROR.NOT_AUTHORIZED) {
        return { success: false, error: '현재 비밀번호가 올바르지 않습니다.' };
      }
      if (err.name === COGNITO_ERROR.INVALID_PASSWORD) {
        return { success: false, error: PASSWORD_REQUIREMENT_MESSAGE };
      }
      if (err.name === COGNITO_ERROR.LIMIT_EXCEEDED) {
        return { success: false, error: '시도가 너무 많아요. 잠시 후 다시 시도해주세요.' };
      }

      return { success: false, error: '비밀번호 변경에 실패했습니다.' };
    }
  };

  const logout = async () => {
    try {
      await signOut();
      setUser(null);
    } catch (error) {
      console.error('Sign out error:', error);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        signInWithGoogle,
        signInWithEmail,
        signUpWithEmail,
        confirmSignUpCode,
        resendConfirmationCode,
        forgotPassword,
        confirmForgotPassword,
        changePassword,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
