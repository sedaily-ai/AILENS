# 2026-08-25 GitHub 이슈 정리 — 인증 보안(#14,#16,#18) · 비밀번호 변경(#17) · 린트(#20) + 스플래시 + 푸터 공시

작성: 문영광 + Claude Code
관련: 이슈 [#14](https://github.com/sedaily-ai/AILENS/issues/14)
[#16](https://github.com/sedaily-ai/AILENS/issues/16)
[#17](https://github.com/sedaily-ai/AILENS/issues/17)
[#18](https://github.com/sedaily-ai/AILENS/issues/18)
[#20](https://github.com/sedaily-ai/AILENS/issues/20),
커밋 `09bb1c0`, `cbee4a2`, `4561467`, `96ccd10`, `33a3968`, `b1c38b3`

## 배경

PR 정리 후 남은 오픈 이슈들을 한 세션에서 순차 처리. 전부
`entities/user/contexts/AuthContext.tsx`(인증 중앙 로직)에 몰려있어 한
파일 안에서 교차 검증하며 진행. 실기기/브라우저로 실제 플로우를 끝까지
타본 뒤에만 완료 처리(코드 리뷰만으로 끝내지 않음).

## 한 것

### 이슈 #16 — 인증 코드가 메일 제목에 노출 (`09bb1c0`)
- Cognito 인증 메일 제목에 OTP 코드 원문이 그대로 찍히던 걸 제거.

### 이슈 #14, #18, #20 — 계정 열거 방지 + 재가입 무한루프 (`cbee4a2`)
- **#14 계정 열거**: `signInWithEmail`에서 `UserNotFoundException`과
  `NotAuthorizedException`을 모두 동일한 `WRONG_CREDENTIALS_MESSAGE`
  ('이메일 또는 비밀번호가 올바르지 않습니다.')로 수렴 — 이전엔 "가입 안 된
  이메일"과 "비번 틀림"이 다른 문구로 응답해 계정 존재 여부가 새어나갔다.
  `forgotPassword`도 `UserNotFoundException`을 성공 케이스와 동일하게
  `{ success: true }`로 응답하도록 수정 — 두 번째 계정 열거 경로.
  AWS CLI로 실제 UNCONFIRMED/CONFIRMED 계정 양쪽에 `resend-confirmation-code`
  를 직접 호출해 확인(UNCONFIRMED→성공, CONFIRMED→
  `InvalidParameterException: User is already confirmed`, 메일 미발송) —
  이 비대칭성이 #18 수정의 근거.
- **#18 UNCONFIRMED 재가입 무한루프**: 기존 코드 주석이 "`signUp()`을
  UNCONFIRMED 계정에 다시 호출하면 인증코드가 자동 재발송된다"고
  잘못 가정하고 있었음 — 실측(`aws cognito-idp sign-up`)으로 반증,
  실제로는 그냥 `UsernameExistsException`만 던지고 메일은 안 감. 위에서
  확인한 `resendSignUpCode`(=`ResendConfirmationCode` API)의 비대칭
  동작을 이용해 `signUpWithEmail`의 `USERNAME_EXISTS` 분기에서
  `resendSignUpCode`를 먼저 시도 → 성공하면(=UNCONFIRMED였다는 뜻) 신규
  가입과 동일하게 인증 화면으로 보냄(`needsConfirmation: true`), 실패하면
  기존 "이미 등록된 이메일입니다." 유지. `signInWithEmail`도 UNCONFIRMED
  케이스에서 `unconfirmedAccount: true`를 반환하도록 `AuthResult`에 필드
  추가.
  - `LoginClient.tsx`에 `showResignupCta` state 추가 — 로그인 실패가
    UNCONFIRMED 계정이면 에러 배너 아래 "지금 회원가입 이어하기 →" 버튼을
    노출, 눌러도 `switchMode("signup")`으로 넘어가기만 하고 자동으로
    아무 API도 재호출하지 않음(사용자가 직접 이메일 재입력·제출).
- **#20 린트**: `AuthContext.tsx`의 `any` 타입 대부분은 이전 세션(팀원
  작업)에서 이미 `unknown`+타입가드로 정리돼 있었음 — 남은 건
  `react-hooks/exhaustive-deps` 경고 하나(`checkUser`/`syncUserProfile`가
  `useCallback`으로 안 감싸져 마운트 `useEffect`의 의존성 배열에 못
  들어가고 있던 것). 두 함수를 `useCallback`으로 감싸고
  (`syncUserProfile`은 빈 deps, `checkUser`는 `[syncUserProfile]`)
  의존성 배열에 추가 — 런타임 동작 변경 없이 경고만 해소.
- `err.message` 형태로 raw Cognito 에러 메시지를 그대로 노출하던 catch
  블록 전부(파일 전체) 제거 — 위 두 이슈와 별개로 같이 발견된 정보 노출.
- 검증: 디스포저블 테스트 계정(`admin-create-user`+
  `admin-set-user-password`로 생성, 실제 유저 계정은 절대 안 건드림)으로
  CDP 스크립트를 짜서 실제 브라우저에서: 로그인 실패 응답 문구 동일성,
  UNCONFIRMED 재가입 CTA 클릭→가입 폼→인증코드 화면 도달까지 전 구간 확인.

### 이슈 #17 — 비밀번호 변경 기능 (`4561467`)
- `AuthContext.tsx`에 `changePassword(oldPassword, newPassword)` 신규 —
  Amplify `updatePassword` 사용, 기존 세션 유지(강제 재로그인 없음).
  에러 매핑: `NotAuthorizedException`→"현재 비밀번호가 올바르지
  않습니다.", `InvalidPasswordException`→정책 안내 문구,
  `LimitExceededException`→"시도가 너무 많아요...".
- `shared/ui/PasswordChecklist.tsx` 신규 — `LoginClient.tsx`에 있던
  `PasswordChecklist`/`PasswordMismatchHint`를 추출해 재사용.
- `app/(auth)/settings/password/` 신규 — `PasswordSettingsClient.tsx`
  (현재/새/확인 3필드 폼, `user.isFederated`(구글 로그인 계정)면 폼 대신
  안내 문구만 표시), `page.tsx`(`robots: { index: false }`).
- `UserMenu.tsx`에 "비밀번호 변경" 메뉴 추가, 구글 계정이면 숨김.
- 검증: 브라우저로 오답→정책 위반→불일치→성공→기존 비밀번호로 재로그인
  시도(거절 확인)까지 전 구간 확인. 초반에 테스트 스크립트가 "모든 시도가
  실패"로 보였는데, 원인은 공유 크롬 프로필에 이전 로그인 세션이 남아있어
  Amplify의 `UserAlreadyAuthenticatedException` 가드에 걸린 테스트
  방법론 문제였음(실제 앱 버그 아님) — 매 테스트 전
  `localStorage`의 `CognitoIdentityServiceProvider*` 키를 지우도록 스크립트
  수정.

### 스플래시 화면 연결 (`96ccd10`, `33a3968`)
- PR #29(이전 세션에서 머지된 피그마 핸드오프 `SplashScreen` 컴포넌트)가
  만들어지기만 하고 실제로 어디서도 안 쓰이고 있었음. `providers.tsx`에
  `SplashGate` 신규 — `sessionStorage` 플래그로 세션당 1회만 노출.
- 첫 구현은 `useState(false)` + effect에서 `setShow(true)`라, 서버
  렌더/첫 페인트 시점엔 항상 스플래시가 없는 상태로 나가고 메인 콘텐츠가
  먼저 보였다가 뒤늦게 스플래시가 덮는 역전 현상 발생. `useState(true)`로
  기본값을 뒤집어 서버/클라이언트 첫 렌더가 일치하도록 수정(하이드레이션
  안전) — `sessionStorage`에 이미 플래그가 있을 때만 effect에서
  `setShow(false)`.

### 푸터 공시 문구 추가 (`b1c38b3`)
- `widgets/SiteFooter/SiteFooter.tsx`에 "AI LENS는 한국언론진흥재단
  지원을 받아 개발한 인지양식 유형별 서비스입니다." 추가 — 기존 AI
  고지 문단 바로 위, 동일 스타일.

## 결정

- 계정 열거 방지 원칙(#14)을 UNCONFIRMED 재가입 복구(#18)에도 그대로
  적용 — `resendSignUpCode`의 성공/실패 자체가 계정 존재·확정 여부를
  노출하지 않는 API 비대칭을 그대로 활용, 새 엔드포인트를 안 만듦.
- 비밀번호 변경은 기존 세션을 유지하는 쪽으로(강제 재로그인 없음) —
  UX 마찰을 줄이는 쪽을 택함.

## 다음

- 없음 — 5개 이슈(#14,#16,#17,#18,#20) 전부 실제 브라우저 검증까지
  완료 후 종료. #21(게임 슬러그 중복)은 사용자 본인이 이전에 이미
  해결한 상태였음이 확인돼 검증만 하고 종료, #22(테스트 계정 정리)는
  코드 변경 없는 운영 작업으로 별도 커밋 없음.
