# 2026-08-23 /lens·/webtoon 캐시 복구 + 프리페치 즉시 전환 + SEO/GEO/AEO 점검

작성: 영광 + Claude Code
관련: `3ab8a99` (perf: /lens, /webtoon 목록 캐시 복구 + 프리페치 즉시 전환 + AEO/robots 보강)

## 배경

"사이트 반응속도가 느려졌다(클릭하면 2초 뒤에 넘어간다)"는 신고로 시작했다.
서버 리소스(PM2 재시작 횟수·CPU·메모리)를 먼저 의심했으나 조사 결과 실제
문제는 없었다(누적 배포 재시작 이력일 뿐). 이어서 "업비트·토스 같은 금융권은
프론트를 어떻게 더 빠르게 만드나"는 질문에 CDN/RSC/낙관적 UI/워터폴 제거를
설명했는데, 사용자가 직접 코드로 검증해보라고 요청 → 검증 과정에서 CDN이
이미 잘 붙어있다는 걸 확인(이전 세션에서 "CDN 없다"고 잘못 알고 있던 것도
같이 정정)했고, `/lens`·`/webtoon` 목록 페이지만 CDN 캐시를 전혀 못 타는
실제 버그를 발견했다. 이어서 "스켈레톤·스피너 같은 체감 효과 말고 진짜
빠르게"라는 요청으로 상단 진행 바(NavProgress)도 같이 걷어냈다. 마지막으로
"검색엔진·AI가 잘 찾아오도록"이라는 요청으로 SEO/GEO/AEO 상태를 점검했다.

## 한 것

- **`/lens`, `/webtoon` 목록 캐시 복구**: 두 페이지가 `?page=N` 페이지네이션을
  서버 컴포넌트에서 `searchParams`로 읽고 있었는데, Next.js는 `searchParams`를
  읽기만 해도 그 라우트 전체를 dynamic(캐시 불가)으로 처리한다. 실측
  TTFB 800ms대, `x-cache: Miss from cloudfront` 고정이었던 걸 확인. 페이지네이션을
  `/lens/page/[n]`, `/webtoon/page/[n]` 경로로 옮기고(`generateStaticParams`로
  실제 총 페이지 수만큼 사전 생성), 1페이지(`/lens`, `/webtoon` 자체)는
  `searchParams`를 아예 안 읽게 해서 `[slug]` 페이지들과 같은
  force-cache+revalidate 캐시를 되찾았다.
  - 새 파일: `lens/lensListShared.ts`, `lens/page/[n]/page.tsx`,
    `webtoon/webtoonListShared.ts`, `webtoon/page/[n]/page.tsx`
    (메타데이터·JSON-LD·PAGE_SIZE를 목록 페이지와 페이지네이션 페이지가
    공유하기 위해 분리).
  - `LensListClient.tsx`, `WebtoonListClient.tsx`의 페이지 버튼 href를
    `?page=N` → `/lens/page/N`(`lensPageHref`/`webtoonPageHref` 헬퍼)로 교체.
  - 옛 `?page=N` 링크(검색엔진 인덱싱분 포함) 리다이렉트: 처음엔
    `next.config.ts`의 `redirects()`+`has`(쿼리 매칭) 조합으로 시도했으나,
    Next가 `has`로 잡은 쿼리를 destination에 캡처값으로 꽂아 넣어도 원본
    쿼리스트링을 안 지워서 `/lens/page/2?page=2`처럼 지저분한 URL이 됐다.
    `src/middleware.ts`(신규, `/lens`·`/webtoon`에만 스코프)로 옮겨 해결.
- **즉시 전환(체감 트릭 없이)**: `next.config.ts`에
  `experimental.staleTimes: { dynamic: 30, static: 180 }` 추가 — `[slug]`
  페이지들은 이미 `generateStaticParams`로 `<Link>` 프리페치가 켜져 있었는데
  staleTimes 미설정 시 Next 기본값이 보수적이라 프리페치해둔 데이터를 두고도
  클릭 시 재요청하는 경우가 있었다. 상단 진행 바(`widgets/NavProgress`)는
  `providers.tsx`에서 렌더링을 뺐다 — 실제 전환이 끝나도 최소 460ms짜리
  페이드아웃 애니메이션을 강제해 오히려 느려 보이게 만들고 있었다
  (컴포넌트 파일 자체는 남겨둠, 필요시 되돌릴 수 있게).
- **SEO/GEO/AEO 점검**: robots.txt·sitemap.xml·news-sitemap.xml·루트
  JSON-LD(WebSite+NewsMediaOrganization)·`[slug]` 페이지의 NewsArticle+
  speakable·`llms.txt`까지 이미 여러 세션에 걸쳐 상당히 꼼꼼히 돼있는 걸
  확인했다(전면 재작성은 안 함 — 아래 결정 참조). 그중 실제로 어긋난 것만 수정:
  - `public/llms.txt`: 폐기된 `/issue-talk`을 독립 콘텐츠처럼 3군데(콘텐츠
    형식·주요 페이지·E-E-A-T)에서 설명하고 있었음(실제로는 `/archive`로
    301). "하루 한 이슈"라는 문구도 실제 발행량(14~18건/일)과 안 맞았음
    (2026-08-14에 lens 페이지 자체 카피에서는 이미 걷어냈던 문구인데
    llms.txt만 안 고쳐져 있었다). `/archive`가 2026-08-20부터 lens도
    포함한다는 것도 반영. 새 페이지네이션 URL 패턴 추가.
  - `public/robots.txt`: `Bingbot` 명시 추가(원래 `*` 그룹으로 이미
    허용되고 있었지만 확인차), `Applebot`/`Applebot-Extended`(Apple
    Intelligence/Siri), `meta-externalagent`(Meta AI), `Amazonbot`,
    `DuckAssistBot` 추가. Gemini는 별도 크롤러 토큰이 없어(기존
    `Google-Extended`+`Googlebot`으로 이미 커버) 추가 안 함.
- **백링크 관계 확인**: "서울경제신문으로 검색해도 AI LENS가 뜨게" 요청에
  실측 — `sedaily.com`·`en.sedaily.com` 어디에도 `ailens.sedaily.ai`로
  가는 링크가 없음(AI LENS → sedaily.com은 JSON-LD `sameAs`로 이미 있는데
  반대 방향이 없는 일방향 관계). 이건 이 저장소 코드로 고칠 수 있는 부분이
  아니라 sedaily.com 관리 팀에 메인 사이트 링크 추가를 요청해야 함 —
  보류(다음 참조).
- 배포: `service/frontend/deploy.sh` 1회 실행, `https://ailens.sedaily.ai/`
  헬스체크 200 확인. `/lens`·`/webtoon` 캐시 헤더, `/lens?page=2` 리다이렉트,
  robots.txt·llms.txt 반영 실측으로 재확인.

## 결정

- **URL 구조 전면 개편(카테고리 prefix 등)은 하지 않기로 함** — 사용자가
  "lens 라는 경로가 유의미할까, 카테고리 붙은 URL이 더 효과적이지 않나"로
  제안했으나, (1) 구글 공식 입장상 URL 키워드는 랭킹에 거의 영향 없고
  (2) 지금 슬러그가 이미 날짜+키워드를 담고 있어 카테고리 prefix가 하려는
  일을 사실상 하고 있으며 (3) 카테고리는 발행 후 재분류될 수 있어 URL에
  박으면 오히려 깨지기 쉽고 (4) 이미 인덱싱된 라이브 URL을 전부 리다이렉트
  매핑해야 하는 리스크가 실질적 — 얻는 것 대비 리스크가 커서 보류를 권했고
  사용자도 동의.
- 쿼리스트링 옛 링크 리다이렉트는 `next.config.ts`의 `has` 기반이 아니라
  `middleware.ts`로 — 위 "한 것" 참조, `has`+쿼리 캡처가 원본 쿼리를 안
  지우는 게 Next.js 자체의 한계로 보여 우회.

## 다음

- sedaily.com/en.sedaily.com에 AI LENS로 가는 링크(GNB·푸터·기사 하단 등)를
  넣어달라고 해당 팀에 요청 — 이 저장소 범위 밖이라 별도 채널로 전달 필요.
- `/lens/page/[n]`·`/webtoon/page/[n]` 신규 라우트가 실제로 검색엔진에
  크롤링·인덱싱되는지는 시간을 두고 Search Console에서 확인.
