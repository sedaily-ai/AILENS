# 2026-11-04 DB 구조 정리 1차 — 미사용 Lambda·DynamoDB 정리

작성: Claude Code
관련: 브랜치 `chore/decommission-20261104`, [`service/backend/infrastructure/decommission-2026-11-04/README.md`](../../../service/backend/infrastructure/decommission-2026-11-04/README.md), 바탕화면 `[LENS]DB현재구조_20261103.pdf`

## 배경

DB 재설계(새 기능 추가·트래픽 증가·저장소 단순화)에 앞서 현재 구조를 정리했다. 데이터 대부분은 이미 Aurora PostgreSQL로 옮겨졌고, DynamoDB에는 캐시·옛 사본만 남아 있었다. 저장소를 줄이려고 안 쓰는 Lambda와 DynamoDB 테이블부터 정리했다.

## 한 것

- 현재 구조 조사(코드·ERD·db-changelog 읽기 + AWS 조회만): PostgreSQL 약 105개 테이블(코드 사용 ~65, 미사용 ~40, 정의 파일 기준), DynamoDB 13개 중 30일 꾸준히 쓰는 건 `sedaily-mbti-articles-dev`(타임머신 캐시)뿐, S3는 파일만. 결과는 바탕화면 문서.
- Lambda 판단: CloudWatch 30일 호출 − 워밍(`sedaily-mbti-lambda-warming`, 5분마다 → 30일 8,640회) + API Gateway 실제 경로 + 프론트·앱·관리자·파이프라인 코드 검색.
- 백업: Lambda 15개 설정(비밀 값 가림)·리소스 정책·API 경로·스케줄 → `decommission-2026-11-04/`, 코드 zip 337MB → 로컬 `~/ailens-lambda-archive-2026-11-04/`, DynamoDB 11개 on-demand 백업.
- 차단: Lambda 15개 예약 동시성 0, 브리핑 스케줄 2개 DISABLED, 워밍 규칙에서 post-dev 제외.
- 즉시 삭제(30일 실호출 0·호출 코드 없음): Lambda 6개(voice-tts, voice-stt-presign, voice-stt-url, external-content, newsletter-subscribe, post) + `chzwwtjtgk` 경로 14개·통합 7개, DynamoDB 6개(cms-posts, engagement, external-content, podcast, quiz-questions, ws-connections). 확인: `/api/v2/health`·`/time-machine` 200, 삭제 경로 404.
- 스크립트 정리: `deploy.sh` 함수 목록에서 삭제한 3개 제거(없는 함수는 실패로 집계돼 배포가 실패로 끝남), 배포 후 확인 주소를 `/api/v2/posts`(차단 중, 503) → `/api/v2/health`. `setup-lambda-warming.sh`에서 post·article 제거(실제 규칙 대상과 일치).

## 결정

- 바로 전부 지우지 않고 나눴다: 한 달 내내 0인 12개는 즉시 삭제, 10월 중순까지 쓰던 Lambda 9개·DynamoDB 5개는 1주일 차단 뒤 삭제. 코드 조사로 "안 씀"이던 `admin-prompts`가 실제로는 10/26에 읽힌 사례가 있어 조사만 믿지 않았다.
- `v2-health`는 7/30 결정대로 남김(장애 대응). `search`는 REST API `7w5nco7xn4`에 따로 물려 있어 보류.
- `chzwwtjtgk`는 LENS 전용(다른 서비스 경로 0). 처음엔 공유로 잘못 봤다 — 영문 서비스 경로 112개는 `7w5nco7xn4`. 삭제는 대상 함수로 가는 경로·통합 ID만 골라서 했다.
- 쿼리 튜닝은 11/4 결과보고로 중단(CPU 100%는 1~2초 순간값, ACU 평균 최소치). 재설계 동기는 성능이 아니라 단순화·확장성.

## 다음

- 2026-11-11 이후: 차단한 9개 `Throttles` 확인 → 0이면 Lambda 9개(+경로·통합)·DynamoDB 5개 삭제, `deploy.sh`에서 나머지 이름 제거.
- `admin-prompts`를 읽는 코드 찾기 → PostgreSQL로 옮기면 DynamoDB는 타임머신 캐시 1개(TTL 꺼짐, 229MB). 캐시도 옮기면 0개.
- 선택: 관리자 코드 `config_table()`(JOBS_BACKEND=pg라 안 쓰는 갈래)·`letters_table()`(숨은 "AI 레터 편집" 화면, 빈 테이블) 제거 — 화면 폐기 여부는 결정 필요.
- `selection_runs` INSERT 권한 오류(매일 08·12·15시) 조사. PostgreSQL 실제 테이블 사용량(`pg_stat_user_tables`) 조회는 DB 접속 정보가 필요해 보류.
