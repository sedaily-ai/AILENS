# 2026-08-07 SEO/AEO/GEO 대응 — 레터·웹툰 상세 SSG 렌더링 버그 4건 수정

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

## 다음

- `/paper` 라우트는 front-page API가 복구되면 그때 같은 패턴(generateStaticParams +
  generateMetadata + JSON-LD + initialX prop seeding)으로 전환.
- 오늘 고친 `mounted` 게이트·`cache: 'no-store'` 패턴이 다른 미전환 라우트에도 잠재해
  있을 수 있음 — 새 라우트를 SSG로 전환할 때마다 이 두 가지를 체크리스트로 확인할 것.
