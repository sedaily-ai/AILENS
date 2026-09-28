# Bedrock 응답 신뢰성 — reasoning 비활성화 + 프롬프트 캐싱 + 재시도 (2026-09-24)

## 문제 발견

- "영상 탭에서 Opus 5로 각본이 출력되다가 중단됐다"는 리포트 — 사용자 요구: "출력이 중단되는 케이스가 존재하면 안 됨"
- 6개 텍스트 모델(sonnet-46/opus-5/sonnet-5/opus-5-5/gpt-6-astra/gpt-6-sol) 전량을 실제 기사로 직접 호출해 재현 — sonnet-5/opus-5-5에서 간헐적으로 응답이 0글자로 끊김을 확인

## 문제 정의

- 처음엔 타임아웃으로 추정했으나, `_BEDROCK_READ_TIMEOUT_SECONDS`(240→300초로 이미 상향, 실제 Lambda 타임아웃은 900초로 확인)와 무관하게 재현됨
- 진짜 원인: Claude 5 계열의 내부 extended thinking(확장 사고)이 답변과 같은 `max_tokens` 예산을 공유해, 긴 카테고리 시스템 프롬프트에서 reasoning이 예산을 불규칙하게 전부 소진 — max_tokens을 늘려도 기사별로 결과가 들쭉날쭉해 근본 해법이 아님을 확인
- 부가로 `_stream_completion`의 예외 처리가 `logger.warning`(트레이스백 없음)만 남기고 조용히 `text_done`을 보내, 실패해도 로그·사용자 화면 둘 다에 드러나지 않던 문제도 발견
- 프롬프트 캐싱 조사 중 `requirements.txt`에 boto3가 아예 안 박혀 있어(Lambda 런타임 내장 1.35.0) Bedrock `cachePoint`가 클라이언트 단 `ParamValidationError`로 거부되고 있음을 확인
- `_get_bedrock_client()`의 `retries={"max_attempts": 1}`(재시도 없음, 사유 명시 주석 없음)도 확인 — 쓰로틀링·순간 커넥션 오류가 즉시 사용자 에러로 노출되는 구조

## 왜 그렇게 했는지

- `get_thinking_config(model_id)` 신설, Converse API `additionalModelRequestFields`로 모델별 제어 — sonnet-46/opus-5/sonnet-5는 `{"thinking":{"type":"disabled"}}`로 완전 차단. opus-5-5는 Bedrock이 disabled를 거부해(`ValidationException`으로 직접 확인) `{"type":"adaptive"},"effort":"low"`로만 완화 가능하고 0% 위험은 아님을 사용자에게 명시 후 드롭다운 유지를 확정(사용자 선택 — 옵션 1). gpt-6-astra/gpt-6-sol은 `thinking` 파라미터 자체를 거부해(직접 확인) 매핑에서 제외
- `_stream_completion` 예외 처리는 이미 웹툰 경로에 적용돼 있던 패턴(`logger.exception`+사용자 노출 `error` 이벤트)을 그대로 이식 — 새 처리 방식을 고안하지 않음
- 프롬프트 캐싱은 격리 환경(`pip install --target`, 전역 미변경)에 `boto3==1.43.101`을 설치해 동작을 먼저 직접 검증(cache write→다음 호출 read)한 뒤에만 requirements.txt에 고정 — 검증 없이 버전만 올리지 않음
- gpt-6-astra/gpt-6-sol은 캐싱 요청 시 Bedrock이 서버 단 `AccessDeniedException`으로 거부함을 직접 호출로 확인(thinking과 달리 클라이언트 검증이 아닌 실제 모델 미지원) — `model_supports_prompt_cache(model_id)`로 이 두 모델만 분기 제외, 나머지 호출부엔 무조건 적용
- 재시도는 `max_attempts=2`, `mode="standard"`로 제한 — botocore 재시도가 요청/응답 헤더 수신 단계에서만 판단됨을 확인해 `converse_stream`의 스트림 순회 중 실패는 재시도 대상이 아니므로(응답이 이미 호출부로 넘어간 이후) 텍스트 중복 노출 위험이 없다고 판단. 횟수를 2로 제한한 근거는 `read_timeout(300초)×2+여유`≈610초가 Lambda 타임아웃 900초 이내라는 계산(3회는 최악의 경우 초과)

## 어떻게 달라졌는지

| | 이전 | 이후 |
|---|---|---|
| 응답 중단(0글자) | sonnet-5/opus-5-5에서 간헐적 재현 | sonnet-46/opus-5/sonnet-5는 재현 테스트로 해소 확인, opus-5-5는 완화(0% 아님, 사용자 인지) |
| read timeout | 240초 | 300초 |
| 스트리밍 예외 처리 | `logger.warning`, 사용자 미노출 | `logger.exception`+`error` 이벤트 노출 |
| 프롬프트 캐싱 | 미사용(boto3 미고정) | `boto3==1.43.101` 고정, 캐시 write→read 실측 확인(1차 `cacheWriteInputTokens=7202` → 2차 `cacheReadInputTokens=7202`) |
| Bedrock 재시도 | `max_attempts=1` | `max_attempts=2`, `mode="standard"` |
| 자유 대화 max_tokens | 2000 | 8000(reasoning 차단된 모델이라 부작용 없음) |

- `admin/backend/deploy-admin-api.sh`로 배포 완료(2회 — 1차: 타임아웃+reasoning+캐싱, 2차: 재시도 정책), `pyflakes` 클린 확인

## 다음

- 미해결: `GET /admin/posts` HTTP 413(payload too large) → Lambda `Runtime.ExitError` — 로그 점검 중 별도 발견, 이 작업과 무관, 미착수
