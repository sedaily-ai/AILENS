# 2026-08-14 — SEO/GEO/AEO 종합 감사 및 수정

## 배경

전날 lens 3차 배치 업로드 후 "구글 검색했을 때 4가지 시선 게시글이 잘 뜨나요?" 질문에서 시작. 1차 조사에서 lens 상세 페이지 자체는 기술적으로 이미 잘 돼있음(canonical/robots/OG/JSON-LD NewsArticle 완비, 본문이 실제 텍스트로 SSR)을 확인했지만, `/lens` 목록 페이지의 페이지네이션이 크롤 불가능한 구조라는 구멍을 발견. 이어서 "AI에게 잘 걸릴만한 작업을 이전에 올라간 것까지 전부 교과서적으로 해달라"는 요청으로 범위를 사이트 전체로 확장.

## 리서치로 확인한 사실 (착수 전)

- **구글 FAQ 리치 결과는 2026-05-07부로 완전히 폐기됨**(2023년 정부·의료 사이트로 축소된 데 이어 최종 폐기). lens 페이지가 `FAQPage` 타입을 안 쓰고 `NewsArticle.mainEntity`에 `ItemList`(Question/Answer 중첩)로 Q&A를 얹은 기존 설계가 결과적으로 정확한 선택이었음 — 그대로 유지, 추가 변경 없음.
- **Speakable(`SpeakableSpecification`) 스키마**: 원래 Google Assistant TTS용이지만, 2026년 기준 Perplexity/ChatGPT/AI Overviews가 "우선순위 콘텐츠" 신호로 실제 사용 중(2026-05 웹 인덱스 기준 10만~100만 도메인 채택). 이번 작업에서 신규 추가.
- GEO 2026 모범사례: 구조화된 리스트/통계/직접답변 블록이 AI 응답 인용률을 높인다는 컨센서스 확인 — lens의 4가지 시선 Q&A 포맷은 이미 이 패턴에 부합.

## Explore 에이전트 전수 감사 결과

`service/frontend/src` 전체를 감사해 확정한 갭 4가지(문제없다고 확인된 항목: 이미지 alt 텍스트, robots.txt, OG 이미지 폴백, webtoon/video 상세 페이지 JSON-LD 기본기, letters/archive/column/trend/issue-talk/video/words의 내부링크 구조):

1. `/lens`, `/webtoon` 목록 페이지네이션이 `<button onClick={setPage}>` 방식 — 서버 첫 HTML엔 최신글+8~12개만 `<a href>`로 존재, 나머지는 크롤러가 못 밟음.
2. 홈페이지(`/`)에 `<h1>`이 0개 — `widgets/FeedPage`, `features/news-feed` 전수 검색 결과.
3. `public/llms.txt`에 `/lens`, `/issue-talk` 채널 언급이 0건(둘 다 실제 라이브 라우트인데 최근 생긴 채널이 통째로 누락).
4. `video/[slug]` VideoObject JSON-LD에 `contentUrl`이 없어(비유튜브/네이버TV 플랫폼이면 `embedUrl`도 비어 재생 가능 URL 신호가 아예 없는 경우 존재).

## 한 것

### 1. `/lens`, `/webtoon` 페이지네이션 → 진짜 크롤 가능 URL
- `app/lens/page.tsx`, `app/webtoon/page.tsx`: `searchParams.page`를 서버에서 읽어 `initialPage`로 클라이언트에 전달(Next 16 비동기 `searchParams` 패턴, `timemachine/[date]/page.tsx`와 동일 관례).
- `LensListClient.tsx`, `WebtoonListClient.tsx`: `useState(1)` 제거, 페이지 버튼을 `<button onClick={setPage}>`에서 `<Link href="/lens?page=N">`(웹툰은 `/webtoon?page=N`)로 전환. `pointerEvents:'none'`으로 현재 페이지/비활성 버튼 시각 처리는 유지.
- 로컬 `next start`로 검증: `/lens`와 `/lens?page=2`가 서로 다른 9개 링크 세트를 SSR로 내려줌(겹치는 건 고정 히어로 1개뿐), `/webtoon`도 동일 패턴 확인. 페이지네이션 버튼이 실제 `<a href="/lens?page=2">`임을 curl로 확인.

### 2. 홈페이지 h1 추가
- `widgets/FeedPage/FeedPage.tsx`의 `<main>` 최상단에 `<h1 className="sr-only">AI LENS — 서울경제신문의 AI 경제 뉴스</h1>` 추가(레이아웃 title과 동일 문구).
- 시각 디자인은 그대로 두는 쪽을 택함 — 각 섹션(브리핑/딥다이브/오늘의 시선 등)이 전부 `<h2>`로 동등한 weight를 의도적으로 유지하고 있어(디자인 검토 결과), 그중 하나를 h1으로 승격시키면 시각적 위계가 깨짐. sr-only h1은 SEO 신호와 스크린리더 접근성을 동시에 개선하면서 기존 디자인에 영향 없음.

### 3. `llms.txt` + `rss.xml`에 lens/issue-talk 반영
- `public/llms.txt`: "콘텐츠 형식"·"주요 페이지"·E-E-A-T 섹션에 오늘의 시선(`/lens`)·이슈 톡톡(`/issue-talk`) 추가.
- 감사 중 부수적으로 발견: `app/rss.xml/route.ts`가 letters 채널만 싣고 있어 RSS를 보는 뉴스 애그리게이터/AI 크롤러가 lens 신규 발행물을 놓치는 상태였음 → `fetchLensPosts()`를 병합해 letters+lens를 날짜순으로 합쳐 최신 `FEED_LIMIT`(30)개만 노출하도록 수정.

### 4. video JSON-LD 보강
- `app/video/[slug]/page.tsx`의 VideoObject에 `contentUrl: video.video_url` 무조건 추가(admin이 항상 입력하는 필드라 항상 채울 수 있음).
- `duration`은 추가하지 않음 — 정확한 값을 얻을 소스가 없음(YouTube Data API 키 연동이 필요한데 현재 미보유). 추측값을 넣는 건 구글 구조화 데이터 가이드라인 위반(허위 정보 금지)이라 의도적으로 보류.

### 5. Speakable 스키마 추가 (lens, letters 상세)
- `lens/[slug]/LensViewClient.tsx`: 헤드라인(`data-speakable="headline"`), 핵심요약(`data-speakable="summary"`), 시선 4개 Q&A 블록(`data-speakable="qa"`, 섹션당 1개)에 마커 속성 추가.
- `letters/[id]/LetterDetailClient.tsx`: 헤드라인, 부제(subtitle), "핵심 정리"(key_points) 블록에 동일 패턴 적용.
- `lens/[slug]/page.tsx`, `letters/[id]/page.tsx`의 JSON-LD `NewsArticle`에 `speakable: { '@type': 'SpeakableSpecification', cssSelector: [...] }` 추가 — 위 `data-speakable` 속성 selector를 그대로 참조.
- 스타일에 영향 없는 `data-*` 속성 방식을 택함(className 대신) — 기존 인라인 style 기반 컴포넌트에 CSS 충돌 없이 얹기 위함.

## 검증

- `npx tsc --noEmit` 통과, `npm run build` 통과(145 페이지 생성, `/lens`·`/webtoon`이 `ƒ Dynamic`으로 정상 전환).
- 로컬 `next start`로 라이브 스팟체크:
  - 홈 h1: `<h1 class="sr-only">AI LENS — 서울경제신문의 AI 경제 뉴스</h1>` 렌더 확인.
  - `/lens` vs `/lens?page=2`: 지난 이슈 링크 각 9개, 겹침 1개(히어로)만 — 서로 다른 콘텐츠가 실제로 SSR됨.
  - `/webtoon` vs `/webtoon?page=2`: 동일 패턴 확인(정적 포스터 이미지 참조 제외하면 실질 겹침은 히어로 1개).
  - video 상세 JSON-LD: `contentUrl`/`embedUrl` 둘 다 채워짐 확인.
  - lens 상세 JSON-LD: `speakable.cssSelector` 3개 모두 DOM에 매치되는 `data-speakable` 속성 존재 확인(headline 1, summary 1, qa 4).

## 결정

- FAQPage 타입은 추가하지 않음 — 구글이 이미 폐기했고, 현재 `NewsArticle.mainEntity` 구조가 다른 AI 크롤러(Perplexity/ChatGPT 등)에도 동일한 Q&A 정보를 노출하므로 실효 없이 스키마만 늘리는 선택은 피함.
- video `duration`은 정확한 값을 확보하기 전까지 넣지 않음 — 추측값보다 필드 생략이 낫다는 원칙.
- 홈 h1은 시각적으로 보이는 형태 대신 sr-only로 처리 — 기존 섹션 위계(전부 h2 동등)를 깨지 않는 선택.

## 배포

`./deploy.sh`로 프로덕션(EC2+PM2, ailens.sedaily.ai) 배포 완료(release `20260813-234141`, 헬스체크 200). 배포 후 실도메인에서 재검증:
- 홈 h1 렌더 확인.
- `/lens` vs `/lens?page=2` — 지난 이슈 링크 각 9개, 겹침 1개(히어로)만 — 실제로 다른 콘텐츠가 SSR됨.
- `llms.txt`에 lens/이슈 톡톡 반영 확인, `rss.xml`에 `/lens/` 항목 다수 포함 확인.
- 영상 상세 JSON-LD `contentUrl` 반영 확인.
- lens 상세 JSON-LD `speakable.cssSelector` 반영 확인.

## 다음

- Search Console에서 신규/변경 URL 수동 색인 요청은 GSC 접근 권한이 없어 사용자가 직접 해야 함(이전 턴에서 안내함).
- 구글 뉴스 Publisher Center 등록 여부는 미확인 — `news-sitemap.xml`은 이미 정확히 구축돼 있으나 Top Stories/뉴스 탭 노출은 별도 심사가 필요할 수 있어 사용자 확인 필요.
