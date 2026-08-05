# 오늘의 1면 — 실데이터 파이프라인 설계

- 날짜: 2026-07-23
- 브랜치: `feat/front-page-live-data`
- 근거 문서: `~/Desktop/sedaily-print-front-page-ingestion-workflow.md` (en.sedaily.com 핸드오프 문서 — 본 프로젝트에 맞게 적응)
- 상태: 설계 승인됨 (사용자, 2026-07-23)

## 1. 배경 & 목표

사이트(ailens.sedaily.ai)는 현재 100% mock/수기 데이터로 동작한다. `daily_letters` 테이블이 모든 날짜에 대해 비어 있어(2026-07-23 실측: 오늘·어제·5/26 모두 `letters: []`) 프론트는 2026-05-25가 마지막인 로컬 수기 레터로 fallback 중이다.

**목표(사용자 확정, 최소 범위):** 서울경제 종이신문 **1면 기사(매일 5~6건)를 실데이터로 수집·저장·표시**한다. 레터 파이프라인 재가동은 이번 범위가 아니다 — 레터는 현행(수기/mock) 유지.

## 2. 검증된 현재 상태 (2026-07-23 실측 스냅샷)

이 섹션의 사실은 모두 이날 AWS/S3/코드에서 직접 확인한 것이다.

### 2.1 이미 돌아가는 것

| 항목 | 상태 |
|---|---|
| Core 1 수집기 (`sedaily-mbti-v2-collector-dev`) | **매일 KST 00:00 실행 중** (`sedaily-mbti-v2-collector-schedule` ENABLED). 로그 7/20·21·22 확인 |
| paper-mode (`collector-paper-mode` feature flag) | **켜져 있음.** 7/22 run: `paper_pass: 26` (지면 기사 중 `paragraph=='TOP'`만 통과) |
| 저장소 | pgvector v2 `articles` (metadata JSONB에 `paper_number`/`paper_date`/`paper_paragraph` 저장) + S3 `sedaily-mbti-article-body-v2-dev`의 `articles/{nsid}/original.json` (전체 필드: `title_ko`, `sub_title_ko`, `content_ko`, `content_blocks`, `images`, `paper`, `url`, `author_name` 등) |
| D-1 시맨틱 | 오늘자 신문 1면 기사는 **어제 날짜 XML**에 들어옴 (`publishInfo/date`=오늘, 파일은 D-1). paper-mode가 이미 target_date=어제로 처리 |
| S3 읽기 | `S3ArticleV2Client.get_article_file()` 이미 존재 |
| 중지된 것 | transform-trigger DISABLED, editor-pick 스케줄 미생성 → 레터 미생산 (이번 범위 아님) |

### 2.2 XML 실측 (20260722.xml = 7/23자 지면)

- 총 431건 중 `paperNumber=='1'`인 기사 **5건** — **포맷은 plain `"1"`** ("01"/"A1" 아님, 근거 문서 §4의 검증 완료)
- **7일치(0716~0722, 2,165건) 전수 재검증**: paperNumber 고유값 32개 전부 plain 정수, 0-패딩·알파벳 0건. 1면 원시값은 7일 내내 `'1'`. 부수 실측 — (a) 토·일 신문일 부재(주말 휴간) → fallback 규칙 주말 상시 발동, (b) 같은 신문일 1면 기사가 여러 파일일에 분산 도착(stragglers) → 매일 cron이 다음 날 파일에서 자동 회수(self-healing)
- **S3 read 권한**: 로컬 IAM 유저(minseo)·수집기 Lambda role 모두 `sedaily-news-xml-storage` 읽기 가능 실증 (인프라 요청 불필요). 신규 front-page Lambda는 XML 버킷 미접근
- 1면 5건 중 `paragraph=='TOP'` 1건(톱기사), 나머지 4건은 `paragraph=='9'`
- **`position`/`detailPosition`은 실제 피드에서 빈값** → 근거 문서의 "position 정렬"은 사용 불가. 대체: `paragraph=='TOP'` 우선 정렬
- 1면 기사 87%가 `action=U` (온라인 선공개 후 지면 메타 추가) — paper-mode는 의도적으로 action 무관 통과
- `content_blocks` shape: `{"type":"image","url","alt","width","caption",...}` / `{"type":"text","text_ko":"...\n\n..."}`

### 2.3 현재의 갭 (이번 작업이 채울 것)

1. **수집 필터**: `paragraph=='TOP'`만 통과 → 1면 톱기사 1건만 저장되고 **나머지 1면 4~5건은 버려짐**
2. **읽기 API 부재**: 저장된 1면 기사를 조회할 엔드포인트 없음
3. **표시 부재**: 프론트에 1면 페이지 없음

## 3. 확정된 결정 사항

| 결정 | 선택 | 비고 |
|---|---|---|
| 범위 | **1면 기사 표시만 (최소)** | 레터 자동생성 연결은 보류 |
| 노출 위치 | **새 라우트 `/paper`** | 메인에서 진입 링크 1곳 |
| 본문 보기 | **사이트 내 본문 렌더** (in-page 확장) + 하단 원문 링크 | 정적 export 제약상 동적 라우트 대신 쿼리/확장 |
| API 위치 | **A안: 신규 Lambda `sedaily-mbti-v2-front-page-dev`** | v2 네이밍·장애격리 일관 |
| mock fallback | **없음** | "저장소가 진실의 원천" — 실패 시 정직한 빈/에러 상태 |

## 4. 아키텍처

```
서울경제 daily XML (S3, ap-northeast-2)                       [기존]
  → core1_collector (매일 KST 00:00, paper-mode)             [기존 · 필터 1곳 확대]
      통과 조건: paragraph=='TOP'  OR  paper_number=='1'  ← 변경점
  → pgvector articles (metadata.paper_*) + S3 original.json   [기존 그대로]
  → GET /api/v2/front-page?date=YYYY-MM-DD                    [신규 Lambda]
  → /paper 페이지 (features/front-page)                        [신규 프론트]
```

신규 cron 없음 · DB 스키마 변경 없음 · S3 버킷 신규 없음.

## 5. 상세 설계

### 5.1 수집 — `core1_collector.py` 필터 확대

- `_passes_paper_filter()`의 통과 조건을 `paragraph == 'TOP'` → **`paragraph == 'TOP'` OR `paper_number.strip() == '1'`** 로 확대.
- 실패 사유 문자열은 기존 유지(`no-paper-element` / `paragraph-not-TOP`은 1면 아님+TOP 아님인 경우에만).
- run 요약 로그(`collector_paper_mode_run`)에 **`front_page_pass`** 카운트 필드 추가 (paper_number=='1' 경로 통과 수) — 1면 0건 감지용. CloudWatch 메트릭 dimension은 변경하지 않음(카디널리티 유지).
- `_build_metadata()`는 **변경 없음** — `paper_number`/`paper_date`/`paper_paragraph` 이미 저장. `position`은 피드에서 빈값이므로 저장하지 않는다(YAGNI).
- 영향: 순증 +4~5건/일 (임베딩 Titan V2 비용 월 수 원 단위). selector가 raw 풀에서 이들을 스코어링하게 되지만 transform이 DISABLED라 하류 영향 없음.

### 5.2 읽기 API — `GET /api/v2/front-page`

**신규 파일** `service/backend/v2/handlers/front_page.py`, **신규 Lambda** `sedaily-mbti-v2-front-page-dev` (런타임·메모리·타임아웃·role·VPC·env는 `sedaily-mbti-v2-today-letters-dev` 구성을 복제; env는 `PG_V2_*` + `S3_ARTICLE_BODY_V2_BUCKET`).

**요청**: `date` 쿼리 파라미터 (YYYY-MM-DD, 옵션. 기본값 = KST 오늘. 형식 오류 → 400)

**로직**:
1. date → YYYYMMDD 변환
2. `PgVectorV2Client.get_front_page_articles(paper_date)` *(신규 메서드)* — `metadata->>'paper_number'='1' AND metadata->>'paper_date'=%s` 조회
3. 0건이면 `get_latest_front_page_date(upper_bound)` *(신규 메서드)* — `MAX(paper_date) WHERE paper_number='1' AND paper_date <= 요청일` → 재조회, `is_fallback: true`
4. 그래도 0건 → 200 + `articles: []`
5. 각 기사 S3 `original.json` 병렬 로드(asyncio.to_thread + gather, 5~6건) → 본문 합성. **S3 실패 기사는 본문 없이 목록에 포함** (제목+원문 링크는 유지)
6. 정렬: `is_top DESC, published_at ASC, news_id ASC` (결정적). `is_top = (metadata.paper_paragraph == 'TOP')`

**응답** (200):
```json
{
  "requested_date": "2026-07-23",
  "paper_date": "2026-07-23",
  "is_fallback": false,
  "articles": [
    {
      "news_id": "2KF26GAWZP",
      "title": "애플 보란 듯…4대3 폴더블 펼쳤다",
      "sub_title": "...",
      "category": "경제",
      "author_name": "...",
      "published_at": "2026-07-22T17:29:00+09:00",
      "url": "https://www.sedaily.com/...",
      "image_url": "https://wimg.sedaily.com/...",
      "is_top": true,
      "content": "본문 순수 텍스트 (content_ko)",
      "content_blocks": [ {"type":"image","url":"...","caption":"..."}, {"type":"text","text_ko":"..."} ]
    }
  ]
}
```
- `image_url` = `images[0].url` (없으면 `""`)
- 성공 응답에 `Cache-Control: public, max-age=300` 추가 (지면은 하루 1회 변경)
- 핸들러 패턴은 v2 관례(`@handler_decorator`, OPTIONS 처리, `success_response`/`error_response`) 그대로
- `deploy-v2.sh`: `API_V2_FUNCTIONS`에 추가 + `front-page` case 추가

### 5.3 프론트 — `/paper` (FSD 신규 feature)

```
service/frontend/src/features/front-page/
├── api/frontPageApi.ts        # 타입 + fetch + 날짜별 promise cache (todayLettersApi 패턴)
├── components/FrontPageView.tsx  # 페이지 본체: 헤더(지면 날짜) + 카드 목록 + 날짜 네비게이션
├── components/ArticleBlocks.tsx  # content_blocks 렌더러 (text: \n\n 문단 분리 / image: url+caption, max-width 100%)
└── index.ts                   # barrel export (ESLint boundaries 준수)
service/frontend/src/app/paper/page.tsx  # 얇은 래퍼 + <Suspense> (useSearchParams 규칙) + metadata
```

- 카드: 톱기사(is_top) 시각 강조, 탭하면 **in-page 확장**으로 본문(content_blocks) 렌더 + 하단 "원문 보기" 링크(새 창)
- 날짜 네비게이션: `?date=YYYY-MM-DD` 클라이언트 쿼리 (router.replace) — 정적 export 제약 없음. `is_fallback`이면 "요청일에 지면이 없어 M월 D일자 1면을 표시" 안내
- 상태: 로딩 스켈레톤 / 에러(재시도 버튼) / 빈 상태 — **로컬 mock fallback 금지**
- API base는 기존 shared config(`src/shared/config/api.ts`)의 base 재사용
- 메인 페이지 진입 링크 **1곳만** 추가 (레터 섹션 하단 텍스트 링크 수준 — 메인 레이아웃 훼손 최소 지점, 구현 시 확정). 그 외 메인 수정 없음

### 5.4 백필

필터 확대 배포 후, 수집기 date override로 최근 7일 소급:
```bash
# 파일일 X 를 invoke 하면 신문일 X+1 의 1면이 수집됨 (D-1 시맨틱).
# 최근 8개 파일일(오늘~-7d) 순차 invoke → 신문일 오늘+1(예정분)~-6d 커버.
for D in 0 1 2 3 4 5 6 7; do
  aws lambda invoke --function-name sedaily-mbti-v2-collector-dev --region us-east-1 \
    --cli-binary-format raw-in-base64-out \
    --payload "{\"date\": \"$(date -v-${D}d +%Y%m%d)\"}" /dev/stdout
done
```
- 멱등: `filter_existing_news_ids`가 기저장 기사(각 지면 TOP)를 건너뜀 — 신규 삽입은 1면 non-TOP분만 (~5건/일)
- 검증: 날짜별 front-page API 호출로 5±2건 확인

## 6. AWS 변경 목록 & 절차 (`.clauderules` 준수)

| # | 변경 | 자동화 여부 | 비용 |
|---|---|---|---|
| 1 | collector 코드 업데이트 (`deploy-v2.sh collector`) | 자동 허용 (update-function-code) | — |
| 2 | **Lambda 생성** `sedaily-mbti-v2-front-page-dev` | **수동** — 실행 직전 커맨드 제시 + 사용자 확인, 이상 시 중단, 생성 ID 기록 | ~$0/월 (호출량 미미) |
| 3 | API GW `chzwwtjtgk`에 `GET /api/v2/front-page` 라우트 + Lambda invoke 권한 | 리소스 생성 — 사용자 확인 후 실행 | $0 |
| 4 | front-page 코드 배포 (`deploy-v2.sh front-page`) | 자동 허용 | — |
| 5 | 백필 invoke ×8 | 실행 전 확인 | 임베딩 ~40건, 무시 가능 |
| 6 | 프론트 배포 (`service/frontend/deploy.sh`) | 기존 절차 | — |

시크릿 env(`PG_V2_PASSWORD`)는 기존 Lambda 구성 복제 시에만 전달하고 로그·문서에 값 노출 금지.

## 7. 테스트 계획

- **백엔드** (v2 규칙: 새 파일당 pytest ≥1):
  - `v2/tests/test_front_page.py` — date 검증(400), fallback 로직, 정렬(is_top 우선·결정성), S3 실패 시 graceful 목록 포함, 빈 응답 shape (pg/s3 mock)
  - `v2/tests/test_core1_collector.py`에 케이스 추가 — 1면 non-TOP 통과, 2면 non-TOP 불통과, TOP 통과 유지, `front_page_pass` 카운트
- **프론트**: `npx tsc --noEmit` + `npm run build` (정적 export 성공 = 게이트)
- **스모크(배포 후)**: curl — 오늘/과거일/미래일/형식오류, 실기사 5±2건·is_top 1건 확인

## 8. 엣지케이스 & 알려진 한계

| 케이스 | 처리 |
|---|---|
| 1면 0건(휴간·수집 실패) | 최신 지면일 fallback + `is_fallback: true` + 프론트 안내 문구 |
| `action=D` (지면 확정 후 삭제) | **미반영 (known limitation)** — paper-mode는 action 무관, 지면 확정 후 삭제는 극히 드묾. 발생 시 수동 삭제로 대응 |
| S3 본문 누락 | 해당 기사만 본문 없이 목록 포함 (제목+원문 링크) |
| 이미지 없는 기사 | `image_url: ""` — 프론트 텍스트 카드로 렌더 |
| 미래 date 요청 | `paper_date <= 요청일` 조건의 fallback 규칙이 자연 처리 |
| paperNumber 포맷 변화 | 실측 `"1"` 고정(2026-07-23). 변하면 `front_page_pass=0`으로 로그에서 감지 |
| 과거 미백필 날짜 조회 | fallback 규칙으로 가장 가까운 이전 지면일 표시 |

## 9. 비범위 (Out of scope)

- transform / editor-pick 재가동, 레터 실데이터화 (`daily_letters` 백필 포함)
- 온라인 전용 기사 수집 정책 변경, selector 로직 변경
- 메인 페이지 UX 리디자인 (진입 링크 1곳 외)
- 다국어/번역 (근거 문서 §8 — 한국어 그대로)
