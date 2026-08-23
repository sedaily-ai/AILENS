# 2026-08-23 팟캐스트 전문 표시 + 사이드바 sticky 재도입 + 카테고리 레일 빈 공간 채움

작성: Claude Code
관련: service/frontend/src/app/(content)/listen, service/frontend/src/shared/ui/HomeSideBar.tsx,
service/frontend/src/features/news-feed/components/CategoryFeatureSection.tsx

## 배경

웹툰/영상/팟캐스트 채널 분리(같은 날 앞선 worklog) 이후 실제 화면을
사용자가 스크린샷으로 확인하면서 나온 후속 지적 세 건.

## 한 것

### 1. `/listen/[slug]` 팟캐스트 상세에 전체 대본 표시
- 사용자 지적: "들어갈 때 플레이어만 있으니까 너무 허전한데, 텍스트
  스크립트 테이블에 데이터 저장된 거 없나요?" — lens 팟캐스트 포맷이
  이미 갖고 있던 접근성용 transcript를 home_player 채널 글로 복제할 때
  빠뜨렸었다.
- 백엔드 `_shape_home_player_item`에 transcript 노출 추가, 파이프라인
  `podcast_item`의 body_inline에 transcript 포함, 프론트
  `ListenViewClient.tsx`에 lens 상세 페이지와 같은 패턴의 스크립트 카드
  추가.
- 이미 백필된 28건 중 transcript가 있던 원본 lens 글 2건(오늘 발행분,
  transcript 기능 도입 이후)은 패치 스크립트로 소급 반영 — 나머지 26건은
  더 이른 날짜 발행이라 애초에 lens 레벨에서도 transcript가 없었음
  (기능 도입 이전 발행분, 정상 — 데이터 없음이지 버그 아님).

### 2. 우측 사이드바 다시 sticky로
- 2026-08-17엔 "따로 논다"는 피드백으로 sticky를 뺐었는데, 본문이
  사이드바보다 훨씬 길어서 스크롤할수록 사이드바 아래 여백만 커지는 게
  더 어색하다는 반대 피드백을 받음("스크롤 내리면 사라지게 되어있는데
  따라오도록 하면 어떤가요 — 여백 생기는게 좀 별로라서").
- `HomeSideBar.tsx`에 sticky 재도입 + 헤더(56px, 자체 sticky) 높이만큼
  top 오프셋을 줘서 헤더와 안 겹치게 함. 그리드 부모의 기본
  `align-items:stretch` 때문에 `alignSelf:'start'`가 없으면 sticky가
  안 먹어서 같이 추가. `maxHeight`+`overflowY:auto`로 사이드바 자체가
  뷰포트보다 길어질 경우도 방어.

### 3. 카테고리 레일 narrow 쪽 빈 공간
- 증시/산업/국제(wide) + 부동산/금융·정책/재테크(narrow) 페어 레이아웃
  에서 narrow 쪽이 히어로 카드 1개만 있고 그 아래가 통째로 비어 있었다
  (2026-08-17 최초 구현부터). 사용자가 실제 en.sedaily.com 화면(양쪽
  다 "히어로+이미지 카드 1개" 구조)을 근거로 지적 — narrow 쪽에도 두
  번째 기사를 이미지 있는 카드 톤(`HeroArticle`, large=false)으로 추가.

## 결정

- 사이드바 sticky 여부는 2026-08-17과 정반대 결정 — "따로 논다"는
  인상은 sticky 자체가 아니라 top 오프셋 없이 헤더에 바짝 붙어 있던
  것도 한몫했을 가능성이 있다고 보고, 이번엔 오프셋을 같이 손봄.

## 다음

- 사이드바 sticky 재도입이 다시 "따로 논다" 피드백으로 이어지면, 이번엔
  top 오프셋 문제가 아니라 sticky 자체가 안 맞는다는 뜻이니 되돌릴 것.
