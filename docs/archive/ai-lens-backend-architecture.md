# AI LENS 백엔드 아키텍처 명세서 v3

> **프로젝트**: AI LENS — MBTI 맞춤형 뉴스 리라이팅 서비스  
> **도메인**: mbti.sedaily.ai  
> **기간**: 2026.04.02 ~ 06.11 (10주 PoC)  
> **인프라**: AWS (Bedrock, Lambda, S3, DynamoDB, OpenSearch, RDS 등)  
> **AWS 리전**: us-east-1 (버지니아) + ap-northeast-2 (서울) 병행 사용  
> **크레딧**: AWS Jump Start $26,000  
> **개발 범위**: 백엔드만 구축, 프론트엔드는 추후 별도 리뉴얼 시 연결  
> **마지막 업데이트**: 2026.04.07 (새 아키텍처 + 동료 피드백 반영)

---

## 1. 시스템 전체 구조 개요

이 시스템은 서울경제신문의 원본 기사를 수집하여, MBTI 인지 스타일(NT/NF/ST/SF) 4가지 버전으로 리라이팅하고, 개인화 추천, 내 서랍(문장 아카이빙), 오디오/팟캐스트, 타임머신 등 독자 서비스를 제공하는 AI 뉴스 플랫폼이다.

시스템은 다음 주요 파이프라인/서비스로 구성된다:

1. **Article Auto Collection Pipeline** — 기사 자동 수집
2. **기사 변환 파이프라인 (Step Functions)** — 선별 → 분류 → 톤앤매너 변환 → Validation
3. **개인화 추천 시스템** — Amazon Personalize + Claude 기반 추천
4. **오디오/팟캐스트 파이프라인** — 기사 → 팟캐스트 변환 → TTS → 음성 저장
5. **MBTI Website Services** — 사용자 대면 서비스 4종
6. **데이터 저장 레이어** — Article DB, Personal DB, Podcast DB, Vector DB

### 전체 데이터 흐름 요약
```
서울경제 기사 DB (원본)
    → [Article Auto Collection Pipeline] → S3 (원본 저장)
    → [기사 변환 파이프라인 - Step Functions]
        Step 1: 기사 선별
        Step 2: MBTI 유형별 기사 분류
        Step 3: 톤앤매너 변환 (Claude)
        Step 4: Validation (교열, 맞춤법, 스타일, 오탈자 검수)
    → [MBTI Supervisor Model] (Nova, 품질 조율)
    → Article Database (MBTI 기사 DB + Article Pointer in DynamoDB)
    → Vector DB (OpenSearch + pgvector, 기사 변환 시 동시 적재)
        ├→ [개인화 추천] → Personal DB → "나의 분석" 서비스
        ├→ [오디오/팟캐스트 파이프라인] → Podcast DB + 음성 S3
        └→ [MBTI Website Services] → 사용자
            ├→ Time Machine (S3 직접 조회)
            ├→ 뉴스 피드 (Article DB 조회)
            ├→ 내 서랍 (Personal DB + Vector DB 유사도 검색)
            └→ 나의 분석 (Personalize 추천 결과)
```

---

## 2. Article Auto Collection Pipeline

기사를 자동으로 수집하여 S3에 저장하는 파이프라인이다. 다이어그램에서 빨간색 테두리의 "Article Auto Collection Pipeline" 영역으로 표시되어 있다.

### 구성 요소
- **서울경제 기사 DB**: 다이어그램 상단에 위치한 외부 데이터 소스이다. 서울경제신문의 원본 기사가 저장되어 있다.
- **Amazon EventBridge** (Scheduled Collection): 스케줄 기반으로 기사 수집을 트리거한다.
- **Batch & AI Pipeline Lambda** (`article_collector`): EventBridge에서 트리거를 받아 서울경제 기사 DB에서 원본 기사를 수집하는 Lambda 함수이다.
- **S3**: `article_collector` Lambda가 수집한 원본 기사를 저장한다. 다이어그램에서 S3는 Article Auto Collection Pipeline 영역 내 우측에 위치하며, Article Database 영역과 양방향 화살표로 연결되어 있다.

### 데이터 흐름
```
서울경제 기사 DB
    → EventBridge (스케줄 트리거)
    → Batch & AI Pipeline Lambda (article_collector)
    → S3 (원본 기사 저장)
    ↔ Article Database (양방향 연결)
```

### 참고
- 다이어그램에서 서울경제 기사 DB → Article Auto Collection Pipeline → S3 → Article Database로 이어지는 화살표가 확인된다.
- S3와 Article Database(DynamoDB) 사이에 양방향 화살표가 존재한다. S3에 원본이 저장되고, DynamoDB의 Article Pointer가 S3 URI를 참조하는 구조이다.

---

## 3. 기사 변환 파이프라인 (Step Functions)

S3에 저장된 원본 기사를 MBTI 4유형으로 리라이팅하는 파이프라인이다. 동료 피드백을 반영하여, 기존 MBTI Agent 4개 병렬 구조에서 **Step Functions 기반 4단계 순차 처리 구조**로 변경한다.

### 변경 배경
동료 피드백: "NF, SF 이런 유형들은 시스템 프롬프트 하나에 다 들어가는 거고 Bedrock 모델 하나에서 변환되는 거라서, MBTI 4개를 따로 두는 것보다 Step Functions 방식으로 단계별로 표현하는 게 좋다."

### Step Functions 4단계

#### Step 1: 기사 선별
- **목적**: 전 MBTI 유형에 대해 관심 가질 기사를 선별한다.
- **동작**: Prism(서울경제 기존 AI 서비스)과 유사한 방식으로, 속보/인사/부고/짧은 기사 등을 규칙 기반으로 제외하고, AI 기반으로 홍보성/반복성 기사를 추가 필터링한다.
- **모델**: Nova (간단한 분류 작업)
- **참고**: 기존 백엔드의 `ArticleFilterService` (Phase 73 스마트 필터링)의 로직을 확장한다.

#### Step 2: 기사 분류
- **목적**: 선별된 기사를 MBTI 유형별로 분류한다.
- **동작**: 각 기사가 어떤 MBTI 유형에 적합한지 분류한다. 하나의 기사가 여러 유형에 분류될 수 있다.
- **모델**: Nova (간단한 분류 작업)

#### Step 3: 톤앤매너 변환
- **목적**: 분류된 기사들을 MBTI 스타일별로 변환(리라이팅)한다.
- **동작**: 하나의 Bedrock 모델 호출로 4버전(NT/NF/ST/SF)을 동시에 생성한다. 시스템 프롬프트 하나에 4유형의 톤앤매너 지시가 모두 포함된다.
- **모델**: Claude (Bedrock 경유) — 한글 리라이팅은 복잡한 작업이므로 Claude를 사용한다.
- **출력**: 각 기사에 대해 4개 MBTI 버전 (title, subtitle, body, key_points, closing_line, tone)

#### Step 4: Validation
- **목적**: 변환된 기사의 품질을 검수한다.
- **동작**: 교열, 맞춤법, 스타일 일관성, 오탈자 등을 검수한다. 문제 발견 시 재변환 요청하거나 플래그를 남긴다.
- **모델**: Nova 또는 Claude (검수 복잡도에 따라)

### MBTI Supervisor Model
- **Amazon Nova** 모델을 사용한다.
- 다이어그램에서 Step Functions 결과와 Article Database 사이에 위치한다.
- Step Functions 4단계를 거친 결과를 최종 조율하고 품질 관리를 수행한 후 Article Database에 저장한다.

### 다이어그램과의 관계
다이어그램에서는 "MBTI Agents (Collect / Change)" 영역에 ST/NT/NF/SF Agent가 각각 Claude로 표시되어 있다. 이는 Step 3(톤앤매너 변환)에 해당하며, 실제 구현에서는 하나의 Claude 모델이 시스템 프롬프트로 4유형을 동시에 처리한다. 다이어그램의 4개 Agent는 논리적 구분이다.

### Amazon Lambda (Prompt + Logic)
- 다이어그램 하단 좌측에 위치한다.
- **Prompt** 문서 아이콘과 연결되어 있다.
- MBTI Agents로 향하는 화살표가 연결되어 있다.
- Step Functions 각 단계에 필요한 프롬프트를 구성하고 비즈니스 로직을 처리하는 범용 Lambda이다.

### Vector DB 동시 적재
동료 피드백: "처음부터 기사들 변환 시 벡터 DB에 두면 좋을 것 같다."

기사 변환 완료 후 Article Database 저장과 동시에, 변환된 기사를 Vector DB(OpenSearch + pgvector)에도 적재한다. 이를 통해 내 서랍의 유사도 검색과 개인화 추천에 활용한다.

### 데이터 흐름
```
S3 (원본 기사)
    → [Step 1: 기사 선별] (Nova)
    → [Step 2: 기사 분류] (Nova)
    → [Step 3: 톤앤매너 변환] (Claude, 4버전 동시 생성)
    → [Step 4: Validation] (Nova/Claude)
    → MBTI Supervisor Model (Nova, 최종 조율)
    → Article Database (DynamoDB 포인터 + S3 본문)
    → Vector DB (OpenSearch + pgvector, 동시 적재)
```

---

## 4. Article Database

다이어그램에서 "Article Database" 라벨로 표시된 영역이다. 두 개의 컴포넌트가 포함되어 있다:

### 4-1. MBTI 기사 DB
- 다이어그램에서 데이터베이스 아이콘으로 표시되어 있다.
- 변환된 MBTI 기사의 본문 데이터를 S3에 저장한다.

### 4-2. Article Pointer
- 다이어그램에서 **Amazon DynamoDB** 아이콘으로 표시되어 있다.
- S3에 저장된 기사 본문의 URI 포인터와 메타데이터를 저장한다.

### 저장 구조

| 저장소 | 저장 대상 | 용도 |
|--------|----------|------|
| **S3** (MBTI 기사 DB) | 기사 본문 데이터 (원문, 4버전 리라이팅 결과) | 대용량 텍스트 저장 |
| **DynamoDB** (Article Pointer) | S3 URI(포인터), 기사 메타데이터 (제목, 카테고리, 날짜, MBTI 유형 등) | 빠른 조회, 인덱싱 |
| **OpenSearch** | 기사 벡터 임베딩 + 전문 검색 인덱스 | RAG 검색, 유사도 검색 |
| **PostgreSQL + pgvector** | 기사 벡터 임베딩 (관계형 데이터와 함께) | 내 서랍 유사도 검색, 분석 쿼리 |

### 조회 패턴
```
1. DynamoDB(Article Pointer)에서 기사 키(메타데이터, S3 URI)를 조회한다.
2. 반환된 S3 URI로 S3(MBTI 기사 DB)에서 실제 기사 본문을 가져온다.
```

### 데이터 연결
다이어그램에서 Article Database는 다음과 양방향/단방향 화살표로 연결되어 있다:
- S3 (Article Auto Collection Pipeline) ↔ 양방향
- MBTI Supervisor Model ← 단방향 (Supervisor에서 DB로 저장)
- MBTI Website Services → 단방향 (뉴스 피드, 내 서랍 등에서 조회)
- Personal DB → 단방향 (개인화 추천에서 참조)

### 추가 사항
- 약어(abbreviations)에 대한 별도 사전을 관리한다.
- 복잡한 분석 쿼리는 **Amazon Athena**를 사용하여 S3 데이터를 직접 쿼리한다.
- 오래되거나 불필요한 기사는 DynamoDB에서 제거하고 S3에만 보관(아카이빙)한다.

---

## 5. 개인화 추천 시스템

다이어그램 하단 중앙에 위치한 추천 시스템이다. 사용자의 읽기 패턴을 분석하여 맞춤형 기사를 추천한다.

### 구성 요소

#### Claude (Bedrock)
- 다이어그램에서 Bedrock 아이콘 아래 "Claude" 라벨로 표시되어 있다.
- Amazon Personalize로 향하는 화살표가 연결되어 있다.
- 추천 로직에 Claude를 활용하여 사용자 프로필 기반 추천 이유를 생성하거나, 추천 결과를 보강한다.
- **Prompt** 문서 아이콘과 연결되어 있다.
- **Top Picks For You Recipe** 문서 아이콘과 연결되어 있다. Amazon Personalize의 추천 레시피 설정을 의미한다.

#### Amazon Personalize
- 다이어그램에서 Amazon Personalize 아이콘으로 표시되어 있다.
- Claude에서 화살표를 수신하고, Personal DB로 화살표를 전달한다.
- 사용자 행동 데이터(읽기 기록, 아카이빙, 체류 시간 등)를 학습하여 개인화 추천을 생성한다.

#### Personal DB
- 다이어그램에서 데이터베이스 아이콘으로 표시되어 있다.
- Amazon Personalize에서 화살표를 수신한다.
- **List of pointers** 라벨이 옆에 표시되어 있다. 추천된 기사의 포인터(Article Pointer 참조) 목록을 저장한다.
- "나의 분석" 서비스로 화살표가 연결되어 있다.

### 데이터 흐름
```
사용자 행동 데이터 (읽기, 아카이빙 등)
    → Claude (추천 로직 보강) + Prompt + Top Picks For You Recipe
    → Amazon Personalize (개인화 모델)
    → Personal DB (추천 기사 포인터 목록 저장)
    → "나의 분석" 서비스 (API Gateway → 사용자)
```

---

## 6. 오디오/팟캐스트 파이프라인

기사를 팟캐스트 형태의 오디오 콘텐츠로 변환하는 별도 파이프라인이다. 기사 변환 파이프라인과는 분리되어 독립적으로 운영된다.

### 변경 배경
동료 피드백: "오디오 브리핑을 해야 하는데, S3에 음성 데이터 저장 필요하고 팟캐스트 관련 DB도 있으면 좋겠다."

### 파이프라인 구성

#### Step 1: 팟캐스트 변환 (Bedrock)
- Article Database에서 변환 완료된 MBTI 기사를 입력으로 받는다.
- Bedrock 모델(Claude 또는 Nova)을 사용하여 기사를 팟캐스트 대본 형태로 변환한다.
- 대본에는 인트로, 본문 요약, 핵심 포인트, 아웃트로가 포함된다.

#### Step 2: TTS 변환 (AWS Polly)
- 팟캐스트 대본을 AWS Polly로 음성 변환한다.
- 기존 TTS 설정 유지: Neural 엔진, Seoyeon(한국어 여성) 음성
- MBTI 유형별 음성 스타일 적용 (속도, 피치 차별화)

#### Step 3: 음성 저장 (S3)
- 생성된 음성 파일을 별도 음성 전용 S3 버킷에 저장한다.

### Podcast DB
- 팟캐스트 메타데이터를 저장하는 별도 데이터베이스이다.
- 저장 필드: 팟캐스트 생성 날짜, 원본 기사 ID, 대본 본문, 음성 길이(초), MBTI 유형, S3 음성 파일 URI, 상태(생성중/완료/실패)

### 데이터 흐름
```
Article Database (변환 완료된 MBTI 기사)
    → [팟캐스트 변환] (Bedrock Claude/Nova → 대본 생성)
    → [TTS 변환] (AWS Polly → 음성 생성)
    → 음성 전용 S3 버킷 (음성 파일 저장)
    → Podcast DB (메타데이터 저장)
```

### 프론트엔드 연동
- 프론트엔드의 오디오 브리핑 기능(현재 Mock)이 이 파이프라인의 API를 호출한다.
- 비구독자: 1분(33.3%) 미리듣기 후 페이월
- 구독자: 전체 재생

---

## 7. 내 서랍 (아카이빙) 시스템

사용자가 기사에서 선택한 문장들을 저장하고 유사도 검색하는 시스템이다.

### 변경 배경
동료 피드백: "내 서랍은 테이블을 별도로 분리하고, 문장이 DB에 쌓이면서 유사도 검색이 필요하니 벡터 DB에 저장해야 한다."

### 저장 구조

기사를 저장하는 Article Database와 분리된 별도 저장소를 사용한다:

| 저장소 | 저장 대상 | 용도 |
|--------|----------|------|
| **Personal DB (DynamoDB)** | 아카이빙 메타데이터 (user_id, article_id, text, created_at) | 빠른 CRUD, 사용자별 목록 조회 |
| **Vector DB (OpenSearch + pgvector)** | 아카이빙된 문장의 벡터 임베딩 | 유사도 검색, 관련 문장 추천 |

### 아카이빙 데이터 모델
```typescript
interface ArchivedSentence {
  id: string;                 // "{userId}-{articleId}-{timestamp}"
  user_id: string;
  text: string;               // 저장한 문장
  article_id: string;
  article_title: string;
  article_published_at: string;
  created_at: string;         // ISO 8601
  vector_id: string;          // Vector DB의 해당 벡터 ID (참조용)
}
```

### 유사도 검색 흐름
```
사용자가 문장 저장
    → Personal DB에 메타데이터 저장
    → Vector DB에 문장 벡터 임베딩 저장
    → 유사 문장 검색 시: Vector DB에서 코사인 유사도 검색
    → 결과의 article_id로 Article Database에서 원본 기사 조회
```

### 프론트엔드 연동
- 프론트엔드의 ArchiveTab(현재 React state Mock)이 이 시스템의 API를 호출한다.
- 문장 저장 경로: ArticleView에서 문장 선택 + NewsFeedTab에서 텍스트 드래그 선택

---

## 8. Vector DB 구성

기사 본문과 아카이빙 문장의 벡터 임베딩을 저장하여 유사도 검색을 지원한다.

### 변경 배경
동료 피드백: "유사도 검색해야 돼서 DynamoDB 말고 Vector DB 사용하면 좋겠다. PostgreSQL Vector DB에 기사들 적재하고, 처음부터 기사들 변환 시 벡터 DB에 두면 좋겠다."

### 이중 Vector DB 구성

| Vector DB | 용도 | 강점 |
|-----------|------|------|
| **OpenSearch** | RAG 검색 (챗봇), 전문 검색 + 벡터 검색 하이브리드 | 전문 검색과 벡터 검색 동시 지원, Bedrock Knowledge Base 연동 |
| **PostgreSQL + pgvector** | 기사 적재, 내 서랍 유사도 검색, 분석 쿼리 | 관계형 데이터 + 벡터를 한 DB에서 관리, SQL 분석 쿼리 가능 |

### 데이터 적재 시점
- **기사 변환 완료 시**: Step Functions 파이프라인의 최종 결과를 Article Database 저장과 동시에 양쪽 Vector DB에 적재한다.
- **문장 아카이빙 시**: 사용자가 문장을 저장할 때 pgvector에 벡터 임베딩을 저장한다.

### 임베딩 모델
- Amazon Bedrock의 임베딩 모델(Titan Embeddings 또는 Cohere Embed)을 사용하여 텍스트를 벡터로 변환한다.

---

## 9. MBTI Website Services

사용자가 직접 접근하는 4개의 웹 서비스이다. 다이어그램 우측에 "MBTI Website" 라벨 아래에 세로로 나열되어 있다. 각 서비스는 Amazon API Gateway를 통해 사용자 요청을 수신한다. 다이어그램 우측의 사용자(Users) 아이콘에서 각 서비스로 화살표가 연결되어 있다.

### 9-1. Time Machine

과거 특정 날짜의 기사를 조회할 수 있는 서비스이다.

- **Amazon API Gateway**: 사용자 요청을 수신한다.
- 기사 DB를 단순 조회하는 구조이다. 그날의 뉴스 몇 개와 사진을 가져온다.
- S3에서 과거 기사 데이터를 직접 조회한다.

#### 프론트엔드 연동
- `/timemachine` 페이지에서 `GET /time-machine?date=YYYY-MM-DD` 호출
- 4개 결과 탭: 그날의 뉴스(API), 같은 날 태어난 유명인(프론트 하드코딩), 기록된 순간(API events), 투자 시뮬레이션(프론트 하드코딩)

#### 데이터 흐름
```
Users → Amazon API Gateway → S3 / Article Database (과거 기사 조회)
```

### 9-2. 뉴스 피드

MBTI 유형별로 변환된 기사를 날짜별로 제공하는 메인 서비스이다.

- **Amazon API Gateway**: 사용자 요청을 수신한다.
- Article Database(DynamoDB Article Pointer + S3 본문)에서 기사를 조회한다.
- 다이어그램에서 Article Database의 Article Pointer로부터 화살표를 수신한다.

#### 프론트엔드 연동
- 메인 페이지(`/`) FeedPage의 NewsFeedTab에서 호출
- `GET /s3-articles?date={YYYYMMDD}&limit=30` — 1차 조회
- `POST /api/search` — S3에 없을 시 fallback
- `GET /s3-article/{id}` 또는 `GET /api/article/{id}` — 기사 상세 프리페치

#### 데이터 흐름
```
Users → Amazon API Gateway → Article Database (DynamoDB Pointer → S3 본문)
```

### 9-3. 내 서랍

사용자가 아카이빙한 문장을 관리하고 유사도 검색하는 서비스이다.

- **Amazon API Gateway**: 사용자 요청을 수신한다.
- Personal DB(별도 DynamoDB 테이블)에서 사용자별 아카이빙 데이터를 관리한다.
- Vector DB(OpenSearch + pgvector)에서 유사도 검색을 수행한다.

#### 프론트엔드 연동
- 메인 페이지(`/`) FeedPage의 ArchiveTab(현재 Mock)에서 호출
- 향후 필요 API: 아카이빙 CRUD (user_id + article_id + text), 유사 문장 검색

#### 데이터 흐름
```
Users → Amazon API Gateway → Personal DB (아카이빙 CRUD)
                            → Vector DB (유사도 검색)
                            → Article Database (원본 기사 참조)
```

### 9-4. 나의 분석

사용자의 뉴스 관심사 분석과 개인화 추천을 제공하는 서비스이다.

- **Amazon API Gateway**: 사용자 요청을 수신한다.
- Personal DB에서 사용자의 추천 결과(List of pointers)를 조회한다.
- Amazon Personalize의 추천 결과를 기반으로 관심도 분석 데이터를 제공한다.

#### 프론트엔드 연동
- 메인 페이지(`/`) FeedPage의 DnaTab(현재 하드코딩 Mock)에서 호출
- 향후 필요 API: 사용자 읽기 패턴 기반 관심도 분석, 개인화 추천 기사 목록

#### 데이터 흐름
```
Users → Amazon API Gateway → Personal DB (추천 기사 포인터 목록)
                            → Article Database (추천 기사 상세 조회)
```

---

## 10. 모델 사용 정책

### 역할별 모델 배정

| 역할 | 모델 | 근거 |
|------|------|------|
| Step 1: 기사 선별 | Amazon Nova | 간단한 분류 작업 |
| Step 2: 기사 분류 | Amazon Nova | 간단한 분류 작업 |
| Step 3: 톤앤매너 변환 | Claude (Bedrock 경유) | 한글 리라이팅, 복잡한 지시 수행 |
| Step 4: Validation | Nova 또는 Claude | 검수 복잡도에 따라 |
| MBTI Supervisor Model | Amazon Nova | 결과 조율, 품질 관리 |
| 개인화 추천 보강 | Claude (Bedrock 경유) | 추천 이유 생성 |
| 팟캐스트 대본 변환 | Claude 또는 Nova | 대본 생성 복잡도에 따라 |
| 벡터 임베딩 | Bedrock Embeddings (Titan/Cohere) | 텍스트→벡터 변환 |

### 멀티 에이전트 오케스트레이션
- AWS에서 **Strands SDK**(오픈소스)를 추천하였다.
- AWS 워크샵 계정이 제공될 예정이다.

### 모델 비교 실험
- Nova vs Claude 비교 실험을 규모 축소하여 진행한다.

---

## 11. 데이터 저장 전략

### 전체 데이터베이스 구성

| DB | 서비스 | 저장 대상 | 용도 |
|----|--------|----------|------|
| **Article DB (S3)** | S3 | 기사 본문 (원문 + 4버전 리라이팅) | 대용량 텍스트 |
| **Article Pointer** | DynamoDB | S3 URI, 기사 메타데이터 | 빠른 조회 |
| **Personal DB** | DynamoDB (별도 테이블) | 아카이빙 문장, 사용자 프로필, 추천 포인터 | 사용자 개인 데이터 |
| **Podcast DB** | DynamoDB (별도 테이블) | 팟캐스트 메타데이터 (날짜, 본문, 길이, 유형 등) | 팟캐스트 관리 |
| **Vector DB (OpenSearch)** | OpenSearch | 기사 벡터 임베딩, 전문 검색 인덱스 | RAG 검색, 하이브리드 검색 |
| **Vector DB (pgvector)** | PostgreSQL (RDS) | 기사 벡터 임베딩, 내 서랍 문장 벡터 | 유사도 검색, SQL 분석 |
| **음성 S3** | S3 (별도 버킷) | 팟캐스트/TTS 음성 파일 | 오디오 스트리밍 |

### S3 버킷 구성

| 버킷 | 용도 | 연결 파이프라인 |
|------|------|---------------|
| 원본 기사 S3 | article_collector가 수집한 원본 기사 | Article Auto Collection Pipeline |
| MBTI 기사 본문 S3 | 리라이팅된 기사 본문 (DynamoDB에서 URI 참조) | Article Database |
| 음성 전용 S3 버킷 | 팟캐스트/TTS 음성 파일 | 오디오/팟캐스트 파이프라인 |

---

## 12. Bedrock 운영 정책

### 배치 추론 (Batch Inference)
- Bedrock에서 배치 추론이 가능하다.
- 요청하면 24시간 이내에 처리된다.
- 배치 추론은 On-Demand 대비 50% 비용 절감이 된다.

### 처리량 제한 (Throttling)
- Bedrock에는 기본 quota가 존재한다.
- limit에 도달할 경우 AWS 서비스 팀에 연락하여 증설을 요청한다.

### Guardrails
- 할루시네이션 방지: 프롬프트 엔지니어링, 파인튜닝, RAG로 대응한다.
- Guardrails는 개인정보 보호(PII 필터링), 아동 콘텐츠 보호, 성인 콘텐츠 필터링 목적으로만 사용한다.

---

## 13. AWS 리전 전략

| 리전 | 용도 |
|------|------|
| **us-east-1 (버지니아)** | Bedrock (Nova, Claude), DynamoDB, OpenSearch, RDS (pgvector), Personalize |
| **ap-northeast-2 (서울)** | S3 (원본 기사), CloudFront |

---

## 14. AWS 서비스 전체 목록

| AWS 서비스 | 용도 |
|-----------|------|
| **Amazon EventBridge** | 기사 수집 스케줄링 |
| **AWS Lambda** | article_collector, Prompt+Logic, Voice Handler |
| **AWS Step Functions** | 기사 변환 4단계 파이프라인 오케스트레이션 |
| **Amazon S3** | 원본 기사, MBTI 기사 본문, 음성 파일 |
| **Amazon DynamoDB** | Article Pointer, Personal DB, Podcast DB |
| **Amazon RDS (PostgreSQL + pgvector)** | 벡터 DB (기사 + 내 서랍 유사도 검색) |
| **Amazon OpenSearch** | 벡터 DB (RAG 검색, 전문 + 벡터 하이브리드 검색) |
| **Amazon Bedrock (Nova)** | 기사 선별/분류, Supervisor, 간단한 작업 |
| **Amazon Bedrock (Claude)** | 기사 리라이팅, 추천 보강, 복잡한 작업 |
| **Amazon Bedrock (Embeddings)** | 텍스트→벡터 임베딩 변환 |
| **Amazon Personalize** | 개인화 기사 추천 |
| **Amazon API Gateway** | MBTI Website 4개 서비스 진입점 |
| **AWS Polly** | TTS 음성 변환 (팟캐스트, 오디오 브리핑) |
| **Amazon Athena** | S3 데이터 분석 쿼리 |
| **Amazon CloudFront** | CDN (프론트엔드 배포 시) |

---

## 15. 프론트엔드 연동 API 명세

### 15-1. 실제 API 연동 완료 (기존)

| Method | Path | 설명 |
|--------|------|------|
| `GET` | `/s3-articles?date={YYYYMMDD}&limit=30` | 날짜별 기사 목록 |
| `GET` | `/s3-article/{news_id}` | 기사 상세 (MBTI 버전 포함) |
| `GET` | `/api/article/{news_id}` | 기사 상세 (DynamoDB fallback) |
| `POST` | `/api/search` | 기사 검색 |
| `POST` | `/api/chat` | MBTI 페르소나 AI 챗봇 |
| `POST` | `/saju` | 사주 분석 |
| `GET` | `/time-machine?date={YYYY-MM-DD}` | 타임머신 |
| `POST` | `/api/user/profile` | 유저 프로필 동기화 |
| `POST` | `/api/user/read` | 기사 읽음 기록 |

### 15-2. 신규 필요 API (프론트엔드 Mock 대체용)

| 기능 | 필요 API | 프론트엔드 현재 상태 |
|------|----------|-------------------|
| 오늘의 질문 | 질문 CRUD, 답변 저장 | 하드코딩 3개 질문 |
| 커뮤니티 | 게시글 CRUD, 댓글 CRUD, 추천, 랭킹 | Mock 5개 게시글, 13명 유저 |
| 내 서랍 (아카이빙) | 아카이빙 CRUD, 유사 문장 검색 | React state, Mock 8개 문장 |
| 뉴스 DNA 관심도 | 읽기 패턴 분석, 개인화 추천 | 하드코딩 수치 |
| 오디오 브리핑 | 팟캐스트 목록, 음성 스트리밍 | 프로그레스 시뮬레이션 Mock |
| 구독/결제 | 결제 처리, 구독 상태 관리 | UI만 (`isSubscribed=false`) |
| 유저 프로필 상세 | 활동 통계, 공감온도, 뱃지 | Mock (온도, 뱃지, 칭호) |

---

## 16. 기존 백엔드 참조 (As-Is)

### 16-1. As-Is vs To-Be 핵심 비교

| 영역 | As-Is | To-Be |
|------|-------|-------|
| 기사 변환 | Claude 3.5 Haiku 단일, 순차 호출 | Step Functions 4단계 (Nova+Claude 하이브리드) |
| DB | DynamoDB (기사 본문 직접 저장) | DynamoDB (포인터만) + S3 (본문) + Vector DB |
| 검색 | DynamoDB GSI Query | OpenSearch (RAG) + pgvector (유사도) |
| 추천 | 없음 | Amazon Personalize + Claude |
| 오디오 | AWS Polly 단순 TTS | 별도 팟캐스트 파이프라인 + Podcast DB |
| 내 서랍 | 프론트엔드 Mock (비영속) | Personal DB + Vector DB (유사도 검색) |
| 에이전트 | 없음 | Strands SDK 멀티 에이전트 |

### 16-2. 기존 기술 스택

| 항목 | 기술 |
|------|------|
| 프레임워크 | FastAPI 0.115.0 |
| 런타임 | Python 3.11 (Lambda) |
| AI 모델 | Bedrock Claude 3.5 Haiku (`us.anthropic.claude-3-5-haiku-20241022-v1:0`) |
| DB | DynamoDB On-Demand (`sedaily-mbti-articles-dev`, `sedaily-mbti-engagement-dev`) |
| 캐시 | Redis 5.2.0 (TTL 7일) |
| TTS | AWS Polly (Neural, Seoyeon) |

### 16-3. 기존 Lambda 함수 (7개)

| 함수명 | 핸들러 | 트리거 |
|--------|--------|--------|
| `sedaily-mbti-article-collector-dev` | `article_collector.lambda_handler` | EventBridge |
| `sedaily-mbti-article-dev` | `article_handler.lambda_handler` | API Gateway GET |
| `sedaily-mbti-search-dev` | `search_handler.lambda_handler` | API Gateway POST |
| `sedaily-mbti-chatbot-dev` | `chatbot_handler.lambda_handler` | API Gateway POST |
| `sedaily-mbti-engagement-dev` | `engagement_handler.lambda_handler` | API Gateway GET/POST |
| `sedaily-mbti-tts-dev` | `tts_handler.lambda_handler` | API Gateway POST |
| `sedaily-mbti-time-machine-dev` | `time_machine_handler.lambda_handler` | API Gateway GET |

### 16-4. 기존 디렉토리 구조

```
backend/
├── main.py                          # FastAPI 앱 진입점
├── config/                          # 상수, 환경변수 설정
├── clients/                         # DynamoDB, Bedrock, S3 클라이언트
├── handlers/                        # Lambda 핸들러 7개
├── core/                            # 데코레이터, 예외, 응답 포맷
├── models/                          # Article dataclass
├── repositories/                    # DynamoDB 저장소 패턴
├── services/                        # 필터링, 프롬프트 관리
├── utils/                           # 날짜, 해시 유틸
└── prompts/                         # MBTI 4유형별 프롬프트 (nt.md, nf.md, st.md, sf.md)
```

### 16-5. 유지할 기존 패턴

- `@lambda_handler` 데코레이터 (통합 에러 처리 + 로깅 + async)
- `@require_params`, `@require_body_fields`, `@require_path_param` 검증
- 표준 응답 포맷: `success_response()`, `error_response()`, `paginated_response()`
- 에러 계층: `BackendError` → `ValidationError`/`NotFoundError`/`RepositoryError`
- CORS 헤더: `Access-Control-Allow-Origin: *`
- content_hash 기반 변경 감지 (불필요한 재변환 방지)
- 카테고리 정규화 매핑 (7개 표준 카테고리)
- 프롬프트 로딩 우선순위 (파일 → DynamoDB → fallback)

### 16-6. 기존 환경변수

| 변수 | 용도 | 기본값 |
|------|------|--------|
| `BIGKINDS_API_KEY` | 뉴스 수집 API 키 | — |
| `ANTHROPIC_API_KEY` | Anthropic API 키 | — |
| `ANTHROPIC_MODEL_ID` | AI 모델 ID | `us.anthropic.claude-3-5-haiku-20241022-v1:0` |
| `AWS_REGION` | 기본 AWS 리전 | `us-east-1` |
| `S3_REGION` | S3 XML 리전 | `ap-northeast-2` |
| `DYNAMODB_TABLE_ARTICLES` | 기사 테이블명 | `sedaily-mbti-articles-dev` |
| `REDIS_HOST/PORT/PASSWORD` | Redis 캐시 | — |
| `FRONTEND_URL` | CORS 허용 도메인 | `https://mbti.sedaily.com` |

---

## 17. 미정 사항

| # | 항목 | 상태 | 비고 |
|---|------|------|------|
| 1 | Podcast DB 상세 스키마 | 미정 | 필드 목록은 확정(날짜, 본문, 길이, 유형), 구체적 DynamoDB 스키마 설계 필요 |
| 2 | 커뮤니티 기능 백엔드 | 미정 | 게시글 CRUD, 댓글, 추천, 유저 프로필 상세 설계 필요 |
| 3 | 구독/결제 시스템 | 미정 | 결제 처리, 구독 상태 관리 설계 필요 |
| 4 | 오늘의 질문 백엔드 | 미정 | 질문 데이터 관리, 답변 저장 설계 필요 |
| 5 | OpenSearch vs pgvector 역할 세분화 | 미정 | 어떤 검색을 어느 DB에서 처리할지 구체적 분담 설계 필요 |

---

*AI LENS = Let's Enjoy News in your Style*  
*서울경제신문 미래전략부 × AWS Newsroom JumpStart*
