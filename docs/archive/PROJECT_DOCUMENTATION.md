# AI LENS 프로젝트 완전 명세서

> **서비스명**: AI LENS — 서울경제신문 MBTI 맞춤형 경제 뉴스  
> **도메인**: https://mbti.sedaily.ai  
> **API**: https://chzwwtjtgk.execute-api.us-east-1.amazonaws.com/dev  
> **마지막 업데이트**: 2026-04-07  
> **현재 브랜치**: `feature/backend-redesign`

---

## 1. 서비스 개요

AI LENS는 서울경제신문의 원본 경제 기사를 MBTI 인지 스타일 4그룹(NT/NF/ST/SF)별로 AI가 서로 다른 톤과 구조로 리라이팅하여 제공하는 뉴스 서비스이다.

### 핵심 컨셉

하나의 기사를 4명의 에디터 페르소나가 각자 스타일로 다시 쓴다:

| 그룹 | 에디터 | 직함 | 스타일 | 색상 | MBTI 유형 |
|------|--------|------|--------|------|-----------|
| NT | 김시현 | 전략분석팀 수석연구원 | 애널리스트 리포트 | Blue (#3B82F6) | INTJ, INTP, ENTJ, ENTP |
| NF | 박지원 | 오피니언팀 논설위원 | 칼럼/에세이 | Violet (#8B5CF6) | INFJ, INFP, ENFJ, ENFP |
| ST | 이정훈 | 팩트체크 에디터 | 팩트시트 (표 중심) | Green (#22C55E) | ISTJ, ISTP, ESTJ, ESTP |
| SF | 김하은 | MZ 독자 담당 에디터 | 친구 톡 | Orange (#F97316) | ISFJ, ISFP, ESFJ, ESFP |

### 데이터 플로우

```
서울경제 원본 기사 (S3 XML, ap-northeast-2)
  → EventBridge 스케줄 트리거
  → article_collector Lambda
    → S3 XML 파싱 → 카테고리 정규화
    → 스마트 필터링 (속보/인사/부고 제외)
    → 카테고리별 TOP 기사 선별 (총 11개)
    → Bedrock Claude 3.5 Haiku로 MBTI 4버전 변환
    → DynamoDB 저장 (sedaily-mbti-articles-dev)
  → API Gateway → 프론트엔드 서빙
```

---

## 2. 인프라 아키텍처

### 2.1 AWS 리소스

```
┌─────────────────────────────────────────────────────────────────┐
│                       데이터 소스                                │
│  S3: sedaily-news-xml-storage/daily-xml/YYYYMMDD.xml            │
│  리전: ap-northeast-2 (서울)                                     │
│  형식: XML, 매일 기사 150~300건 업데이트                          │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                  Article Collector Lambda                        │
│  함수명: sedaily-mbti-article-collector-dev                      │
│  트리거: EventBridge 스케줄                                      │
│  동작: XML 파싱 → 필터링 → MBTI 변환 → DynamoDB 저장              │
│  AI: Bedrock Claude 3.5 Haiku (us-east-1)                       │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                     DynamoDB 저장소                               │
│  테이블명: sedaily-mbti-articles-dev (us-east-1)                 │
│  PK: news_id                                                     │
│  GSI: category-published_at-index, slug-index                    │
│  저장: 원본 + version_NT/NF/ST/SF + 메타데이터                    │
│                                                                   │
│  테이블명: sedaily-mbti-engagement-dev (us-east-1)               │
│  PK: pk (ARTICLE#{id} 또는 USER#{id})                            │
│  SK: sk (REACTIONS, COMMENT#, READ#, PROFILE, STATS 등)          │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                   API Gateway (HTTP API)                          │
│  ID: chzwwtjtgk                                                   │
│  URL: https://chzwwtjtgk.execute-api.us-east-1.amazonaws.com/dev │
│  Lambda 함수 7+개 연결                                            │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Frontend (Next.js)                              │
│  S3: sedaily-mbti-frontend-dev (ap-northeast-2)                   │
│  CloudFront: E1QS7PY350VHF6                                      │
│  도메인: mbti.sedaily.ai                                          │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Lambda 함수 목록 (us-east-1)

| 함수명 | 핸들러 | 트리거 | 설명 |
|--------|--------|--------|------|
| `sedaily-mbti-article-collector-dev` | `article_collector.lambda_handler` | EventBridge | S3 XML 수집 → MBTI 변환 → DynamoDB 저장 |
| `sedaily-mbti-article-dev` | `article_handler.lambda_handler` | API Gateway GET | 기사 상세 조회 |
| `sedaily-mbti-search-dev` | `search_handler.lambda_handler` | API Gateway POST | GSI 기반 기사 검색 |
| `sedaily-mbti-chatbot-dev` | `chatbot_handler.lambda_handler` | API Gateway POST | AI 챗봇 (MBTI 페르소나) |
| `sedaily-mbti-engagement-dev` | `engagement_handler.lambda_handler` | API Gateway GET/POST | 반응/댓글/별점 |
| `sedaily-mbti-tts-dev` | `tts_handler.lambda_handler` | API Gateway POST | AWS Polly TTS |
| `sedaily-mbti-time-machine-dev` | `time_machine_handler.lambda_handler` | API Gateway GET | 과거 날짜 뉴스 |

### 2.3 S3 버킷

| 버킷명 | 용도 | 리전 |
|--------|------|------|
| `sedaily-news-xml-storage` | 서울경제 원본 XML (daily-xml/YYYYMMDD.xml) | ap-northeast-2 |
| `sedaily-mbti-frontend-dev` | 프론트엔드 정적 파일 | ap-northeast-2 |
| `sedaily-mbti-lambda-packages-dev` | Lambda 배포 패키지 | us-east-1 |

### 2.4 인증 인프라 (AWS Cognito)

| 항목 | 값 |
|------|-----|
| User Pool ID | `us-east-1_ZS8PgF3iX` |
| Client ID | `66c9bq3ovmk007d0eepkle92k3` |
| OAuth Domain | `sedaily-mbti.auth.us-east-1.amazoncognito.com` |
| Redirect (prod) | `https://mbti.sedaily.ai/auth/callback` |
| Redirect (local) | `http://localhost:3000/auth/callback` |
| OAuth Provider | Google |
| Flow | Authorization Code |

---

## 3. 프론트엔드 (frontend-next/)

### 3.1 기술 스택

| 항목 | 기술 | 버전 |
|------|------|------|
| 프레임워크 | Next.js (App Router) | 16.2.2 |
| UI | React + TypeScript | 19.2.4 / 5 |
| 스타일링 | Tailwind CSS | v4 |
| 인증 | aws-amplify (Cognito) | 6.16.3 |
| 아이콘 | lucide-react | 1.7.0 |
| 마크다운 | react-markdown + remark-gfm | 10.1.0 |
| 한글 로마자 | aromanize | 0.1.5 |
| 상태 관리 | React Context + localStorage | - |
| 데이터 페칭 | 직접 fetch() | - |
| 테스트 | 없음 | - |

### 3.2 디렉토리 구조 (Feature-Sliced Design)

```
frontend-next/
├── src/
│   ├── app/                              # Next.js App Router (라우팅 전용)
│   │   ├── layout.tsx                    # 루트 레이아웃 (Providers, 폰트, 메타데이터)
│   │   ├── page.tsx                      # 메인 홈 (4개 뷰모드)
│   │   ├── providers.tsx                 # AuthProvider 래퍼
│   │   ├── globals.css                   # 전역 스타일 (다크모드, 테마변수)
│   │   ├── robots.ts                     # SEO robots.txt
│   │   ├── sitemap.ts                    # SEO sitemap.xml
│   │   ├── login/page.tsx                # 로그인 (5가지 인증 모드)
│   │   ├── auth/callback/page.tsx        # OAuth 리다이렉트 핸들러
│   │   ├── saju/page.tsx                 # 사주 운세 분석
│   │   ├── subscription/page.tsx         # 구독 플랜 안내
│   │   ├── timeline/page.tsx             # 타임라인 뉴스피드
│   │   └── timemachine/page.tsx          # 과거 날짜 뉴스 탐색
│   │
│   ├── components/                       # 대형 페이지 컴포넌트
│   │   ├── mbti/
│   │   │   ├── FeedPage.tsx              # 메인 뉴스피드 (5개 탭, ~1800줄)
│   │   │   ├── ArticleView.tsx           # 기사 전체화면 (문장 아카이빙)
│   │   │   ├── MbtiChatBot.tsx           # AI 챗봇 플로팅
│   │   │   ├── OnboardingPage.tsx        # MBTI 에디터 선택
│   │   │   └── BriefingPage.tsx          # 음성 인터랙티브 브리핑
│   │   ├── story/
│   │   │   └── StoryNewsFeed.tsx         # 카드 스와이프 온보딩
│   │   ├── timeline/
│   │   │   └── TimelineNewsFeed.tsx      # 시간대별 뉴스피드
│   │   └── character/
│   │       └── Character3D.tsx           # 고양이 캐릭터 (6가지 기분)
│   │
│   ├── features/                         # FSD Feature 모듈
│   │   ├── auth/                         # 인증
│   │   │   ├── components/LoginButton.tsx, UserMenu.tsx
│   │   │   ├── contexts/AuthContext.tsx   # AWS Amplify 통합
│   │   │   └── index.ts
│   │   ├── news-feed/                    # 뉴스피드 탭
│   │   │   ├── components/NewsFeedTab.tsx
│   │   │   └── index.ts
│   │   ├── question/                     # 오늘의 질문 탭
│   │   │   ├── components/QuestionTab.tsx
│   │   │   └── index.ts
│   │   ├── community/                    # 커뮤니티 탭
│   │   │   ├── components/CommunityTab.tsx
│   │   │   └── index.ts
│   │   ├── archive/                      # 내 서랍 탭
│   │   │   ├── components/ArchiveTab.tsx
│   │   │   └── index.ts
│   │   └── news-dna/                     # 나의 DNA 탭
│   │       ├── components/DnaTab.tsx
│   │       └── index.ts
│   │
│   ├── shared/                           # 공통 모듈
│   │   ├── config/
│   │   │   ├── api.ts                    # API_URL 상수
│   │   │   ├── auth.ts                   # Cognito 설정
│   │   │   └── videoConfig.ts            # 일별 영상 URL
│   │   ├── constants/
│   │   │   ├── categories.ts             # 카테고리 매핑
│   │   │   ├── categoryMapping.ts        # 영한 카테고리 변환
│   │   │   └── reporterNames.ts          # 기자명 변환
│   │   ├── data/
│   │   │   ├── mbtiGroups.ts             # 4개 MBTI 그룹 정의
│   │   │   ├── mockArticles.ts           # 14개 샘플 기사 (MBTI 4버전 포함)
│   │   │   ├── sampleArticles.ts         # 온보딩용 샘플 기사
│   │   │   ├── famousBirthdays.ts        # 365일 유명인 생일 (128KB)
│   │   │   ├── investmentScenarios.ts    # 투자 시뮬레이션 데이터
│   │   │   ├── economicSnapshots.ts      # 경제 스냅샷 데이터
│   │   │   └── connectionsPuzzles.ts     # 커넥션 퍼즐 데이터
│   │   ├── types/
│   │   │   ├── article.ts                # BaseArticle, ArticleDetail 등
│   │   │   ├── mbti.ts                   # MbtiVersion, ArchivedSentence 등
│   │   │   ├── timeMachine.ts            # DayNews, HistoricalEvent
│   │   │   ├── aromanize.d.ts            # aromanize 모듈 타입
│   │   │   └── speech.d.ts               # Web Speech API 타입
│   │   ├── lib/
│   │   │   ├── userApi.ts                # 유저 API 클라이언트
│   │   │   ├── readingTracker.ts         # localStorage 읽기 통계
│   │   │   └── elevenlabs.ts             # ElevenLabs TTS 연동
│   │   ├── api/
│   │   │   └── timeMachineApi.ts         # 타임머신 API 클라이언트
│   │   ├── services/
│   │   │   └── postService.ts            # 게시글 CRUD
│   │   ├── ui/
│   │   │   └── ScrollReveal.tsx          # IntersectionObserver 애니메이션
│   │   └── utils/
│   │       ├── dateUtils.ts              # 날짜 포맷, 주간 계산
│   │       └── textUtils.ts              # 마크다운 클리닝
│   │
│   └── widgets/
│       └── index.ts                      # 위젯 re-export
│
├── public/                               # 정적 파일
├── package.json
├── next.config.ts
├── tsconfig.json
├── postcss.config.mjs
└── eslint.config.mjs
```

### 3.3 페이지 라우팅

| 경로 | 파일 | 설명 | 인증 |
|------|------|------|------|
| `/` | `src/app/page.tsx` | 메인 홈 — 4개 뷰모드 허브 | 불필요 |
| `/login` | `src/app/login/page.tsx` | 로그인/회원가입 (5가지 모드) | 불필요 |
| `/auth/callback` | `src/app/auth/callback/page.tsx` | OAuth 리다이렉트 처리 | 불필요 |
| `/saju` | `src/app/saju/page.tsx` | 사주 운세 분석 | 불필요 |
| `/subscription` | `src/app/subscription/page.tsx` | 구독 플랜 안내 | 불필요 |
| `/timeline` | `src/app/timeline/page.tsx` | 타임라인 뉴스피드 | 불필요 |
| `/timemachine` | `src/app/timemachine/page.tsx` | 과거 날짜 뉴스 탐색 | 불필요 |

### 3.4 메인 페이지 (/) 뷰모드 시스템

메인 페이지는 4개의 ViewMode를 가진 SPA:

```typescript
type ViewMode = "story" | "feed" | "editor-select" | "briefing";
```

| ViewMode | 컴포넌트 | 설명 |
|----------|----------|------|
| `feed` (기본) | `FeedPage` + `MbtiChatBot` | 메인 뉴스피드 (5개 탭) |
| `editor-select` | `OnboardingPage` | MBTI 그룹 선택 (4개 에디터 카드) |
| `briefing` | `BriefingPage` | 선택한 에디터 소개 내러티브 |
| `story` | `StoryNewsFeed` | 관심사 기반 카드 스와이프 온보딩 |

**전환 흐름**:
```
최초 방문 → feed (기본 SF 그룹)
에디터 변경 → editor-select → 에디터 선택 → briefing → feed
스토리 모드 → story → 완료 → feed
```

### 3.5 FeedPage — 5개 탭 시스템

FeedPage는 앱의 중심 컴포넌트 (~1,800줄). 5개 탭으로 구성:

| 탭 ID | 탭 이름 | 컴포넌트 | 설명 | API 연동 |
|--------|---------|----------|------|----------|
| `question` | 오늘의 질문 | `QuestionTab` | AI 질문 퀴즈 → MBTI 변경 가능 | 하드코딩 |
| `feed` | 뉴스피드 | `NewsFeedTab` | 날짜별 기사 + MBTI 버전 전환 | 실제 API |
| `community` | 커뮤니티 | `CommunityTab` | 아카이빙 문장 기반 토론 | Mock |
| `archive` | 내 서랍 | `ArchiveTab` | 저장한 문장 관리 | Mock (React state) |
| `dna` | 나의 DNA | `DnaTab` | 뉴스 관심 분석 + 생일 | 하드코딩 |

탭 상태는 URL 쿼리 파라미터에 동기화: `/?tab=feed` (replaceState, 히스토리 비축적)

### 3.6 기사 로드 플로우 (NewsFeedTab)

```typescript
// 1차: S3에서 해당 날짜 기사 가져오기
const res = await fetch(`${API_URL}/s3-articles?date=${dateStr}&limit=30`);
const data = await res.json();

if (data.articles?.length > 0) {
  setArticles(data.articles);
} else {
  // 2차: S3에 없으면 search API로 fallback
  const searchRes = await fetch(`${API_URL}/api/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: "*",
      filters: {
        published_from: targetDate,   // YYYY-MM-DD
        published_until: nextDay,     // YYYY-MM-DD
      },
      page: 1,
      page_size: 30,
    }),
  });
}
```

**기사 프리페칭** (카드 노출 시 자동):
```typescript
// 1차: S3에서 MBTI 버전 포함 상세
fetch(`${API_URL}/s3-article/${id}`)
// 2차: DynamoDB fallback
fetch(`${API_URL}/api/article/${id}`)
```

### 3.7 인증 시스템 (AuthContext)

```typescript
// src/features/auth/contexts/AuthContext.tsx

// 지원 인증 방식:
signInWithGoogle()          // → Cognito OAuth redirect → /auth/callback
signInWithEmail(email, pw)  // → Cognito signIn
signUpWithEmail(name, email, pw)  // → Cognito signUp → 이메일 인증
confirmSignUpCode(email, code)    // → Cognito confirmSignUp
forgotPassword(email)             // → Cognito resetPassword
confirmForgotPassword(email, code, newPw)  // → Cognito confirmResetPassword
logout()                          // → Cognito signOut

// 로그인 성공 시 자동 서버 동기화:
async function syncUserProfile(userData) {
  await fetch(`${API_URL}/api/user/profile`, {
    method: 'POST',
    body: JSON.stringify({
      user_id: userData.userId,
      email: userData.email,
      name: userData.name,
      picture: userData.picture,
      mbti_group: localStorage.getItem('mbti-group') || 'SF',
    }),
  });
}
```

### 3.8 상태 관리

**React Context** (전역 1개):
- `AuthContext` — user, isAuthenticated, isLoading, 인증 메서드

**localStorage 키**:

| Key | 값 예시 | 용도 |
|-----|---------|------|
| `mbti-group` | `"NT"` | 선택된 MBTI 그룹 |
| `user-tags` | `["경제", "IT"]` | 관심 태그 |
| `user_birthday` | `"1995-03-15"` | DNA탭 생일 |
| `mbti-reading-tracker` | ReadingStats JSON | 읽기 통계 (90일 보관) |
| `onboarding-completed` | `"true"` | 온보딩 완료 여부 |
| `onboarding-answers` | JSON | 온보딩 답변 |

**URL 파라미터**:

| 파라미터 | 예시 | 용도 |
|----------|------|------|
| `?tab=feed` | `/?tab=community` | FeedPage 탭 상태 |
| `#article-{id}` | `/#article-2K7B9WQC2M` | 기사 상세 보기 |
| `?date=YYYY-MM-DD` | `/timemachine?date=2000-03-15` | 타임머신 날짜 |
| `?mode=birthday` | `/timemachine?mode=birthday` | 생일 모드 진입 |

### 3.9 MBTI 그룹 정의 (프론트엔드)

```typescript
// src/shared/data/mbtiGroups.ts

export const mbtiGroups: Record<MbtiGroupId, MbtiGroup> = {
  NT: {
    id: 'NT', name: '전략형', label: 'NT 전략형',
    types: ['INTJ', 'INTP', 'ENTJ', 'ENTP'],
    color: '#3B82F6', bgClass: 'bg-blue-500',
    style: '애널리스트 리포트', icon: '📊',
    description: '데이터와 논리로 핵심을 꿰뚫는 분석형 뉴스',
    axis: '추상 + 분석',
  },
  NF: {
    id: 'NF', name: '가치형', label: 'NF 가치형',
    types: ['INFJ', 'INFP', 'ENFJ', 'ENFP'],
    color: '#8B5CF6', bgClass: 'bg-violet-500',
    style: '칼럼 / 에세이', icon: '💡',
    description: '의미와 가치를 찾아 깊이 읽는 인문형 뉴스',
    axis: '추상 + 감성',
  },
  ST: {
    id: 'ST', name: '실용형', label: 'ST 실용형',
    types: ['ISTJ', 'ISTP', 'ESTJ', 'ESTP'],
    color: '#22C55E', bgClass: 'bg-green-500',
    style: '팩트시트', icon: '✅',
    description: '숫자와 팩트로 빠르게 파악하는 실용형 뉴스',
    axis: '구체 + 분석',
  },
  SF: {
    id: 'SF', name: '공감형', label: 'SF 공감형',
    types: ['ISFJ', 'ISFP', 'ESFJ', 'ESFP'],
    color: '#F97316', bgClass: 'bg-orange-500',
    style: '친구 톡', icon: '💬',
    description: '친근한 대화체로 쉽게 이해하는 공감형 뉴스',
    axis: '구체 + 감성',
  },
};
```

### 3.10 ElevenLabs TTS 연동 (BriefingPage)

```typescript
// src/shared/lib/elevenlabs.ts
// 에디터별 한국어 음성 ID 매핑, IndexedDB 캐싱
// BriefingPage에서 에디터 소개 음성 재생에 사용
```

### 3.11 읽기 추적 (이중 시스템)

```typescript
// 1. localStorage 기반 (모든 사용자) — src/shared/lib/readingTracker.ts
trackArticleRead(articleId);   // 일별 읽기 수, 연속 스트릭
getReadingStats();              // totalArticles, currentStreak, weeklyCount

// 2. 서버 API (로그인 사용자만) — src/shared/lib/userApi.ts
recordArticleRead(userId, articleId, title);
// → POST /api/user/read { user_id, article_id, article_title }
```

---

## 4. 백엔드 (backend/)

### 4.1 기술 스택

| 항목 | 기술 | 버전/설정 |
|------|------|-----------|
| 프레임워크 | FastAPI | 0.115.0 |
| 서버 | uvicorn | 0.32.0 |
| AI 모델 | Bedrock Claude 3.5 Haiku | `us.anthropic.claude-3-5-haiku-20241022-v1:0` |
| DB | DynamoDB On-Demand | us-east-1 |
| TTS | AWS Polly (Neural, Seoyeon) | us-east-1 |
| 캐시 | Redis | 5.2.0 (TTL 7일) |
| HTTP | httpx + requests | 0.27.0 / 2.32.3 |
| 스크래핑 | BeautifulSoup4 | 4.12.3 |

### 4.2 디렉토리 구조

```
backend/
├── main.py                              # FastAPI 진입점 (로컬 개발용)
├── config/
│   ├── __init__.py                      # settings 인스턴스 export
│   ├── settings.py                      # Settings 데이터클래스 (환경변수)
│   └── constants.py                     # 상수 정의 (카테고리, MBTI, URL 등)
├── clients/
│   ├── s3_xml_client.py                 # S3 XML 파싱 클라이언트 (898줄)
│   ├── dynamodb_client.py               # DynamoDB CRUD + 배치 + 버전 관리
│   └── mbti_transform_service.py        # Bedrock MBTI 변환 서비스
├── handlers/
│   ├── article_collector.py             # 기사 수집 + 필터링 + 변환 Lambda
│   ├── article_handler.py               # 기사 상세 조회 Lambda
│   ├── search_handler.py                # GSI 기반 검색 Lambda (최적화 완료)
│   ├── chatbot_handler.py               # MBTI 페르소나 AI 챗봇 Lambda
│   ├── engagement_handler.py            # 반응/댓글/별점 Lambda
│   ├── post_handler.py                  # 관리자 게시글 CRUD Lambda
│   ├── s3_articles_handler.py           # S3 직접 기사 조회 Lambda
│   ├── saju_handler.py                  # 사주 팔자 분석 Lambda (~600줄)
│   ├── time_machine_handler.py          # 과거 날짜 뉴스 Lambda
│   ├── tts_handler.py                   # AWS Polly TTS Lambda
│   └── user_handler.py                  # 유저 프로필/통계/뱃지 Lambda
├── core/
│   ├── decorators.py                    # @lambda_handler, @require_params 등
│   ├── exceptions.py                    # 에러 계층 (BackendError 기반)
│   ├── response.py                      # 통합 응답 포맷 (success/error/paginated)
│   └── revalidation.py                  # Next.js ISR 재검증
├── models/
│   └── article.py                       # Article, ArticleVersion, CollectionLog
├── repositories/
│   ├── base.py                          # 베이스 리포지토리
│   ├── log_repository.py                # 수집 로그 리포지토리
│   └── settings_repository.py           # 설정 리포지토리
├── services/
│   ├── article_filter_service.py        # 스마트 기사 필터링 (규칙+AI)
│   └── prompt_service.py                # 프롬프트 CRUD/버저닝
├── utils/
│   ├── hash_utils.py                    # SHA256 콘텐츠 해시 (변경 감지)
│   └── date_utils.py                    # news_id → ISO 타임스탬프
├── prompts/
│   ├── nt.md                            # NT 전략형 프롬프트 (256줄)
│   ├── nf.md                            # NF 가치형 프롬프트 (250줄)
│   ├── st.md                            # ST 실용형 프롬프트 (287줄)
│   └── sf.md                            # SF 공감형 프롬프트 (282줄)
├── MBTI_TRANSFORM_PROMPT.md             # 레거시 통합 프롬프트 (fallback)
├── requirements.txt
├── deploy.sh                            # Lambda 배포 스크립트
└── deploy.bat                           # Windows 배포 스크립트
```

### 4.3 설정 (config/)

```python
# config/settings.py — 환경변수 로딩
@dataclass
class Settings:
    bigkinds_api_key: str        # 뉴스 수집 API 키
    anthropic_api_key: str       # Anthropic API 키
    region: str = 'us-east-1'    # AWS 기본 리전
    s3_region: str = 'ap-northeast-2'  # S3 리전 (서울)
    dynamodb_table_articles: str = 'sedaily-mbti-articles-dev'
    redis_host: str = 'localhost'
    api_port: int = 8000
    frontend_url: str = 'https://mbti.sedaily.com'

# config/constants.py — 핵심 상수
BEDROCK_MODEL_ID_DEFAULT = 'us.anthropic.claude-3-5-haiku-20241022-v1:0'
CATEGORIES_KOREAN = ['경제', 'IT_과학', '정치', '사회', '문화', '스포츠', '국제']
MBTI_GROUPS = ['NT', 'NF', 'ST', 'SF']
```

### 4.4 기사 수집 파이프라인 (article_collector.py)

카테고리별 MBTI 변환 할당량:

```python
TRANSFORM_PER_CATEGORY = {
    '경제': 3,      # 매일 최대 3개
    'IT_과학': 2,
    '정치': 1,
    '사회': 2,
    '문화': 1,
    '스포츠': 1,
    '국제': 1,
}
# 총 11개 기사/일 (스마트 필터링 후)
```

**수집 흐름**:
1. S3 XML (YYYYMMDD.xml) 파싱 → S3Article 객체 리스트
2. DynamoDB 중복 체크 (batch_check_exists)
3. 업데이트 기사: content_hash 비교로 변경분만 처리
4. 카테고리별 스마트 필터링 (ArticleFilterService)
5. 필터링 통과 + 카테고리별 할당량 내 기사만 MBTI 변환
6. 모든 기사 DynamoDB 저장 (변환 여부 무관)
7. 수집 로그 저장

### 4.5 MBTI 변환 서비스 (mbti_transform_service.py)

```python
# 프롬프트 로딩 우선순위:
# 1. /backend/prompts/ 폴더의 개별 파일 (nt.md, nf.md, st.md, sf.md)
# 2. DynamoDB settings_config.transform_prompt (레거시)
# 3. MBTI_TRANSFORM_PROMPT.md 파일 (레거시)
# 4. 기본 fallback 문자열

# Bedrock 호출 설정:
BEDROCK_MODEL_ID = "us.anthropic.claude-3-5-haiku-20241022-v1:0"
MAX_RETRIES = 5
INITIAL_RETRY_DELAY = 30  # 초
MAX_RETRY_DELAY = 300     # 초 (5분)
max_tokens = 8192

# 응답 형식 (JSON):
{
  "NT": { "title": "...", "body": "..." },
  "NF": { "title": "...", "body": "..." },
  "ST": { "title": "...", "body": "..." },
  "SF": { "title": "...", "body": "..." }
}
```

### 4.6 S3 XML 파싱 (s3_xml_client.py)

S3 XML 구조: `s3://sedaily-news-xml-storage/daily-xml/YYYYMMDD.xml`

```python
# 카테고리 정규화 (60+ 매핑)
CATEGORY_NORMALIZATION_MAP = {
    '산업,IT일반': 'IT_과학',   # 레거시 형식
    'IT·과학,반도체': 'IT_과학', # 2026-01-23 이후 형식
    '문화·라이프': '문화',
    '금융': '경제',
    '증권': '경제',
    '부동산': '경제',
    '지역': '사회',
    # ... 총 60개 이상
}

# S3Article 데이터클래스 (34개 필드):
@dataclass
class S3Article:
    nsid: str              # 기사 ID (예: 2K78XY958Z)
    action: str            # I=Insert, U=Update, D=Delete
    title: str
    content_clean: str     # HTML 제거된 순수 텍스트
    content_blocks: List[ContentBlock]  # 이미지 위치 보존 구조
    main_category: str     # 정규화된 카테고리
    published_at: str      # ISO 8601
    images: List[ImageData]
    related_news: List[RelatedNews]
    is_breaking_news: bool
    # ... 등
```

### 4.7 스마트 기사 필터링 (article_filter_service.py)

2단계 필터링:

**1단계 — 규칙 기반 (즉시)**:
```python
# 제외 키워드: 인사, 발령, 승진, 부고, 별세, 사망, 속보 등
# 제외 제목 패턴: [인사], [부고], [속보], [1보], 증시 마감, 환율 마감
# 최소 본문 길이: 300자
```

**2단계 — AI 기반 (후보 3개 이상일 때)**:
```python
# Bedrock Claude Haiku에게 기사 목록을 보여주고 제외 대상 식별
# 제외 기준: 속보/단신, 사건/사고, 인사/발령, 부고/동정, 반복성, 홍보성
```

### 4.8 검색 최적화 (search_handler.py)

```python
# PHASE 71: table.scan() 완전 제거
# Before: ~$32/day (127M RCU), 4.5s/request
# After:  ~$15/day (<50M RCU), <1s/request

# 전략: 항상 GSI Query 사용 (category-published_at-index)
# 카테고리 미지정 시 → 모든 표준 카테고리 + alias를 순회 쿼리

# 카테고리 검색 alias (PHASE 72):
CATEGORY_SEARCH_ALIASES = {
    '경제': ['경제', '금융', '증권', '부동산'],
    'IT_과학': ['IT_과학', '산업', 'IT·과학'],
    '정치': ['정치'],
    '사회': ['사회', '지역'],
    '문화': ['문화', '문화·라이프'],
    '스포츠': ['스포츠'],
    '국제': ['국제'],
}

# Lambda warm container 내 인메모리 캐시 (5분 TTL)
```

### 4.9 챗봇 (chatbot_handler.py)

```python
# MBTI 그룹별 시스템 프롬프트:
MBTI_SYSTEM_PROMPTS = {
    'NT': "당신은 '시현'입니다. 논리적이고 분석적...",
    'NF': "당신은 '지원'입니다. 성찰적이고 따뜻한...",
    'ST': "당신은 '정훈'입니다. 정확하고 체계적...",
    'SF': "당신은 '하은'입니다. 친근하고 공감적...",
}

# 최근 기사 5개를 컨텍스트로 제공
# 대화 히스토리 최대 6개 메시지
# 응답 ~200자, Bedrock prompt caching 사용 (5분)
```

### 4.10 사주 분석 (saju_handler.py)

순수 Python 로직으로 사주 팔자 계산:
- 천간(10개), 지지(12개), 오행, 음양, 십신 매핑
- 년주/월주/일주/시주 계산
- 대운 10년 주기 계산
- 용신/희신/기신 판단
- 성격/적성 프로필 생성
- 신살(특수 별자리) 판단

### 4.11 에러 처리 체계

```python
# core/exceptions.py — 계층적 에러 클래스
BackendError (base)
├── ValidationError      # 400
├── AuthenticationError  # 401
├── AuthorizationError   # 403
├── NotFoundError        # 404
├── RateLimitError       # 429
├── RepositoryError      # 500
├── TranslationError     # 500
├── ConfigurationError   # 500
└── ExternalServiceError # 502

# core/decorators.py — Lambda 핸들러 데코레이터
@lambda_handler           # 통합 에러 처리 + 로깅 + async
@require_params('category', 'page')      # 쿼리 파라미터 검증
@require_body_fields('title', 'content') # 바디 필드 검증
@require_path_param('id')               # 경로 파라미터 검증
```

---

## 5. API 엔드포인트 전체 목록

### 5.1 실제 연동 완료 API

| Method | Path | 설명 | 프론트엔드 호출 위치 |
|--------|------|------|---------------------|
| `GET` | `/s3-articles?date={YYYYMMDD}&limit=30&category={cat}` | 날짜별 기사 목록 (S3 XML) | NewsFeedTab |
| `GET` | `/s3-article/{news_id}?date={YYYYMMDD}` | 기사 상세 (S3 XML, MBTI 없음) | FeedPage 프리페치 |
| `GET` | `/api/article/{news_id}` | 기사 상세 (DynamoDB, MBTI 포함) | ArticleView, 프리페치 |
| `POST` | `/api/search` | 기사 검색 (GSI 기반) | NewsFeedTab fallback |
| `POST` | `/api/chat` | MBTI 페르소나 AI 챗봇 | MbtiChatBot |
| `POST` | `/saju` | 사주 팔자 분석 | SajuPage |
| `GET` | `/time-machine?date={YYYY-MM-DD}` | 과거 날짜 뉴스 + 역사 사건 | TimeMachinePage |
| `POST` | `/api/user/profile` | 유저 프로필 동기화 | AuthContext (로그인 시) |
| `POST` | `/api/user/read` | 기사 읽음 기록 | ArticleView |
| `GET` | `/api/user/stats?user_id={id}` | 유저 통계 | userApi.ts |
| `GET` | `/api/user/history?user_id={id}` | 읽기 기록 | userApi.ts |
| `GET/POST` | `/api/engagement/{articleId}/*` | 반응/댓글/별점 | (백엔드 준비 완료) |
| `POST` | `/api/tts` | TTS 음성 생성 (Polly) | (백엔드 준비 완료) |
| `GET/POST/DELETE` | `/api/posts/*` | 관리자 게시글 CRUD | postService.ts |

### 5.2 주요 요청/응답 형식

**기사 목록 응답** (`/s3-articles`):
```json
{
  "date": "20260407",
  "total": 25,
  "articles": [
    {
      "news_id": "2K78XY958Z",
      "title": "삼성전자, 1분기 영업이익 6조원 전망",
      "published_at": "2026-04-07T09:23:00+09:00",
      "category": "경제",
      "provider": "서울경제",
      "byline": "이현호 기자",
      "image_url": "https://...",
      "content": "삼성전자가...(첫 2000자)",
      "original_link": "https://www.sedaily.com/NewsView/2K78XY958Z"
    }
  ]
}
```

**기사 상세 응답** (`/api/article/{id}`):
```json
{
  "news_id": "2K78XY958Z",
  "title_ko": "삼성전자, 1분기 영업이익 6조원 전망",
  "content_ko": "전체 원본 본문...",
  "category": "경제",
  "published_at": "2026-04-07T09:23:00+09:00",
  "version_NT": {
    "title": "삼성전자 1Q 영업이익 구조 분석: 6조원의 의미",
    "body": "마크다운 본문..."
  },
  "version_NF": { "title": "...", "body": "..." },
  "version_ST": { "title": "...", "body": "..." },
  "version_SF": { "title": "...", "body": "..." },
  "content_blocks": [
    { "type": "text", "text_ko": "...", "style": "normal" },
    { "type": "image", "url": "...", "caption": "..." }
  ],
  "images": [{ "url": "...", "caption_content": "..." }],
  "related_news": [{ "title": "...", "url": "..." }]
}
```

**MBTI 버전 구조** (MbtiVersion):
```typescript
interface MbtiVersion {
  title: string;           // MBTI 스타일 제목
  subtitle?: string;
  body: string | string[]; // 마크다운 본문 또는 문단 배열
  key_points?: string[];   // 핵심 요약 포인트
  closing_line?: string;   // 마무리 문장
  tone?: string;           // "분석적", "성찰적", "간결한", "친근한"
}
```

**검색 요청** (`/api/search`):
```json
{
  "query": "*",
  "filters": {
    "published_from": "2026-04-07",
    "published_until": "2026-04-08",
    "categories": ["경제", "IT_과학"]
  },
  "page": 1,
  "page_size": 30
}
```

**챗봇 요청** (`/api/chat`):
```json
{
  "message": "오늘 주요 뉴스 알려줘",
  "mbti_group": "NT",
  "conversation_history": [
    { "role": "user", "content": "..." },
    { "role": "assistant", "content": "..." }
  ]
}
```

### 5.3 미연동 기능 (Mock 데이터)

| 기능 | 현재 상태 | 필요 API |
|------|-----------|----------|
| 오늘의 질문 | 하드코딩 3개 질문 | 질문 CRUD, 답변 저장, MBTI 변경 |
| 커뮤니티 | Mock 5개 게시글, 13명 유저 | 게시글 CRUD, 댓글 CRUD, 추천, 랭킹 |
| 내 서랍 (아카이빙) | React state, Mock 8개 문장 | 아카이빙 CRUD (user + article + text) |
| 뉴스 DNA 관심도 | 하드코딩 수치 | 읽기 패턴 분석, 카테고리 관심도 |
| 오디오 브리핑 | Mock 프로그레스 시뮬레이션 | TTS 스트리밍 (Polly 백엔드 존재) |
| 구독/결제 | UI만 (isSubscribed=false) | 결제 처리, 구독 상태 관리 |
| 유저 프로필 상세 | Mock (온도, 뱃지, 칭호) | 활동 통계, 게이미피케이션 |

---

## 6. MBTI 프롬프트 시스템

4개의 프롬프트 파일이 `/backend/prompts/`에 각각 250줄 이상으로 존재한다.

### 6.1 공통 구조

모든 프롬프트는 동일한 XML 태그 구조:
```xml
<system_role>     <!-- 페르소나 역할 정의 -->
<persona>         <!-- 이름, 성향, 말투, 신념, 철학 -->
<target_audience> <!-- 인지 특성, 정보 소비 패턴, 원하는 것/싫어하는 것 -->
<content_structure> <!-- 기승전결 4단계 구조 -->
<thinking_process>  <!-- Chain of Thought 5단계 -->
<tone_and_style>    <!-- 어조, 문장 규칙, 허용/금지 표현 -->
<output_format>     <!-- 출력 형식 (마크다운) -->
<few_shot_example>  <!-- 입력/출력 예시 -->
<quality_checklist> <!-- 품질 체크 항목 7~8개 -->
```

### 6.2 NT 전략형 — 핵심 특성

- **어조**: 냉철하고 객관적, 단정적이되 근거 있는
- **구조**: 핵심 논점 → 구조적 분석 (■ 소제목) → 시나리오/변수 → 체크포인트
- **금지**: 이모지, 감정 호소, "~인 것 같다"
- **마무리**: ✓ 체크포인트 3개 + 핵심 키워드 5개

### 6.3 NF 가치형 — 핵심 특성

- **어조**: 성찰적이고 따뜻함, 독자와 함께 생각하는 톤
- **구조**: 장면/감정으로 시작 → 가치 충돌 조명 → 열린 질문 → 여운
- **금지**: 이모지, 냉소적 톤, 결론 강요
- **마무리**: 여운 있는 마무리 + "더 깊이 읽기" 추천

### 6.4 ST 실용형 — 핵심 특성

- **어조**: 건조하고 간결, 사실 중심
- **구조**: 기본 정보 표 → 핵심 발언 표 → 세부 번호 리스트 → 체크포인트
- **금지**: 이모지, 감정 표현, 추측 표현, 장황한 설명
- **마무리**: ✓ 체크포인트 + 관련 데이터 링크

### 6.5 SF 공감형 — 핵심 특성

- **어조**: 친구에게 설명하듯 친근하고 공감적
- **구조**: 친근한 시작 → 쉬운 설명 → 나와의 연결 (실생활 팁) → 가벼운 마무리
- **허용**: 이모지 (섹션당 1~2개), "솔직히", "~잖아요", "~거든요"
- **마무리**: 독자 질문 + "이런 것도 있어요" 추천

---

## 7. DynamoDB 데이터 모델

### 7.1 기사 테이블 (sedaily-mbti-articles-dev)

**PK**: `news_id` (string)

| item_type | news_id 패턴 | 설명 |
|-----------|--------------|------|
| `article` | `2K78XY958Z` | MBTI 변환 기사 |
| `user_post` | `post_20260407_abc12345` | 관리자 게시글 |
| `collection_log` | `collection_log_20260407_143022` | 수집 로그 |
| `article_version` | `version_2K78XY958Z_20260407_143022` | 기사 버전 히스토리 |
| `failed_article` | `failed_queue_2K78XY958Z` | 변환 실패 재시도 큐 |
| `settings_config` | `settings_config` | 전역 설정 (프롬프트 등) |
| `timemachine_cache` | `timemachine_2026-04-07` | 타임머신 캐시 |

**GSI**:
- `category-published_at-index` — 카테고리 + 날짜 범위 검색
- `slug-index` — SEO slug 조회

**기사 아이템 스키마**:
```json
{
  "news_id": "2K78XY958Z",
  "item_type": "article",
  "title_ko": "원본 한국어 제목",
  "sub_title_ko": "부제목",
  "content_ko": "정제된 본문 텍스트",
  "content_raw": "원본 HTML",
  "content_blocks": [
    { "type": "text", "text_ko": "...", "style": "normal|bold|heading" },
    { "type": "image", "url": "...", "alt": "...", "caption": "..." }
  ],
  "version_NT": { "title": "...", "body": "..." },
  "version_NF": { "title": "...", "body": "..." },
  "version_ST": { "title": "...", "body": "..." },
  "version_SF": { "title": "...", "body": "..." },
  "category": "경제",
  "published_at": "2026-04-07T09:23:00+09:00",
  "author_name": "이현호 기자",
  "author_email": "hhlee@sedaily.com",
  "images": [{ "url": "...", "caption_content": "..." }],
  "content_hash": "sha256hex...",
  "transformed_at": "2026-04-07T14:30:22",
  "transform_usage": { "input_tokens": 3000, "output_tokens": 4000 }
}
```

### 7.2 참여 테이블 (sedaily-mbti-engagement-dev)

**PK**: `pk` (string), **SK**: `sk` (string)

| pk 패턴 | sk 패턴 | 설명 |
|---------|---------|------|
| `ARTICLE#{id}` | `REACTIONS` | 기사 반응 카운트 |
| `ARTICLE#{id}` | `USER_REACTION#{userId}#{type}` | 유저별 반응 |
| `ARTICLE#{id}` | `RATING_STATS` | 기사 별점 통계 |
| `ARTICLE#{id}` | `USER_RATING#{userId}` | 유저별 별점 |
| `ARTICLE#{id}` | `COMMENT#{timestamp}#{id}` | 댓글 |
| `USER#{id}` | `PROFILE` | 유저 프로필 |
| `USER#{id}` | `STATS` | 유저 통계 (읽기 수, 뱃지 등) |
| `USER#{id}` | `DAILY#{date}` | 일별 방문 기록 (스트릭 계산) |
| `USER#{id}` | `READ#{articleId}` | 기사 읽기 기록 |

---

## 8. 주요 사용자 여정

### 8.1 최초 방문 → 뉴스피드

```
홈페이지 (/)
  → localStorage에서 'mbti-group' 확인
  → 없으면: 기본 SF 그룹 적용
  → FeedPage 렌더링 (5개 탭)
  → NewsFeedTab: /s3-articles?date=오늘 호출
  → 기사 카드 표시 (SF 버전 제목/미리보기)
```

### 8.2 에디터 변경

```
FeedPage 상단 에디터 아바타 클릭
  → ViewMode: 'editor-select'
  → OnboardingPage: 4개 에디터 카드 표시
  → 에디터 선택 (예: NT)
  → ViewMode: 'briefing'
  → BriefingPage: 시현 소개 내러티브 (TTS)
  → 완료 → localStorage에 'mbti-group': 'NT' 저장
  → ViewMode: 'feed' → FeedPage (NT 버전 표시)
```

### 8.3 기사 읽기

```
FeedPage의 기사 카드 클릭
  → ArticleView 전체화면 오버레이
  → 이미 프리페치된 상세 데이터 사용
  → 없으면: /api/article/{news_id} 호출
  → MBTI 버전 있으면: 현재 그룹 버전 표시
  → MBTI 버전 없으면: 원본 한국어 기사 표시
  → 문장 터치 → 노란 하이라이트 → "N개 문장 저장" 버튼
  → 읽기 추적: trackArticleRead(localStorage) + recordArticleRead(서버)
```

### 8.4 로그인

```
/login 페이지
  → Google OAuth: signInWithRedirect → Cognito → /auth/callback → "/"
  → 이메일: signIn(email, password) → 성공 → "/"
  → 회원가입: signUp → 이메일 인증 → confirmSignUp → "로그인하세요" 안내
  → 로그인 성공 시: syncUserProfile() → POST /api/user/profile
```

---

## 9. 외부 서비스 연동

### 9.1 AWS 서비스

| 서비스 | 용도 | 리전 |
|--------|------|------|
| Bedrock (Claude 3.5 Haiku) | MBTI 기사 변환, 챗봇, 기사 필터링 | us-east-1 |
| DynamoDB | 기사 저장, 유저 데이터, 설정 | us-east-1 |
| S3 | 원본 XML, 프론트엔드 정적 파일 | ap-northeast-2 |
| API Gateway | REST API 진입점 | us-east-1 |
| Lambda | 서버리스 백엔드 함수 | us-east-1 |
| CloudFront | CDN (mbti.sedaily.ai) | Global |
| Cognito | 사용자 인증 (Google OAuth + Email) | us-east-1 |
| Polly | TTS (Neural, Seoyeon 한국어 여성) | us-east-1 |
| EventBridge | 기사 수집 스케줄 트리거 | us-east-1 |

### 9.2 외부 API

| API | 용도 | 호출 위치 |
|-----|------|-----------|
| Wikipedia REST API | 과거 날짜 역사 이벤트 (한국어 → 영어 fallback) | time_machine_handler.py |
| 서울경제 아카이브 (sedaily.com) | 과거 날짜 뉴스 크롤링 (BeautifulSoup) | time_machine_handler.py |
| ElevenLabs TTS API | 에디터 음성 브리핑 (한국어) | elevenlabs.ts (프론트엔드) |

### 9.3 ElevenLabs TTS (프론트엔드)

```typescript
// src/shared/lib/elevenlabs.ts
// 에디터별 한국어 음성 매핑
// IndexedDB 캐싱 (반복 호출 방지)
// BriefingPage, OnboardingPage에서 사용
```

---

## 10. 로컬 개발

### 10.1 프론트엔드

```bash
cd frontend-next
npm install
npm run dev        # http://localhost:3000
npx next lint      # 린트
npx tsc --noEmit   # 타입 체크
npm run build      # 프로덕션 빌드
```

### 10.2 백엔드

```bash
cd backend
pip install -r requirements.txt
python main.py     # http://localhost:8000 (FastAPI + uvicorn)
```

### 10.3 배포

```bash
# 프론트엔드
cd frontend-next
npm run build
aws s3 sync out/ s3://sedaily-mbti-frontend-dev --delete
aws cloudfront create-invalidation --distribution-id E1QS7PY350VHF6 --paths "/*"

# 백엔드
cd backend
./deploy.sh        # Lambda 패키지 빌드 + 업로드
```

---

## 11. 신규 백엔드 아키텍처 (To-Be 계획)

`ai-lens-backend-architecture.md`에 기술된 재설계 계획 (10주 PoC):

### 11.1 기사 변환: Step Functions 4단계

```
S3 (원본 기사)
  → Step 1: 기사 선별 (Nova) — 속보/인사/부고/반복 제외
  → Step 2: 기사 분류 (Nova) — MBTI 유형별 적합성 분류
  → Step 3: 톤앤매너 변환 (Claude) — 4버전 동시 생성
  → Step 4: Validation (Nova/Claude) — 교열, 맞춤법, 스타일 검수
  → MBTI Supervisor Model (Nova) — 최종 품질 조율
  → Article Database + Vector DB (동시 적재)
```

### 11.2 신규 DB 구조

| DB | 서비스 | 용도 |
|----|--------|------|
| Article DB (S3) | S3 | 기사 본문 (원문 + 4버전 리라이팅) |
| Article Pointer | DynamoDB | S3 URI + 메타데이터 (빠른 조회) |
| Personal DB | DynamoDB (별도 테이블) | 아카이빙, 사용자 프로필, 추천 포인터 |
| Podcast DB | DynamoDB (별도 테이블) | 팟캐스트 메타데이터 |
| Vector DB (OpenSearch) | OpenSearch | RAG 검색, 전문+벡터 하이브리드 검색 |
| Vector DB (pgvector) | PostgreSQL (RDS) | 유사도 검색, SQL 분석 쿼리 |
| 음성 S3 | S3 (별도 버킷) | 팟캐스트/TTS 음성 파일 |

### 11.3 신규 서비스

- **개인화 추천**: Amazon Personalize + Claude 보강
- **오디오/팟캐스트**: Bedrock → 대본 → Polly TTS → S3
- **내 서랍 유사도 검색**: pgvector 벡터 임베딩
- **벡터 임베딩**: Bedrock Titan Embeddings / Cohere Embed
- **멀티 에이전트**: Strands SDK (AWS 오픈소스)

### 11.4 As-Is vs To-Be

| 영역 | As-Is | To-Be |
|------|-------|-------|
| 기사 변환 | Haiku 단일 호출 | Step Functions 4단계 (Nova+Claude) |
| DB | DynamoDB (본문 직접 저장) | DynamoDB (포인터) + S3 (본문) + Vector DB |
| 검색 | GSI Query | OpenSearch RAG + pgvector 유사도 |
| 추천 | 없음 | Amazon Personalize + Claude |
| 오디오 | Polly 단순 TTS | 팟캐스트 파이프라인 + Podcast DB |
| 내 서랍 | 프론트엔드 Mock | Personal DB + Vector DB 유사도 |

---

## 12. 파일 크기 참고

| 파일 | 줄 수 | 설명 |
|------|-------|------|
| `FeedPage.tsx` | ~1,800 | 앱의 중심 컴포넌트 (5개 탭) |
| `s3_xml_client.py` | ~898 | S3 XML 파싱 + 카테고리 정규화 |
| `dynamodb_client.py` | ~775 | DynamoDB 전체 CRUD |
| `saju_handler.py` | ~600+ | 사주 분석 (순수 로직) |
| `search_handler.py` | ~353 | GSI 최적화 검색 |
| `mbti_transform_service.py` | ~408 | MBTI 변환 서비스 |
| `article_collector.py` | ~419 | 기사 수집 파이프라인 |
| `chatbot_handler.py` | ~385 | AI 챗봇 |
| `engagement_handler.py` | ~539 | 반응/댓글/별점 |
| `user_handler.py` | ~545 | 유저 프로필/통계/뱃지 |
| `famousBirthdays.ts` | ~128KB | 365일 유명인 생일 데이터 |
| `nt.md` / `nf.md` / `st.md` / `sf.md` | 각 250~287줄 | MBTI 프롬프트 |
