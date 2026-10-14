import {
  autoSignIn,
  confirmResetPassword,
  confirmSignUp,
  resendSignUpCode,
  resetPassword,
  signIn,
  signUp,
} from 'aws-amplify/auth';
import { PASSWORD_REQUIREMENT_MESSAGE } from '@ailens/domain';

// 이메일(일반) 로그인 동작 모음 — 웹 entities/user/contexts/AuthContext.tsx 와 같은 규칙·문구를 쓴다.
// 화면은 Cognito 예외를 몰라도 되도록 모든 함수가 throw 대신 { success, error?, ... } 를 돌려준다.

export interface AuthResult {
  success: boolean;
  error?: string;
  /** 가입(또는 재가입)이 인증 코드 입력 단계로 넘어가야 하는지. */
  needsConfirmation?: boolean;
  /** 이 호출로 로그인 세션까지 만들어졌는지. */
  signedIn?: boolean;
  /** 미인증 계정으로 로그인하려 한 경우. */
  unconfirmedAccount?: boolean;
  /** 인증 코드가 틀렸거나 만료돼 코드를 다시 받아야 하는 경우. */
  codeInvalid?: boolean;
}

const ERR = {
  USER_NOT_CONFIRMED: 'UserNotConfirmedException',
  USER_NOT_FOUND: 'UserNotFoundException',
  USERNAME_EXISTS: 'UsernameExistsException',
  INVALID_PASSWORD: 'InvalidPasswordException',
  CODE_MISMATCH: 'CodeMismatchException',
  EXPIRED_CODE: 'ExpiredCodeException',
  LIMIT_EXCEEDED: 'LimitExceededException',
} as const;

const UNCONFIRMED_LOGIN_MESSAGE = '가입이 완료되지 않은 계정이에요. 회원가입을 다시 진행하면 인증 코드를 새로 보내드려요.';
// 로그인 실패는 항상 이 문구 하나로 통일한다(계정 열거 방지) — 비밀번호 오류와 미가입을 구분해 알려 주지 않는다.
const WRONG_CREDENTIALS_MESSAGE = '이메일 또는 비밀번호가 올바르지 않습니다.';
const TOO_MANY_MESSAGE = '요청이 너무 많아요. 잠시 후 다시 시도해 주세요.';

const nameOf = (e: unknown) => (e instanceof Error ? e.name : '');

export async function signInWithEmail(email: string, password: string): Promise<AuthResult> {
  try {
    const result = await signIn({ username: email, password });
    if (result.isSignedIn) return { success: true, signedIn: true };
    if (result.nextStep?.signInStep === 'CONFIRM_SIGN_UP') return { success: false, error: UNCONFIRMED_LOGIN_MESSAGE, unconfirmedAccount: true };
    return { success: false, error: '로그인에 실패했습니다.' };
  } catch (e) {
    if (nameOf(e) === ERR.USER_NOT_CONFIRMED) return { success: false, error: UNCONFIRMED_LOGIN_MESSAGE, unconfirmedAccount: true };
    if (nameOf(e) === ERR.LIMIT_EXCEEDED) return { success: false, error: TOO_MANY_MESSAGE };
    return { success: false, error: WRONG_CREDENTIALS_MESSAGE };
  }
}

export async function signUpWithEmail(email: string, password: string, name: string): Promise<AuthResult> {
  try {
    const result = await signUp({
      username: email,
      password,
      // autoSignIn: 인증 코드 확정 직후 그 자리에서 세션을 받는다(Amplify v6 은 COMPLETE_AUTO_SIGN_IN 에서 직접 호출해야 함).
      options: { userAttributes: { email, name }, autoSignIn: true },
    });
    return { success: true, needsConfirmation: result.nextStep?.signUpStep === 'CONFIRM_SIGN_UP' };
  } catch (e) {
    if (nameOf(e) === ERR.USERNAME_EXISTS) {
      // 가입 도중 이탈한 미인증 계정이면 코드를 재발송하고 인증 화면으로 보낸다(로그인↔가입 루프 방지).
      // 인증이 끝난 계정은 재발송이 실패하므로 가입 여부를 새로 노출하지 않는다(계정 열거 방지).
      try {
        await resendSignUpCode({ username: email });
        return { success: true, needsConfirmation: true };
      } catch {
        return { success: false, error: '이미 등록된 이메일입니다.' };
      }
    }
    if (nameOf(e) === ERR.INVALID_PASSWORD) return { success: false, error: PASSWORD_REQUIREMENT_MESSAGE };
    if (nameOf(e) === ERR.LIMIT_EXCEEDED) return { success: false, error: TOO_MANY_MESSAGE };
    return { success: false, error: '회원가입에 실패했습니다.' };
  }
}

export async function confirmSignUpCode(email: string, code: string): Promise<AuthResult> {
  try {
    const result = await confirmSignUp({ username: email, confirmationCode: code });
    if (!result.isSignUpComplete) return { success: false, error: '인증에 실패했습니다.' };
    if (result.nextStep?.signUpStep === 'COMPLETE_AUTO_SIGN_IN') {
      try {
        const auto = await autoSignIn();
        if (auto.isSignedIn) return { success: true, signedIn: true };
      } catch {
        // autoSignIn 은 가입을 시작한 앱 실행 상태에 의존한다(앱이 종료됐다 돌아오면 실패). 인증 자체는 성공했으니 로그인 화면으로 돌려보낸다.
      }
    }
    return { success: true };
  } catch (e) {
    if (nameOf(e) === ERR.CODE_MISMATCH) return { success: false, error: '인증 코드가 올바르지 않습니다.' };
    if (nameOf(e) === ERR.EXPIRED_CODE) return { success: false, error: '인증 코드가 만료되었습니다. 다시 요청해주세요.' };
    return { success: false, error: '인증에 실패했습니다.' };
  }
}

export async function resendConfirmationCode(email: string): Promise<AuthResult> {
  try {
    await resendSignUpCode({ username: email });
    return { success: true };
  } catch (e) {
    return { success: false, error: nameOf(e) === ERR.LIMIT_EXCEEDED ? TOO_MANY_MESSAGE : '코드 재전송에 실패했습니다.' };
  }
}

export async function forgotPassword(email: string): Promise<AuthResult> {
  try {
    await resetPassword({ username: email });
    return { success: true };
  } catch (e) {
    // 미가입 이메일도 성공과 같게 처리한다(계정 열거 방지) — 코드는 실제로 발송되지 않지만 화면은 구분되지 않는다.
    if (nameOf(e) === ERR.USER_NOT_FOUND) return { success: true };
    if (nameOf(e) === ERR.LIMIT_EXCEEDED) return { success: false, error: TOO_MANY_MESSAGE };
    return { success: false, error: '비밀번호 재설정 요청에 실패했습니다.' };
  }
}

export async function confirmForgotPassword(email: string, code: string, newPassword: string): Promise<AuthResult> {
  try {
    await confirmResetPassword({ username: email, confirmationCode: code, newPassword });
    return { success: true };
  } catch (e) {
    if (nameOf(e) === ERR.CODE_MISMATCH) return { success: false, codeInvalid: true, error: '인증 코드가 올바르지 않습니다.' };
    if (nameOf(e) === ERR.EXPIRED_CODE) return { success: false, codeInvalid: true, error: '인증 코드가 만료되었습니다. 코드를 다시 받아주세요.' };
    if (nameOf(e) === ERR.INVALID_PASSWORD) return { success: false, error: PASSWORD_REQUIREMENT_MESSAGE };
    if (nameOf(e) === ERR.LIMIT_EXCEEDED) return { success: false, error: TOO_MANY_MESSAGE };
    return { success: false, error: '비밀번호 재설정에 실패했습니다.' };
  }
}
