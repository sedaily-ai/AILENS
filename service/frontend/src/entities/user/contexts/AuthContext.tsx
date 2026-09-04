import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import { Amplify, type ResourcesConfig } from 'aws-amplify';
import {
  signInWithRedirect,
  signOut,
  getCurrentUser,
  fetchAuthSession,
  signIn,
  signUp,
  autoSignIn,
  confirmSignUp,
  resendSignUpCode,
  resetPassword,
  confirmResetPassword,
  updatePassword,
} from 'aws-amplify/auth';
import { Hub } from 'aws-amplify/utils';
import { authConfig } from '@/shared/config/auth';
import { API_URL } from '@/shared/config/apiClient';
import { authFetch } from '@/shared/lib/authFetch';
import { PASSWORD_REQUIREMENT_MESSAGE } from '@/shared/lib/passwordPolicy';

// Configure Amplify
Amplify.configure(authConfig as ResourcesConfig);

// 이 파일이 다루는 Cognito 예외 이름 — 상수로 모아 문자열 리터럴 오타를 줄인다
// (이슈 #20). `err.name`은 여전히 string이라 완전한 컴파일 타임 보장은 아니지만,
// 7개 함수에 흩어져 있던 리터럴을 한 곳에서 자동완성으로 참조하게 한다.
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
   * 구글 등 소셜 로그인으로 만들어진 계정인지. 이런 계정은 Cognito에
   * 비밀번호 자체가 없어서 비밀번호 변경 화면을 보여줄 수 없다(이슈 #17).
   * ID 토큰의 `identities` 클레임(연동 IdP를 통해 로그인했을 때만 존재)
   * 유무로 판별한다 — Username이 `Google_...` 형태인 것과 같은 신호지만,
   * 클레임 쪽이 Amplify 문서가 명시하는 공식 판별 방법이다.
   */
  isFederated: boolean;
}

interface AuthResult {
  success: boolean;
  error?: string;
  needsConfirmation?: boolean;
  /**
   * 이 호출로 실제 로그인 세션까지 만들어졌는지. 호출자가 곧바로 홈으로
   * 보낼지, 로그인 폼을 다시 보여줄지 판단하는 데 쓴다. 이메일 인증
   * (`confirmSignUpCode`)은 성공했지만 autoSignIn 이 실패한 경우처럼
   * `success: true` 이면서 `signedIn: false` 인 상태가 존재한다.
   */
  signedIn?: boolean;
  /**
   * 실패 원인이 '인증 코드'인지. 비밀번호 재설정은 코드와 새 비밀번호를
   * 하나의 API 호출(`ConfirmForgotPassword`)로 함께 보내야 하므로, 코드가
   * 틀렸다는 사실을 새 비밀번호 화면에서야 알게 된다. 그때 호출자가
   * 사용자를 코드 입력 단계로 되돌려보내려면 원인 구분이 필요하다.
   */
  codeInvalid?: boolean;
  /**
   * 로그인 실패 원인이 '가입 도중 이탈(UNCONFIRMED)'인지. LoginClient가 이
   * 값으로 에러 문구 안에 "회원가입 이어하기" 같은 실제 이동 수단을 붙일 수
   * 있게 한다(이슈 #18 — 안내는 있는데 화면상 가까운 곳에 갈 방법이 없었다).
   */
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
  // The backend now derives `user_id` from the verified JWT (`sub` claim);
  // the body's `user_id` is ignored server-side but kept here so logs in
  // earlier pipelines that read the JSON body still see a stable value.
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
          // `identities` 클레임은 Google 등 연동 IdP를 거쳐 로그인했을 때만
          // ID 토큰에 실린다 — 이메일/비밀번호 직접 가입 계정에는 없다.
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
    checkUser();

    // Listen for auth events
    const unsubscribe = Hub.listen('auth', ({ payload }) => {
      switch (payload.event) {
        case 'signInWithRedirect':
          checkUser();
          break;
        case 'signedOut':
          setUser(null);
          break;
      }
    });

    return () => unsubscribe();
  }, [checkUser]);

  const signInWithGoogle = async () => {
    try {
      await signInWithRedirect({ provider: 'Google' });
    } catch (error) {
      console.error('Google sign in error:', error);
    }
  };

  // 로그인 화면에서는 이메일 인증 단계를 절대 노출하지 않는다.
  // 인증은 회원가입 흐름에서만 끝낸다(가입 → 코드 입력 → 자동 로그인).
  // 따라서 로그인 중 UNCONFIRMED 를 만나는 건 '가입 도중 코드 입력을 이탈한
  // 계정' 뿐이고, 그 경우 코드 화면으로 끌고 가는 대신 회원가입을 다시
  // 진행하라고 안내한다.
  //
  // ⚠️ 2026-08-25 확인(이슈 #18) — 예전 주석은 "Cognito는 UNCONFIRMED
  // 사용자로 재가입하면 인증 코드를 다시 발송한다"고 적혀 있었는데, 이 가정은
  // 틀렸다. 실제로 `signUp()`을 같은 이메일로 다시 호출하면 코드 재발송 없이
  // `UsernameExistsException`이 던져진다(CLI로 직접 재현·확인) — 즉 이 안내를
  // 그대로 따라가면 로그인→가입→"이미 등록된 이메일"→로그인으로 되돌아가는
  // 무한 루프에 갇혔다. 실제 자력 복구는 `signUpWithEmail`의
  // `UsernameExistsException` 분기가 담당한다 — 거기서 `resendSignUpCode`를
  // 먼저 시도해 UNCONFIRMED면 인증 코드를 재발송하고 인증 화면으로 보낸다.
  const UNCONFIRMED_LOGIN_MESSAGE =
    '가입이 완료되지 않은 계정이에요. 회원가입을 다시 진행하면 인증 코드를 새로 보내드려요.';

  // 로그인 실패는 항상 이 문구 하나로 통일한다(이슈 #14 — 계정 열거 방지).
  // "등록되지 않은 이메일입니다"처럼 존재 여부를 알려주는 별도 문구를 두면
  // 공격자가 이메일 목록을 넣어보며 가입 여부를 하나씩 확인할 수 있다.
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
      // NotAuthorizedException(비밀번호 틀림)과 UserNotFoundException(미가입)을
      // 같은 문구로 합친다 — 계정 열거 방지(이슈 #14). 그 외 알 수 없는
      // 예외도 원본 Cognito 메시지를 그대로 노출하지 않고 이 안전한 기본
      // 문구로 떨어진다(err.message 노출 경로 제거).
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
          // 인증 코드 확정(confirmSignUpCode) 직후 그 자리에서 세션을 받기
          // 위한 옵션. Amplify v6 부터 autoSignIn 은 자동 실행되지 않고
          // COMPLETE_AUTO_SIGN_IN 단계에서 직접 호출해야 한다.
          autoSignIn: true,
        },
      });

      // 정상 경로 — 유저풀 AutoVerifiedAttributes 에 email 이 걸려 있어
      // 가입은 항상 인증 코드 입력을 요구한다.
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
        // 2026-08-25(이슈 #18) — 이 이메일이 UNCONFIRMED 상태로 가입 도중
        // 이탈한 계정일 수 있다. signUp()은 UNCONFIRMED라도 무조건
        // UsernameExistsException을 던지고 코드를 재발송하지 않는다(CLI로
        // 확인) — signInWithEmail이 그 경우 "회원가입을 다시 진행하라"고
        // 안내하는데, 여기서 그냥 "이미 등록된 이메일"만 보여주면 로그인↔
        // 가입을 오가는 무한 루프에 갇힌다. resendSignUpCode를 먼저 시도해
        // 성공하면(=UNCONFIRMED였다는 뜻) 새 가입과 동일하게 인증 화면으로
        // 보내 루프를 끊는다 — CONFIRMED 계정에서는 resendSignUpCode 자체가
        // InvalidParameterException("User is already confirmed")으로 실패하니
        // "이미 가입됨" 여부를 이 분기가 새로 노출하지 않는다(계정 열거
        // 방지, 이슈 #14와 같은 원칙).
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
        // 인증이 끝났으면 로그인 폼으로 되돌리지 않고 그 자리에서 세션을 만든다.
        // signUp 을 autoSignIn: true 로 호출했을 때만 이 단계가 온다.
        if (result.nextStep?.signUpStep === 'COMPLETE_AUTO_SIGN_IN') {
          try {
            const autoResult = await autoSignIn();
            if (autoResult.isSignedIn) {
              await checkUser();
              return { success: true, signedIn: true };
            }
          } catch (autoError) {
            // autoSignIn 은 signUp 을 호출한 브라우저 컨텍스트에 의존한다
            // (중간에 새로고침/탭 이동 시 실패). 인증 자체는 성공했으므로
            // 호출자가 로그인 폼으로 돌려보내면 된다.
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

      // 미가입 이메일도 성공과 동일하게 처리한다(이슈 #14 — 계정 열거 방지).
      // 코드가 실제로는 발송되지 않지만, 화면·문구는 가입된 이메일과
      // 구분되지 않는다 — LoginClient가 그대로 resetCode 단계로 넘어간다.
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

  // Change Password (logged-in user, knows current password) — 이슈 #17.
  // "비밀번호 찾기"(이메일 왕복, forgotPassword)와 별개 기능이다. 기존
  // 비밀번호를 요구하므로 메일이 개입하지 않고, Cognito 하루 발송 한도를
  // 쓰지 않는다.
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
