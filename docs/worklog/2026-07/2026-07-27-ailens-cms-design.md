# AI LENS CMS — 관리자 콘텐츠 관리 시스템 설계

- 날짜: 2026-07-27
- 요구자: 문영광 (카카오톡, 2026-07-27 14:10~14:20)
- 상태: 설계 승인됨 (사용자, 2026-07-27)

## 1. 배경 & 목표

요구사항 원문(요약):

> 현 UI/UX 에서 블로그 CMS 를 만드는 것. 직접 게시글을 올리고 수정하고 삭제할 수 있는 시스템.
> 영문사이트(en.sedaily.com)가 관리자 페이지에서 수정·삭제·발송하듯, 우리도 관리자 페이지에서
> 글을 올리고 수정하면 사용자 화면에 적용되는 느낌.

**목표:** 관리자가 `ailens-cms.sedaily.ai` 에서 글을 쓰고·고치고·내리면 `ailens.sedaily.ai` 사용자
화면에 반영된다. 기존 AI 레터도 같은 화면에서 수정·삭제한다.

현재 사용자 화면의 콘텐츠는 **전부 기계 생성**이다 — 레터(Editor Pick 파이프라인 → `daily_letters`),
1면 기사(XML 수집), 피드(MBTI 변환). 사람이 쓴 글이 들어갈 경로가 존재하지 않는다. 이 작업이 그
경로를 만든다.

## 2. 검증된 현재 상태 (2026-07-27 실측)

이 절의 사실은 모두 이날 코드·AWS·라이브 엔드포인트에서 직접 확인했다.

### 2.1 기존 admin 은 정상 동작한다

사용자가 "똑바로 작동하는지 모르겠다"고 했으나 실측 결과 인프라 수준에서 건강하다.

| 점검 | 결과 |
|---|---|
| `https://mbti-admin.sedaily.ai/` | HTTP 200, 실제 Next 빌드 (`_next/static` 청크 존재) |
| `/login` | HTTP 200 |
| admin API 라우트 12개 | 전부 **401** = 등록됨 + 인증 요구 (정상) |
| 배포 번들의 API 주소 | `chzwwtjtgk.execute-api.us-east-1.amazonaws.com` 이 청크에 박혀 있음 → 빌드 시 env 정상 주입 |

주의: admin API 의 실제 경로는 `/admin/*` 이다 (`/api/admin/*` 아님). routeKey 목록은
`service/backend/admin/handler.py` 의 `HANDLERS` dict 참조.

발견된 결함은 `<title>` 이 `mbti-admin.sedaily.ai` 로 비어 있는 것 정도.

### 2.2 admin 백엔드 구조는 CMS 를 올릴 수 없다 (핵심 제약)

```
service/backend/admin/requirements.txt = argon2-cffi + PyJWT   ← 이게 전부
pg8000 / pgvector 참조                  = 0건                   ← DB 접근 수단 없음
배포 스크립트                            = 없음                   ← deploy.sh·deploy-v2.sh 어디에도 없고
                                                                  admin/*.sh 도 없음
import 규약   = `import auth` / `from routes import …` / `from shared import …`
                                                                ← zip 루트가 admin/ 이어야만 동작
core/·common/ 재사용                     = 0건                   ← response.py 를 32줄로 따로 만들어 씀
```

**결과:** `cms_posts` 는 pgvector 에 있는데 admin Lambda 에는 DB 접근 수단이 없고, v2 의
`PgVectorV2Client` 를 가져오려면 flat import 패키징부터 바꿔야 한다. 게다가 **배포 스크립트가
저장소에 없어서** 라우트를 추가해도 올릴 방법이 없다. 그래서 백엔드 구조 정리가 CMS 의
**전제조건**이며, 4단계가 아니라 0단계다.

### 2.3 `daily_letters` 는 수동 글을 담을 수 없다

```sql
article_id TEXT NOT NULL REFERENCES articles(news_id) ON DELETE CASCADE  -- 원본 기사 필수
UNIQUE (letter_date, editor_id)                                          -- 에디터당 하루 1건
mbti_group CHAR(2) NOT NULL CHECK (mbti_group IN ('NT','NF','ST','SF'))  -- 그룹 필수
```

관리자가 직접 쓴 글은 원본 기사가 없고, 하루에 여러 건 써야 하며, 전체 대상 공지는 그룹이 없다.
세 제약 모두 위배된다. `UNIQUE` 를 푸는 선택지는 **기각** — 이 제약이 Editor Pick 파이프라인의
중복 삽입 방지 장치라서, 풀면 재시도·중복 실행 때 같은 레터가 여러 건 쌓인다.

### 2.4 `/api/v2/feed` 에 수동 글을 섞을 수 없다

이 Lambda 는 `MemoryManager → ContextBroker → RecommendAgent` 를 인라인으로 돌려 개인화
랭킹을 한다. 수동 글은 임베딩이 없어 **랭킹 자체가 불가능**하고, 프로덕션 개인화 경로에 예외
분기를 심게 된다.

## 3. 확정된 결정 사항

| 항목 | 결정 | 근거 |
|---|---|---|
| 콘텐츠 범위 | AI 레터 편집 + 직접 작성 글 **둘 다** | 사용자 확정 |
| 노출 위치 | **관리자가 채널을 선택** (`letters`/`paper`/`feed`) | 사용자 확정 |
| AI 레터 발행 | **지금대로 자동 발행** 유지, 관리자는 사후 수정 | 승인 게이트를 두면 사람이 못 볼 때 사이트가 빈다 |
| 편집기 | **레터와 동일한 구조화 폼** | 기존 레터 UI 에 그대로 렌더 → 신규 렌더러 0, AI 레터 편집기와 화면 공유 |
| 뉴스레터 발송 | **이번 범위 제외** | 메일은 되돌릴 수 없다. CMS 안정화 후 별도 |
| 이미지 | **직접 업로드 포함** | 사용자 확정 |
| URL 전략 | 즉시 쿼리 URL + 야간 재빌드로 정식 URL 승격 | 정적 export 제약 |
| 저장소 | **신규 `cms_posts` 테이블** (A안) | §2.3 |
| 사용자 화면 반영 | **신규 공개 API + 프론트 머지** | §2.4, 롤백 용이 |
| 삭제 | **소프트 삭제** (`deleted_at`) | "삭제" = 화면에서 내리는 것, 기록 말소가 아님 |
| 사이트 | **기존 admin 앱 확장 + 도메인 추가** (신규 앱 아님) | 인증·배포·API 클라이언트 재사용 |
| admin renewal | **UI 전면 재설계 + 백엔드 구조 재설계** | 사용자 확정 |

## 4. 아키텍처

```
ailens-cms.sedaily.ai ─┐
mbti-admin.sedaily.ai ─┴→ CloudFront E1MITYI58DB9UW → S3 sedaily-mbti-admin-frontend-dev
                              (기존 배포에 도메인 alias 만 추가)
        │  argon2id + JWT (기존 인증 재사용)
        ▼
   API Gateway chzwwtjtgk
        /admin/*          기존 12개 라우트
        /admin/posts/*    신규 CMS CRUD
        /admin/letters/*  신규 AI 레터 편집
        /admin/media/*    신규 이미지 presign
        ▼
   sedaily-mbti-admin-api-dev Lambda (기존 함수에 라우트 추가)
        ├─ cms_posts            신규 테이블 (pgvector v2)
        ├─ daily_letters        기존 테이블 UPDATE / DELETE
        └─ S3 presigned PUT     sedaily-mbti-cms-media-dev
        ▼
   sedaily-mbti-v2-posts-dev Lambda (신규, 공개)
        GET /api/v2/posts?channel=&date=
        GET /api/v2/posts/{slug}
        ▼
   ailens.sedaily.ai — 프론트가 기존 응답과 머지해서 렌더
```

기존 읽기 경로(`today-letters` / `front-page` / `feed`)는 **건드리지 않는다.**

## 5. 상세 설계

### 5.0 0단계 — 백엔드 기반 정비 (CMS 전제조건)

기존 6개 라우트의 **동작을 바꾸지 않는다.** 포장과 배포 경로만 정리한다.

- `service/backend/admin/deploy-admin.sh` 신설 — 현재 저장소에 배포 방법이 없다. zip 빌드 →
  S3 업로드 → `update-function-code` 로, `deploy-v2.sh` 패턴을 따른다
- **DB 접근은 얇은 전용 클라이언트로 붙인다** — `service/backend/admin/shared/pg_client.py` 신설
  (pg8000 연결 + `run()` 헬퍼, ~40줄). v2 의 `PgVectorV2Client`(약 1,900줄, admin 이 안 쓰는
  메서드가 대부분)를 import 하지 않는다.

  *설계 변경 사유 (2026-07-27):* 처음에는 "패키징 규약을 v2 방식으로 통일"을 계획했으나,
  그러려면 Handler 를 `handler.lambda_handler` → `admin.handler.lambda_handler` 로 바꾸고
  `import auth` / `from routes import …` / `from shared import …` 세 종류의 flat import 를
  전부 수정해야 한다. 0단계의 원칙인 "기존 6개 라우트의 동작을 바꾸지 않는다" 와 정면으로
  충돌한다. 얇은 클라이언트는 같은 목적(pgvector 접근)을 훨씬 작은 위험으로 달성한다.
  패키징·`core/` 이관은 4단계 정비로 미룬다.

- `requirements.txt` 에 `pg8000==1.31.2` 추가 (v2 와 동일 핀)
- admin Lambda 를 VPC 에 연결 — **실측 확인 (2026-07-27)**: `sedaily-mbti-admin-api-dev` 는
  `VpcConfig` 가 `null` 이라 현재 pgvector 접속 불가. 아래 구성을 적용한다.

  | 항목 | 값 | 출처 |
  |---|---|---|
  | VPC | `vpc-07a3a75110d6594aa` | `sedaily-mbti-v2-today-letters-dev` |
  | 서브넷 | `subnet-0430a7468d7d796e9`(1a), `subnet-0b9783a637589c096`(1b) | 〃 |
  | 보안그룹 | `sg-0cddc39619b1d69d9` | 〃 |
  | 추가 env | `PG_V2_HOST` `PG_V2_PORT` `PG_V2_USER` `PG_V2_PASSWORD` `PG_V2_DATABASE` | 〃 (값 비노출 복제) |

  **VPC 연결이 기존 12개 라우트를 깨지 않는 근거**: 두 서브넷 모두 라우트테이블
  `rtb-0237950d5ef4ca8d8` 을 통해 `0.0.0.0/0` → NAT `nat-0665bd606c707c846` 로 나간다.
  따라서 admin 이 쓰는 SSM·DynamoDB·CloudWatch·SES 호출이 VPC 안에서도 유지된다.
  (S3 는 Gateway 엔드포인트, Bedrock 은 Interface 엔드포인트도 이미 있음)

  **IAM 선행 작업**: `sedaily-mbti-admin-api-dev-role` 에는 현재
  `AWSLambdaBasicExecutionRole` + 인라인 `AdminApiAccess` 만 붙어 있다. VPC 연결에 필요한
  ENI 권한이 없으므로 **`AWSLambdaVPCAccessExecutionRole` 을 먼저 attach** 해야 한다.
  빠뜨리면 함수가 초기화 단계에서 실패한다.

**게이트:** 정비 후 기존 12개 라우트가 전부 이전과 동일하게 응답해야 한다 (401 스모크).

### 5.1 1단계 — `cms_posts` + CRUD API

```sql
CREATE TABLE IF NOT EXISTS cms_posts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug            TEXT UNIQUE NOT NULL,   -- 서버 생성 (§5.1.2), 관리자 수정 가능
    status          TEXT NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft','published','archived')),
    channels        TEXT[] NOT NULL DEFAULT '{}',   -- 'letters' | 'paper' | 'feed'
    publish_date    DATE NOT NULL,
    mbti_group      CHAR(2) CHECK (mbti_group IS NULL
                                   OR mbti_group IN ('NT','NF','ST','SF')),
    editor_id       TEXT,
    headline        TEXT NOT NULL,
    subtitle        TEXT,
    closing_line    TEXT,
    body_inline     JSONB NOT NULL,   -- {body[], key_points[], keywords[], images[]}
    cover_image_url TEXT,
    created_by      TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    published_at    TIMESTAMPTZ,
    deleted_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_cms_posts_pub
    ON cms_posts (publish_date DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_cms_posts_channels
    ON cms_posts USING GIN (channels);
```

`daily_letters` 와 다르게 잡은 점:

- **`article_id` FK 없음** — 직접 쓴 글은 원본 기사가 없다
- **`UNIQUE (date, editor_id)` 없음** — 하루 여러 건
- **`mbti_group` NULL 허용** — 전체 대상 공지
- **본문 S3 분리 안 함** — 레터는 Opus 가 길게 써서 S3 에 뺐지만 사람 글은 짧다.
  JSONB 인라인으로 S3 왕복을 없앤다 (커지면 그때 추가)
- **`editor_id` NULL 허용** — NULL 이면 'AI LENS 편집팀' 명의로 표시

관리자 API (기존 admin Lambda 에 라우트 추가, JWT 뒤):

```
POST   /admin/posts                  생성 (draft)
GET    /admin/posts?status=&channel= 목록
GET    /admin/posts/{id}             단건
PUT    /admin/posts/{id}             수정
POST   /admin/posts/{id}/publish     발행  (status=published, published_at=now())
POST   /admin/posts/{id}/unpublish   내림  (status=draft)
DELETE /admin/posts/{id}             소프트 삭제 (deleted_at=now())
```

공개 API (신규 Lambda `sedaily-mbti-v2-posts-dev`, 인증 없음, `Cache-Control: public, max-age=300`):

```
GET /api/v2/posts?channel=letters&date=YYYY-MM-DD
GET /api/v2/posts/{slug}
```

조회 조건은 `status='published' AND deleted_at IS NULL AND '<channel>' = ANY(channels)`.

#### 5.1.1 채널별 렌더 매핑

각 화면의 응답 형태가 서로 달라서, 공개 API 는 `channel` 에 따라 **다른 모양으로 shaping** 한다.
매핑은 아래로 고정한다 (구현자가 임의 해석하지 않는다).

| 대상 필드 | `letters` (ApiLetter) | `paper` (front-page article) |
|---|---|---|
| 식별자 | `id` ← `slug` | `news_id` ← `slug` |
| 제목 | `headline` | `title` ← `headline` |
| 부제 | `subtitle` | `sub_title` ← `subtitle` |
| 본문 | `body[]` ← `body_inline.body` | `content` ← `body` 를 `\n\n` 로 결합 |
| 블록 | — | `content_blocks` ← `body`(text) + `images`(image) 를 순서대로 |
| 이미지 | `images` ← `body_inline.images` | `image_url` ← `cover_image_url` |
| 명의 | `editor_id` | `author_name` ← 에디터 표시명 |
| 기타 | `key_points` · `keywords` · `closing_line` 그대로 | `is_top` = `false`, `category` = `''` |

`feed` 채널은 **개인화 랭킹 대상이 아니다** (§2.4). 피드 상단에 고정 카드로 노출하며,
`RecommendAgent` 의 정렬에 참여하지 않는다.

**에디터 표시명 규칙**: `editor_id` 가 있으면 그 페르소나(민철/하은/준서/소율)의 이름·아바타·
accent 를 쓴다. `editor_id` 가 NULL 이면 이름은 `AI LENS 편집팀`, 아바타는 서비스 로고
(`/lens.png`), accent 는 중립 회색(`#6b7280`)을 쓴다. `mbti_group` 이 NULL 인 글은 4그룹 모두에게
노출된다.

#### 5.1.2 slug 생성

서버가 생성한다. `{publish_date}-{headline 의 슬러그화}` 형태로 만들고, 한글은 그대로 두되 공백·
특수문자는 `-` 로 바꾼다. 최대 80자. 중복이면 `-2`, `-3` 을 붙인다. 관리자가 에디터에서 직접
수정할 수 있고, 수정본이 중복이면 400 을 반환한다.

발행 후에는 slug 를 바꾸지 않는다 — 이미 나간 URL 이 깨진다. 변경이 필요하면 새 글로 만든다.

### 5.2 2단계 — CMS 화면

`admin/src/app/(authenticated)/posts/` 아래에 목록·에디터를 만든다. 기존 admin 의 인증 래퍼와
`adminClient` 를 그대로 쓴다.

- **목록**: 상태(초안/발행/휴지통) 필터, 채널 뱃지, 발행일 정렬
- **에디터**: 헤드라인 · 부제 · 본문 문단(추가/삭제/순서) · 핵심 정리 · 키워드(term+explain) ·
  닫는 줄 · 채널 다중 선택 · MBTI 그룹(선택 안 하면 전체) · 에디터 명의
- **발행 흐름**: 저장(draft) → 미리보기 → 발행 → 사용자 화면 확인

프론트 머지: `todayLettersApi.fetchTodayLetters` 가 `/api/v2/posts?channel=letters` 를 **병렬로**
불러 기존 레터 배열에 합친다. 공개 API 가 실패하면 기존 레터만 렌더한다 (fail-open).

### 5.3 3단계 — AI 레터 편집 + 이미지 업로드

AI 레터 편집은 `daily_letters` 를 직접 UPDATE 한다. 편집기 화면은 2단계 것을 재사용한다
(스키마가 같은 모양이라 폼이 공유된다).

```
GET    /admin/letters?date=   목록
PUT    /admin/letters/{id}    수정
DELETE /admin/letters/{id}    삭제
```

이미지 업로드 — presigned PUT:

```
에디터에서 파일 선택
  → POST /admin/media/presign {filename, content_type, size}
  → admin Lambda 가 presigned PUT 발급 (5분 만료, content-type 고정, 크기 상한 10MB)
  → 브라우저가 S3 로 직접 PUT        ← Lambda 를 거치지 않음
  → 반환된 공개 URL 을 body_inline.images 에 저장
```

브라우저 직접 업로드인 이유: **API Gateway·Lambda 페이로드 한계가 6MB** 라 Lambda 를 경유하면
이미지 한 장에 막힌다.

서빙은 신규 버킷 `sedaily-mbti-cms-media-dev` + **기존 프론트 CloudFront `E1QS7PY350VHF6` 에
`/media/*` behavior 와 origin 추가**. 이미지가 `ailens.sedaily.ai/media/…` 로 같은 오리진에서
나가 캐싱이 붙고, CloudFront 배포를 새로 만들지 않아도 된다. 버킷은 OAC 로 잠그고 직접 공개하지
않는다.

### 5.4 4단계 — admin renewal + 도메인 전환

- 기존 5개 화면(비용·프롬프트·드라이버·뉴스레터·설정) UI 전면 재설계, CMS 와 일관된 디자인
- 백엔드 정비: 기존 6개 라우트를 `@lambda_handler` + `core/response` 로 이관 (에러·응답 포맷을
  v1/v2 와 일치), `shared/response.py` 중복 제거, 감사 로그(`audit`) 일원화
- `<title>` 등 메타데이터 정리
- Route53 `ailens-cms.sedaily.ai` + CloudFront alias 추가. `mbti-admin.sedaily.ai` 는 당분간 병행

**4단계를 마지막에 두는 이유:** UI 재설계가 기능 검증을 막지 않게 한다. 반대로 하면 CMS 가
도는지 확인도 못 한 채 화면부터 갈아엎게 된다.

## 6. AWS 변경 목록 & 절차 (`.clauderules` 준수)

**모든 리소스 생성은 실행 직전 커맨드를 제시하고 사용자 확인을 받은 뒤 실행한다. 이상 발생 시
즉시 중단하고 보고. 생성된 ID 는 PR 본문에 기록.**

| # | 변경 | 자동/수동 | 비용 | 단계 |
|---|---|---|---|---|
| 1 | admin Lambda `update-function-code` (`deploy-admin.sh`) | 자동 허용 | — | 0 |
| 2 | admin Lambda VPC 설정 (서브넷·SG) | 승인 후 실행 | $0 | 0 |
| 3 | `cms_posts` 테이블 생성 (DDL) | 승인 후 실행 | $0 | 1 |
| 4 | **Lambda 생성** `sedaily-mbti-v2-posts-dev` | **항상 수동** | 월 $0 수준 | 1 |
| 5 | API GW `chzwwtjtgk` 라우트 + invoke 권한 | 승인 후 실행 | $0 | 1 |
| 6 | S3 `sedaily-mbti-cms-media-dev` + OAC | 승인 후 실행 | 월 $1 미만 | 3 |
| 7 | CloudFront `E1QS7PY350VHF6` 에 `/media/*` behavior + origin | 승인 후 실행 | $0 | 3 |
| 8 | Route53 `ailens-cms.sedaily.ai` + CloudFront alias | 승인 후 실행 | $0 | 4 |

**ACM 인증서는 신규 불필요** — 와일드카드 `*.sedaily.ai` (`ae647d30…`) 가 `ailens-cms.sedaily.ai`
를 이미 커버한다.

API Gateway CORS allowlist 에 `https://ailens-cms.sedaily.ai` 를 추가해야 한다 (기존 3개
`ailens` / `mbti` / `mbti-admin` 와 함께 — 넷 다 유지해야 프런트가 안 깨진다).

시크릿 env 값(`PG_V2_PASSWORD` 등)은 기존 Lambda 구성 복제로만 전달하고 로그·문서·채팅에
값을 출력하지 않는다.

## 7. 테스트 계획

- **백엔드** (v2 규칙: 신규 파이썬 파일당 pytest ≥1). pg·S3 는 fake 로 대체, DB 불필요
  - CRUD, 발행/내림, 소프트 삭제, 채널 필터, slug 중복, presign 만료·크기 상한
  - 0단계 회귀: 기존 12개 라우트가 정비 전후 동일 응답
- **프론트**: `npx tsc --noEmit` + `npm run build` 통과가 게이트 (admin·frontend 양쪽)
- **스모크(배포 후)**: 글 작성 → 발행 → 공개 API 200 → 사용자 화면 확인 → 삭제 →
  공개 API 에서 사라짐

## 8. 엣지케이스 & 알려진 한계

| 케이스 | 처리 |
|---|---|
| 공개 API 장애 | 프론트가 기존 레터만 렌더 (fail-open). 머지 실패가 화면을 죽이지 않음 |
| presign 후 업로드 실패 | 고아 URL 발생 가능 → 글 저장 시점에 S3 HEAD 로 존재 확인 |
| 발행 중 실패 | `status` 는 `draft` 유지. 중간 상태로 남지 않게 단일 트랜잭션 |
| 같은 slug 중복 | `UNIQUE` 위반 → 400 반환, 에디터에서 수정 유도 |
| 새 글의 SEO | 발행 즉시는 쿼리 URL 이라 검색 노출 약함. 야간 재빌드 후 정식 URL 로 승격 |
| `feed` 채널 | 개인화 랭킹과 섞지 않고 프론트에서 상단 고정 노출. 랭킹 대상 아님 |
| 이미지 삭제 | 글을 지워도 S3 오브젝트는 남는다 (고아). 정리는 별도 배치 — 이번 범위 아님 |
| 동시 편집 | 마지막 저장이 이김 (last-write-wins). 편집 잠금은 이번 범위 아님 |

## 9. 비범위 (Out of scope)

- 뉴스레터 **발송** 버튼 (수정·삭제·게시까지만)
- 다중 관리자 계정·권한 분리 (현행 단일 argon2id 비밀번호 유지)
- 예약 발행, 편집 이력·되돌리기, 편집 잠금
- 고아 이미지 정리 배치
- 사용자 화면 UI 리디자인 (CMS 글은 기존 레터 UI 로 렌더)
