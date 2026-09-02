# 2026-08-28 목록 fetch limit 수정 + archive 재설계 + video/listen 페이지네이션 신설

작성: 영광 (+ Claude Code)
관련: 브랜치 feat/list-pagination-and-archive-redesign (별도 브랜치
chore/remove-dead-paper-feed-channels에서 원인 조사 — "웹툰 이전 데이터
다 어디갔지" 질문에서 시작, 그쪽 worklog 참조)

## 배경

webtoon/lens 목록에서 옛 데이터가 안 보이는 버그를 조사한 결과, 프론트
fetch 함수들이 `limit=100`을 하드코딩해뒀는데 8/23 채널 분리 이후
발행량이 하루 최대 96건까지 늘면서 그 캡이 며칠 만에 뚫린 것으로
확인됐다(DB엔 데이터가 그대로 남아있는 순수 표시 버그). 이 조사 도중
사용자가 "/archive 페이지도 다 보여주긴 비효율적이니 주제별로 나누고
페이지네이션+n개씩 보기를 넣자"고 제안했다.

## 한 것

1. **limit 버그 수정** — webtoon/video/lens/home_player 4개 채널 fetch
   전부 100→1000으로. 백엔드는 이미 1000까지 DB 읽기 비용 증가 없이
   지원(handlers/cms_posts_public.py, 2026-08-18 sitemap용으로 이미
   상한을 올려둔 전례가 있었음).
2. **`/archive` 재설계** — letters/trend/video/lens를 날짜순으로 합쳐
   페이지네이션 없이 다 보여주던 방식을 버리고, 4개 형식(4가지 시선/
   웹툰/팟캐스트/영상) 카드로 가는 진입 디렉토리로 교체. 각 카드는
   해당 독립 목록 페이지(/lens, /webtoon, /listen, /video)로 링크.
   색·아이콘은 lens 상세의 4형식 선택기(lensPerspectives.ts)와 같은
   팔레트 재사용. letters(이슈 톡톡)는 신규 발행이 끊겨 독립 목록이
   없어서 범위 제외(홈/사이트맵/카테고리 노출은 그대로 유지).
3. **video/listen 페이지네이션 신설** — limit 버그를 고치는 과정에서
   새로 발견한 문제: /video, /listen은 애초에 페이지네이션이 없어서,
   캡을 풀자마자 수백 건이 한 화면에 그대로 뿌려지게 됐다(/webtoon,
   /lens는 이미 자체 페이지네이션이 있어서 무관). lens/webtoon이 쓰던
   `/xxx/page/[n]` 경로 세그먼트 패턴(generateStaticParams +
   force-cache, 쿼리스트링은 캐시가 안 걸려서 피함)을 그대로 이식.
   "n개씩 보기" 셀렉트도 신설(shared/ui/ListPagination.tsx) — 기본
   크기일 땐 정적 라우트 Link, 커스텀 크기를 고르면 그 세션 한정으로
   버튼 기반 클라이언트 상태 페이지네이션으로 전환(이미 브라우저에
   전체 목록이 로드돼 있어 재슬라이스만 하면 됨, 커스텀 크기마다 정적
   라우트를 새로 만들 필요 없음).

## 결정

- /lens, /webtoon의 기존 페이지네이션(시리즈 그룹핑, 히어로 캐러셀 등
  꽤 정교하게 짜여있음)은 이번엔 안 건드림 — 이미 동작하고 있고,
  "n개씩 보기"까지 소급 적용하려면 UI 재검토가 필요해 보여서 범위 밖.
  video/listen만 신규로 추가.
- ListPagination 컴포넌트는 lens `.pg` 버튼 스타일을 참고해 새로 만듦
  (video/listen이 공유하므로 shared/ui/로).

## 다음

- Chrome 브라우저 확장 미연결로 실제 클릭 인터랙션(n개씩 보기 전환,
  페이지 이동)까지의 브라우저 확인은 못함 — 다음 세션에서 필요.
- 이 브랜치는 아직 push/PR 안 함 — 로컬 커밋만 완료(limit 수정 1건,
  archive 재설계 1건, video/listen 페이지네이션 1건, 총 3커밋).
- /lens, /webtoon에도 "n개씩 보기"를 소급 적용할지는 별도 논의 필요.
