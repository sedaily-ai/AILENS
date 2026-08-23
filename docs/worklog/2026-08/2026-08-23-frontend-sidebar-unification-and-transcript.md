# 2026-08-23 사이드바 위치 통일 + 스크립트 접근성 텍스트 + 영상 자동재생 버그

작성: Claude Code
관련: service/frontend/src/shared/ui/HomeSideBar.tsx,
service/frontend/src/app/(content)/lens/[slug]/LensViewClient.tsx,
service/frontend/src/app/(content)/letters/[id]/LetterDetailClient.tsx,
service/backend/handlers/cms_posts_public.py

## 배경

사용자가 스크린샷으로 여러 라운드에 걸쳐 우측 사이드바("요즘 가장 많이
읽힌 글" 등)의 위치가 페이지마다 미묘하게 다르다고 지적("상세 부분 메인
부분 탭부분, lens 모두... 사이드바 들어가는 모든 경로의 위치가... x, y
그리고 포지션도.. 동일한 위치면 좋겠어서"). 별도로 팟캐스트/영상 포맷에
스크립트(본문 텍스트)가 없어 청각장애인 접근성이 아쉽다는 요청도 있었고,
영상 탭에 들어가지 않았는데도 영상이 자동재생되는 버그도 발견됐다.

## 한 것

- **사이드바 위치 통일**: 홈/카테고리 아카이브/`/lens` 목록/`/lens/[slug]`
  상세/`/archive` 허브/`/letters/[id]` 상세 — 6개 페이지 유형 전부를
  동일한 `maxWidth:1320, padding:'clamp(8px,2vw,16px)
  clamp(24px,3.5vw,44px) 0'` 그리드 래퍼로 통일하고, 페이지별
  `HomeSideBar` `paddingTop` 오버라이드를 전부 제거했다. 여러 라운드
  시행착오(위치를 옮겼다가 다시 되돌리는 등) 끝에, 근본 원인이 페이지마다
  래퍼 padding이 미세하게 달랐던 것임을 확인하고 완전히 동일한 값으로
  맞추는 쪽으로 정리.
- **`SideRail.tsx` 제거**: `LetterDetailClient.tsx`만 별도로 쓰던, 완전히
  다른 구현(sticky 포지션, 자체 "나의 이상형, 사주로 풀어보면" 위젯)의
  중복 사이드바를 발견해 삭제하고 `HomeSideBar`로 교체.
  `features/news-feed/index.ts`의 export도 같이 정리.
- **"요즘 가장 많이 읽힌 글" 늦게 뜨는 문제**: `initialHotLetters` 서버
  프리페치가 없던 페이지들(`/lens/[slug]`, `/letters/[id]` 등)에
  `fetchFollowingLetters(5)`를 `page.tsx`의 `Promise.all`에 추가해
  SSR로 채워서, 클라이언트 fetch가 끝날 때까지 빈 자리로 보이던 문제를
  없앴다.
- **스크립트(본문 텍스트) 접근성 기능**: 팟캐스트/영상 포맷에 원문 스크립트
  표시 추가.
  - 파이프라인(`mustknow_auto/run.py`, `frontpage_auto/run.py`
    `_publish()`): 팟캐스트는 `대본.md`, 영상은 `script.json`의 각 컷
    `narration`을 이어붙여 `transcript` 필드로 DDB에 저장.
  - 백엔드(`cms_posts_public.py` `_shape_lens()`): `transcript` 필드
    패스스루 추가, 단일 함수 배포(`sedaily-mbti-v2-posts-dev`)로 반영.
  - 프론트(`LensViewClient.tsx`): 팟캐스트/영상 포맷에 `l.transcript`가
    있으면 카드로 렌더링.
- **영상 자동재생 버그**: 4개 포맷 섹션이 전부 동시에 마운트돼 있고
  `hidden={!on}` 속성으로만 숨겨지는 구조라(조건부 언마운트가 아님),
  레터 페이지에 들어가기만 해도 영상 섹션의 `<video autoPlay>`가 항상
  재생되고 있었다. `AutoPlayVideo`라는 작은 서브컴포넌트를 새로 만들어
  `useRef` + `useEffect(() => { active ? play() : pause() }, [active])`로
  실제 탭 활성 여부에 따라 재생/정지하도록 고쳤다. 팟캐스트/영상 iframe
  임베드(`realPodcast`/`realVideo`, `autoplay=1` 내장)도 `on`일 때만
  `src`를 설정하도록 같은 방식으로 고침 — 반대로 요청받은 "영상 탭
  클릭하면 자동재생"은 이 수정으로 그대로 유지됨.
- 홈 화면 "네 형식" 미리보기와 `/lens` 목록 히어로 행에서 3/4 포맷이
  헤드라인을 그대로 반복 표시하던 중복 버그 수정
  (`l.question || p.tagline` → `p.tagline`) — `question`은 웹툰만
  별도로 생성하고 나머지 포맷은 원문 헤드라인을 그대로 담고 있어서
  발생했던 문제.
- `/lens` 목록 페이지에 카테고리 페이지와 동일한 상단 Header 추가, 각 행에
  본문 미리보기 텍스트 추가.
- `HomeSideBar.tsx`/`HotLettersRail.tsx`/`SajuMiniRail.tsx`를
  `features/news-feed/components/`에서 `shared/ui/`로 이동(FSD상
  `shared`가 특정 feature를 참조하면 안 되는데 반대로 여러 feature가
  이 위젯들만 공유하는 상태였음).

## 결정

- 헤드라인 중복 버그는 `LensPreviewSection.tsx`(홈)와 `LensListClient.tsx`
  (`/lens` 목록)에 각각 독립적으로 고쳤다. 두 파일이 애초에 공유 컴포넌트가
  아니라 각자 따로 구현된 코드라, 공통 컴포넌트로 뽑아내는 리팩토링은
  이번엔 하지 않고 보류 — 사용자가 공유 컴포넌트 추출 여부를 아직
  확정하지 않음.

## 다음

- 헤드라인 중복 렌더링 로직을 공유 컴포넌트로 뽑을지 결정 필요(보류 중).
- 스크립트 표시 UI/UX(디자인 다듬기)는 아직 1차 구현 상태 — 사용자
  피드백에 따라 조정 여지 있음.
