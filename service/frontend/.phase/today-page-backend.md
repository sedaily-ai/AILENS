# "오늘" 페이지 백엔드 — 일일 에디터 레터 파이프라인

작성: 2026-05-14 · 상태: 기획 검토 중 (구현 미착수)

## 1. 컨셉 합의

- "오늘" 페이지 = 매일 4 에디터(NT 민철 · NF 하은 · ST 준서 · SF 소율)가 각자 한 통씩 보내는 편지 4편.
- **A 모드 (평일 기본)** — 4 에디터가 각자 페르소나 관점에서 다른 기사 1편씩 픽.
- **C 모드 (빅이벤트 트리거)** — 한은 금통위·FOMC·삼성전자 실적 등 시그널 큰 날, 4 에디터가 같은 기사를 4해석. 자동 감지(특정 키워드·발행 시간) 또는 수동 flag.
- 글 형식 = mock 의 `OneShotLetter` 톤 — 챕터 제목 · 부소제목 · 키워드 형광펜 · archetype 라벨 · "안녕하세요, OO입니다" 인사.

## 2. 기존 v2 인프라 (재사용)

```
Collector (매일 새벽)        → articles 테이블 (raw)
Core 1.5 Selector (Nova)     → article_selections 테이블, MBTI별 selected=TRUE top 20
Core 2 Transform (Opus 4.6)  → 각 selected 기사를 NT/NF/ST/SF 4 버전 텍스트 작성 → S3
```

→ 일 ~80개 기사가 4 MBTI 버전으로 transform 됨. 우리가 만들 "오늘의 한 통" 4편은 **이 풀에서 4 에디터별 top1 픽 + letter 톤 재작성**.

## 3. 추가할 레이어

### 3-1. Editor Pick Lambda (신규)

- 이름: `sedaily-mbti-v2-editor-pick-dev`
- 트리거: EventBridge `cron(30 20 * * ? *)` = KST 05:30 (Core 2 Transform 완료 후 1~2시간 여유)
- 입력: 그날 transform 완료된 기사 풀 (article_selections.transformed_at IS NOT NULL AND date(transformed_at) = today)
- 로직:
  1. 4 에디터별 최고 fit 점수 기사 후보 5건씩 추출 (페르소나 fit + 카테고리 다양성 + 빅이벤트 가중)
  2. Opus 4.6 호출 1회로 4 에디터 동시 픽 + letter 작성 (시스템 프롬프트에 페르소나 카드 4개 + 후보 20건 메타 + 본문 발췌)
  3. 출력: 4편의 letter (headline·subtitle·body·keywords·archetype·theme·article_id 링크)
  4. `daily_letters` 테이블에 저장 (pgvector)

### 3-2. daily_letters 테이블 (신규 — pgvector)

```sql
CREATE TABLE daily_letters (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  letter_date DATE NOT NULL,                         -- 발행일 (KST)
  editor_id   TEXT NOT NULL,                         -- 'NT-min' | 'NF-ha' | 'ST-jun' | 'SF-so'
  mbti_group  CHAR(2) NOT NULL,                      -- NT/NF/ST/SF
  article_id  TEXT REFERENCES articles(news_id),     -- 원본 기사
  mode        TEXT NOT NULL DEFAULT 'A',             -- 'A' (개별 픽) | 'C' (4해석 공통)
  headline    TEXT NOT NULL,
  subtitle    TEXT,
  archetype   TEXT,                                  -- "이번 주의 분석가" 같은 메타 라벨
  theme       TEXT,                                  -- "두산에너빌리티" 같은 주제 키워드
  keywords    JSONB,                                 -- [{ term, explain }, ...]
  body_s3_uri TEXT NOT NULL,                         -- 본문은 S3 (split storage 패턴)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (letter_date, editor_id)
);
CREATE INDEX idx_daily_letters_date ON daily_letters (letter_date DESC);
```

### 3-3. Today Letters API (신규 Lambda + API Gateway 라우트)

- 이름: `sedaily-mbti-v2-today-letters-dev`
- 라우트: `GET /api/v2/today-letters?date=YYYY-MM-DD` (date 생략 시 오늘)
- 응답:
```json
{
  "date": "2026-05-14",
  "mode": "A",
  "letters": [
    {
      "id": "...", "editor_id": "NT-min", "headline": "...",
      "subtitle": "...", "archetype": "...", "theme": "...",
      "keywords": [...], "body": "...", "article_id": "..."
    },
    ... (4개)
  ]
}
```

프론트 `mockTodayFeed` 를 이 API 응답으로 교체.

## 4. 비용 추정

| 항목 | 일 발생량 | 단가 | 일 비용 | 월 (30일) |
|------|-----------|------|---------|-----------|
| Editor Pick Opus 4.6 (1 호출 / 일) | 1 | 입력 ~15K tok × $15/M + 출력 ~6K tok × $75/M | ~$0.68 | ~$20 |
| Editor Pick Lambda invocation | 1 | 무시 가능 | ~$0 | ~$0 |
| Today Letters API Lambda | ~10K req | 무시 가능 | ~$0.02 | ~$0.6 |
| pgvector 저장 (4 row/일) | — | 기존 RDS 공유 | $0 | $0 |
| S3 본문 (4 obj/일) | — | 기존 버킷 공유 | ~$0 | ~$0 |
| **합계** | | | | **약 $21** |

- 기존 v2 transform 파이프라인 비용은 **변경 없음** (이미 매일 돌고 있음).
- Editor Pick 만 신규 → 월 $21 추가.
- 빅이벤트 C 모드 확장 시 동일 호출(같은 1 호출에서 4편 다 나옴) → 비용 차이 없음.

## 5. 결정 포인트 (사용자 확인 필요)

| # | 질문 | 추천안 |
|---|------|--------|
| Q1 | Editor Pick 신규 Lambda 만들기 + EventBridge cron 추가 | 승인 필요 (AWS 리소스) |
| Q2 | `daily_letters` 테이블 신규 추가 (pgvector RDS 안에) | 승인 필요 |
| Q3 | `today-letters` API Lambda + API Gateway 라우트 신규 | 승인 필요 |
| Q4 | letter 본문 = letter 톤으로 새로 작성 vs 기존 transform 결과 재사용 | **새 letter 톤으로 새로 작성** 추천. 기존 transform 은 기사 재해석 톤이라 편지 결이 약함. |
| Q5 | 빅이벤트 C 모드 트리거 — 자동(키워드 룰) vs 수동 flag | 1단계는 **A 모드만**, C 는 Phase 2 로 분리 |
| Q6 | 4 에디터 시그너처 톤 프롬프트 위치 | `backend/v2/prompts/editor_letter/{NT,NF,ST,SF}.md` 신규 |

## 6. 구현 단계 (Q1~Q3 승인 후)

```
Phase 1 — 스키마 + 픽 로직 (mock 호출, AWS 자원 0)
  - daily_letters 테이블 SQL + 마이그레이션 스크립트 작성
  - editor_pick_service.py 로컬 작성 + 기존 transform 풀 mock 으로 단위 테스트
  - prompts/editor_letter/{NT,NF,ST,SF}.md 4개 작성

Phase 2 — Editor Pick Lambda 배포
  - handlers/core25_editor_pick.py
  - deploy-v2.sh 에 sedaily-mbti-v2-editor-pick-dev 추가
  - EventBridge cron 수동 생성 (사용자 승인 후)

Phase 3 — Today Letters API
  - handlers/today_letters.py
  - API Gateway 라우트 추가
  - 프론트 mockTodayFeed → API 호출 교체

Phase 4 — C 모드 (빅이벤트 4해석) 후속
```

## 7. v1 영향

- v1 파일 수정 0건 (backend/v2/ 안에서만 작업)
- v1 Lambda 배포 (deploy.sh) 영향 0
- 프론트 mockTodayFeed → API 교체 시 v1 API 와 무관 (신규 v2 라우트)
