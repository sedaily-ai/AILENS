import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Amplify } from 'aws-amplify';
import {
  signInWithRedirect,
  signOut,
  getCurrentUser,
  fetchAuthSession,
  signIn,
  signUp,
  confirmSignUp,
  resendSignUpCode,
  resetPassword,
  confirmResetPassword,
} from 'aws-amplify/auth';
import { Hub } from 'aws-amplify/utils';
import { authConfig } from '@/shared/config/auth';
import { API_URL } from '@/shared/config/api';
import { authFetch } from '@/shared/lib/authFetch';

// Configure Amplify
Amplify.configure(authConfig as any);

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

  // Email/Password Sign In
  const signInWithEmail = async (email: string, password: string): Promise<AuthResult> => {
    try {
      const result = await signIn({ username: email, password });

      if (result.isSignedIn) {
        await checkUser();
        return { success: true };
      }

      if (result.nextStep?.signInStep === 'CONFIRM_SIGN_UP') {
        return { success: false, needsConfirmation: true };
      }

      return { success: false, error: '로그인에 실패했습니다.' };
    } catch (error: any) {
      console.error('Email sign in error:', error);

      if (error.name === 'UserNotConfirmedException') {
        return { success: false, needsConfirmation: true };
      }
      if (error.name === 'NotAuthorizedException') {
        return { success: false, error: '이메일 또는 비밀번호가 올바르지 않습니다.' };
      }
      if (error.name === 'UserNotFoundException') {
        return { success: false, error: '등록되지 않은 이메일입니다.' };
      }

      return { success: false, error: error.message || '로그인에 실패했습니다.' };
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
        },
      });

      if (result.isSignUpComplete) {
        return { success: true };
      }

      if (result.nextStep?.signUpStep === 'CONFIRM_SIGN_UP') {
        return { success: true, needsConfirmation: true };
      }

      return { success: true };
    } catch (error: any) {
      console.error('Sign up error:', error);

      if (error.name === 'UsernameExistsException') {
        return { success: false, error: '이미 등록된 이메일입니다.' };
      }
      if (error.name === 'InvalidPasswordException') {
        return { success: false, error: '비밀번호는 8자 이상, 대소문자, 숫자, 특수문자를 포함해야 합니다.' };
      }

      return { success: false, error: error.message || '회원가입에 실패했습니다.' };
    }
  };

  // Confirm Sign Up Code
  const confirmSignUpCode = async (email: string, code: string): Promise<AuthResult> => {
    try {
      const result = await confirmSignUp({ username: email, confirmationCode: code });

      if (result.isSignUpComplete) {
        return { success: true };
      }

      return { success: false, error: '인증에 실패했습니다.' };
    } catch (error: any) {
      console.error('Confirm sign up error:', error);

      if (error.name === 'CodeMismatchException') {
        return { success: false, error: '인증 코드가 올바르지 않습니다.' };
      }
      if (error.name === 'ExpiredCodeException') {
        return { success: false, error: '인증 코드가 만료되었습니다. 다시 요청해주세요.' };
      }

      return { success: false, error: error.message || '인증에 실패했습니다.' };
    }
  };

  // Resend Confirmation Code
  const resendConfirmationCode = async (email: string): Promise<AuthResult> => {
    try {
      await resendSignUpCode({ username: email });
      return { success: true };
    } catch (error: any) {
      console.error('Resend code error:', error);
      return { success: false, error: error.message || '코드 재전송에 실패했습니다.' };
    }
  };

  // Forgot Password
  const forgotPassword = async (email: string): Promise<AuthResult> => {
    try {
      await resetPassword({ username: email });
      return { success: true };
    } catch (error: any) {
      console.error('Forgot password error:', error);

      if (error.name === 'UserNotFoundException') {
        return { success: false, error: '등록되지 않은 이메일입니다.' };
      }

      return { success: false, error: error.message || '비밀번호 재설정 요청에 실패했습니다.' };
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
    } catch (error: any) {
      console.error('Confirm forgot password error:', error);

      if (error.name === 'CodeMismatchException') {
        return { success: false, error: '인증 코드가 올바르지 않습니다.' };
      }
      if (error.name === 'ExpiredCodeException') {
        return { success: false, error: '인증 코드가 만료되었습니다. 다시 요청해주세요.' };
      }
      if (error.name === 'InvalidPasswordException') {
        return { success: false, error: '비밀번호는 8자 이상, 대소문자, 숫자, 특수문자를 포함해야 합니다.' };
      }

      return { success: false, error: error.message || '비밀번호 재설정에 실패했습니다.' };
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
