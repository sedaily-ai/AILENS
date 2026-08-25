import { checkPassword, PASSWORD_SPECIAL_CHARACTERS } from '@/shared/lib/passwordPolicy';

// LoginClient.tsx(회원가입·비밀번호 재설정)에서 추출(2026-08-25, 이슈 #17) —
// 비밀번호 변경 화면(/settings/password)도 같은 실시간 체크리스트가 필요해서
// 로컬 컴포넌트를 shared/ui로 승격했다. 로직·마크업은 그대로, 위치만 이동.

/**
 * 비밀번호를 새로 정하는 화면(회원가입 · 비밀번호 재설정 · 비밀번호 변경)에서
 * 유저풀 정책 충족 여부를 입력 중 실시간으로 보여준다.
 *
 * 접근성:
 * - 충족/미충족을 색으로만 구분하지 않는다(WCAG 1.4.1) — 아이콘 모양이
 *   빈 원 ↔ 체크로 바뀌고, 스크린리더용 텍스트도 함께 붙는다.
 * - `aria-live`는 쓰지 않는다. 타이핑마다 5개 항목을 재낭독하면 오히려
 *   방해가 되므로, 대신 input의 `aria-describedby`로 연결해 사용자가
 *   원할 때 읽게 한다.
 */
export function PasswordChecklist({ id, password }: { id: string; password: string }) {
  const results = checkPassword(password);
  // 어떤 기호가 특수문자로 인정되는지는 Cognito 정책마다 달라서 사용자가
  // 추측할 수 없다. 그 규칙이 아직 미충족일 때만 목록을 펼쳐 안내한다.
  const showSpecialCharHint = password.length > 0 && !results.find((r) => r.rule.id === 'special')?.passed;

  return (
    <div id={id}>
      <ul className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1.5">
        {results.map(({ rule, passed }) => (
          <li
            key={rule.id}
            className={
              'flex items-center gap-1.5 text-[12px] transition-colors ' +
              (passed ? 'text-emerald-600' : 'text-gray-400')
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
            <span className="sr-only">{passed ? ' 충족' : ' 미충족'}</span>
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
export function PasswordMismatchHint({
  password,
  confirmPassword,
}: {
  password: string;
  confirmPassword: string;
}) {
  if (confirmPassword.length === 0 || password === confirmPassword) return null;
  return <p className="mt-2 text-[12px] text-red-600">비밀번호가 일치하지 않습니다.</p>;
}
