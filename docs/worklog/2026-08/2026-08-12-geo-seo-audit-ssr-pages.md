# 2026-08-12 GEO/SEO 감사 — 네비/워딩 정리 + SSR-empty 페이지 전면 수정

작성: Claude Code
관련: `service/frontend/deploy.sh` release `20260811-220154`

## 배경

"실시간 뉴스(타임라인)가 검색엔진에 하나도 안 걸린다"는 질문에서 출발해,
AI LENS 프론트 전반의 GEO/SEO 상태를 점검했다. 핵심 문제 패턴 하나를 여러
페이지에서 반복 발견: `'use client'` 컴포넌트가 `useEffect`+`fetch`로만
콘텐츠를 채우고 첫 페인트는 `null`/스켈레톤 상태로 시작하는 구조라, JS를
안 돌리는 크롤러(GPTBot 등)에는 사실상 빈 페이지로 보였다.

## 한 것

**네비게이션/워딩 정리**
- 푸터 Instagram 링크(`@ailens.sedaily` 정정), "서비스 소개" 링크 추가,
  콘텐츠 타입별 링크 로우(`CONTENT_LINKS`) 신설 — `SiteFooter.tsx`
- 탭 리네이밍: 레터→브리핑, 트렌드→딥다이브, 칼럼→인사이트 (영상은 유지) —
  `headerTabs.ts` 라벨 + `FeedPage.tsx`/`letters`/`trend`/`column`/`archive`
  각 페이지 타이틀·킥커 일괄 변경
- 페이지 내 중복 필터 pill(`ArchiveTabs.tsx`) + 헤더의 core/extra tier 구분선
  제거 — 상단 탭과 기능이 겹쳐 불필요해짐

**GEO 메타데이터 보강**
- `letters`/`trend`/`column`/`video`/`archive`/`webtoon` — `keywords` 확장,
  `author` Organization JSON-LD 블록 추가
- `llms.txt` 전면 갱신(죽은 라우트 제거, 신규 페이지 반영), `robots.txt`에서
  `/onboarding/` disallow 해제(구 온보딩 퍼널 폐기 후 순수 소개 랜딩으로 바뀐
  뒤로도 계속 막혀 있었음)
- 안 쓰는 이미지 2개(2.4MB) 삭제

**SSR-empty 버그 수정 — 페이지 3개**
1. `/timeline` → `/timeline/[date]`: `NewsTimeMachine.tsx`를 입력+되감기
   애니메이션까지로 축소, 결과 렌더는 새 `timelineApi.ts`(순수 fetch 함수) +
   `TimelineResultView.tsx`(클라이언트 프레젠테이션)로 분리. 서버 페이지가
   `CollectionPage` JSON-LD + 날짜별 `robots: index:false`(빈 날짜) 부여.
2. `/words`: `words.ts`(fetchTerms/dedupeTerms 순수 함수) 분리 후 `page.tsx`를
   서버 컴포넌트로 전환, 인터랙션(검색)만 `WordsPageClient.tsx`로. `DefinedTermSet`
   JSON-LD 추가(용어집 콘텐츠에 맞는 schema.org 타입).
3. `/timemachine` → `/timemachine/[date]`: 가장 큰 리팩토링(1249줄).
   `timemachine.ts`(fetchTimeMachineDay — news/events/birthdays/snapshot/
   liveMarket 병렬 fetch), `TimeMachineClient.tsx`는 입력 폼+되감기
   애니메이션만 남기고 결과(챕터 Ⅰ~Ⅳ+투자 시뮬레이션)는
   `[date]/TimeMachineDayClient.tsx`로 분리. `CollectionPage` JSON-LD +
   그날 태어난 인물을 `mentions: Person[]`으로 노출.

**KST/하이드레이션 안전 처리**
- `kstTodayStr()`(`shared/lib/date.ts`)을 sitemap·타임라인 프리뷰·되감기
  컴포넌트 전반에 통일 적용 — UTC 서버가 자정~09시 KST 사이 "오늘"을 하루
  전으로 계산하던 버그 수정.
- `/timemachine/[date]`의 "OO년 전"/"OOOO번째 아침" 카피는 클라이언트에서
  `new Date()`를 다시 부르는 대신 서버가 `daysSince`/`yearsSince`를 계산해
  props로 내려줌 — 하이드레이션 시점 재계산으로 인한 서버/클라이언트 값
  불일치 가능성을 원천 차단.

## 결정

- `/timemachine/{date}` 개별 URL은 sitemap.ts에 시딩하지 않음 — `/timeline`과
  달리 "최근 N일"이 아니라 생일 등 임의의 과거 날짜(1990~어제)라 어떤 날짜가
  실제로 방문될지 신호가 없고, 홈에도 특정 날짜를 링크하는 티저가 없음(확인
  완료). 무작위 시딩은 아무도 안 볼 얇은 페이지만 늘림 — 직접 방문·공유
  경로로는 그대로 색인 가능.
- 리팩토링 중 발견한 죽은 코드(`activeTab`/`ResultTab`/`tabs` 배열,
  `FIELD_ICONS`, `CATEGORY_COLOR` — 전부 정의만 되고 렌더되지 않음)는
  옮기지 않고 정리.
- `DatePicker`의 prop-sync `useEffect`가 `react-hooks/set-state-in-effect`
  린트 에러를 유발해, React 공식 "Adjusting state when a prop changes"
  패턴(렌더 중 조건부 setState)으로 교체.

## 다음

- `/timemachine`의 홈 화면 진입 지점(티저 섹션)이 아직 없음 — 필요하면
  `TimelinePreviewSection.tsx`와 같은 패턴으로 추가 검토.
- `service/frontend/src/app/{trend,column,archive}` 등 이번 세션에 새로
  생긴 나머지 커밋되지 않은 변경사항 다수 존재 — `git status`로 전체 diff
  확인 후 커밋 필요(이 세션은 배포만 하고 커밋은 안 함, 사용자 지시 대기).
