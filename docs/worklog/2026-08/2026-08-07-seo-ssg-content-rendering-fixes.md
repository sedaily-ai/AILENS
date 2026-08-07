# 2026-08-07 SEO/AEO/GEO 대응 — 레터·웹툰 상세 + 나머지 전체 라우트 SSG 감사

작성: Claude Code
관련: `docs/architecture/2026-08-07-rendering-strategy-decision.md`(이 작업의 설계 근거),
계획 파일 `~/.claude/plans/cozy-squishing-balloon.md`

## 배경

렌더링 전략을 SSG + 발행 시 재빌드로 확정한 뒤(위 아키텍처 결정 문서 참조), 실제로
`/letters/[id]` 정적 페이지가 크롤러에게 완성된 콘텐츠를 주는지 검증하다가, 겉으로는
정상처럼 보이던 이 라우트가 사실 **처음부터 한 번도 제대로 작동한 적이 없었다**는 걸
발견했다. 이번 세션은 그 원인 4가지를 찾아 고친 기록이다.

## 한 것 — 발견·수정한 버그 4건

**1. `generateStaticParams`가 죽은 API를 보고 있었음.** `/letters/[id]/page.tsx`가
`today-letters`(구 AI 파이프라인 `daily_letters` 테이블) API를 호출하고 있었는데, 이
테이블은 2026-08-04 RDS pgvector-v2 삭제로 영구히 빈 응답만 반환한다(CLAUDE.md에 이미
기록된 사실). 그 결과 이 페이지는 항상 `placeholder-1970-01-01` 하나만 정적 생성해왔다.
실제 콘텐츠는 전부 CMS(DynamoDB) 경로로 발행되고 있어, `today-letters` 대신
`/api/v2/posts?channel=letters&date=...`를 보게 고쳤다. `sitemap.ts`도 같은 API를 보고
있어서 동일하게 수정.

**2. `mounted` 게이트가 SSG 출력을 항상 빈 화면으로 만들고 있었음.**
`LetterDetailClient.tsx`가 `loadState === 'loading' || !letter || !mounted` 일 때 빈
`<div>`만 반환하는데, `mounted`는 `useEffect`에서만 `true`가 된다 — 그런데 `useEffect`는
빌드타임(정적 생성) 렌더에서는 절대 실행되지 않는다. 즉 1번을 고쳐서 진짜 데이터가
와도, 이 게이트 때문에 정적 HTML에는 여전히 빈 화면만 구워지고 있었다. 서버에서 이미
`findLetter()`로 가져온 데이터를 `initialLetter` prop으로 클라이언트 컴포넌트에
내려주고, 그게 있으면 mount를 안 기다리게 게이트를 수정했다.

**3. (가장 심각) URL 인코딩된 슬러그를 디코딩하지 않고 있었음.** 한글 슬러그라 Next가
정적 export 시 동적 세그먼트의 `params.id`를 URL-encode된 채로 넘기는데(`%EC%8B%A0...`),
`findLetter(id)`가 이 인코딩된 문자열을 디코딩 없이 그대로 비교에 썼다. 그 결과
`generateMetadata`와 페이지 본체 양쪽에서 `findLetter`가 **단 한 번도 성공적으로 글을
찾은 적이 없었다** — 1·2번을 다 고쳐도 이 버그 때문에 여전히 모든 레터 상세가 "찾을 수
없어요"로 떴다. `decodeURIComponent(rawId)` 추가로 해결. 콘솔에 임시 로그를 찍어서
실측으로 확인한 뒤 고쳤다(`params`에서 받은 원본 문자열이 실제로 `%EC%8B%A0...` 형태였음).

**4. `fetchWebtoons()`의 `cache: 'no-store'`가 빌드 안정성을 깨고 있었음.**
`/webtoon/[slug]`로 전환하며 새로 만든 라우트가 간헐적으로 "웹툰을 찾을 수 없어요"로
떨어지는 걸 발견 — `generateStaticParams`는 성공했는데 `generateMetadata`/페이지 본체의
같은 함수 호출이 빈 배열을 받는 재현이었다. 원인은 `fetchWebtoons()`가
`fetch(url, { cache: 'no-store' })`를 쓰고 있던 것 — 이 옵션이 Next의 빌드타임 요청
중복제거(Data Cache)까지 꺼버려서, 빌드 워커 9개가 동시에 같은 URL을 fetch할 때 매번
개별 네트워크 호출이 되고 그중 일부가 부하로 실패했다. `letters/[id]`의 동일 목적
함수(`fetchLettersForDate`)는 애초에 `cache` 옵션을 안 줘서(기본값 = 중복제거) 이
문제가 없었다. `cache: 'no-store'` 제거로 해결 — 이 함수는 이미 자체 `cached()` 래퍼로
5분 캐시를 갖고 있어 신선도 손실은 없다.

## 그 외 한 것

- `/webtoon/view?id=` → `/webtoon/[slug]` 경로 전환. `generateMetadata` + JSON-LD(`Article`)
  추가. 진입 링크(`WebtoonPreviewSection.tsx`, `webtoon/page.tsx`) 갱신, 구 파일 삭제.
- `letterHref()` — 오늘 아침 고친 CloudFront `_rsc` 폴백 버그(별도 worklog:
  `2026-08-07-cloudfront-rsc-navigation-bug.md`) 때문에 `/letters/view?id=` 워크어라운드를
  쓰고 있었는데, 근본 원인이 없어졌으니 `/letters/[id]` 직결로 원복.
- `sitemap.xml`에 웹툰 URL 추가(전엔 레터만 있었음).
- `robots.txt` 감사 — 이미 GPTBot/ClaudeBot/PerplexityBot/Google-Extended 등 AI 크롤러가
  전부 명시적으로 허용돼 있어 수정 불필요.
- `/paper/article`(지면기사 상세)은 경로 전환 대상에서 제외 — `/api/v2/front-page` API가
  이미 죽어있어(RDS 삭제, `{"message":"Not Found"}` 직접 확인) 전환할 실제 콘텐츠가 없음.
- 발행 시 자동 재빌드(CodeBuild)는 만들지 않기로 결정 — 지금 발행 빈도엔 수동
  `./deploy.sh`로 충분하다고 판단. 상세 근거는 계획 파일 4단계 참조.

## 결정

- `paper`/`front-page`는 API가 죽어있어 이번 스코프에서 완전히 제외. 되살리려면 별도
  작업(RDS 복구 또는 API 재구축)이 먼저 필요.
- `fetchWebtoons()` 하나만 `cache: 'no-store'` 제거 — 같은 파일의 `fetchTrendCards`,
  `fetchVideos`, `fetchCmsPostBySlug` 등 다른 함수도 같은 옵션을 쓰지만, 이번에 실제로
  건드린 라우트(webtoon)만 스코프로 잡고 나머지는 안 건드렸다. 다른 라우트를 SSG로
  전환할 때 같은 증상이 나오면 그때 같이 고칠 것.

## 검증

- `npm run build` 후 `out/letters/*.html`, `out/webtoon/*.html`을 직접 열어 `<body>` 텍스트를
  파싱 — 실제 기사 본문이 그대로 박혀 있는 것을 확인(JS 실행 없이).
- JSON-LD `articleBody`도 실제 텍스트로 채워짐(신용점수 레터 기준 2797자) 확인.
- `sitemap.xml`에 레터 40개 + 웹툰 1개가 실제 슬러그로 나열되는 것 확인.

## 다음 (위 섹션 시점 기준 — 아래 이어서 전부 처리함)

---

## 이어서 한 것 (같은 날 후속 세션) — "나머지 콘텐츠 라우트도 SSG 감사 한번 돌려주시죠" → "전체 다"

위 4건을 고친 뒤, 나머지 라우트 전체를 감사해 SSG 격차를 마저 잡았다. 순서대로:

### 감사 결과 — 대부분은 정상(제외 대상)이었음

- `/timemachine`, `/saju-match`, `/timeline` — 계획 파일에 이미 "게임/사주/타임라인 등
  인터랙티브 툴은 SEO 대상 제외"로 명시된 라우트. `/timemachine`은 진단 중 임시로 뺐던
  `Suspense`를 원복해 빌드만 정상화(`useSearchParams()` + 정적 export 조합은 Suspense
  fallback만 굽는 게 Next.js의 의도된 동작 — `missing-suspense-with-csr-bailout`).
- `/dna` — 로그인 사용자별 누적 통계라 애초에 개인화 콘텐츠, SSG 대상 아님.

### mock/죽은 API 페이지 삭제 (사용자 지시: "목업페이지 다 삭제, 필요없는건 다 삭제")

- **`/today`** — `TodayLensClient.tsx` 전체가 "문영광"이라는 가상 인물의 사주·추천
  이유·주간 통계까지 전부 하드코딩된 mock. 실백엔드 연동 자체가 없었다.
- **`/today/preview`** — 코드 주석에 "production today-letters API 결과를 그대로
  보여주는 검증 페이지"라고 명시된 내부 디버그 도구. 호출하는 `today-letters` API도
  RDS 삭제로 죽어있어 검증 목적 자체가 이미 달성 불가능한 상태였음.
- **`/paper`, `/paper/article`** — 감사 중 추가 발견. `/api/v2/front-page`를 직접
  `curl`로 찔러보니 404("Not Found") — RDS 삭제 여파로 라우트 자체가 없어진 상태.
  `features/front-page` 모듈째로 정리(어디서도 안 쓰임 확인 후 삭제).
- 넷 다 내부 링크 0건 확인 후 삭제, `git status`로 잔여 참조 없음 검증.
- `/letters/view`는 살려뒀다 — mock이 아니라 실제 CMS 데이터를 `?id=`로 여는, 옛 공유
  링크 호환용으로 여전히 동작하는 페이지라 "불필요"에 해당하지 않는다고 판단.

### `/letters`, `/webtoon` 목록 페이지 SSG 전환

- 둘 다 전체가 `'use client'`라 정적 HTML에 목록 스켈레톤만 있었음. 서버 컴포넌트로
  전환해 빌드타임에 실제 목록을 굽게 함(상세 페이지 때와 동일 패턴).
- `buildArchiveItems()`를 `'use client'` 파일에서 서버 컴포넌트가 못 부르는 문제가 나서
  순수 로직만 `letters/archiveItems.ts`로 분리(서버/클라이언트 공용).
- `cmsPostsApi.ts`의 `fetchCmsPosts`/`fetchTrendCards`/`fetchWebtoons`/`fetchVideos`
  전부에서 `cache: 'no-store'` 제거 — 위 4번 버그와 동일 원인, 이번엔 리스트용 함수까지
  전부 스코프에 넣어 한 번에 정리.

### 홈페이지(`/`) — 가장 큰 작업

정적 HTML이 192자(nav/footer뿐)였다. 진단 결과 `FeedPage.tsx`(743줄, 5탭)의 실제 구조:

- `articles`/`loading` state + `/api/v2/feed` fetch + `mockArticles` 폴백(~100줄)이
  **완전히 죽은 코드**였다 — `NewsFeedTab.tsx`가 props로 받기만 하고 JSX 어디서도 안
  씀(grep으로 확인). `/api/v2/feed`도 Transform 파이프라인 삭제로 영구히 빈 배열만
  반환. `openArticle`/`viewArticle`/`ArticleView` 오버레이·`archiveSentence`까지 이
  죽은 흐름에 딸려 있어 연쇄 삭제.
- 실제 렌더되는 건 `NewsFeedTab` 안의 개별 섹션 5개(`FollowingFeed`(이슈 톡톡),
  `WebtoonPreviewSection`, `VideoPreviewSection`, `WordsPreviewSection`(단어 퀴즈),
  `MiniHeadlinesSection`) — 전부 지금까지와 동일한 `useState(null)+useEffect(fetch)`
  패턴. `TimelinePreviewSection`/`TrendingEconomySection`/`ColumnPreviewSection`/유료
  헤드라인 잠금 UI는 코드 주석에 이미 "다른 팀원이 이어서 작업"/"아직 실제 데이터
  없어서 목업"이라고 명시된 의도적 placeholder라 안 건드림.
- `FollowingFeed`의 "최대 14일 역순 조회" 로직을 `todayLettersApi.ts`의
  `fetchFollowingLetters()`로 추출해 서버(`page.tsx` 빌드타임)·클라이언트(갱신 effect)
  공유. `WordsPreviewSection`도 동일 패턴(`fetchFollowingWordTerms()`).
- `todayLettersApi.ts`의 `fetchTodayLettersLive()`도 `cache: 'no-store'`를 쓰고 있어서
  미리 제거(같은 버그 재발 방지 — `FollowingFeed`를 빌드타임에 부르기 전 필수 선행 작업).
- **props를 다 연결했는데도 정적 HTML이 여전히 192자였던 게 진짜 막힌 지점** —
  `FeedPage.tsx`가 내부에서 `useSearchParams()`(`?tab=` 동기화용)를 직접 호출하고
  있어서, `/timemachine`과 완전히 같은 이유로 전체 서브트리가 CSR bailout돼 Suspense
  fallback(빈 스피너)만 정적 HTML에 구워지고 있었다. 이건 승인된 계획 범위 밖이라(파일
  상단에 "다른 에이전트가 소유한 컴포넌트, 이번 정리 범위 밖" 주석 있음) 사용자에게
  확인 후 진행 — `useSearchParams()` 훅을 없애고 `window.location.search`를
  `useEffect` 안에서 직접 읽는 방식으로 교체(`activeTab` 초기값은 서버/클라이언트
  둘 다 항상 `"feed"`로 고정해 hydration 일치 보장, `?tab=archive` 같은 경우는 마운트
  후 effect가 보정).
- `WordsPreviewSection`의 단어 퀴즈 `shuffle()`이 `Math.random()`을 써서, 서버 빌드
  시점과 클라이언트 첫 렌더의 셔플 순서가 어긋나 hydration mismatch가 날 뻔했다 —
  `qIndex` 기반 seed로 결정되는 PRNG(mulberry32)로 교체해 해결.
- 결과: 정적 HTML 텍스트 192자 → **4,018자** (실제 레터 헤드라인·웹툰 1화·단어 퀴즈
  본문 전부 포함).

## 결정 (후속 세션)

- `/today`·`/today/preview`·`/paper`·`/paper/article`은 되살리지 않고 완전 삭제 —
  실데이터 연동이 없거나(today) 백엔드 자체가 죽어있어서(paper) "복구 후 전환"이 아니라
  "필요 없어지면 지운다" 원칙 적용.
- 홈페이지의 `TimelinePreviewSection` 등 의도된 placeholder 섹션은 손대지 않음 — SSG
  버그가 아니라 제품 로드맵상 미완성 상태.
- `FeedPage.tsx`의 `useSearchParams()` 제거는 원래 스코프 밖이었지만, 이게 없으면 홈
  SSG 자체가 불가능해 사용자 확인 후 진행.

## 검증 (후속 세션)

- `npm run build` + `npm run lint` 통과, 이번에 건드린 파일에서 새로 발생한
  에러/경고 없음(기존에 있던 무관한 파일의 에러는 그대로 — 내 변경 범위 밖).
- `out/index.html`·`out/letters.html`·`out/webtoon.html` 등 body 텍스트 추출로 실제
  콘텐츠 확인.
- 커밋(`286e0d4`) → 푸시 → `./deploy.sh` 배포 → 프로덕션에서 `curl`로 홈페이지 4,018자
  재확인, `/today`·`/paper`가 200(CloudFront가 없는 경로를 홈으로 폴백시키는 기존 동작
  — S3 원본 파일 자체는 삭제 로그로 확인됨, 새로 만든 문제 아님).

## 다음

- CloudFront가 삭제된 경로(`/today`, `/paper`)를 진짜 404 대신 홈페이지로 조용히
  폴백시키는 기존 동작 — 문제라고 판단되면 별도로 다룰 것(이번 스코프 아님).
- `fetchCmsPostBySlug`/`fetchWebtoonBySlug`(단건 조회, `no-store` 유지)는 이번에
  안 건드렸음 — 빌드타임 대량 호출 루프에서 안 쓰여서 지금까지 문제가 안 됐지만, 이
  함수들도 빌드타임 경로에 새로 쓰이게 되면 같은 버그가 재발할 수 있음.
- 홈페이지는 SEO 관점에서 `activeTab === "feed"`(기본 탭)만 SSG 대상으로 잡았다 —
  `question`/`archive`/`dna` 탭은 URL 기본 진입 시 안 보이는 탭이라 그대로 클라이언트
  전용으로 남겨둠, 필요해지면 그때 같은 패턴으로 전환.
