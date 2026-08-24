# 2026-08-24 Cognito 인증 메일 발송을 COGNITO_DEFAULT → SES(DEVELOPER)로 전환

작성: 문영광 + Claude Code
관련: [이슈 #15](https://github.com/sedaily-ai/AILENS/issues/15), 유저풀 `us-east-1_ZS8PgF3iX`(mbti)

## 배경

Cognito 기본 메일(`COGNITO_DEFAULT`)은 유저풀당 하루 50통 상한이 있는 개발용
발송 경로다. 회원가입 인증코드·비밀번호 재설정 코드가 이 50통을 나눠 쓰는데,
한도를 넘으면 화면엔 "인증 코드가 전송됐어요"가 정상적으로 뜨면서 실제로는
메일이 조용히 발송되지 않는다 — 장애가 로그에 안 잡히고 "가입이 안 돼요" CS로만
들어오는 구조. 발신 도메인도 Cognito 기본 도메인이라 서울경제 브랜드가 아니었다.
이슈 #15(minyoung0303)에서 제기.

## 한 것

- SES 계정 상태 확인 — 이 AWS 계정(887078546492, us-east-1)은 이미 프로덕션
  액세스 승인 상태(`ProductionAccessEnabled: true`, 5만 통/일)라 샌드박스 해제
  신청 자체가 불필요했다.
- `ailens.sedaily.ai`를 SES 도메인 아이덴티티로 신규 검증(기존 `mbti.sedaily.ai`
  재사용 대신 — 사용자가 ailens.sedaily.ai에서 가입하는데 mbti.sedaily.ai에서
  메일이 오면 브랜드가 안 맞아서). DKIM CNAME 3개를 Route53(`Z07543813V4FC5RK599U0`)에
  추가, 몇 분 내 `VerificationStatus: SUCCESS` 확인.
- `describe-user-pool`로 현재 설정 전체 백업 후, `update-user-pool`로
  `EmailConfiguration`만 교체:
  ```json
  "EmailConfiguration": {
    "SourceArn": "arn:aws:ses:us-east-1:887078546492:identity/ailens.sedaily.ai",
    "From": "AI LENS <noreply@ailens.sedaily.ai>",
    "EmailSendingAccount": "DEVELOPER"
  }
  ```
  나머지 필드(태그 8개, PasswordPolicy, AccountRecoverySetting,
  VerificationMessageTemplate, MfaConfiguration 등)는 백업값 그대로 재전송해
  `update-user-pool`의 전체 덮어쓰기 특성으로 인한 유실을 막았다.
  `AdminCreateUserConfig`는 이슈에서 경고한 대로 `UnusedAccountValidityDays`를
  빼고 `AllowAdminCreateUserOnly`만 보냈다(둘 다 보내면 ValidationException).
- 실제 발송 검증 — 회원가입 코드(Gmail·Naver 도메인 모두 수신 확인), 비밀번호
  재설정 코드 모두 실제 수신 확인 완료.
- 변경 후 `describe-user-pool`로 태그·정책·MFA·복구설정이 그대로인지 재확인.
- 테스트 과정에서 만든 미확인 Cognito 계정(`ttrhtt1@gmail.com`) 및 기존
  `ttrhtt12@sedaily.com` 계정 정리(사용자 요청으로 삭제).

## 결정

- `mbti.sedaily.ai`(이미 검증된 도메인)를 그대로 재사용하는 대신
  `ailens.sedaily.ai`를 새로 검증했다 — DNS 작업 5분 추가되지만 발신 도메인이
  실제 서비스 도메인과 일치해야 사용자 신뢰도·스팸 통과율에 유리하다고 판단.
- SPF용 커스텀 MAIL FROM 도메인은 설정하지 않았다 — 기존 `mbti.sedaily.ai`도
  DKIM만 설정하고 커스텀 MAIL FROM 없이 잘 동작 중이라 같은 패턴을 따름.

## 다음

- CloudWatch 알람 등 발송 실패 감지 수단은 아직 없음(이슈에서 "권장" 수준으로
  명시, 필수 아님) — 필요시 별도 세션에서.
- 이슈 #15에 완료 코멘트 남기고 닫을 것.
