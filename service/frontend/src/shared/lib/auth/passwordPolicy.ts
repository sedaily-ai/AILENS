// 비밀번호 정책(Cognito 유저풀 규칙의 클라이언트 재현)은 @ailens/domain 으로 옮겼다(앱과 공용). 이 파일은 기존 import 경로를 지키는 재수출이다.
export { PASSWORD_SPECIAL_CHARACTERS, PASSWORD_REQUIREMENT_MESSAGE, checkPassword, isPasswordValid } from '@ailens/domain';
export type { PasswordRuleResult } from '@ailens/domain';
