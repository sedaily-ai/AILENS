/** 로그인 화면 공용 UI 조각(입력창 스타일·스피너·필드 라벨)과 모드 타입 — LoginClient.tsx 에서 분리(리팩토링 5단계, 내용 불변). */
export type AuthMode = "login" | "signup" | "confirm" | "forgot" | "resetCode" | "resetPassword";

/** Cognito 확인 코드는 항상 6자리 숫자다. */
export const VERIFICATION_CODE_LENGTH = 6;

// 메인 페이지와 동일 톤 — white bg, black CTA, gray-200 보더, 절제된 라운드.
export const INPUT_CLS =
  "w-full px-4 py-3 text-[14.5px] text-gray-900 placeholder-gray-400 bg-white border border-gray-200 rounded-lg outline-none focus:border-gray-900 focus:ring-2 focus:ring-gray-900/5 transition-colors";
export const PRIMARY_BTN =
  "w-full py-3 text-[14.5px] font-semibold text-white bg-gray-900 rounded-lg hover:bg-black disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2";
export const SECONDARY_LINK =
  "text-[13px] text-gray-500 hover:text-gray-900 transition-colors";
export const STRONG_LINK =
  "text-[13.5px] font-semibold text-gray-900 hover:underline underline-offset-4";

export function Spinner() {
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

export function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-[12.5px] font-semibold text-gray-700 mb-2">
      {children}
    </label>
  );
}
