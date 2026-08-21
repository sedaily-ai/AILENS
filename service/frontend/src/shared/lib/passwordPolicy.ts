/**
 * Cognito 유저풀(`us-east-1_ZS8PgF3iX`)의 비밀번호 정책을 클라이언트에서
 * 그대로 재현한다.
 *
 * 왜 필요한가
 * ----------
 * 유저풀 `Policies.PasswordPolicy`는 `MinimumLength: 8` + 대문자/소문자/숫자/
 * 특수문자를 모두 요구한다. 그런데 폼에서는 이걸 알려주지 않아서, 사용자는
 * 제출한 뒤에야 Cognito의 `InvalidPasswordException`을 받아 "뭐가 부족한지"를
 * 역추적해야 했다(회원가입은 길이만 검사, 비밀번호 재설정은 일치 여부만 검사).
 * 규칙을 여기 한 곳에 두고 입력 중 실시간으로 보여주려고 분리했다.
 *
 * 특수문자 목록은 AWS 문서에 명시된 집합을 그대로 옮겼다:
 *   ^ $ * . [ ] { } ( ) ? " ! @ # % & / \ , > < ' : ; | _ ~ ` = + -
 *   (앞뒤가 아닌 위치의 공백도 허용)
 * https://docs.aws.amazon.com/cognito/latest/developerguide/managing-users-passwords.html
 *
 * 유저풀 정책을 바꾸면 이 파일도 같이 바꿔야 한다 — 클라이언트 검증은 UX용
 * 선행 안내일 뿐이고, 최종 판정은 언제나 Cognito가 한다.
 */

export const PASSWORD_MIN_LENGTH = 8;

/** 화면에 그대로 노출해도 되는 허용 특수문자 안내 문자열. */
export const PASSWORD_SPECIAL_CHARACTERS =
  '^ $ * . [ ] { } ( ) ? " ! @ # % & / \\ , > < \' : ; | _ ~ ` = + -';

/**
 * Cognito가 특수문자로 인정하는 집합. 위 목록과 1:1로 대응한다.
 * (문자 클래스 안이라 `^ [ ] / \ -` 는 이스케이프하거나 마지막에 둔다)
 */
const SPECIAL_CHARACTER_PATTERN = /[\^$*.\[\]{}()?"!@#%&\/\\,><':;|_~`=+-]/;

/** 서버(Cognito)와 클라이언트가 같은 문구를 쓰도록 한 곳에서 관리한다. */
export const PASSWORD_REQUIREMENT_MESSAGE =
  '비밀번호는 8자 이상이어야 하고 대문자, 소문자, 숫자, 특수문자를 각각 하나 이상 포함해야 합니다.';

export interface PasswordRule {
  id: 'length' | 'uppercase' | 'lowercase' | 'number' | 'special';
  label: string;
  test: (password: string) => boolean;
}

export const PASSWORD_RULES: readonly PasswordRule[] = [
  {
    id: 'length',
    label: `${PASSWORD_MIN_LENGTH}자 이상`,
    test: (password) => password.length >= PASSWORD_MIN_LENGTH,
  },
  // Cognito는 basic latin 대소문자만 인정한다 — 한글은 어느 쪽도 아니다.
  { id: 'uppercase', label: '대문자 포함', test: (password) => /[A-Z]/.test(password) },
  { id: 'lowercase', label: '소문자 포함', test: (password) => /[a-z]/.test(password) },
  { id: 'number', label: '숫자 포함', test: (password) => /[0-9]/.test(password) },
  {
    id: 'special',
    label: '특수문자 포함',
    test: (password) => SPECIAL_CHARACTER_PATTERN.test(password),
  },
];

export interface PasswordRuleResult {
  rule: PasswordRule;
  passed: boolean;
}

/** 규칙별 충족 여부. 체크리스트 렌더링용. */
export function checkPassword(password: string): PasswordRuleResult[] {
  return PASSWORD_RULES.map((rule) => ({ rule, passed: rule.test(password) }));
}

/** 모든 규칙을 만족하는지. 제출 직전 게이트용. */
export function isPasswordValid(password: string): boolean {
  return PASSWORD_RULES.every((rule) => rule.test(password));
}
