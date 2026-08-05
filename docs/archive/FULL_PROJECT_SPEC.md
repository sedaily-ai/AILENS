# AI LENS — 완전한 프로젝트 & 코드베이스 명세서

> **서비스**: AI LENS — 서울경제신문 MBTI 맞춤형 경제 뉴스
> **도메인**: https://mbti.sedaily.ai
> **API Gateway**: `https://chzwwtjtgk.execute-api.us-east-1.amazonaws.com/dev`
> **최종 업데이트**: 2026-04-13
> **코드 규모**: 백엔드 ~72 파일 / ~31,000줄, 프론트엔드 ~50 파일 / ~21,000줄
> **데모**: 2026-06-11 서울경제 최종 발표
> **운영 상태**: Step Functions 파이프라인 MBTI 타입별 30개 기사 선별 (4타입 × 30 = ~90개 unique) · 변환 · 저장 운영 중. 4차원 MBTI 적합도 AI 스코어링 (NT/NF/ST/SF + 품질) → 타입별 top-30 선별 → S3 임시저장 → Claude 변환. type_assignments DynamoDB 저장으로 프론트엔드 MBTI 타입별 피드 제공. EventBridge 매일 07:00 KST 자동 트리거. OpenSearch (RAG 시맨틱 검색) + RDS pgvector (유사도 검색) 활성화됨. CloudWatch 비용 알람 6개 설정. Lambda 22개 배포 (17 API + 5 Pipeline). 레거시 article_collector EventBridge 비활성화 — Step Functions 파이프라인이 유일한 기사 소스.

---

## 목차

1. [서비스 개요](#1-서비스-개요)
2. [인프라 아키텍처](#2-인프라-아키텍처)
3. [MBTI 그룹 시스템](#3-mbti-그룹-시스템)
4. [프론트엔드](#4-프론트엔드)
5. [백엔드 디렉토리 구조](#5-백엔드-디렉토리-구조)
6. [데이터 저장 레이어](#6-데이터-저장-레이어)
7. [기사 변환 파이프라인 (Step Functions)](#7-기사-변환-파이프라인)
8. [번역 파이프라인 (영문 사이트)](#8-번역-파이프라인)
9. [AI 모델 구성](#9-ai-모델-구성)
10. [API 엔드포인트 전체 목록](#10-api-엔드포인트-전체-목록)
11. [인증 시스템](#11-인증-시스템)
12. [벡터 검색 (OpenSearch + pgvector)](#12-벡터-검색)
13. [추천 시스템](#13-추천-시스템)
14. [A/B 테스트 프레임워크](#14-ab-테스트-프레임워크)
15. [운영 메트릭 + 모니터링](#15-운영-메트릭--모니터링)
16. [환경 변수](#16-환경-변수)
17. [배포](#17-배포)
18. [테스트 스위트](#18-테스트-스위트)
19. [파일별 상세 명세](#19-파일별-상세-명세)
20. [운영 상태 + 최근 변경 사항](#20-운영-상태--최근-변경-사항)

---

## 1. 서비스 개요

AI LENS는 서울경제신문의 원본 경제 기사를 MBTI 인지 스타일 4그룹(NT/NF/ST/SF)별로 AI가 서로 다른 톤과 구조로 리라이팅하여 제공하는 뉴스 서비스이다.

### 핵심 데이터 플로우

```
서울경제 원본 기사 (S3 XML, ap-northeast-2)
  │
  ▼ EventBridge 스케줄 (매일 22:00 UTC = 07:00 KST 다음날)
  │
  ▼ Step Functions 파이프라인 (us-east-1, chained Map architecture)
  ├─ Step1_Select (Nova Lite) — 규칙 필터링 → 4차원 MBTI AI 스코어링 (배치 20건)
  │   → 타입별 top 30 선별 (NT/NF/ST/SF 각 30개, unique ~90개)
  │   → 전체 기사 데이터 S3 임시 저장 (256KB 상태 제한 해결)
  │   → type_assignments DynamoDB 저장 (API 타입별 조회용)
  │   ResultPath: $ (상태 덮어쓰기)
  ├─ Step2_Classify (Pass-Through) — type_assignments → target_groups 매핑, S3 URI 전달
  ├─ ProcessArticlesMap (MaxConcurrency=8, ~90개 기사, ~11 웨이브 × ~30s ≈ 25분 소요)
  │   ├─ TransformOne (Claude Haiku) — S3에서 기사 본문 로드 → 1 호출로 4 MBTI 버전 생성
  │   ├─ ValidateOne (Nova Lite) — 구조적 검증만: 필수필드/길이/언어/환각
  │   │   팩트·스타일 해석 차이는 MBTI 리라이팅의 의도된 결과이므로 절대 거부하지 않음
  │   └─ StoreOne (Supervisor)
  │       ├─ S3 임시 파일에서 기사 본문 로드 (방어적 fallback)
  │       ├─ passed/flagged → 저장, failed만 거부 (빈 body, 잘못된 언어 등)
  │       ├─ Nova 교차버전 리뷰 → SOFT 체크 (로그만, 저장 결정에 영향 없음)
  │       ├─ Article Body → S3 (sedaily-mbti-article-body-dev)
  │       ├─ Article Pointer → DynamoDB (sedaily-mbti-articles-dev)
  │       ├─ Embeddings → OpenSearch (ACTIVE, RAG 시맨틱 검색)
  │       └─ Embeddings → pgvector (ACTIVE, 유사도 검색)
  │
  ▼ (선택) 번역 파이프라인
  ├─ AWS Translate (경제 용어 84개 커스텀)
  └─ Nova 영문 품질 향상 → S3 body_en.json
  │
  ▼ API Gateway → 프론트엔드 (Next.js, mbti.sedaily.ai)
```

**아키텍처 노트** (2026-04-13 업데이트):
- 원래 `Step3_TransformMap → Merge → Step4 → Supervisor` 순차 구조였으나, Step Functions 256 KB 상태 페이로드 제한 때문에 `ProcessArticlesMap` (각 iteration이 Step3→Step4→Supervisor 전체를 1개 기사에 대해 실행) 으로 변경.
- `merge_transform_results` Lambda 및 소스 파일 삭제됨 (chained Map 아키텍처에서 불필요).
- **Step 1: MBTI 타입별 4차원 AI 스코어링 + 타입별 top 30 선별** (2026-04-13 redesign). Nova Lite가 각 기사를 NT적합도·NF적합도·ST적합도·SF적합도 + 품질 총 5개 기준으로 1-10점 평가 (배치 20건, 병렬 5). 각 MBTI 타입별로 복합점수(0.7×타입점수+0.3×품질)로 정렬, 카테고리 최소 쿼터(경제5/IT4/정치3/사회4/문화3/스포츠3/국제3=25) + 잔여 5슬롯(최고점수) = **타입당 30개**. 4타입 합집합 ~90개 unique 기사 (overlap ~30개). 프롬프트: `prompts/selection/article_scorer.md`.
- **256 KB 상태 제한 대응 (S3 offload)**: Step 1이 전체 기사 데이터를 `s3://sedaily-mbti-article-body-dev/pipeline-temp/{date}/selected_articles.json`에 업로드. Step Functions 상태에는 경량 메타데이터(news_id, title, category, published_at)만 전달. Step 3·Supervisor가 S3에서 content_clean 로드. Map `ItemSelector`가 `selected_articles_s3_uri`를 각 iteration에 전달.
- **type_assignments DynamoDB 저장**: Step 1이 `news_id=__type_assignments__{date}` 아이템을 articles 테이블에 저장 (NT/NF/ST/SF 각 30개 news_id 리스트 + 메트릭). 프론트엔드가 `GET /api/articles?mbti_group=NT`로 타입별 기사 조회.
- **Step 2: Pass-Through** (2026-04-13). Step 1의 type_assignments로부터 target_groups 자동 매핑. Nova 분류 호출 제거됨. S3 URI를 Step 3로 전달.
- **Step 3: S3에서 기사 본문 로드** (2026-04-13). `selected_articles_s3_uri`에서 전체 기사 데이터 다운로드 → news_id 룩업 → 경량 payload 기사에 content_clean 등 필드 보강. S3 로드 실패 시 payload fallback (하위 호환).
- **Supervisor: S3 방어적 fallback** (2026-04-13). 날짜 기반 예측 가능한 S3 URI 구성으로 기사 본문 보강. Step 3이 이미 S3 로드하므로 이중 안전망.
- **Step 4 검증 정책** (2026-04-12): 팩트·스타일 해석 차이는 MBTI 리라이팅의 의도된 결과이므로 절대 거부하지 않음. 구조적 검증만: 필수필드(title/body), 길이(100-10,000자), 한국어, 명백한 환각. Nova 환각 체크 실패 시 기본 통과.
- **Supervisor 정책** (2026-04-12): Step 4 status `passed`/`flagged` → 저장, `failed`만 거부. Nova 교차리뷰는 소프트 체크(로그만). 빈 body 안전망 추가.
- **MaxConcurrency 5→8**, **TimeoutSeconds 1800→3600** (1시간), **Step1 TimeoutSeconds 300→600**: ~90개 기사 × 8 동시 = ~11 웨이브 × ~30초 ≈ 25분 소요. 검증 실측: 321 XML → 312 후보 → 90 unique 선별 → 전체 파이프라인 25분 완료.

---

## 2. 인프라 아키텍처

### 2.1 AWS 리소스 전체 목록

| 서비스 | 리소스명 | 리전 | 상태 | 용도 |
|--------|----------|------|------|------|
| **DynamoDB** | `sedaily-mbti-articles-dev` | us-east-1 | ACTIVE | 기사 메타데이터 + S3 포인터 |
| **DynamoDB** | `sedaily-mbti-personal-dev` | us-east-1 | ACTIVE | 유저 프로필, 아카이빙, 읽기 기록, A/B 테스트 |
| **DynamoDB** | `sedaily-mbti-podcast-dev` | us-east-1 | ACTIVE | 팟캐스트 메타데이터 |
| **DynamoDB** | `sedaily-mbti-engagement-dev` | us-east-1 | ACTIVE | 반응, 댓글, 별점 |
| **S3** | `sedaily-news-xml-storage` | ap-northeast-2 | OK | 서울경제 원본 XML (외부, 읽기 전용) |
| **S3** | `sedaily-mbti-article-body-dev` | us-east-1 | OK | 기사 본문 (원문 + MBTI 4버전 + 영문) |
| **S3** | `sedaily-mbti-audio-dev` | us-east-1 | OK | 팟캐스트/TTS 음성 파일 |
| **S3** | `sedaily-mbti-frontend-dev` | ap-northeast-2 | OK | 프론트엔드 정적 파일 |
| **S3** | `sedaily-mbti-lambda-packages-dev` | us-east-1 | OK | Lambda 배포 패키지 |
| **CloudFront** | `E1QS7PY350VHF6` | Global | OK | CDN (mbti.sedaily.ai) |
| **Cognito** | `us-east-1_ZS8PgF3iX` | us-east-1 | OK | 사용자 인증 (Google OAuth) |
| **API Gateway** | `chzwwtjtgk` (HTTP API v2) | us-east-1 | OK | REST API 진입점 (52개 라우트) |
| **Bedrock** | Claude Haiku, Sonnet, Nova Lite/Pro, Titan Embed V2 | us-east-1 | OK | AI 모델 |
| **Polly** | Seoyeon (Neural, ko-KR) | us-east-1 | OK | TTS 음성 합성 |
| **Translate** | Custom Terminology (84 경제 용어) | us-east-1 | OK | 한→영 번역 |
| **OpenSearch** | `sedaily-mbti-search-dev` (t3.small, 10GB gp3) | us-east-1 | **ACTIVE** | RAG 시맨틱 검색 (~$26/월) |
| **RDS PostgreSQL** | `sedaily-mbti-pgvector-dev` (db.t3.micro, PG 16.6, pgvector 0.8.0) | us-east-1 | **ACTIVE** | 유사도 검색 (~$14/월) |
| **CloudWatch** | `sedaily-mbti-*` 알람 6개 + SNS 토픽 | us-east-1 | **ACTIVE** | 비용/성능 모니터링 |
| **Step Functions** | `sedaily-mbti-transform-pipeline-dev` | us-east-1 | ACTIVE | 기사 변환 오케스트레이션 |
| **EventBridge** | `sedaily-mbti-pipeline-schedule-dev` | us-east-1 | ENABLED | 매일 22:00 UTC = 07:00 KST 트리거 |
| **IAM Role** | `sedaily-mbti-lambda-execution-dev` | global | OK | Lambda 실행 역할 (DynamoDB Full + S3 r/w + Bedrock + Polly) |
| **IAM Role** | `sedaily-mbti-stepfunctions-role` | global | OK | Step Functions → Lambda 호출 권한 |
| **IAM Role** | `sedaily-mbti-eventbridge-role` | global | OK | EventBridge → Step Functions 시작 권한 |

### 2.2 Lambda 함수 (배포 22개 + 미배포 1개)

**배포된 API 함수 (17개)** — `./deploy.sh api`로 업데이트됨:

| 함수명 | 핸들러 | 라우트 | 메모리/타임아웃 |
|--------|--------|--------|---------------|
| `sedaily-mbti-article-collector-dev` | `handlers.article_collector.lambda_handler` | EventBridge (레거시, **비활성화**) | 512MB / 300s |
| `sedaily-mbti-article-dev` | `handlers.article_handler.lambda_handler` | `GET /api/articles?date=&mbti_group=&limit=` (목록, 타입별), `GET /api/article/{id}` (상세) | 1024MB / 120s |
| `sedaily-mbti-search-dev` | `handlers.search_handler.lambda_handler` | `POST /api/search` | 512MB / 300s |
| `sedaily-mbti-chatbot-dev` | `handlers.chatbot_handler.lambda_handler` | `POST /api/chat` | 512MB / 300s |
| `sedaily-mbti-engagement-dev` | `handlers.engagement_handler.lambda_handler` | `/api/engagement/*` | 512MB / 300s |
| `sedaily-mbti-tts-dev` | `handlers.tts_handler.lambda_handler` | `POST /api/tts` | 512MB / 300s |
| `sedaily-mbti-time-machine-dev` | `handlers.time_machine_handler.lambda_handler` | `GET /time-machine` | 512MB / 300s |
| `sedaily-mbti-s3-articles-dev` | `handlers.s3_articles_handler.lambda_handler` | `GET /s3-articles` | 512MB / 300s |
| `sedaily-mbti-user-dev` | `handlers.user_handler.lambda_handler` | `/api/user/*` | 512MB / 300s |
| `sedaily-mbti-archive-dev` | `handlers.archive_handler.lambda_handler` | `/api/archive/*` | 512MB / 300s |
| `sedaily-mbti-podcast-dev` | `handlers.podcast_handler.lambda_handler` | `/api/podcast/*` | 512MB / 300s |
| `sedaily-mbti-recommend-dev` | `handlers.recommendation_handler.lambda_handler` | `/api/recommend/*` | 512MB / 300s |
| `sedaily-mbti-post-dev` | `handlers.post_handler.lambda_handler` | `/api/posts/*` | 512MB / 300s |
| `sedaily-mbti-question-dev` | `handlers.question_handler.lambda_handler` | `/api/questions` | 512MB / 300s |
| `sedaily-mbti-metrics-dev` | `handlers.metrics_handler.lambda_handler` | `/api/metrics/*` | 512MB / 300s |
| `sedaily-mbti-abtest-dev` | `handlers.ab_test_handler.lambda_handler` | `/api/ab-test/*` | 512MB / 300s |
| `sedaily-mbti-translation-dev` | `handlers.translation_handler.lambda_handler` | (내부 전용, API Gateway 미연결) | 512MB / 300s |

**배포된 파이프라인 함수 (5개)** — `./deploy.sh pipeline`로 업데이트됨:

| 함수명 | 핸들러 | 역할 | 메모리/타임아웃 |
|--------|--------|------|---------------|
| `sedaily-mbti-pipeline-step1-dev` | `handlers.pipeline.step1_select.lambda_handler` | XML 로드 → 규칙 필터링 → 4차원 MBTI AI 스코어링 (배치 20건) → 타입별 top 30 → S3 업로드 + DynamoDB type_assignments 저장 | 512MB / 600s |
| `sedaily-mbti-pipeline-step2-dev` | `handlers.pipeline.step2_classify.lambda_handler` | Pass-through: type_assignments → target_groups 매핑, S3 URI 전달 (Nova 호출 없음) | 256MB / 300s |
| `sedaily-mbti-pipeline-step3-dev` | `handlers.pipeline.step3_transform.lambda_handler` | S3에서 기사 본문 로드 → Claude Haiku 4 MBTI 버전 변환 (title + body) | 1024MB / 300s |
| `sedaily-mbti-pipeline-step4-dev` | `handlers.pipeline.step4_validate.lambda_handler` | 구조적 검증: 필수필드·길이·언어·환각만 (팩트/스타일 검증 안 함) | 256MB / 300s |
| `sedaily-mbti-pipeline-supervisor-dev` | `handlers.pipeline.supervisor.lambda_handler` | S3 fallback 본문 로드 + passed/flagged → 저장, failed만 거부. 소프트 Nova 리뷰. DynamoDB+S3+벡터 | 1024MB / 300s |

**미배포 (코드는 존재, deploy.sh에서 제외)**:
- `saju_handler.py` — 사주/운세 (로컬 전용)

**삭제됨 (2026-04-10)**:
- ~~`sedaily-mbti-pipeline-merge-dev`~~ — chained Map 아키텍처 도입으로 불필요해져 AWS 및 소스 코드에서 모두 제거.

---

## 3. MBTI 그룹 시스템

### 3.1 4개 그룹 정의

```typescript
// frontend-next/src/shared/data/mbtiGroups.ts
export const mbtiGroups = {
  NT: { id: 'NT', name: '전략형', color: '#3B82F6', style: '애널리스트 리포트', icon: '📊',
        types: ['INTJ', 'INTP', 'ENTJ', 'ENTP'] },
  NF: { id: 'NF', name: '가치형', color: '#8B5CF6', style: '칼럼 / 에세이', icon: '💡',
        types: ['INFJ', 'INFP', 'ENFJ', 'ENFP'] },
  ST: { id: 'ST', name: '실용형', color: '#22C55E', style: '팩트시트', icon: '✅',
        types: ['ISTJ', 'ISTP', 'ESTJ', 'ESTP'] },
  SF: { id: 'SF', name: '공감형', color: '#F97316', style: '친구 톡', icon: '💬',
        types: ['ISFJ', 'ISFP', 'ESFJ', 'ESFP'] },
};
```

### 3.2 에디터 페르소나 + 팟캐스트 음성

| 그룹 | 에디터 | 직함 | 프롬프트 | Polly 속도 |
|------|--------|------|----------|-----------|
| NT | 김시현 | 전략분석팀 수석연구원 | `prompts/transform/nt.md` | 100% |
| NF | 박지원 | 오피니언팀 논설위원 | `prompts/transform/nf.md` | 95% |
| ST | 이정훈 | 팩트체크 에디터 | `prompts/transform/st.md` | 105% |
| SF | 김하은 | MZ 독자 담당 에디터 | `prompts/transform/sf.md` | 95% |

---

## 4. 프론트엔드 (frontend-next/)

### 4.1 기술 스택

```json
{ "next": "16.2.2", "react": "19.2.4", "aws-amplify": "^6.16.3",
  "tailwindcss": "^4", "lucide-react": "^1.7.0", "react-markdown": "^10.1.0" }
```

`next.config.ts`: `output: "export"` (S3 정적 호스팅, CloudFront CDN). `sitemap.ts`와 `robots.ts`에 `export const dynamic = "force-static"` 설정.

### 4.2 활성 파일 구조 (102 파일 / 20,697줄)

```
src/
├── app/                              # Next.js App Router (13 파일, 2,522줄)
│   ├── layout.tsx (52), page.tsx (120), providers.tsx (11)
│   ├── login/page.tsx (375), auth/callback/page.tsx (25)
│   ├── saju/page.tsx (426), subscription/page.tsx (257)
│   ├── timeline/page.tsx (64), timemachine/page.tsx (1,006)
│   └── globals.css (78), robots.ts (29), sitemap.ts (49)
│
├── components/                       # 대형 페이지 컴포넌트 (8 파일, 4,969줄)
│   ├── mbti/FeedPage.tsx (1,941)     # 메인 뉴스피드 (5개 탭 + 오디오 플레이어)
│   ├── mbti/ArticleView.tsx (420)    # 기사 전체화면 (문장 아카이빙)
│   ├── mbti/MbtiChatBot.tsx (371)    # AI 챗봇 플로팅
│   ├── mbti/OnboardingPage.tsx (317) # MBTI 에디터 선택
│   ├── mbti/BriefingPage.tsx (417)   # 음성 브리핑 (ElevenLabs TTS)
│   ├── story/StoryNewsFeed.tsx (665) # 카드 스와이프 온보딩
│   ├── timeline/TimelineNewsFeed.tsx (658)
│   └── character/Character3D.tsx (180)
│
├── features/                         # FSD Feature 모듈 (13 파일, 3,061줄)
│   ├── auth/ (507) — AuthContext (Cognito), LoginButton, UserMenu
│   ├── news-feed/ (535) — NewsFeedTab
│   ├── archive/ (638) — ArchiveTab ← API 연동 완료 (GET/POST/DELETE + 유사도)
│   ├── community/ (700) — CommunityTab (Mock)
│   ├── news-dna/ (526) — DnaTab ← API 연동 완료 (레이더 차트 + 추천)
│   └── question/ (155) — QuestionTab (하드코딩)
│
├── shared/                           # 공통 모듈 (23 파일, 4,148줄)
│   ├── lib/archiveApi.ts (122)       # 내 서랍 API 클라이언트 ← NEW
│   ├── lib/podcastApi.ts (125)       # 팟캐스트 API 클라이언트 ← NEW
│   ├── lib/recommendApi.ts (79)      # 추천/DNA API 클라이언트 ← NEW
│   ├── lib/abTestApi.ts (78)         # A/B 테스트 클라이언트 ← NEW
│   ├── lib/userApi.ts (57), readingTracker.ts (221), elevenlabs.ts (194)
│   ├── config/api.ts (7), auth.ts (34), videoConfig.ts (20)
│   ├── data/mbtiGroups.ts (95), mockArticles.ts (521), famousBirthdays.ts (1,462)
│   ├── types/article.ts (99), mbti.ts (60), timeMachine.ts (20)
│   └── utils/, constants/, services/, ui/
│
└── legacy/                           # 미사용 코드 (44 파일, 5,992줄)
```

### 4.3 프론트엔드 API 연동 현황

| 기능 | 이전 상태 | 현재 상태 | API 연동 |
|------|-----------|-----------|----------|
| 뉴스피드 | API ✅ | API ✅ | `/api/articles` (primary, MBTI 버전 프리로드), `/s3-articles` (fallback), `/api/search` (last resort) |
| 기사 상세 | API ✅ | API ✅ | `/api/article/{id}` (split storage 지원) |
| AI 챗봇 | API ✅ | API ✅ (RAG) | `/api/chat` (OpenSearch fallback DynamoDB) |
| **내 서랍** | **Mock ❌** | **API ✅** | `/api/archive` CRUD + `/api/archive/similar` |
| **오디오** | **Mock ❌** | **API ✅** | `/api/podcast/generate` + HTML5 `<audio>` |
| **뉴스 DNA** | **하드코딩 ❌** | **API ✅** | `/api/recommend/analysis` → 레이더 차트 |
| **추천 기사** | 없음 | **API ✅** | `/api/recommend` → DnaTab 맞춤 추천 |
| 사주 분석 | API ✅ | API ✅ | `/saju` |
| 타임머신 | API ✅ | API ✅ | `/time-machine` |
| 커뮤니티 | Mock ❌ | Mock ❌ | 아직 미연동 |
| **오늘의 질문** | 하드코딩 | **API ✅** | `/api/questions` (question_handler 배포됨) |

---

## 5. 백엔드 디렉토리 구조

```
backend/                               # ~72 파일, ~31,000줄
├── main.py (235)                      # FastAPI 로컬 서버
├── requirements.txt (39)              # 12 런타임 패키지
├── deploy.sh (~180)                   # Lambda 배포 (17 API + 5 pipeline = 22개 함수)
│
├── config/ (4 파일, 717줄)
│   ├── constants.py (282)             # 모든 상수 (테이블, 모델ID, 카테고리, 팟캐스트 음성)
│   ├── settings.py (191)              # Settings 데이터클래스 (39개 환경변수)
│   ├── __init__.py (160)              # 78개 re-export
│   └── economics_terminology.csv (84) # 한→영 경제 용어 84개 ← NEW
│
├── clients/ (13 파일, 4,287줄)
│   ├── dynamodb_client.py (943)       # DynamoDB + S3 split 저장/조회 + get_transformed_articles_by_date()
│   ├── s3_xml_client.py (897)         # S3 XML 파싱 (카테고리 정규화 60+)
│   ├── opensearch_client.py (487)     # OpenSearch full-text + kNN 검색 ← NEW
│   ├── mbti_transform_service.py (407)# Claude MBTI 변환
│   ├── pgvector_client.py (370)       # PostgreSQL 유사도 검색 ← NEW
│   ├── embedding_client.py (298)      # Bedrock Titan 임베딩 (1024차원) ← NEW
│   ├── podcast_db_client.py (223)     # Podcast DB 클라이언트 ← NEW
│   ├── translate_client.py (210)      # AWS Translate 한→영 ← NEW
│   ├── personal_db_client.py (209)    # Personal DB 클라이언트 ← NEW
│   ├── s3_article_client.py (168)     # S3 기사 본문 저장/조회 ← NEW
│   └── personalize_client.py (158)    # Amazon Personalize 어댑터 ← NEW
│
├── handlers/ (21 파일, 8,971줄)
│   ├── saju_handler.py (956)          # 사주 팔자 분석
│   ├── recommendation_handler.py (698)# 개인화 추천 + DNA 분석 ← ENHANCED
│   ├── engagement_handler.py (544)    # 반응/댓글/별점
│   ├── chatbot_handler.py (505)       # RAG 챗봇 (OpenSearch + 폴백) ← ENHANCED
│   ├── podcast_handler.py (496)       # 팟캐스트 생성/조회 ← NEW
│   ├── ab_test_handler.py (449)       # A/B 테스트 프레임워크 ← NEW
│   ├── post_handler.py (445)          # 관리자 게시글
│   ├── article_collector.py (418)     # 기사 수집 (레거시, 유지)
│   ├── archive_handler.py (391)       # 내 서랍 CRUD + 유사도 ← NEW
│   ├── user_handler.py (375)          # 유저 프로필/통계 ← MIGRATED (Personal DB)
│   ├── article_handler.py (369)       # 기사 상세 ← ENHANCED (split storage)
│   ├── search_handler.py (366)        # GSI 검색 ← ENHANCED (S3 body fetch)
│   ├── s3_articles_handler.py (256)   # S3 XML 직접 조회
│   ├── translation_handler.py (205)   # 영문 기사 API ← NEW
│   ├── tts_handler.py (205)           # AWS Polly TTS
│   ├── time_machine_handler.py (344)  # 과거 날짜 뉴스
│   └── metrics_handler.py (71)        # 대시보드 메트릭 ← NEW
│
├── handlers/pipeline/ (7 파일, ~2,090줄)
│   ├── supervisor.py (629)            # 최종 승인 + S3+DynamoDB 저장 + 벡터 인덱싱
│   ├── translation_pipeline.py (371)  # 한→영 번역 파이프라인
│   ├── step4_validate.py (~320)       # 품질 검증 (Nova messages-v1 format)
│   ├── step1_select.py (~340)         # 필터링 + 카테고리 할당 (Step 2에서 이동)
│   ├── step2_classify.py (~240)       # MBTI 분류 (Nova messages-v1 format)
│   ├── step3_transform.py (200)       # 변환 (Claude Haiku, 1 호출 → 4 버전)
│   └── __init__.py (11)
│   # Note: merge_transform_results.py 삭제됨 (chained Map 아키텍처 도입)
│
├── models/ (5 파일, 938줄)
│   ├── article.py (371)               # Article, ArticleVersion, CollectionLog
│   ├── personal.py (237)              # ArchivedSentence, UserProfile, ReadingRecord ← NEW
│   ├── ab_test.py (166)               # Experiment, Assignment, ABEvent ← NEW
│   └── podcast.py (129)               # Podcast ← NEW
│
├── repositories/ (6 파일, 1,424줄)
│   ├── base.py (406)                  # BaseDynamoDBRepository
│   ├── log_repository.py (300)        # 수집 로그
│   ├── personal_repository.py (283)   # 아카이빙, 프로필, 읽기 기록 ← NEW
│   ├── settings_repository.py (226)   # 설정/프롬프트
│   └── podcast_repository.py (203)    # 팟캐스트 CRUD ← NEW
│
├── services/ (6 파일, ~1,200줄)
│   ├── metrics_service.py (309)       # 운영 메트릭 수집/집계
│   ├── prompt_service.py (296)        # 프롬프트 CRUD/버저닝 (admin)
│   ├── prompt_loader.py (37)          # 프롬프트 로더: load_prompt(category, name) ← NEW
│   ├── collaborative_filter_service.py (282) # MBTI 협업 필터링
│   └── article_filter_service.py (277)# 기사 필터링 (규칙 + AI)
│
├── infrastructure/ (8 파일, 2,231줄) ← ALL NEW
│   ├── provision.sh (400)             # AWS 리소스 프로비저닝
│   ├── provision_pgvector.sh (332)    # RDS PostgreSQL + pgvector
│   ├── cost_monitoring.sh (270)       # CloudWatch 비용 알람
│   ├── step_functions_definition.json (270) # Step Functions 상태 머신
│   ├── deploy_step_functions.sh (248) # SFN + IAM + EventBridge
│   ├── provision_opensearch.sh (213)  # OpenSearch 도메인
│   ├── README.md (177)                # 배포 가이드 + 트러블슈팅
│   └── demo_checklist.md (121)        # 6/11 데모 체크리스트
│
├── tests/ (15 파일, 5,327줄) ← ALL NEW
│   ├── test_new_apis.py (592)         # 아카이브/팟캐스트/추천 스모크 테스트
│   ├── test_full_integration.py (561) # 전체 통합 테스트
│   ├── test_split_storage.py (560)    # DynamoDB + S3 split 저장 테스트
│   ├── test_regression.py (510)       # 기존 API 회귀 테스트
│   ├── test_opensearch.py (480)       # OpenSearch 통합 테스트
│   ├── test_model_comparison.py (482) # Claude vs Nova 비교 테스트
│   ├── test_pgvector.py (490)         # pgvector 통합 테스트
│   ├── test_full_volume.py (478)      # 대량 파이프라인 부하 테스트
│   ├── estimate_costs.py (432)        # AWS 비용 분석 + 크레딧 예측
│   ├── test_pipeline.py (398)         # Step Functions E2E 테스트
│   ├── run_demo_checks.py (264)       # 데모 전 자동 검증
│   ├── test_performance.py (254)      # 성능 벤치마크
│   └── demo_data_setup.py (244)       # 데모 데이터 생성
│
├── utils/ (2 파일, 123줄)
│   ├── hash_utils.py (67)             # SHA256 콘텐츠 해시
│   └── date_utils.py (56)             # news_id → ISO 타임스탬프
│
└── prompts/ (7 디렉토리, 13 파일)
    ├── transform/ (nt.md, nf.md, st.md, sf.md) — MBTI 변환
    ├── chatbot/ (nt.md, nf.md, st.md, sf.md)   — 챗봇 페르소나
    ├── selection/article_scorer.md              — Step 1 AI 스코어링
    ├── validation/validator.md                  — Step 4 검증
    ├── supervisor/supervisor_review.md          — Supervisor 리뷰
    ├── podcast/podcast_script.md                — 팟캐스트 대본
    └── question/daily_question.md               — 오늘의 질문
```

---

## 6. 데이터 저장 레이어

### 6.1 Article DB (split storage)

DynamoDB에는 메타데이터 + S3 포인터만 저장. 본문은 S3에 JSON으로 저장.

**DynamoDB** (`sedaily-mbti-articles-dev`, PK: `news_id`):
```
news_id, item_type, title_ko, sub_title_ko, category, categories,
published_at, author_name, byline, url, original_link, images,
content_hash, transformed_at, transform_usage, s3_body_uri,
s3_body_en_uri, translated_en_at  ← 번역 포인터
```

**S3** (`sedaily-mbti-article-body-dev`):
```
articles/{news_id}/body.json     # 한국어 원본 + MBTI 4버전
articles/{news_id}/body_en.json  # 영문 번역 (선택)
```

**통합 조회**:
```python
db = DynamoDBClient(s3_article_client=S3ArticleClient(...))
article = await db.get_article(news_id)  # DynamoDB + S3 자동 병합
# 레거시 (s3_body_uri 없는 기사)도 그대로 작동
```

### 6.2 Personal DB

```
테이블: sedaily-mbti-personal-dev (PK: user_id, SK: sk)
SK 패턴:
  PROFILE                          — 유저 프로필
  ARCHIVE#{article_id}#{timestamp} — 아카이빙 문장
  READING#{article_id}             — 읽기 기록
  AB_META#{experiment_id}          — A/B 실험 정의 (PK=__experiment__)
  AB_ASSIGN#{experiment_id}        — A/B 그룹 할당
  AB_EVENT#{experiment_id}#{ts}    — A/B 이벤트
```

### 6.3 Podcast DB

```
테이블: sedaily-mbti-podcast-dev (PK: podcast_id)
GSI: date-index (PK: created_date, SK: podcast_id)
상태: creating → completed | failed
```

### 6.4 Engagement DB

```
테이블: sedaily-mbti-engagement-dev (PK: pk, SK: sk)
ARTICLE#{id}/REACTIONS, RATING_STATS, COMMENT#, USER_REACTION#
```

---

## 7. 기사 변환 파이프라인

### 7.1 Step Functions 상태 머신 (chained Map + S3 offload)

```
Step1_Select (ResultPath: $, TimeoutSeconds: 600)
  → CheckStep1HasArticles ($.body.metrics.selected > 0)
  → Step2_Classify (ResultPath: $)
  → ProcessArticlesMap (MaxConcurrency=8, ~90 iterations)
      ├─ TransformOne(selected_articles_s3_uri 전달) → ValidateOne → StoreOne
      └─ ItemFailed (per-iteration failure escape)
  → END (pipeline_result = [~90 × metrics])

빈 날짜: CheckStep1HasArticles → NoArticles → END
Step1/Step2 실패: → PipelineFailure (Supervisor가 에러 로그 저장) → END
전체 TimeoutSeconds: 3600 (1시간)
```

**S3 offload 패턴**: Step 1이 전체 기사 데이터를 S3 임시 파일에 저장 (`pipeline-temp/{date}/selected_articles.json`). Step Functions 상태에는 경량 메타데이터만 전달 → ~90개 기사 × 200 bytes = ~18 KB < 256 KB. Step 3이 S3에서 content_clean 로드하여 Claude 변환. Supervisor도 날짜 기반 URI 구성으로 S3 fallback.

**왜 chained Map 인가**: 각 iteration이 1개 기사를 Step3→Step4→Supervisor 전체에 통과시키고, `OutputPath`로 ~300 byte 메트릭만 추출. Map의 aggregated output = ~90 × 300 byte = ~27 KB로 안전.

### 7.2 카테고리별 최소 쿼터 + 4차원 MBTI AI 스코어링 (Step 1)

```python
# backend/handlers/pipeline/step1_select.py

# 카테고리 최소 보장 (합계 25, 잔여 5슬롯은 최고점수) — 타입별로 적용
CATEGORY_MINIMUMS = {
    '경제':    5,
    'IT_과학': 4,
    '정치':    3,
    '사회':    4,
    '문화':    3,
    '스포츠':  3,
    '국제':    3,
}
TOTAL_TARGET = 30       # 타입당 30개
MBTI_TYPES = ['NT', 'NF', 'ST', 'SF']

# AI 스코어링 설정
SCORING_BATCH_SIZE = 20        # Nova 호출당 기사 수
SCORING_MAX_CONCURRENCY = 5    # 병렬 Nova 호출 수
CONTENT_PREVIEW_CHARS = 200    # Nova에 보내는 content 미리보기 길이

# 5차원 기본 점수 (Nova 실패 시)
DEFAULT_SCORES = {
    'nt_score': 5.0, 'nf_score': 5.0, 'st_score': 5.0, 'sf_score': 5.0, 'quality': 5.0,
}
```

**타입별 선별 알고리즘** (`_select_per_type`): 각 MBTI 타입별로 독립 실행:
- 복합점수 = 0.7 × 타입점수 + 0.3 × 품질 (내림차순 정렬)
- Phase 1 (카테고리 최소) — 7개 표준 카테고리에서 각 최소 할당 충족 (총 25)
- Phase 2 (잔여 충전) — 나머지 5슬롯을 최고점수 미배정 기사로 충전
- 4타입 합집합 → unique ~90개 (overlap ~30개: 여러 타입에 동시 선별된 기사)
- Nova 전체 실패 시 4타입 모두 동일 최신순 30개 fallback

### 7.3 Step 1 — 기사 선별 (규칙 필터 + 4차원 MBTI AI 스코어링 + S3 저장)

```python
# 1. S3 XML 로드 (cross-region, ap-northeast-2 → us-east-1)
all_articles = await s3_client.get_articles_by_date(date_str)  # ~321건

# 2. action='D' 제외
active = [a for a in all_articles if a.action != 'D']

# 3. 규칙 기반 필터 (변경 없음)
#   - len(content) < 300 chars → 제외
#   - title 패턴: ^\[인사\], ^\[부고\], ^\[속보\], ^\[\d보\], 증시.*마감, 환율.*마감
#   - title 키워드: 인사, 부고, 속보, 발령
candidates = [a for a in active if not _quick_filter(a.title, a.content_clean)[0]]
# ~312건 survivors

# 4. AI 스코어링 (Nova Lite, 배치 20건, 병렬 5)
#   5가지 기준 1-10점: nt_score, nf_score, st_score, sf_score, quality
#   프롬프트: prompts/selection/article_scorer.md
scores_map, any_success = await _ai_score_nova(candidates, nova)
# scores_map: {news_id: {nt_score, nf_score, st_score, sf_score, quality}}

# 5. 타입별 top 30 선별 (각 타입 독립)
type_assignments = _select_per_type(scored_articles)
# type_assignments: {"NT": [30 ids], "NF": [30 ids], "ST": [30 ids], "SF": [30 ids]}
# unique ~90개 (overlap ~30개)

# 6. S3에 전체 기사 데이터 업로드 (256 KB 상태 제한 해결)
s3_uri = _upload_selected_to_s3(s3_client, date_str, full_articles_data)
# s3://sedaily-mbti-article-body-dev/pipeline-temp/{date}/selected_articles.json

# 7. type_assignments DynamoDB 저장 (프론트엔드 타입별 조회용)
_store_type_assignments(date_str, type_assignments, metrics)
# news_id="__type_assignments__{date}", item_type="type_assignment"

# 8. 경량 출력 (Step Functions 상태용)
#   selected_articles_summary: [{news_id, title, category, published_at}] (content 없음)
#   selected_article_ids: [90개 unique ID]
#   type_assignments: {NT: [30 ids], ...}
```

### 7.4 Step 4 — 구조적 검증 (팩트/스타일 검증 안 함)

```python
# backend/handlers/pipeline/step4_validate.py
# 거부 기준 (CRITICAL_ISSUE_TYPES):
#   missing, missing_title, missing_body, body_too_short (<100자),
#   body_too_long (>10000자), wrong_language (한국어 아님), hallucination
# 절대 거부하지 않는 것:
#   다른 표현/문장 구조, 추가된 분석/감정/맥락, 재구성된 순서, 제목 톤 차이
# Nova 환각 체크 실패 시: 기본 통과 (검증기 에러가 기사 거부 원인이 되면 안 됨)
# missing_key_points는 비판적 (정보용) — Step 3이 key_points를 생성하지 않으므로
```

### 7.5 Supervisor — 저장 우선 정책

```python
# backend/handlers/pipeline/supervisor.py
async def _supervise_and_store(event_body):
    # Phase 1: 저장 결정 (Step 4 status 기반)
    #   status == 'failed' → 거부 (구조적 결함: 빈 body, 잘못된 언어 등)
    #   status == 'passed' 또는 'flagged' → 저장
    #   _is_critically_broken() 안전망: 어떤 버전의 body가 빈 경우 → 거부

    # Phase 2: Nova 소프트 리뷰 (로그만, 저장 결정에 영향 없음)
    soft_concerns = await _supervisor_review(to_store, nova)
    for nid, reason in soft_concerns.items():
        logger.warning(f"Supervisor soft-flagged {nid}: {reason} (storing anyway)")

    # Phase 3: Article DB 저장 (반드시 성공해야 함)
    db = _init_storage()  # DynamoDBClient(s3_article_client=S3ArticleClient(...))
    for article in to_store:
        success = await db.save_article(_to_storage_format(article))

    # Phase 4: 벡터 인덱싱 (NON-FATAL — 실패해도 Phase 3는 보존)
    if stored_articles_for_indexing:
        vector_results = await _index_vectors(stored_articles_for_indexing)

    # Phase 5: collection_log 저장
    log_id = await _save_collection_log(db, ...)
```

**불변식**: Phase 3 (저장) 가 Phase 4 (벡터) 보다 반드시 먼저 실행. 벡터 인덱싱 실패는 절대 기사 저장을 막지 않음. Phase 2 (Nova 리뷰) 가 Phase 1 (결정) 이후에 실행되므로 저장 결정에 영향 없음.

### 7.6 검증된 실행 결과

| Run | 날짜 | 결과 | 노트 |
|-----|------|------|------|
| v1-v3 (2026-04-10) | 11개 | 아키텍처 디버깅 | chained Map, IAM, 페이로드 등 이슈 해결 |
| **v4 (2026-04-10)** | **11개** | **SUCCEEDED** | 17/17 저장 (split storage, ~7분) |
| v5 (2026-04-12) | 6개 | SUCCEEDED, stored=0 | Step 4 과도한 팩트/스타일 거부 → 검증 정책 변경 필요 발견 |
| v6-v8 (2026-04-12) | 30개 | 디버깅 | NameError, DataLimitExceeded, missing_key_points 등 해결 |
| **v9 (2026-04-12)** | **30개** | **SUCCEEDED** | **30/30 저장, 0 거부, 0 실패, ~6.5분** (20260411 데이터, 7개 카테고리 고르게 분포) |

---

## 8. 번역 파이프라인

```
변환 완료 기사 (MBTI 4버전 존재)
  → AWS Translate (84개 경제 용어 커스텀 터미놀로지)
    title_ko → title_en, content_ko → content_en
    version_NT/NF/ST/SF → 각각 영문 번역
  → Nova 품질 향상 (자연스러운 영어, 문화 맥락 추가)
  → S3: articles/{news_id}/body_en.json
  → DynamoDB: s3_body_en_uri 추가
  → GET /api/article/{news_id}/en 으로 서빙
```

커스텀 터미놀로지 예시 (`config/economics_terminology.csv`):
```
공매도,short selling
기준금리,base interest rate
전세,jeonse (lump-sum deposit lease)
양도세,capital gains tax
코스피,KOSPI
```

---

## 9. AI 모델 구성

```python
# Claude (복잡한 리라이팅 — Step 3, 챗봇, 팟캐스트 대본)
BEDROCK_MODEL_ID_HAIKU  = 'us.anthropic.claude-3-5-haiku-20241022-v1:0'  # $0.25/$1.25/1M
BEDROCK_MODEL_ID_SONNET = 'us.anthropic.claude-sonnet-4-20250514-v1:0'   # 고품질 옵션

# Nova (분류/필터링/검증 — Steps 1, 2, 4, Supervisor, 번역 향상)
BEDROCK_MODEL_ID_NOVA_LITE = 'amazon.nova-lite-v1:0'
BEDROCK_MODEL_ID_NOVA_PRO  = 'amazon.nova-pro-v1:0'

# 임베딩 (벡터 검색)
BEDROCK_EMBEDDING_MODEL_ID = 'amazon.titan-embed-text-v2:0'  # 1024차원
```

실측 비교 (test_model_comparison.py 결과):
| 지표 | Claude Haiku | Nova Pro |
|------|-------------|----------|
| 기사당 비용 | $0.0025 | $0.0279 |
| 응답 시간 | ~28초 | ~33초 |
| 4버전 완성률 | 100% | 100% |

---

## 10. API 엔드포인트 전체 목록

### 기사 (5개)

| Method | Path | 설명 |
|--------|------|------|
| `GET` | `/api/articles?date={YYYYMMDD}&mbti_group={NT\|NF\|ST\|SF}&limit=30` | **MBTI 변환 기사 목록 (프론트엔드 primary source)** — `mbti_group` 지정 시 DynamoDB type_assignments에서 해당 타입 기사 ID 조회 → 개별 get_article → 적합도 순 반환. 미지정 시 기존 GSI 날짜 쿼리 fallback. type_assignments 없는 날짜도 GSI fallback |
| `GET` | `/s3-articles?date={YYYYMMDD}&limit=30` | S3 XML 원본 기사 목록 (fallback, 파이프라인 이전 날짜용) |
| `GET` | `/s3-article/{id}` | S3 XML 기사 상세 |
| `GET` | `/api/article/{id}` | DynamoDB+S3 기사 상세 (MBTI 포함) |
| `POST` | `/api/search` | GSI 검색 |

### 챗봇 (1개)

| Method | Path | 설명 |
|--------|------|------|
| `POST` | `/api/chat` | RAG 챗봇 (OpenSearch → DynamoDB fallback) |

### 내 서랍 (4개) ← NEW

| Method | Path | 설명 |
|--------|------|------|
| `POST` | `/api/archive` | 문장 저장 (Personal DB + pgvector) |
| `GET` | `/api/archive?user_id=&date_from=&date_to=` | 문장 목록 |
| `DELETE` | `/api/archive/{id}?user_id=` | 문장 삭제 |
| `POST` | `/api/archive/similar` | 유사 문장 검색 (pgvector) |

### 팟캐스트 (4개) ← NEW

| Method | Path | 설명 |
|--------|------|------|
| `POST` | `/api/podcast/generate` | 팟캐스트 생성 (Bedrock + Polly) |
| `GET` | `/api/podcast/{id}` | 상세 + presigned audio URL |
| `GET` | `/api/podcast/list?date=` | 날짜별 목록 |
| `GET` | `/api/podcast/article/{id}` | 기사별 목록 |

### 추천 (2개) ← NEW

| Method | Path | 설명 |
|--------|------|------|
| `GET` | `/api/recommend?user_id=&limit=` | 개인화 추천 (Personalize → 협업 필터 → 카테고리) |
| `GET` | `/api/recommend/analysis?user_id=` | DNA 분석 (레이더 차트) |

### 유저 (5개)

| Method | Path | 설명 |
|--------|------|------|
| `POST` | `/api/user/profile` | 프로필 동기화 |
| `PUT` | `/api/user/mbti` | MBTI 그룹 변경 |
| `POST` | `/api/user/read` | 읽기 기록 |
| `GET` | `/api/user/history` | 읽기 기록 조회 |
| `GET` | `/api/user/stats` | 통계 (뱃지, 스트릭) |

### A/B 테스트 (4개) ← NEW

| Method | Path | 설명 |
|--------|------|------|
| `POST` | `/api/ab-test/experiment` | 실험 생성 (admin) |
| `POST` | `/api/ab-test/assign` | 그룹 할당 (결정론적 해시) |
| `POST` | `/api/ab-test/event` | 이벤트 기록 |
| `GET` | `/api/ab-test/results?experiment_id=` | 결과 집계 (lift %) |

### 번역 (1개) ← NEW

| Method | Path | 설명 |
|--------|------|------|
| `GET` | `/api/article/{id}/en` | 영문 기사 |

### 메트릭 (3개) ← NEW

| Method | Path | 설명 |
|--------|------|------|
| `GET` | `/api/metrics/dashboard` | 전체 대시보드 |
| `GET` | `/api/metrics/pipeline` | 파이프라인 성능 |
| `GET` | `/api/metrics/costs` | 비용 분석 |

### 오늘의 질문 (2개) ← NEW

| Method | Path | 설명 |
|--------|------|------|
| `GET` | `/api/questions?date={YYYYMMDD}` | 오늘의 질문 조회 (캐시, 없으면 Claude 생성) |
| `POST` | `/api/questions` | 질문 답변 제출 |

### 기타 (5개)

| Method | Path | 설명 |
|--------|------|------|
| `POST` | `/saju` | 사주 분석 |
| `GET` | `/time-machine?date=` | 타임머신 |
| `POST` | `/api/tts` | TTS 음성 (Polly) |
| `/api/engagement/*` | | 반응/댓글/별점 |
| `/api/posts/*` | | 관리자 게시글 |

**총 35개 API 엔드포인트**

---

## 11. 인증 시스템

```typescript
// Cognito: us-east-1_ZS8PgF3iX, Client: 66c9bq3ovmk007d0eepkle92k3
// OAuth: Google, domain: sedaily-mbti.auth.us-east-1.amazoncognito.com
// Redirect: https://mbti.sedaily.ai/auth/callback (prod), localhost:3000 (dev)
```

---

## 12. 벡터 검색

### OpenSearch (RAG 하이브리드)

```python
# 인덱스: sedaily-articles
# 필드: news_id, title (nori 분석기), body_text, category, published_at, mbti_group, embedding_vector (knn_vector 1024)
# 검색: hybrid_search(query, embedding, text_weight=0.3, vector_weight=0.7)
```

### pgvector (유사도)

```sql
-- articles_vectors: news_id, mbti_group, chunk_text, embedding vector(1024)
-- archive_vectors: user_id, sentence_text, article_id, embedding vector(1024)
-- 검색: embedding <=> query::vector (cosine distance)
```

---

## 13. 추천 시스템

**다중 전략 캐스케이드:**
```
1. Amazon Personalize (PERSONALIZE_CAMPAIGN_ARN 설정 시)
   ↓ 미설정 → 건너뜀
2. MBTI 협업 필터링 ("같은 MBTI 그룹 유저들이 읽은 기사")
   ↓ 항상 실행
3. 카테고리 기반 관심 매칭 (읽기 기록 분석)
   ↓ 항상 실행
4. pgvector 유사도 (아카이빙 문장 기반)
   ↓ PG 설정 시
5. Cold start (인기 카테고리 최신 기사)
```

응답의 `recommendation_source`: `"personalize"` | `"collaborative"` | `"rule_based"` | `"cold_start"`

---

## 14. A/B 테스트 프레임워크

```python
# 그룹 할당: SHA256(user_id + experiment_id) % 2 → A 또는 B (결정론적)
# 이벤트: read (read_time_seconds), scroll (scroll_depth_percent), archive, share, return
# 결과: group_a vs group_b 메트릭 + lift % 계산
```

---

## 15. 운영 메트릭 + 모니터링

### CloudWatch 알람 (6개)

| 알람 | 임계값 |
|------|--------|
| Bedrock 호출 | > 500/일 |
| DynamoDB WCU | > 1000/일 |
| Lambda 동시 실행 | > 50 |
| S3 저장 용량 | > 10 GB |
| 일일 비용 | > $50 |
| 파이프라인 에러 | > 5/시간 |

### 비용 현황 (2026-04-13 실측)

| 서비스 | 일일 비용 | 월간 예상 | 비고 |
|--------|-----------|-----------|------|
| Bedrock Claude (Haiku) | ~$1.10 | ~$33 | 30 기사/일 × $0.0025 + 챗봇/팟캐스트 |
| Bedrock Nova (Lite) | ~$0.01 | ~$0.30 | 필터링/분류/검증/리뷰 |
| Bedrock Titan Embed | ~$0.002 | ~$0.06 | 30 × 5 임베딩 |
| Lambda | ~$0.02 | $0.60 | 22개 함수 호출 |
| DynamoDB | ~$0 | ~$1 | On-demand, 적은 트래픽 |
| S3 (article body + audio + xml) | ~$0 | ~$1 | 수 MB 수준 |
| OpenSearch | ~$0.87 | **~$26** | t3.small.search, 10GB gp3 |
| RDS pgvector | ~$0.47 | **~$14** | db.t3.micro, PG 16.6, 20GB gp3 |
| **현재 합계** | **~$2.47** | **~$76** | 모든 서비스 활성화 |

**예산**: $26,000 (AWS Jump Start) → 현재 비용 기준 **28년+** 사용 가능

---

## 16. 환경 변수

```bash
# AWS 기본
AWS_REGION=us-east-1

# DynamoDB
DYNAMODB_TABLE_ARTICLES=sedaily-mbti-articles-dev
DYNAMODB_TABLE_PERSONAL=sedaily-mbti-personal-dev
DYNAMODB_TABLE_PODCAST=sedaily-mbti-podcast-dev

# S3
S3_ARTICLE_BODY_BUCKET=sedaily-mbti-article-body-dev
S3_AUDIO_BUCKET=sedaily-mbti-audio-dev

# AI 모델
CLAUDE_MODEL_ID=us.anthropic.claude-3-5-haiku-20241022-v1:0
NOVA_MODEL_ID=amazon.nova-lite-v1:0
EMBEDDING_MODEL_ID=amazon.titan-embed-text-v2:0

# 검색 (선택)
OPENSEARCH_ENDPOINT=https://xxx.es.amazonaws.com
PG_HOST=xxx.rds.amazonaws.com
PG_PASSWORD=...

# 추천 (선택)
PERSONALIZE_CAMPAIGN_ARN=...
```

---

## 17. 배포

### 17.1 코드 배포 (일상 작업)

```bash
cd backend
./deploy.sh              # 전체 (API 17 + Pipeline 5 = 22개 함수)
./deploy.sh api          # API만 (17개)
./deploy.sh pipeline     # Pipeline만 (5개)
```

`deploy.sh`는 다음을 수행:
1. `pip install` (httpx, opensearch-py, requests-aws4auth, pg8000 등) → `lambda-build/`
2. `clients/`, `handlers/`, `config/`, `core/`, `models/`, `repositories/`, `services/`, `utils/`, `prompts/` 복사
3. ZIP 패키지 생성 (~2 MB, fastapi/pytest 제외)
4. `s3://sedaily-mbti-lambda-packages-dev/lambda_package.zip`로 업로드
5. 각 Lambda에 `update-function-code` 호출 (실패한 함수는 `[SKIP]` 후 계속)

### 17.2 인프라 프로비저닝 (1회성)

`backend/infrastructure/provision.sh`는 **사용하지 마세요** — IAM 역할 이름이 잘못되어 있고 (`sedaily-mbti-lambda-role` ← 실제는 `sedaily-mbti-lambda-execution-dev`), `set -e`로 인해 이미 존재하는 리소스에서 멈춤. 대신 아래 수동 명령을 사용:

```bash
# 1. S3 버킷 (이미 존재)
aws s3api create-bucket --bucket sedaily-mbti-article-body-dev --region us-east-1
aws s3api create-bucket --bucket sedaily-mbti-audio-dev --region us-east-1

# 2. DynamoDB 테이블 (이미 존재)
aws dynamodb create-table --table-name sedaily-mbti-personal-dev \
  --attribute-definitions AttributeName=user_id,AttributeType=S AttributeName=sk,AttributeType=S \
  --key-schema AttributeName=user_id,KeyType=HASH AttributeName=sk,KeyType=RANGE \
  --billing-mode PAY_PER_REQUEST --region us-east-1

# 3. Lambda 함수 (모두 sedaily-mbti-lambda-execution-dev 역할 사용)
aws lambda create-function --function-name sedaily-mbti-archive-dev \
  --runtime python3.11 \
  --handler handlers.archive_handler.lambda_handler \
  --role arn:aws:iam::887078546492:role/sedaily-mbti-lambda-execution-dev \
  --code S3Bucket=sedaily-mbti-lambda-packages-dev,S3Key=lambda_package.zip \
  --memory-size 512 --timeout 300 --region us-east-1
# (반복 — 9개 신규 함수)

# 4. IAM 역할 — Step Functions, EventBridge
aws iam create-role --role-name sedaily-mbti-stepfunctions-role \
  --assume-role-policy-document file://sfn-trust-policy.json
aws iam put-role-policy --role-name sedaily-mbti-stepfunctions-role \
  --policy-name invoke-pipeline-lambdas --policy-document '{...}'
# (반복 — sedaily-mbti-eventbridge-role)

# 5. Lambda 실행 역할에 S3 쓰기 권한 추가 (article-body, audio 버킷)
aws iam put-role-policy --role-name sedaily-mbti-lambda-execution-dev \
  --policy-name ailens-s3-write --policy-document file://ailens-s3-write-policy.json

# 6. Step Functions 상태 머신
sed "s/\${AWS_ACCOUNT_ID}/887078546492/g" \
  backend/infrastructure/step_functions_definition.json > /tmp/sfn.json
aws stepfunctions create-state-machine \
  --name sedaily-mbti-transform-pipeline-dev \
  --definition file:///tmp/sfn.json \
  --role-arn arn:aws:iam::887078546492:role/sedaily-mbti-stepfunctions-role \
  --type STANDARD --region us-east-1

# 7. EventBridge 일일 스케줄
aws events put-rule --name sedaily-mbti-pipeline-schedule-dev \
  --schedule-expression 'cron(0 22 * * ? *)' --state ENABLED --region us-east-1
aws events put-targets --rule sedaily-mbti-pipeline-schedule-dev --region us-east-1 \
  --targets '[{"Id":"pipeline-trigger",
               "Arn":"arn:aws:states:us-east-1:887078546492:stateMachine:sedaily-mbti-transform-pipeline-dev",
               "RoleArn":"arn:aws:iam::887078546492:role/sedaily-mbti-eventbridge-role",
               "Input":"{\"source\":\"schedule\"}"}]'

# 8. API Gateway 라우트 (HTTP API v2 chzwwtjtgk)
INTEGRATION_ID=$(aws apigatewayv2 create-integration \
  --api-id chzwwtjtgk --integration-type AWS_PROXY \
  --integration-uri arn:aws:lambda:us-east-1:887078546492:function:sedaily-mbti-archive-dev \
  --integration-method POST --payload-format-version 2.0 \
  --region us-east-1 --query IntegrationId --output text)
aws apigatewayv2 create-route --api-id chzwwtjtgk \
  --route-key 'POST /api/archive' --target integrations/$INTEGRATION_ID --region us-east-1
# (반복 — 19개 신규 라우트)
aws lambda add-permission --function-name sedaily-mbti-archive-dev \
  --statement-id apigw-invoke --action lambda:InvokeFunction \
  --principal apigateway.amazonaws.com \
  --source-arn 'arn:aws:execute-api:us-east-1:887078546492:chzwwtjtgk/*/*' \
  --region us-east-1
```

### 17.3 인프라 (배포 완료)

```bash
# OpenSearch — ACTIVE (2026-04-13 배포)
./infrastructure/provision_opensearch.sh --status

# RDS PostgreSQL + pgvector — ACTIVE (2026-04-13 배포, PG 16.6, pgvector 0.8.0)
./infrastructure/provision_pgvector.sh --status

# CloudWatch 비용 알람 — ACTIVE (6개 알람)
./infrastructure/cost_monitoring.sh --status
```

**Lambda 환경변수**: archive, supervisor, recommend에 OPENSEARCH_ENDPOINT + PG_HOST/PG_PASSWORD 설정 완료. chatbot, search에 OPENSEARCH_ENDPOINT 설정 완료.

### 17.4 수동 파이프라인 트리거 (테스트용)

```bash
aws stepfunctions start-execution \
  --state-machine-arn arn:aws:states:us-east-1:887078546492:stateMachine:sedaily-mbti-transform-pipeline-dev \
  --input '{"date": "20260410", "source": "manual"}' \
  --region us-east-1
```

---

## 18. 테스트 스위트

| 테스트 | 파일 | 대상 | 실행 시간 |
|--------|------|------|-----------|
| 회귀 | `test_regression.py` | 기존 8개 API + 신규 3개 | ~30초 |
| Split 저장 | `test_split_storage.py` | DynamoDB + S3 분리 저장 | ~20초 |
| 신규 API | `test_new_apis.py` | Archive, Podcast, Recommend | ~30초 |
| 통합 | `test_full_integration.py` | 전체 5단계 (저장→벡터→챗봇→서랍→추천) | ~30초 |
| OpenSearch | `test_opensearch.py` | 인덱스, 검색, RAG | ~20초 |
| pgvector | `test_pgvector.py` | 테이블, 벡터, 유사도 | ~20초 |
| 파이프라인 | `test_pipeline.py` | Step Functions E2E | ~10분 |
| 대량 | `test_full_volume.py` | 3일치 파이프라인 부하 | ~30분 |
| 모델 비교 | `test_model_comparison.py` | Claude vs Nova (20기사) | ~20분 |
| 성능 | `test_performance.py` | API + DynamoDB + Embedding 레이턴시 | ~1분 |
| 비용 | `estimate_costs.py` | CloudWatch → 비용 분석 | ~10초 |
| 데모 검증 | `run_demo_checks.py` | 인프라/데이터/기능/성능/비용 | ~36초 |
| 데모 데이터 | `demo_data_setup.py` | 데모 사용자 + 읽기/아카이빙 데이터 | ~10초 |

**테스트 결과 파일**: `tests/results/` (cost_estimate, performance, model_comparison, volume_test JSON)

---

## 19. 파일별 상세 명세

### 19.1 클라이언트 계층 (13 파일, 4,287줄)

| 파일 | 줄 수 | 핵심 클래스 | 외부 서비스 |
|------|-------|------------|------------|
| `dynamodb_client.py` | 870 | `DynamoDBClient(s3_article_client=)` | DynamoDB + S3 |
| `s3_xml_client.py` | 897 | `S3XMLClient`, `normalize_category()` | S3 (XML) |
| `opensearch_client.py` | 487 | `OpenSearchClient.hybrid_search()` | OpenSearch |
| `mbti_transform_service.py` | 407 | `MbtiTransformService.transform_article()` | Bedrock Claude |
| `pgvector_client.py` | 370 | `PgVectorClient.search_similar_sentences()` | PostgreSQL |
| `embedding_client.py` | 298 | `EmbeddingClient.embed_batch()` | Bedrock Titan |
| `podcast_db_client.py` | 223 | `PodcastDBClient.query_by_date()` | DynamoDB |
| `translate_client.py` | 210 | `TranslateClient.translate_text()` | AWS Translate |
| `personal_db_client.py` | 209 | `PersonalDBClient.query_by_user()` | DynamoDB |
| `s3_article_client.py` | 168 | `S3ArticleClient.put_body()` | S3 |
| `personalize_client.py` | 158 | `PersonalizeClient.get_recommendations()` | Personalize |

### 19.2 핸들러 계층 (21 파일, 8,971줄)

| 파일 | 줄 수 | 라우트 | 핵심 동작 |
|------|-------|--------|-----------|
| `chatbot_handler.py` | 505 | `/api/chat` | embed → OpenSearch hybrid → Claude (fallback: DynamoDB) |
| `recommendation_handler.py` | 698 | `/api/recommend[/analysis]` | Personalize → 협업 필터 → 카테고리 → pgvector |
| `podcast_handler.py` | 496 | `/api/podcast/*` | Bedrock 대본 → Polly TTS (청크) → S3 → presigned URL |
| `archive_handler.py` | 391 | `/api/archive[/similar]` | Personal DB CRUD + Bedrock embed + pgvector |
| `ab_test_handler.py` | 449 | `/api/ab-test/*` | 실험 관리, 결정론적 할당, 이벤트 추적, 결과 집계 |
| `translation_handler.py` | 205 | `/api/article/{id}/en` | S3 body_en.json → 영문 기사 서빙 |
| `metrics_handler.py` | 71 | `/api/metrics/*` | 파이프라인/비용/참여 메트릭 대시보드 |

### 19.3 서비스 계층 (5 파일, 1,164줄)

| 파일 | 줄 수 | 핵심 기능 |
|------|-------|-----------|
| `metrics_service.py` | 309 | CloudWatch + DynamoDB → 파이프라인/비용/참여 메트릭 집계 |
| `collaborative_filter_service.py` | 282 | MBTI 그룹별 읽기 패턴 → 협업 추천 (Personalize 대체) |
| `article_filter_service.py` | 277 | 규칙 기반 + AI 기반 기사 필터링 (속보/인사/부고 제외) |
| `prompt_service.py` | 296 | 프롬프트 CRUD + 버전 관리 + 테스트 |

### 19.4 에러 처리 체계

```python
BackendError (500)
├── ValidationError (400)
├── AuthenticationError (401)
├── AuthorizationError (403)
├── NotFoundError (404)
├── RateLimitError (429)
├── RepositoryError (500)
├── TranslationError (500)
├── ConfigurationError (500)
└── ExternalServiceError (502)

# 데코레이터
@lambda_handler         # 통합 에러 처리 + 로깅 + async
@require_params(...)    # 쿼리 파라미터 검증
```

### 19.5 외부 서비스 연동

| 서비스 | 용도 | 호출 위치 |
|--------|------|-----------|
| Bedrock Claude | MBTI 변환, 챗봇 RAG, 팟캐스트 대본 | transform_service, chatbot, podcast |
| Bedrock Nova | 필터링, 분류, 검증, Supervisor, 번역 향상 | pipeline steps, supervisor, translation |
| Bedrock Titan Embed | 1024차원 벡터 임베딩 | embedding_client |
| AWS Translate | 한→영 번역 (84개 경제 용어) | translate_client |
| AWS Polly | TTS (Seoyeon Neural, MBTI별 rate) | tts_handler, podcast_handler |
| DynamoDB | 기사, 유저, 팟캐스트, 참여 | 4개 테이블 |
| S3 | 기사 본문, 오디오, XML | 3개 버킷 |
| OpenSearch | RAG 하이브리드 검색 | opensearch_client |
| PostgreSQL + pgvector | 유사도 검색 | pgvector_client |
| Wikipedia API | 과거 날짜 역사 이벤트 | time_machine_handler |
| 서울경제 아카이브 | 과거 날짜 뉴스 크롤링 | time_machine_handler |
| ElevenLabs TTS | 에디터 음성 브리핑 (프론트엔드) | elevenlabs.ts |
| AWS Cognito | Google OAuth + Email 인증 | auth.ts |
| Amazon Personalize | 개인화 추천 (미래 연동) | personalize_client |

---

## 20. 운영 상태 + 최근 변경 사항

### 20.1 현재 운영 상태 (2026-04-13)

**파이프라인**: Step Functions ACTIVE, EventBridge `sedaily-mbti-pipeline-schedule-dev` ENABLED (매일 22:00 UTC = 07:00 KST). MBTI 타입별 30개 × 4타입 = ~90개 unique 기사 AI 선별·변환·저장 (~25분 소요). 4차원 MBTI 적합도 스코어링 → 타입별 top 30 → S3 임시저장 → Claude 변환. type_assignments DynamoDB 저장. 레거시 `article_collector` EventBridge **DISABLED** — Step Functions가 유일한 기사 소스.

**인프라 활성 상태**:
| 서비스 | 상태 | 확인 |
|--------|------|------|
| OpenSearch `sedaily-mbti-search-dev` | **ACTIVE** | 챗봇 `context_source: opensearch_rag` 확인 |
| RDS pgvector `sedaily-mbti-pgvector-dev` | **ACTIVE** (PG 16.6, pgvector 0.8.0) | `/api/archive/similar` → 200 (이전 503) |
| CloudWatch 알람 6개 | **ACTIVE** (전부 OK) | `sedaily-mbti-*` prefix |
| Lambda 22개 (17 API + 5 Pipeline) | **ACTIVE** | `./deploy.sh` 22/22 updated |
| SNS `sedaily-mbti-cost-alerts` | 생성됨 | 이메일 구독 필요 |

**API 헬스 체크** (2026-04-13, 전체 200):
| Endpoint | HTTP |
|----------|------|
| `GET /s3-articles` | 200 |
| `GET /api/archive` | 200 |
| `GET /api/podcast/list` | 200 |
| `GET /api/recommend/analysis` | 200 |
| `GET /api/questions` | 200 |
| `GET /time-machine` | 200 |
| `GET /api/metrics/dashboard` | 200 |
| `POST /api/search` | 200 |
| `POST /api/chat` | 200 |
| `POST /saju` | 200 |

**테스트 결과** (2026-04-13):
- `run_demo_checks.py`: **READY FOR DEMO** — 24 passed, 2 warnings, 0 failures
- `test_regression.py`: **ALL 12 TESTS PASSED**
- `test_performance.py`: 8/8 OK, avg 1,878ms, p95 6,706ms (chatbot — Bedrock 포함)
- 일일 Bedrock 비용: ~$1.10

**프론트엔드**: https://mbti.sedaily.ai — 2026-04-13 배포 (Next.js 16.2.2 static export → S3 → CloudFront `E1QS7PY350VHF6` 캐시 무효화 완료).

### 20.2 2026-04-13 (후반) — MBTI 타입별 기사 선별 redesign

**핵심 변경: 30개 공통 → 타입별 30개 (NT/NF/ST/SF 각 30, unique ~90)**

**Step 1 (step1_select.py) — 4차원 MBTI 스코어링 + 타입별 선별**:
1. **AI 스코어링 프롬프트 변경** (`prompts/selection/article_scorer.md`): 기존 `total_score` 1차원 → `nt_score, nf_score, st_score, sf_score, quality` 5차원 평가. NT적합도(데이터/분석), NF적합도(가치/의미), ST적합도(팩트/실용), SF적합도(공감/소통) + 품질(깊이/독창성/시의성).
2. **타입별 top 30 선별** (`_select_per_type`): 각 타입별로 복합점수(0.7×타입점수+0.3×품질) 정렬 → 카테고리 쿼터 25 + 잔여 5 = 30개. 4타입 합집합 ~90개.
3. **S3 offload**: 전체 기사 데이터 `s3://sedaily-mbti-article-body-dev/pipeline-temp/{date}/selected_articles.json`에 업로드. Step Functions 상태에는 경량 메타데이터만.
4. **type_assignments DynamoDB 저장**: `news_id=__type_assignments__{date}` 아이템에 NT/NF/ST/SF 각 30개 ID 리스트 + 메트릭 저장.

**Step 2 (step2_classify.py) — Pass-through 단순화**:
- Nova 분류 호출 완전 제거. type_assignments에서 target_groups 자동 매핑.
- S3 URI (`selected_articles_s3_uri`)를 Step 3로 전달.

**Step 3 (step3_transform.py) — S3에서 기사 본문 로드**:
- `_load_articles_from_s3(s3_uri)` 추가: S3에서 전체 기사 데이터 다운로드 → news_id 룩업 → payload 기사에 content_clean 등 보강.
- S3 로드 실패 시 payload fallback (하위 호환).

**Supervisor (supervisor.py) — S3 방어적 fallback**:
- 날짜 기반 예측 가능한 S3 URI 구성으로 기사 본문 보강 (Step 3이 이미 로드하므로 이중 안전망).

**Step Functions 정의 (step_functions_definition.json)**:
- `TimeoutSeconds`: 1800 → **3600** (1시간)
- `MaxConcurrency`: 5 → **8**
- Step1 `TimeoutSeconds`: 300 → **600**
- `ItemSelector`에 `selected_articles_s3_uri` 전달 추가
- `TransformOne.Parameters`에 `selected_articles_s3_uri` 전달 추가

**article_handler.py — 타입별 기사 조회 API**:
- `GET /api/articles?date=&mbti_group=NT&limit=30` 지원
- `_get_type_assignments(table, date_str)`: DynamoDB에서 `__type_assignments__{date}` 아이템 조회
- `_fetch_articles_by_ids(dynamodb_client, news_ids)`: 적합도 순서 유지하며 개별 기사 조회
- `mbti_group` 미지정 시 기존 GSI 날짜 쿼리 fallback (하위 호환)

**프론트엔드 (FeedPage.tsx)**:
- `/api/articles?date=${dateStr}&mbti_group=${selectedGroup}&limit=30` — 선택된 MBTI 타입 전달
- `useEffect` 의존성에 `selectedGroup` 추가 → 타입 전환 시 기사 목록 자동 갱신

**검증 결과 (2026-04-13 manual test)**:
- 321 XML → 312 후보 → 90 unique 선별 (NT:30, NF:30, ST:30, SF:30, overlap:30)
- 전체 파이프라인 25분 완료 (90개 기사 변환 0 실패)
- NT vs SF 공유 기사: 2개/30 (93% 다른 기사 목록)
- NT vs NF 공유 기사: 1개/30 (97% 다른 기사 목록)

### 20.3 2026-04-13 (초반) 변경 사항 (버그 수정, 인프라)

**파이프라인 버그 수정**:
1. **`States.DataLimitExceeded` 해결**: Step 1 `content_clean` 트렁케이트 3000→2000자. 한국어 UTF-8 기준 30×3000×3=270KB > 256KB 제한 → 30×2000×3=180KB로 축소.
2. **`PipelineFailure` 상태 크래시 해결**: EventBridge 입력 `{"source":"schedule"}`에 `date` 필드 없어 `$$.Execution.Input.date` JSONPath 실패 → `$$.Execution.StartTime`으로 변경 (항상 존재).
3. 수정 후 테스트: `{"source": "manual_fix_test"}` (date 없음) → **SUCCEEDED** (12분).

**인프라 배포**:
1. **OpenSearch 활성화**: `sedaily-mbti-search-dev` (t3.small, OpenSearch 2.11, ~$26/월). Lambda 5개에 `OPENSEARCH_ENDPOINT` 환경변수 설정 (chatbot, supervisor, search, archive, recommend). 챗봇 RAG 검증: `context_source: opensearch_rag`.
2. **RDS pgvector 활성화**: `sedaily-mbti-pgvector-dev` (db.t3.micro, PG 16.6, pgvector 0.8.0, ~$14/월). 프로비저닝 스크립트 수정: DB/User `sedaily_mbti/postgres` → `ailens/ailens` (`config/settings.py` 기본값과 일치). Lambda 3개에 PG 환경변수 **기존 변수 보존하며 병합** (archive, supervisor, recommend).
3. **CloudWatch 비용 알람 6개**: Bedrock >500/일, DynamoDB WCU >1000/일, Lambda 동시 >50, S3 >10GB, 일일 비용 >$50, 파이프라인 에러 >5/시간. SNS 토픽 `sedaily-mbti-cost-alerts` 생성.
4. **레거시 collector 비활성화**: `sedaily-mbti-article-collection-dev` EventBridge 규칙 DISABLED 확인. 최근 4일 기사 25/25 (100%) `s3_body_uri` 보유.

**Lambda 배포**:
1. **신규 3개 생성**: `sedaily-mbti-metrics-dev`, `sedaily-mbti-abtest-dev`, `sedaily-mbti-translation-dev`.
2. **API Gateway 라우트**: `/api/metrics` + `/api/ab-test` 연결 (translation은 내부 전용).
3. **deploy.sh 업데이트**: API 함수 14→17개 (question, metrics, abtest, translation 추가).
4. **전체 배포**: 22/22 Lambda 업데이트, 프론트엔드 빌드·S3 동기화·CloudFront 무효화.

**프롬프트 재구성**:
1. 기존 `prompts/nt.md` 등 4파일 → 7개 하위 디렉토리 13파일: `transform/`, `chatbot/`, `selection/`, `validation/`, `supervisor/`, `podcast/`, `question/`.
2. `services/prompt_loader.py` 신규: `load_prompt(category, name)` + `lru_cache`. 기존 `prompt_service.py`는 admin CRUD 전용으로 분리.

**데모 준비**:
1. 데모 사용자 `demo-user-sedaily` 생성 (NT, temp=68.5, 30 읽기 기록, 8 아카이빙 문장).
2. `run_demo_checks.py` READY FOR DEMO, `test_regression.py` ALL 12 PASSED, `test_performance.py` 8/8 OK.

### 20.4 이전 변경 사항 요약

**2026-04-12**: 30개 기사 AI 선별 파이프라인 — Step 1 Nova AI 스코어링 (단일 total_score) + 카테고리 쿼터, Step 4 구조적 검증만, Supervisor 저장 우선 정책, ResultPath:$ 256KB 대응, MaxConcurrency 5, `GET /api/articles` 신규 엔드포인트. (이후 20.2에서 타입별 30개 선별로 redesign)

**2026-04-10/11**: Split storage (body→S3), Chained Map 아키텍처, No-op 모드 (OpenSearch/pgvector/Personalize).

### 20.5 알려진 미해결 사항

| 항목 | 영향 | 우선순위 |
|------|------|---------|
| Step 3가 key_points/closing_line 미생성 | MBTI 버전이 title+body만 가짐. 프롬프트 업데이트 필요 | 중간 |
| `infrastructure/provision.sh` IAM 역할 이름 오류 | 수동 명령으로 대체 | 낮음 |
| `saju` Lambda 미배포 | 핸들러 코드 존재, deploy.sh에서 제외 (로컬 전용) | 낮음 |
| SNS 이메일 구독 미완료 | CloudWatch 알람 발동해도 알림 수신 불가 | 중간 |
| S3 us-east-1 업로드 간헐적 타임아웃 | Seoul 리전 → cross-region 네트워크 불안정 | 운영상 참고 |
| 07:00 KST 스케줄 실행 1건 실패 (2026-04-13) | `States.DataLimitExceeded` — content_clean 2000자로 수정 후 해결 → 이후 S3 offload 방식으로 근본 해결 | **해결됨** |
| pgvector 연결 타임아웃 (Supervisor, 간헐적) | Lambda ↔ RDS 네트워크. 기사 저장에는 무영향 (non-fatal) | 운영상 참고 |

### 20.6 다음 작업 후보

1. Step 3 프롬프트에 `key_points`, `closing_line`, `subtitle` 필드 추가 → Step 4에서 `missing_key_points`를 CRITICAL로 승격
2. SNS 이메일 구독 설정 (비용 알람 수신)
3. pgvector에 기존 기사 벡터 백필 (현재 신규 기사만 인덱싱됨)
4. EventBridge 실패 알람 설정 (Step Functions 실패 시 자동 알림)
5. S3 pipeline-temp 자동 정리 (오래된 임시 파일 TTL 삭제)

### 20.7 참조 문서

| 파일 | 내용 |
|------|------|
| `CLAUDE.md` | 아키텍처 개요 + 핵심 컨벤션 (Claude Code 가이드) |
| `FULL_PROJECT_SPEC.md` | 본 문서 — 전체 코드베이스 명세 |
| `ARTICLE_PIPELINE.md` | Step Functions 파이프라인 상세 (코드 예제 포함) |
| `ai-lens-backend-architecture.md` | To-Be 아키텍처 설계 문서 |
| `frontend-next/CLAUDE.md` | 프론트엔드 FSD 규칙 |
| `backend/infrastructure/README.md` | 인프라 배포 가이드 |
