# Phase 03 — 오늘 페이지 백엔드 자동 파이프라인 (Editor Pick)

작성: 2026-05-14 · 상태: **Phase 1 (코드) 완료 · Phase 2 (AWS 자원) 진행 중**

## Why
[Phase 02](./02-today-page-4-different-letters.md) 가 박은 4 letter 가 **mock**. 운영 시에는 매일 새벽 자동으로 그날의 4 letter 가 작성되어야 함. 기존 v2 인프라(Collector → Selector → Transform)가 매일 ~30 article 을 4 MBTI 본문으로 변환까지는 해놓는 상태였고, 그 위에 **한 층만** 얹으면 됨.

## Before (오늘 페이지가 운영 모드로 갈 수 있는 흐름이 없음)

```
[기존 매일 자동, 작동 중]
EventBridge cron → Collector → Selector → Transform
                                              ↓
                                      ~80 article × 4 MBTI 본문 (S3 + pgvector)

[여기서 끊김]
                                      ↓
                                  ??? (4 에디터별 1편 picking + letter 톤 재작성)
                                      ↓
                                  프론트 mockTodayFeed (현재 mock)
```

## After (Phase 2 완료 시)

```
[기존, 그대로]
Collector → Selector → Transform

[Phase 03 추가 한 층]
KST 05:30 cron → Editor Pick Lambda
  = Haiku 4.5 1 invoke
  = orchestrator prompt + 4 페르소나 카드 + 후보 20 article
  = 4 letter 출력 (NT/NF/ST/SF 각 1편)
  ↓
daily_letters 테이블 4 row insert (UNIQUE(letter_date, editor_id))
  ↓
GET /api/v2/today-letters  ← Today Letters Lambda (API Gateway)
  ↓
프론트 mockTodayFeed → fetch 교체
  ↓
사용자가 매일 아침 다른 letter 4편 받음
```

## Phase 1 — 코드 작성 (LANDED, AWS 자원 0)

| 파일 | 역할 |
|------|------|
| `backend/v2/prompts/editor_letter/NT.md` | 민철 페르소나 카드 (분석가) |
| `backend/v2/prompts/editor_letter/NF.md` | 하은 페르소나 카드 (이야기꾼) |
| `backend/v2/prompts/editor_letter/ST.md` | 준서 페르소나 카드 (팩트 큐레이터) |
| `backend/v2/prompts/editor_letter/SF.md` | 소율 페르소나 카드 (트렌드 캐스터) |
| `backend/v2/prompts/editor_letter/orchestrator.md` | 4 picking + letter 작성 시스템 프롬프트 |
| `backend/v2/core25/editor_pick_service.py` | 후보 추출 + Haiku 호출 + JSON 파싱 + 검증 |
| `backend/v2/handlers/core25_editor_pick.py` | EventBridge cron → 위 서비스 호출 |
| `backend/v2/handlers/today_letters.py` | GET /api/v2/today-letters API |
| `backend/v2/clients/pgvector_v2_client.py` | 3 메서드 추가: `get_editor_pick_candidates` · `insert_daily_letter` · `get_daily_letters` |
| `backend/v2/infrastructure/daily_letters_schema.sql` | 신규 테이블 마이그레이션 SQL |
| `backend/v2/tests/test_editor_pick.py` | pytest 14 케이스 — parse · 검증 · run_editor_pick e2e mock |
| `backend/v2/deploy-v2.sh` | `editor-pick` · `today-letters` 타겟 추가 |

### 핵심 의사결정

1. **모델 = Haiku 4.5 시스템 inference profile** (`us.anthropic.claude-haiku-4-5-20251001-v1:0`).  
   베타 단계는 Opus 4.6 (월 ~$20) 대신 Haiku (월 ~$1.4) 로. 출시 단계 톤 검증 후 Opus 로 전환 검토.
2. **mode A / C 자동 판단은 orchestrator(Haiku)가 함**. 핸들러는 검증만.
3. **카테고리 다양성 룰** — NT 거시·NF 인물·ST IT/실적·SF 문화/소비 우선권. orchestrator 프롬프트에 명시.
4. **UNIQUE(letter_date, editor_id) idempotent** — 같은 날 재실행해도 안전.
5. **prompt cache** — `cache_control: ephemeral` 적용. 1 invoke/일이라 캐시 효과는 거의 없지만 `.clauderules #7` 일관성.

## Phase 2 — AWS 자원 (사용자 손 2 단계 + Claude 자동 5 단계)

### 사용자 손 (`.clauderules #5` Lambda 최초 생성·secret 입력은 콘솔 경유)

**[A] daily_letters 테이블 마이그레이션**

```bash
# 옵션 1: psql (RDS 보안그룹이 본인 IP 허용 시)
psql -h <PG_V2_HOST> -p 5432 -U ailens -d ailens_v2 \
  -f backend/v2/infrastructure/daily_letters_schema.sql

# 옵션 2: RDS Query Editor (AWS Console > RDS > Query Editor)
#   → DB sedaily-mbti-pgvector-v2-dev 선택
#   → schema.sql 내용 붙여넣기 → Run
```

**[B] Lambda 함수 2개 신규 생성** (Console GUI 또는 사용자가 CLI 직접 실행)

빈 placeholder 로 생성:

```bash
echo 'def lambda_handler(event, context): return {"statusCode": 200, "body": ""}' > /tmp/placeholder.py
cd /tmp && zip placeholder.zip placeholder.py

# 함수 1 — Editor Pick (KST 05:30 cron 용)
aws lambda create-function --region us-east-1 \
  --function-name sedaily-mbti-v2-editor-pick-dev \
  --runtime python3.11 --architectures x86_64 \
  --role arn:aws:iam::887078546492:role/service-role/sedaily-mbti-v2-collector-dev-role-nbf99tic \
  --handler placeholder.lambda_handler \
  --memory-size 1024 --timeout 300 \
  --zip-file fileb:///tmp/placeholder.zip

aws lambda put-function-concurrency --region us-east-1 \
  --function-name sedaily-mbti-v2-editor-pick-dev \
  --reserved-concurrent-executions 1

# 함수 2 — Today Letters (API)
aws lambda create-function --region us-east-1 \
  --function-name sedaily-mbti-v2-today-letters-dev \
  --runtime python3.11 --architectures x86_64 \
  --role arn:aws:iam::887078546492:role/service-role/sedaily-mbti-v2-collector-dev-role-nbf99tic \
  --handler placeholder.lambda_handler \
  --memory-size 256 --timeout 30 \
  --zip-file fileb:///tmp/placeholder.zip
```

### Claude 자동 (A·B 끝나면 Claude 가 일괄 실행)

1. 코드 push — `cd backend && ./v2/deploy-v2.sh editor-pick` + `./v2/deploy-v2.sh today-letters`
2. 환경변수 8 개 박기 — 기존 transform Lambda 와 동일 (`PG_V2_HOST/PORT/DATABASE/USER` + `PG_PASSWORD_SSM_PARAM` + `S3_ARTICLE_BODY_V2_BUCKET` + `BEDROCK_RUNTIME_ENDPOINT_URL` + `ROTATION_AT`). **모두 non-secret** (시크릿은 SSM Parameter Store 에서 자동 fetch).
3. Handler 정식 핸들러로 변경 — `v2.handlers.core25_editor_pick.lambda_handler` · `v2.handlers.today_letters.lambda_handler`
4. EventBridge cron — `sedaily-mbti-v2-editor-pick-schedule` `cron(30 20 * * ? *)` (KST 05:30)
5. API Gateway 라우트 — `GET /api/v2/today-letters` → today-letters Lambda
6. Editor Pick manual invoke 1회 → daily_letters 4 row 검증
7. today-letters API 호출 → 4 letter JSON 반환 검증
8. 프론트 mockTodayFeed → API fetch 교체 + 빌드/배포

## 비용

- Haiku 4.5 1 invoke/일 ≈ 입력 15K tok × $1/M + 출력 6K tok × $5/M = **$0.045/일 = 월 ~$1.4**
- 그 외 신규 비용 0 (DDB → pgvector 기존 RDS row 4개/일, S3 기존 버킷 공유)

## 검증

- Phase 1 코드: pytest 14 케이스 통과 (`backend && python3 -m pytest v2/tests/test_editor_pick.py -v`)
- Phase 2 완료 후: Editor Pick manual invoke → daily_letters 4 row + Bedrock CloudWatch metric 확인

## 다음 단계 (Phase 3 — 사용자 미팅 후)

1. 진짜 운영 1 주 모니터링 → letter 톤·일관성·실패율 점검
2. Opus 4.6 전환 검토 (베타 → 운영)
3. mode C 트리거 룰 fine-tune
4. `secondary_article_ids` 활용 (NT 의 묶음 해석 사례 확장)
