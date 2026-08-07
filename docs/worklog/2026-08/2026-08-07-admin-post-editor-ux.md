# 2026-08-07 어드민 글 관리·글 수정 페이지 UX 개선

작성: Claude Code
관련: `dae8323` feat(admin): 트렌드/칼럼 탭 분리, 카테고리 입력, 일괄 작업 추가,
`f1d9f46` fix(admin): 글 수정 페이지 스티키 툴바·모달·위젯 이동 개선.
배포: `mbti-admin.sedaily.ai` (S3 `sedaily-mbti-admin-frontend-dev` + CloudFront
`E1MITYI58DB9UW`, invalidation `I83JTY4SU0AGJLRD0VKDXPOQE1`)

## 배경

MBTI 폐지 이후 admin "글 관리"를 실제로 쓰면서 나온 UX 불편(필터가 뭉뚱그려져 있음, 카테고리를
글쓰기 화면에서 못 바꿈, 대량 작업 불가, 웹툰 컷 재정렬 불가 등)을 사용자가 스크린샷으로
하나씩 짚어가며 빠르게 반복 요청 → 개선한 세션. 이어서 "네이버 블로그/티스토리/미디엄처럼
깔끔하게" 글 수정 페이지 자체를 리디자인해달라는 요청으로 확장됨.

## 한 것

**`dae8323` — 글 목록 필터·대량 작업**
- 트렌드/칼럼 필터 탭 분리 + 짧은 라벨("경제 이슈"/"인기 칼럼")로 리네이밍.
- 글 목록에 체크박스 선택 + 일괄 삭제/이동/카테고리 변경 (`BulkActionBar`,
  `Promise.allSettled` 기반, 부분 실패 허용).
- 글쓰기 화면에서 카테고리를 직접 입력/변경 가능하도록 — 이 과정에서 백엔드 응답
  (`cms_posts_public.py` `_shape_letter()`)과 저장 payload(`posts/edit/page.tsx`) 양쪽 모두
  `category` 필드를 빠뜨리고 있던 버그를 발견해 같이 수정 (DynamoDB 직접 조회로 검증).
- 웹툰 컷 드래그 재정렬, 컷 삭제/전체 삭제 확인창(`window.confirm`), 라이브 미리보기 패널,
  대표 이미지 디자인 리뉴얼(배너형 + hover 오버레이) 추가.
- 리치텍스트 툴바 이모지(🔗🖼🎯) → 선 아이콘 SVG 세트로 교체.

**`f1d9f46` — 글 수정 페이지 리디자인 + 버그 3건**
- **스티키 툴바가 헤더에 가려지는 버그**: 고정 px(`top-20`) 추정치 대신, 페이지 헤더를
  `ResizeObserver`로 실측해 `--post-header-h` CSS 변수로 넘기고 툴바가 그 값을 그대로
  쓰도록 변경. 헤더 높이가 "발행됨 · slug" 줄 유무로 바뀌는 걸 고정값이 못 따라가던 게 원인.
  겸사겸사 `PostForm.tsx`의 글 카드 wrapper에 걸려 있던 `overflow-hidden`도 제거 —
  sticky 자체를 막고 있었다(모서리 둥글림은 `rounded-2xl`만으로 유지됨, 자식 중 카드
  경계까지 닿는 불투명 배경이 없어 클리핑 없이도 시각 차이 없음).
- **퀴즈·투표 위젯 모달이 화면 밖에 렌더링되는 버그** (실사용 중 발견, 스크린샷 리포트):
  `.ui-enter`(진입 애니메이션 wrapper)의 `animation-fill-mode: both`가 애니메이션이 끝난
  뒤에도 computed `transform`을 identity matrix로 계속 "채운 채" 남겨뒀고, transform이
  `none`이 아닌 조상은 그 아래 모든 `position:fixed` 자손의 containing block을 뷰포트가
  아닌 자기 자신으로 바꿔버린다 — 그 결과 모달 backdrop이 전체 문서 높이(8000px+)로
  퍼지고 카드는 스크롤해도 닿을 수 없는 좌표에 렌더링됐다. `fill-mode: both` →
  `backwards`로 변경해 해결 (도착 상태가 어차피 무-애니메이션 기본값과 같아 시각적 차이
  없음). DOM 조사로 정확한 원인을 확인한 뒤 고쳤고, 브라우저에서 modal이 뷰포트 기준
  `(0,0,vw,vh)`로 스크롤과 무관하게 고정되는 것까지 확인.
- **퀴즈·투표 위젯 순서 변경이 안 되는 문제**: 노드에 `draggable:true`, CSS
  `-webkit-user-drag:element`, `user-select:none`까지 전부 정상 배선돼 있었지만(DOM 조사로
  확인) 실사용자 트랙패드에서 네이티브 HTML5 드래그 자체가 시작되지 않는 경우가 있었다.
  제스처에 기대는 대신 위/아래 버튼(ProseMirror transaction으로 인접 블록과
  `replaceWith` swap)을 추가 — 손잡이(⠿)는 보조 힌트로 남기고 버튼이 기본 조작이 되도록.
- 대표 이미지 "교체" 버튼을 hover 전용에서 항상 옅게 보이는 하단 그라디언트 바로 변경
  (교체 가능하다는 걸 알아채기 어렵다는 피드백).
- 발행일/분류 필드를 네이티브 `input[type=date]`/`select`에서 `DateRangeCalendar.tsx`와
  같은 톤의 커스텀 팝오버 컴포넌트(`DatePickerField.tsx`, `CustomSelect.tsx` 신규)로 교체.

## 결정

- 퀴즈 위젯 재정렬은 네이티브 드래그를 고치려 하지 않고 버튼으로 대체 — 브라우저/트랙패드
  의존적인 제스처보다 항상 동작하는 쪽을 택함. 드래그가 되는 환경에서는 여전히 동작하니
  손잡이 UI는 남겨둠.
- 이 세션 동안 사용자가 "브라우저로 검증하지 마시라, 개발 주기가 느려진다"는 지시를 두 번
  줬다 — 처음엔 "리포트된 버그 진단"을 예외로 허용했지만, 두 번째로 (요청 없이) 수정
  검증차 브라우저를 다시 열자 명시적으로 제지받음. 이후로는 예외 없이, 코드/DOM 정적 분석만
  하고 실제 화면 확인은 사용자에게 맡기기로 함 (메모리 `feedback_no_browser_verification.md`
  갱신).

## 다음

- 사용자가 로컬에서 직접 눈으로 확인 예정 — 특히 스티키 툴바가 실제로 안 가려지는지,
  위/아래 버튼으로 위젯이 잘 옮겨지는지는 아직 라이브 재확인 전.
- 커스텀 `DatePickerField`/`CustomSelect`는 이번에 `posts/edit` 화면에만 붙였다. 다른 화면의
  네이티브 select/date input(있다면)은 아직 안 건드림 — 필요해지면 그때 확장.
