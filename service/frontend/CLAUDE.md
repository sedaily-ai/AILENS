# MBTI 뉴스앱 — 아키텍처 규칙

## 기술 스택
- Next.js 16.2.2 (App Router, src/app/)
- React 19.2.4 + TypeScript 5
- Tailwind CSS v4
- 상태 관리: React Context (AuthContext)
- 데이터 페칭: useEffect + fetch (라이브러리 미사용)
- 테스트: 없음 (리팩토링 시 동작 보존 최우선)

## 명령어
- 린트: `npx next lint`
- 타입 체크: `npx tsc --noEmit`
- 빌드: `npm run build`
- 수정 후 반드시 빌드 확인할 것

## 아키텍처: Feature-Sliced Design (FSD)

### 목표 폴더 구조
```
├── app/                         # Next.js 라우팅 전용 (re-export만)
│   ├── (auth)/login/
│   ├── (auth)/auth/callback/
│   ├── (main)/                  # 메인 피드 (기본 경로)
│   ├── (main)/elderly/
│   ├── (main)/timeline/
│   ├── (main)/timemachine/
│   ├── (main)/subscription/
│   ├── (main)/listen/
│   └── layout.tsx
└── src/
    ├── app/                     # FSD app 레이어 (providers, global config)
    ├── pages/                   # FSD pages (features 조합)
    ├── widgets/                 # Header, BottomNav, AudioPlayer 등
    ├── features/
    │   ├── auth/                # 로그인, 콜백, 세션 관리
    │   ├── news-feed/           # 뉴스 피드 탭 (기사 목록, 날짜 선택, 상세)
    │   ├── question/            # AI 질문/퀴즈 탭
    │   ├── community/           # 커뮤니티 탭 (게시글, 댓글, 투표, 랭킹)
    │   ├── archive/             # 내 서랍 탭 (저장 문장/기사)
    │   ├── news-dna/            # 뉴스 DNA 탭 (관심 분석, 생일)
    │   ├── elderly/             # 어르신 모드
    │   ├── timeline/            # 타임라인 뉴스
    │   ├── timemachine/         # 과거 날짜 뉴스
    │   ├── subscription/        # 구독 관리
    │   ├── onboarding/          # 사용자 온보딩
    │   ├── story/               # 스토리 뉴스
    │   └── admin/               # 관리자 기능
    ├── entities/
    │   ├── article/             # 기사 도메인 모델
    │   ├── user/                # 사용자 도메인 모델
    │   └── post/                # 게시글 도메인 모델
    └── shared/
        ├── ui/                  # 공통 UI (LoadingSpinner 등)
        ├── hooks/               # 공통 훅
        ├── lib/                 # API 클라이언트, readingTracker 등
        ├── data/                # mbtiGroups 등 공통 데이터
        ├── config/              # API config 등
        ├── types/               # 공통 타입
        ├── constants/           # 공통 상수
        └── utils/               # analytics, 유틸 함수

### 의존성 방향 (단방향만 허용)
- app → pages → widgets → features → entities → shared
- 같은 레이어 간 import 금지 (features/auth → features/community ❌)
- 하위에서 상위 import 금지 (shared → features ❌)

### Feature 모듈 구조
```
features/[feature-name]/
├── components/
├── hooks/
├── services/
├── types/
└── index.ts         # 공개 API — 외부 노출용만 export
```

### index.ts 규칙
- 외부에서는 index.ts 통해서만 import
- ✅ `import { NewsFeedTab } from '@/features/news-feed'`
- ❌ `import { ArticleCard } from '@/features/news-feed/components/ArticleCard'`

## 수정 범위 제한 (필수)

### 반드시 지킬 것
1. 요청받은 feature 폴더만 수정
2. 다른 feature 폴더 파일 절대 수정하지 않음
3. shared/ 수정 필요 시 먼저 설명하고 승인 받기
4. app/ 폴더는 page.tsx re-export만 수정 가능
5. 수정 후 반드시 `npx tsc --noEmit` 실행하여 타입 에러 확인

### 절대 하지 말 것
- feature 간 직접 import
- shared/에 특정 feature 전용 코드 넣기
- index.ts 거치지 않는 deep import
- 기존 동작을 변경하는 리팩토링 (구조만 바꿀 것)

## 리팩토링 안전 규칙 (테스트 없음 주의)
- 현재 테스트 코드가 없으므로 동작 보존이 최우선
- 리팩토링 = 구조 변경만, 로직 변경 없음
- 한 번에 하나의 작업만 (파일 이동 OR 컴포넌트 분리, 둘 다 동시에 X)
- 변경 후 반드시 빌드(`npm run build`) 성공 확인
- 의심스러우면 멈추고 물어볼 것

## 코드 스타일
- 컴포넌트: PascalCase (LoginForm.tsx)
- 폴더: kebab-case (news-feed/)
- 훅: useXxx (useArticles.ts)
- 타입: PascalCase (ArticleData)
- 상수: UPPER_SNAKE_CASE
- any 사용 금지 → unknown + 타입 가드
- useEffect는 파생 상태 계산에 사용 금지

## 파일 네이밍 컨벤션

### 기본 규칙
- 컴포넌트 (.tsx): PascalCase — `LoginButton.tsx`, `ArticleCard.tsx`
- 훅 (.ts): camelCase + use 접두사 — `useArticles.ts`, `useAuth.ts`
- 유틸/서비스/lib (.ts): camelCase — `formatDate.ts`, `apiClient.ts`
- 타입 (.ts): camelCase — `article.ts`, `user.ts`
- 상수 (.ts): camelCase — `categories.ts`, `reporterNames.ts`
- 데이터 (.ts): camelCase — `mbtiGroups.ts`, `famousBirthdays.ts`
- 폴더: kebab-case — `news-feed/`, `news-dna/`, `time-machine/`
- kebab-case 파일 금지 (폴더만 kebab-case)

### 네이밍 원칙
- 파일명만 보고 역할을 알 수 있어야 함
- 너무 일반적인 이름 금지 (api.ts ❌ → apiClient.ts ✅)
- 접미사로 역할 표시:
  - UI 컴포넌트: 접미사 없음 또는 역할 (`ArticleCard`, `LoginButton`)
  - 페이지 컴포넌트: ~Page (`FeedPage`, `OnboardingPage`)
  - 모달: ~Modal (`WritePostModal`, `CompareModal`)
  - 탭: ~Tab (`QuestionTab`, `CommunityTab`)
  - 훅: use~ (`useArticles`, `useAudioPlayer`)
  - 서비스: ~Service (`postService`, `authService`)
  - API: ~Api (`articleApi`, `timeMachineApi`)
  - 유틸: 동사 또는 설명적 이름 (`formatDate`, `convertByline`)
  - 타입: 도메인명 (`article.ts`, `user.ts`)

## FSD 이행 현황 (2026-08-23 기준 — 코드 리팩토링 감사 때 재확인·갱신)

### 완료된 이동
- @/data/mbtiGroups → shared/data/mbtiGroups (완료, 옛 경로 참조 0건)
- @/config/api → shared/config/api (완료)
- @/contexts/AuthContext → entities/user/contexts/AuthContext (완료)
- `src/components/`(옛 mbti/story/timeline/character, 2026-08-05 문서에
  "6000줄+"로 기록됐던 폴더) — **완전히 삭제됨**, 더는 존재하지 않음.
  `entities/saju`, `entities/user` 2개는 생겼지만 `entities/article`,
  `entities/post`는 여전히 없음.

### pages 레이어 — 여전히 0% 구현
- `src/pages/` 폴더 자체가 여전히 없음
- 대신 `src/app/` 라우트 폴더 밑에 있는 `*ViewClient.tsx`/`*ListClient.tsx`
  (예: `lens/[slug]/LensViewClient.tsx` 1666줄, `letters/[id]/LetterDetailClient.tsx`
  1520줄)와 `widgets/FeedPage/FeedPage.tsx`(506줄, `/` 라우트의 실제 진입점)가
  사실상 "페이지 조합" 역할을 비공식으로 담당 중 — 큰 구조 결정이 필요해서
  이번 라운드에서도 손대지 않음(별도 승인 필요한 항목으로 분류, 코드
  리팩토링 감사 결과 참조).

### widgets/ — 스캐폴딩 아님, 실사용 중
- `widgets/Header/`: 배럴(`index.ts`) 있음
- `widgets/NavProgress/`, `widgets/SiteFooter/`: 배럴 있음
  (`app/layout.tsx`, `app/providers.tsx`가 배럴 경유로 import)

### 남은 위반 (2026-08-23 기준)
- deep-import: 2026-08-05엔 18건이었으나 대부분 해소됨(`fortune`/`couple-match`
  등은 사주 기능이 2026-08-09 완전 독립 앱으로 분리되며 이 코드베이스에서
  사라짐). 이번 라운드에서 새로 발견된 2건(`features/timeline` 컴포넌트를
  `page.tsx`/`TimelineDayClient.tsx`가 직접 import)도 배럴 경유로 수정 완료.
- `features/dna → features/news-feed` lateral import — `features/dna` 자체가
  없어져서 더는 해당 없음.
- `shared → widgets` 역방향 의존성 1건(해소됨) — `shared/ui/CategoryArchiveClient.tsx`가
  `widgets/Header`를 import하고 있었다. 페이지 조합 로직이 `shared/ui`에
  잘못 놓인 것이었다는 판단대로, `economyCategoryPage.tsx`(같은 성격, 서버
  데이터 페칭+메타데이터+렌더 조합)와 함께 `widgets/CategoryArchiveClient/`로
  이전(2026-08-24, 배럴 신설·소비자 8곳 import 경로 수정, `EconomyCategoryPage`로
  개명).

### 2026-08-05 정리 라운드 1 + 2026-08-23 정리 라운드 2 완료 내역
- (2026-08-05) `FeedPage.tsx` 죽은 코드 제거 1차: 도달 불가능한 팟캐스트
  플레이어·페이월 블록(~550줄) 삭제. 2171줄 → 1623줄.
- (2026-08-05) `features/dna/index.ts`, `widgets/NavProgress/index.ts`,
  `widgets/SiteFooter/index.ts` 배럴 신설.
- (2026-08-23) `FeedPage.tsx` 죽은 코드 제거 2차: 미사용 import·완전히
  죽은 state/핸들러(텍스트 선택 기능 전체 등) 삭제. 571줄 → 506줄
  (2026-08-05 이후 다른 세션에서 이미 1623→571로 더 줄어 있었음).
- (2026-08-23) `SITE_URL`(21개 파일 재정의) → `shared/constants/site.ts`
  중앙화, API Gateway URL 재하드코딩 3건 → `apiClient.ts` 경유로 통일,
  `features/timeline` deep-import 2건 수정, `set-state-in-effect` 안티패턴
  6곳 정리, `AuthContext.tsx`의 `any` 7곳 → `unknown`+타입가드 교체.
