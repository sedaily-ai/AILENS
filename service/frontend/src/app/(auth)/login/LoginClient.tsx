'use client';

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useAuth } from "@/features/auth";
import {
  checkPassword,
  isPasswordValid,
  PASSWORD_REQUIREMENT_MESSAGE,
  PASSWORD_SPECIAL_CHARACTERS,
} from "@/shared/lib/passwordPolicy";

/**
 * 비밀번호 재설정은 세 단계다: forgot(이메일) → resetCode(코드) →
 * resetPassword(새 비밀번호).
 *
 * 주의 — Cognito 제약: 코드 검증만 하는 API가 없다. `ConfirmForgotPassword`가
 * 코드와 새 비밀번호를 한 번에 받아서 그때 함께 판정한다. 그래서 resetCode
 * 단계의 "다음"은 서버 호출이 아니라 입력 형식만 확인하고 넘어가며, 코드가
 * 틀렸다는 사실은 마지막 제출에서 드러난다. 그 경우 사용자를 resetCode로
 * 되돌린다(`AuthResult.codeInvalid` 참고).
 */
type AuthMode = "login" | "signup" | "confirm" | "forgot" | "resetCode" | "resetPassword";

/** Cognito 확인 코드는 항상 6자리 숫자다. */
const VERIFICATION_CODE_LENGTH = 6;

// 메인 페이지와 동일 톤 — white bg, black CTA, gray-200 보더, 절제된 라운드.
const INPUT_CLS =
  "w-full px-4 py-3 text-[14.5px] text-gray-900 placeholder-gray-400 bg-white border border-gray-200 rounded-lg outline-none focus:border-gray-900 focus:ring-2 focus:ring-gray-900/5 transition-colors";
const PRIMARY_BTN =
  "w-full py-3 text-[14.5px] font-semibold text-white bg-gray-900 rounded-lg hover:bg-black disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2";
const SECONDARY_LINK =
  "text-[13px] text-gray-500 hover:text-gray-900 transition-colors";
const STRONG_LINK =
  "text-[13.5px] font-semibold text-gray-900 hover:underline underline-offset-4";

function Spinner() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      style={{ animation: "ailens-spin 0.8s linear infinite" }}
      aria-hidden="true"
    >
      <path strokeLinecap="round" d="M12 3a9 9 0 1 0 9 9" />
      <style>{`@keyframes ailens-spin{to{transform:rotate(360deg)}}`}</style>
    </svg>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-[12.5px] font-semibold text-gray-700 mb-2">
      {children}
    </label>
  );
}

/**
 * 비밀번호를 새로 정하는 두 곳(회원가입 · 비밀번호 재설정)에서 유저풀 정책
 * 충족 여부를 입력 중 실시간으로 보여준다.
 *
 * 접근성:
 * - 충족/미충족을 색으로만 구분하지 않는다(WCAG 1.4.1) — 아이콘 모양이
 *   빈 원 ↔ 체크로 바뀌고, 스크린리더용 텍스트도 함께 붙는다.
 * - `aria-live`는 쓰지 않는다. 타이핑마다 5개 항목을 재낭독하면 오히려
 *   방해가 되므로, 대신 input의 `aria-describedby`로 연결해 사용자가
 *   원할 때 읽게 한다.
 */
function PasswordChecklist({ id, password }: { id: string; password: string }) {
  const results = checkPassword(password);
  // 어떤 기호가 특수문자로 인정되는지는 Cognito 정책마다 달라서 사용자가
  // 추측할 수 없다. 그 규칙이 아직 미충족일 때만 목록을 펼쳐 안내한다.
  const showSpecialCharHint = password.length > 0 && !results.find((r) => r.rule.id === "special")?.passed;

  return (
    <div id={id}>
      <ul className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1.5">
        {results.map(({ rule, passed }) => (
          <li
            key={rule.id}
            className={
              "flex items-center gap-1.5 text-[12px] transition-colors " +
              (passed ? "text-emerald-600" : "text-gray-400")
            }
          >
            {passed ? (
              <svg
                viewBox="0 0 24 24"
                className="w-3.5 h-3.5 shrink-0"
                fill="none"
                stroke="currentColor"
                strokeWidth={3}
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 shrink-0" aria-hidden="true">
                <circle cx="12" cy="12" r="5" fill="none" stroke="currentColor" strokeWidth={2} />
              </svg>
            )}
            <span>{rule.label}</span>
            <span className="sr-only">{passed ? " 충족" : " 미충족"}</span>
          </li>
        ))}
      </ul>
      {showSpecialCharHint && (
        <p className="mt-2 text-[11.5px] leading-relaxed text-gray-400 break-all">
          사용 가능한 특수문자 {PASSWORD_SPECIAL_CHARACTERS}
        </p>
      )}
    </div>
  );
}

/** 비밀번호 확인 필드의 불일치를 제출 전에 알려준다. */
function PasswordMismatchHint({ password, confirmPassword }: { password: string; confirmPassword: string }) {
  if (confirmPassword.length === 0 || password === confirmPassword) return null;
  return (
    <p className="mt-2 text-[12px] text-red-600">비밀번호가 일치하지 않습니다.</p>
  );
}

export function LoginClient() {
  const router = useRouter();
  const {
    signInWithEmail,
    signUpWithEmail,
    confirmSignUpCode,
    resendConfirmationCode,
    forgotPassword,
    confirmForgotPassword,
  } = useAuth();

  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const switchMode = (next: AuthMode) => {
    setMode(next);
    setError("");
    setSuccessMessage("");
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);
    const result = await signInWithEmail(email, password);
    setIsLoading(false);
    // 로그인은 성공하면 바로 홈, 아니면 이 화면에 에러만 띄운다.
    // 이메일 인증 화면(confirm)으로 넘기는 분기는 의도적으로 없다 — 인증은
    // 회원가입 흐름 전용이다.
    if (result.success) router.replace("/");
    else setError(result.error || "로그인에 실패했습니다.");
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password !== confirmPassword) return setError("비밀번호가 일치하지 않습니다.");
    // 유저풀 정책 전체를 제출 전에 막는다. 예전엔 길이만 봐서 대소문자·숫자·
    // 특수문자 누락은 Cognito 왕복 후에야 알 수 있었다.
    if (!isPasswordValid(password)) return setError(PASSWORD_REQUIREMENT_MESSAGE);
    setIsLoading(true);
    const result = await signUpWithEmail(email, password, name);
    setIsLoading(false);
    if (!result.success) {
      setError(result.error || "회원가입에 실패했습니다.");
      return;
    }
    // 가입은 이메일 인증을 거친다 — 여기가 정상 경로다.
    if (result.needsConfirmation) {
      setMode("confirm");
      setSuccessMessage("이메일로 인증 코드가 전송되었어요.");
      return;
    }
    if (result.signedIn) return router.replace("/");
    switchMode("login");
    setSuccessMessage("가입이 완료됐어요. 로그인해주세요.");
  };

  const handleConfirmSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);
    const result = await confirmSignUpCode(email, verificationCode);
    setIsLoading(false);
    if (!result.success) {
      setError(result.error || "인증에 실패했습니다.");
      return;
    }
    setVerificationCode("");
    // 인증이 끝나면 바로 로그인된 상태로 홈에 들어간다. 비밀번호를 한 번 더
    // 치게 만들지 않는다.
    if (result.signedIn) return router.replace("/");
    // autoSignIn 이 실패한 경우(가입 도중 새로고침 등)만 로그인 폼으로.
    switchMode("login");
    setSuccessMessage("이메일 인증이 완료됐어요. 로그인해주세요.");
  };

  const handleResendCode = async () => {
    setError("");
    setIsLoading(true);
    const result = await resendConfirmationCode(email);
    setIsLoading(false);
    if (result.success) setSuccessMessage("인증 코드가 재전송됐어요.");
    else setError(result.error || "코드 재전송에 실패했습니다.");
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);
    const result = await forgotPassword(email);
    setIsLoading(false);
    if (result.success) {
      setMode("resetCode");
      setSuccessMessage("이메일로 인증 코드가 전송됐어요.");
    } else setError(result.error || "비밀번호 재설정 요청에 실패했습니다.");
  };

  // 코드 입력 단계 → 새 비밀번호 단계. Cognito에 코드만 검증하는 API가 없어서
  // 여기서는 형식만 보고 넘긴다(실제 판정은 마지막 제출에서).
  const handleResetCodeNext = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const code = verificationCode.trim();
    if (code.length !== VERIFICATION_CODE_LENGTH || !/^\d+$/.test(code)) {
      return setError(`인증 코드 ${VERIFICATION_CODE_LENGTH}자리를 숫자로 입력해주세요.`);
    }
    setVerificationCode(code);
    switchMode("resetPassword");
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password !== confirmPassword) return setError("비밀번호가 일치하지 않습니다.");
    // 재설정 폼에는 정책 검사가 아예 없었다 — 일치 여부만 보고 그대로 보냈다.
    if (!isPasswordValid(password)) return setError(PASSWORD_REQUIREMENT_MESSAGE);
    setIsLoading(true);
    const result = await confirmForgotPassword(email, verificationCode, password);
    setIsLoading(false);
    if (result.success) {
      setSuccessMessage("비밀번호가 재설정됐어요. 로그인해주세요.");
      setMode("login");
      setPassword("");
      setConfirmPassword("");
      setVerificationCode("");
      return;
    }
    // 코드가 틀렸거나 만료된 경우엔 비밀번호 화면에 가둬두지 않고 코드 입력
    // 단계로 되돌린다. 입력한 비밀번호는 유지해서 다시 타이핑하지 않게 한다.
    if (result.codeInvalid) {
      setVerificationCode("");
      setMode("resetCode");
      setSuccessMessage("");
    }
    setError(result.error || "비밀번호 재설정에 실패했습니다.");
  };

  const getEyebrow = () => {
    switch (mode) {
      case "login": return "LOGIN";
      case "signup": return "SIGN UP";
      case "confirm": return "VERIFY";
      case "forgot": return "RESET";
      case "resetCode": return "RESET · 1/2";
      case "resetPassword": return "RESET · 2/2";
    }
  };
  const getTitle = () => {
    switch (mode) {
      case "login": return "로그인";
      case "signup": return "회원가입";
      case "confirm": return "이메일 인증";
      case "forgot": return "비밀번호 찾기";
      case "resetCode": return "인증 코드 입력";
      case "resetPassword": return "새 비밀번호 설정";
    }
  };

  const renderForm = () => {
    switch (mode) {
      case "login":
        return (
          <form onSubmit={handleEmailLogin} className="space-y-4">
            <div>
              <FieldLabel>이메일</FieldLabel>
              <input
                type="email"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@example.com"
                className={INPUT_CLS}
                required
              />
            </div>
            <div>
              <FieldLabel>비밀번호</FieldLabel>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className={INPUT_CLS + " pr-12"}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-gray-500 hover:text-gray-900"
                  aria-label={showPassword ? "비밀번호 숨기기" : "비밀번호 보기"}
                >
                  {showPassword ? "숨기기" : "보기"}
                </button>
              </div>
            </div>
            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={() => switchMode("forgot")}
                className={SECONDARY_LINK}
              >
                비밀번호를 잊으셨나요?
              </button>
            </div>
            <button type="submit" disabled={isLoading} className={PRIMARY_BTN + " mt-2"}>
              {isLoading && <Spinner />}
              로그인
            </button>
          </form>
        );

      case "signup":
        return (
          <form onSubmit={handleSignUp} className="space-y-4">
            <div>
              <FieldLabel>이름</FieldLabel>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="홍길동"
                className={INPUT_CLS}
                required
              />
            </div>
            <div>
              <FieldLabel>이메일</FieldLabel>
              <input
                type="email"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@example.com"
                className={INPUT_CLS}
                required
              />
            </div>
            <div>
              <FieldLabel>비밀번호</FieldLabel>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="8자 이상"
                  className={INPUT_CLS + " pr-12"}
                  aria-describedby="signup-password-rules"
                  aria-invalid={password.length > 0 && !isPasswordValid(password)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-gray-500 hover:text-gray-900"
                  aria-label={showPassword ? "비밀번호 숨기기" : "비밀번호 보기"}
                >
                  {showPassword ? "숨기기" : "보기"}
                </button>
              </div>
              <PasswordChecklist id="signup-password-rules" password={password} />
            </div>
            <div>
              <FieldLabel>비밀번호 확인</FieldLabel>
              <input
                type={showPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="비밀번호 한 번 더"
                className={INPUT_CLS}
                aria-invalid={confirmPassword.length > 0 && password !== confirmPassword}
                required
              />
              <PasswordMismatchHint password={password} confirmPassword={confirmPassword} />
            </div>
            <button type="submit" disabled={isLoading} className={PRIMARY_BTN + " mt-3"}>
              {isLoading && <Spinner />}
              회원가입
            </button>
          </form>
        );

      case "confirm":
        return (
          <form onSubmit={handleConfirmSignUp} className="space-y-4">
            <div className="text-center pb-2">
              <p className="text-[13px] text-gray-500 leading-relaxed">
                <span className="block font-semibold text-gray-900 mb-1">{email}</span>
                으로 전송된 인증 코드를 입력해주세요
              </p>
            </div>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={verificationCode}
              onChange={(e) => setVerificationCode(e.target.value)}
              placeholder="000000"
              className="w-full px-4 py-4 text-center text-[22px] tracking-[0.45em] font-mono text-gray-900 bg-white border border-gray-200 rounded-lg outline-none focus:border-gray-900 focus:ring-2 focus:ring-gray-900/5"
              maxLength={6}
              required
            />
            <button type="submit" disabled={isLoading} className={PRIMARY_BTN}>
              {isLoading && <Spinner />}
              인증하기
            </button>
            <button
              type="button"
              onClick={handleResendCode}
              disabled={isLoading}
              className={"w-full py-2 " + SECONDARY_LINK}
            >
              인증 코드 재전송
            </button>
          </form>
        );

      case "forgot":
        return (
          <form onSubmit={handleForgotPassword} className="space-y-4">
            <div className="text-center pb-2">
              <p className="text-[13px] text-gray-500 leading-relaxed">
                가입한 이메일 주소를 입력하시면
                <br />
                비밀번호 재설정 코드를 보내드려요.
              </p>
            </div>
            <div>
              <FieldLabel>이메일</FieldLabel>
              <input
                type="email"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@example.com"
                className={INPUT_CLS}
                required
              />
            </div>
            <button type="submit" disabled={isLoading} className={PRIMARY_BTN}>
              {isLoading && <Spinner />}
              인증 코드 받기
            </button>
          </form>
        );

      case "resetCode":
        return (
          <form onSubmit={handleResetCodeNext} className="space-y-4">
            <div className="text-center pb-2">
              <p className="text-[13px] text-gray-500 leading-relaxed">
                <span className="block font-semibold text-gray-900 mb-1">{email}</span>
                으로 전송된 인증 코드를 입력해주세요
              </p>
            </div>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={verificationCode}
              onChange={(e) => setVerificationCode(e.target.value)}
              placeholder="000000"
              className="w-full px-4 py-4 text-center text-[22px] tracking-[0.45em] font-mono text-gray-900 bg-white border border-gray-200 rounded-lg outline-none focus:border-gray-900 focus:ring-2 focus:ring-gray-900/5"
              maxLength={VERIFICATION_CODE_LENGTH}
              required
              autoFocus
            />
            <button type="submit" className={PRIMARY_BTN}>
              다음
            </button>
            <button
              type="button"
              onClick={() => switchMode("forgot")}
              className={"w-full py-2 " + SECONDARY_LINK}
            >
              인증 코드 다시 받기
            </button>
          </form>
        );

      case "resetPassword":
        return (
          <form onSubmit={handleResetPassword} className="space-y-4">
            <div className="text-center pb-2">
              <p className="text-[13px] text-gray-500 leading-relaxed">
                새로 사용할 비밀번호를 입력해주세요.
              </p>
            </div>
            <div>
              <FieldLabel>새 비밀번호</FieldLabel>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="8자 이상"
                  className={INPUT_CLS + " pr-12"}
                  aria-describedby="reset-password-rules"
                  aria-invalid={password.length > 0 && !isPasswordValid(password)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-gray-500 hover:text-gray-900"
                  aria-label={showPassword ? "비밀번호 숨기기" : "비밀번호 보기"}
                >
                  {showPassword ? "숨기기" : "보기"}
                </button>
              </div>
              <PasswordChecklist id="reset-password-rules" password={password} />
            </div>
            <div>
              <FieldLabel>비밀번호 확인</FieldLabel>
              <input
                type={showPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="비밀번호 한 번 더"
                className={INPUT_CLS}
                aria-invalid={confirmPassword.length > 0 && password !== confirmPassword}
                required
              />
              <PasswordMismatchHint password={password} confirmPassword={confirmPassword} />
            </div>
            <button type="submit" disabled={isLoading} className={PRIMARY_BTN}>
              {isLoading && <Spinner />}
              비밀번호 재설정
            </button>
            <button
              type="button"
              onClick={() => switchMode("resetCode")}
              disabled={isLoading}
              className={"w-full py-2 " + SECONDARY_LINK}
            >
              ← 인증 코드 다시 입력
            </button>
          </form>
        );
    }
  };

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* 헤더 — 메인 사이트와 동일한 sticky 보더 톤 */}
      <header className="border-b border-gray-100 bg-white">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 h-[56px] flex items-center gap-4">
          <button
            onClick={() => router.back()}
            aria-label="뒤로가기"
            className="p-2 -ml-2 text-gray-500 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-colors"
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="inline-flex items-center gap-2 text-[15px] font-bold text-gray-900 tracking-tight">
            <Image src="/icon.svg" alt="" width={20} height={20} priority />
            AI LENS
          </span>
          <span
            className="text-[9.5px] font-bold tracking-[0.14em] uppercase rounded px-1.5 py-[3px] leading-none"
            style={{ background: '#dbeafe', color: '#1d4ed8' }}
          >
            Beta
          </span>
        </div>
      </header>

      <main className="flex-1 flex items-start justify-center px-4 pt-12 pb-16">
        <div className="w-full max-w-[400px]">
          {/* 로고 + 타이틀 */}
          <div className="text-center mb-10">
            <Image
              src="/icon.svg"
              alt="AI LENS"
              width={56}
              height={56}
              priority
              className="mx-auto"
            />
            <p className="mt-5 text-[10.5px] font-bold tracking-[0.22em] text-gray-400 uppercase">
              {getEyebrow()}
            </p>
            <h1
              className="mt-2 text-[28px] font-bold text-gray-900 tracking-tight"
              style={{ fontFamily: '"Noto Serif KR", serif' }}
            >
              {getTitle()}
            </h1>
            <p className="mt-2 text-[13px] text-gray-500">
              같은 뉴스를 네 개의 렌즈로
            </p>
          </div>

          {/* 알림 */}
          {error && (
            <div className="mb-4 px-4 py-3 bg-red-50 border border-red-100 rounded-lg text-[13px] text-red-700">
              {error}
            </div>
          )}
          {successMessage && (
            <div className="mb-4 px-4 py-3 bg-emerald-50 border border-emerald-100 rounded-lg text-[13px] text-emerald-700">
              {successMessage}
            </div>
          )}

          {/* 폼 */}
          {renderForm()}

          {/* 모드 전환 — 로그인 / 회원가입 */}
          {(mode === "login" || mode === "signup") && (
            <div className="mt-7 pt-6 border-t border-gray-100 text-center">
              {mode === "login" ? (
                <p className="text-[13px] text-gray-500">
                  계정이 없으신가요?{" "}
                  <button type="button" onClick={() => switchMode("signup")} className={STRONG_LINK}>
                    회원가입
                  </button>
                </p>
              ) : (
                <p className="text-[13px] text-gray-500">
                  이미 계정이 있으신가요?{" "}
                  <button type="button" onClick={() => switchMode("login")} className={STRONG_LINK}>
                    로그인
                  </button>
                </p>
              )}
            </div>
          )}

          {/* 모드 전환 — 보조 (confirm/forgot/reset → 로그인 복귀) */}
          {(mode === "confirm" ||
            mode === "forgot" ||
            mode === "resetCode" ||
            mode === "resetPassword") && (
            <div className="mt-6 text-center">
              <button
                type="button"
                onClick={() => switchMode("login")}
                className={SECONDARY_LINK}
              >
                ← 로그인으로 돌아가기
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
