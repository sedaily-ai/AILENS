# 2026-08-24 "내 서랍" 결함 3종 + lens 페이지 문장 선택 팝오버 연결

작성: 문영광 + Claude Code
관련: 커밋 `ef5adc2`, `0416e4b`, `551152e`

## 배경

사용자가 실제로 홈에서 문장을 긁어봐도 아무것도 안 뜬다고 신고("현재... 문장
긁어도.. 아무것도 안 뜨는뎅..")한 게 발단. 코드를 직접 훑어보니 "내 서랍"
기능 자체가 겉만 있고 속은 여러 군데 끊겨 있었다.

## 한 것

### 3가지 결함 수정 (`ef5adc2`)
- `widgets/FeedPage/FeedPage.tsx` — 로그인 여부와 무관하게 항상 보여주던
  하드코딩된 목업 문장 8개(가짜 기사 제목까지 포함)를 통째로 삭제,
  `useState<ArchivedSentence[]>([])`로 교체. 비로그인 사용자에게도 남의
  것처럼 보이는 가짜 데이터가 뜨고 있었음.
- `features/archive/components/ArchiveTab.tsx` — 삭제 버튼이 로컬 React
  state만 지우고 실제 `deleteArchiveSentence` API를 호출하지 않던 문제.
  `handleDelete(sentence)` 신규 — 낙관적으로 먼저 지우고, 실패하면 롤백 +
  에러 표시.
- "내 서랍" 진입점 자체가 UI 어디에도 없었음(같은 날 다른 커밋에서 이어
  해결, 아래 참조).

### 진입점 + 네비게이션 (`0416e4b`)
- `features/auth/components/UserMenu.tsx`에 "내 서랍" 메뉴 항목 추가.
  처음엔 `router.push("/?tab=archive")`로 넣었는데 홈에서 누르면 반응이
  없었음 — `FeedPage.tsx`의 URL→tab 동기화 `useEffect`가 하이드레이션
  안전성 때문에 의도적으로 빈 의존성 배열(마운트 1회만)이라, 같은 경로
  안에서의 소프트 내비게이션은 다시 안 잡힘. `window.location.href`로
  바꿔 하드 네비게이션(항상 새로 마운트)으로 해결 — 약간의 성능 손해를
  감수하고 정확성을 택함.
- 모바일 드로어는 `UserMenu`를 그대로 재사용하는 구조라 별도 수정 없이
  같이 해결됨.

### lens 페이지 문장 선택 팝오버 연결 (`551152e`)
- 문장 선택→서랍 담기 팝오버(`SentenceSelectionPopover`)가 `/letters/[id]`
  에만 있고 `/lens/[slug]`에는 아예 붙어있지 않았던 게 신고의 실제 원인 —
  사용자가 테스트한 화면이 lens 포맷 페이지였음.
- `SentenceSelectionPopover`를 `app/(content)/letters/[id]/components/`
  에서 `widgets/SentenceSelectionPopover/`로 이전(letters 전용 co-location
  으로 있으면 lens 쪽에서 재사용 시 FSD `shared→entities` 역방향 의존성
  위반이 생겨서 — `useAuth` 참조 때문. `SajuMiniRail`/`HomeSideBar`가
  같은 이유로 `widgets/`로 옮겨진 전례를 따름).
- prop 타입을 `{ letter: DisplayLetter }`에서
  `{ letter: { id, headline, publishedAt? } }`로 넓혀 lens 데이터 구조에서도
  그대로 재사용 가능하게.
- `app/(content)/lens/[slug]/components/LensFormatPanel.tsx`의 레터 포맷
  블록을 `<article data-letter-body>`로 감싸고
  `<SentenceSelectionPopover letter={...} />` 추가 — 이게 실제로 이 기능이
  lens 페이지에서 처음 동작하게 만든 지점.

## 결정

- 진입점 네비게이션은 정확성(하드 네비게이션)을 성능(소프트 네비게이션)
  보다 우선. `FeedPage.tsx`의 마운트 1회성 URL 동기화 자체는 하이드레이션
  안전성 때문에 그대로 두고 건드리지 않음.

## 다음

- 없음 — 이 3건은 같은 날 안에서 사용자 실사용 테스트로 확인 완료.
