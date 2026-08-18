# 2026-08-19 하단 플레이어 노출 범위 + admin 리팩토링/테스트

작성: Claude Code
관련: service/frontend, admin/frontend, admin/backend, 커밋 da9336f / aedb49c / b94e089 / 6142353

## 배경

전날 세션(2026-08-18)의 `/letters`·`/column` 정리에 이어, 사용자가 두 가지를
요청했다: (1) 홈 하단 고정 오디오 플레이어("오늘의 핵심 뉴스")가 웹툰·게임·
레터 상세·타임라인·로그인 등 다른 페이지에서도 계속 떠 있는 게 어색하니
메인 피드에서만 보이게 해달라는 것, (2) admin 콘솔 쪽에 최신화·리팩토링·
유지보수할 게 없는지 감사해달라는 것.

## 한 것

### 하단 플레이어를 메인 피드에서만 노출 (커밋 da9336f)
- `ConditionalTodayNewsPlayer.tsx` 신설 — `pathname !== '/'`면 렌더 안 함.
  `ConditionalFooter.tsx`의 블록리스트 패턴과 반대로 "메인에서만"이라는
  요구사항 자체가 허용목록이라 조건 하나로 충분했다.
- `SiteFooter.tsx`에 `reservePlayerSpace` prop 추가 — 플레이어가 저작권
  표기를 가리는 걸 막던 하단 여백도 같은 조건(`pathname === '/'`)에서만
  예약하도록 바꿔, 플레이어가 안 뜨는 페이지에 불필요한 빈 공간이 남지
  않게 했다.

이 작업 도중 로컬 dev 서버(3100번 포트)에서 웹툰 미리보기 카드가 전부
클릭 안 되는 문제를 발견 → 조사 결과 두 가지가 겹친 것으로 확인:
(a) 그 카드들은 원래 "실제 상세 없으면 클릭 막는" 의도된 목업이었고,
(b) 백엔드 API Gateway(`sedaily-mbti-api-dev`, id `chzwwtjtgk`)의 CORS
allow-list가 `localhost:3000/3001/3002`만 허용하는데 3100은 없어서 실제
웹툰 데이터 fetch가 전부 CORS로 막혀 전부 목업으로 채워졌던 것. 인프라는
안 건드리고 이미 허용된 3000번 포트로 dev 서버를 다시 띄우는 것으로 해결.

### admin/ 코드 품질 감사 + 리팩토링 2건 + 테스트 1건

배경 조사(포크 에이전트) 결과: admin은 service/frontend의 이번 URL
변경(letters/column 정리, 카테고리 개편)과는 완전히 분리돼 있어(DynamoDB
채널 태그로만 연결, URL 구조 자체를 안 다룸) 최신화할 게 없었다. 대신
admin 자체의 코드 품질 감사에서 아래 항목이 나왔다.

1. **`PromptDrawer.tsx`(916줄) 분리** (커밋 aedb49c) — `Icon`/`FileIcon`,
   `ScopeTabs`, `FormatPicker`, `PromptField`, 메인 `PromptDrawer` 5개
   컴포넌트가 한 파일에 있던 걸 기존 `PostForm/` 폴더 컨벤션(폴더 +
   `index.ts` 배럴)으로 나눴다.
2. **`ContentTable.tsx`(849줄) 분리** (커밋 b94e089) — video/webtoon/posts/
   lens 4개 페이지가 공유하는 표 컴포넌트에서 `Pagination`,
   `ColumnFilterHeader`/`ColumnFilterHeaderMulti`, `ViewToggle`,
   `SimpleBulkBar`, 상태 라벨·발행일 포맷 유틸(`shared.ts`)을 각자 파일로
   분리.
3. **`routes/quiz.py` pytest 커버리지 추가** (커밋 6142353) — admin/backend
   라우트 중 유일하게 테스트가 0건이던 파일. `test_posts_routes.py`와 같은
   구조로 28개 추가(검증·CRUD·발행 시 "오답 3개 필수" 비즈니스 규칙·감사
   로그 액션명까지). 전체 스위트 168개(기존 140 + 신규 28) 통과.

두 프론트 분리 다 소비처의 import 경로(`@/components/PromptDrawer`,
`@/components/ContentTable`)는 폴더의 `index.ts`가 그대로 resolve해줘서
호출부 수정이 전혀 없었다.

## 결정

- 브라우저 자동화 도구(claude-in-chrome)가 이 세션 내내 연결이 안 돼(확장
  프로그램 미연결) admin 리팩토링 2건을 실제 클릭으로 검증하지 못했다 —
  순수 구조 이동(내용 바이트 단위 동일)이라 `tsc --noEmit` + `eslint` +
  `npm run build`(21 라우트 동일, static export)로 검증을 대신했고, 사용자
  에게 배포 전 로컬 확인을 권했다.
- CORS allow-list(API Gateway `chzwwtjtgk`)는 이미 `localhost:3000/3001/3002`
  를 허용하고 있어 인프라를 건드리지 않고 dev 서버 포트만 맞춰 해결 —
  Tier C(레포 밖 AWS 설정) 성격의 변경을 피했다.

## 다음

- 이전 세션에서 남겨둔 admin 코드 품질 감사 항목 중 `lib/prompt.ts`(585줄)
  는 이번엔 손 안 댐(순수 유틸 밀집이라 분리 실익이 상대적으로 낮다고
  판단, 우선순위 낮음으로 분류).
- `service/frontend`의 `LetterDetailClient.tsx`(1526줄)·`LensViewClient.tsx`
  (1400줄) — words 페이지 때 검증된 `app/→widgets/` 추출 패턴을 그대로
  적용할 수 있는 다음 후보로 남아있음.
