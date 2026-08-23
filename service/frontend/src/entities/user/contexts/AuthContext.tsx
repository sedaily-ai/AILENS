import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
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
} from 'aws-amplify/auth';
import { Hub } from 'aws-amplify/utils';
import { authConfig } from '@/shared/config/auth';
import { API_URL } from '@/shared/config/apiClient';
import { authFetch } from '@/shared/lib/authFetch';
import { PASSWORD_REQUIREMENT_MESSAGE } from '@/shared/lib/passwordPolicy';

// Configure Amplify
Amplify.configure(authConfig as ResourcesConfig);

interface User {
  userId: string;
  email?: string;
  name?: string;
  picture?: string;
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
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithKakao: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<AuthResult>;
  signUpWithEmail: (email: string, password: string, name: string) => Promise<AuthResult>;
  confirmSignUpCode: (email: string, code: string) => Promise<AuthResult>;
  resendConfirmationCode: (email: string) => Promise<AuthResult>;
  forgotPassword: (email: string) => Promise<AuthResult>;
  confirmForgotPassword: (email: string, code: string, newPassword: string) => Promise<AuthResult>;
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
  const syncUserProfile = async (userData: User) => {
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
  };

  // Check current auth state
  const checkUser = async () => {
    try {
      const currentUser = await getCurrentUser();
      const session = await fetchAuthSession();
      const idToken = session.tokens?.idToken;

      if (currentUser && idToken) {
        const userData = {
          userId: currentUser.userId,
          email: idToken.payload.email as string,
          name: idToken.payload.name as string,
          picture: idToken.payload.picture as string,
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
  };

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
  }, []);

  const signInWithGoogle = async () => {
    try {
      await signInWithRedirect({ provider: 'Google' });
    } catch (error) {
      console.error('Google sign in error:', error);
    }
  };

  const signInWithKakao = async () => {
    // Kakao will be added later
    console.log('Kakao login not yet configured');
  };

  // 로그인 화면에서는 이메일 인증 단계를 절대 노출하지 않는다.
  // 인증은 회원가입 흐름에서만 끝낸다(가입 → 코드 입력 → 자동 로그인).
  // 따라서 로그인 중 UNCONFIRMED 를 만나는 건 '가입 도중 코드 입력을 이탈한
  // 계정' 뿐이고, 그 경우 코드 화면으로 끌고 가는 대신 회원가입을 다시
  // 진행하라고 안내한다. Cognito 는 UNCONFIRMED 사용자로 재가입하면 인증
  // 코드를 다시 발송하므로 이 안내만으로 사용자가 스스로 빠져나올 수 있다.
  const UNCONFIRMED_LOGIN_MESSAGE =
    '가입이 완료되지 않은 계정이에요. 회원가입을 다시 진행하면 인증 코드를 새로 보내드려요.';

  // Email/Password Sign In
  const signInWithEmail = async (email: string, password: string): Promise<AuthResult> => {
    try {
      const result = await signIn({ username: email, password });

      if (result.isSignedIn) {
        await checkUser();
        return { success: true, signedIn: true };
      }

      if (result.nextStep?.signInStep === 'CONFIRM_SIGN_UP') {
        return { success: false, error: UNCONFIRMED_LOGIN_MESSAGE };
      }

      return { success: false, error: '로그인에 실패했습니다.' };
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('Email sign in error:', error);

      if (err.name === 'UserNotConfirmedException') {
        return { success: false, error: UNCONFIRMED_LOGIN_MESSAGE };
      }
      if (err.name === 'NotAuthorizedException') {
        return { success: false, error: '이메일 또는 비밀번호가 올바르지 않습니다.' };
      }
      if (err.name === 'UserNotFoundException') {
        return { success: false, error: '등록되지 않은 이메일입니다.' };
      }

      return { success: false, error: err.message || '로그인에 실패했습니다.' };
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

      if (err.name === 'UsernameExistsException') {
        return { success: false, error: '이미 등록된 이메일입니다.' };
      }
      if (err.name === 'InvalidPasswordException') {
        return { success: false, error: PASSWORD_REQUIREMENT_MESSAGE };
      }

      return { success: false, error: err.message || '회원가입에 실패했습니다.' };
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

      if (err.name === 'CodeMismatchException') {
        return { success: false, error: '인증 코드가 올바르지 않습니다.' };
      }
      if (err.name === 'ExpiredCodeException') {
        return { success: false, error: '인증 코드가 만료되었습니다. 다시 요청해주세요.' };
      }

      return { success: false, error: err.message || '인증에 실패했습니다.' };
    }
  };

  // Resend Confirmation Code
  const resendConfirmationCode = async (email: string): Promise<AuthResult> => {
    try {
      await resendSignUpCode({ username: email });
      return { success: true };
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('Resend code error:', error);
      return { success: false, error: err.message || '코드 재전송에 실패했습니다.' };
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

      if (err.name === 'UserNotFoundException') {
        return { success: false, error: '등록되지 않은 이메일입니다.' };
      }

      return { success: false, error: err.message || '비밀번호 재설정 요청에 실패했습니다.' };
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

      if (err.name === 'CodeMismatchException') {
        return { success: false, codeInvalid: true, error: '인증 코드가 올바르지 않습니다.' };
      }
      if (err.name === 'ExpiredCodeException') {
        return {
          success: false,
          codeInvalid: true,
          error: '인증 코드가 만료되었습니다. 코드를 다시 받아주세요.',
        };
      }
      if (err.name === 'InvalidPasswordException') {
        return { success: false, error: PASSWORD_REQUIREMENT_MESSAGE };
      }

      return { success: false, error: err.message || '비밀번호 재설정에 실패했습니다.' };
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
        signInWithKakao,
        signInWithEmail,
        signUpWithEmail,
        confirmSignUpCode,
        resendConfirmationCode,
        forgotPassword,
        confirmForgotPassword,
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
