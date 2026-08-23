# 2026-08-23 KPI 재정의 + GA4 이벤트 계측 + BigQuery 연동

작성: Claude Code
관련: 전략 아티팩트(AI LENS KPI 재정의), service/frontend/src/shared/lib/tracking,
service/frontend/src/app/providers.tsx

## 배경

사용자가 KPI를 새로 정의해야 하는데 "기존 뉴스 사이트·뉴스레터 서비스의
PV/MAU/클릭수 관점보다, 2026년 8월 AI 시대에 맞는 진짜 고객중심적인
KPI를 보고 싶다"고 요청 — 전통 매체 KPI를 먼저 조사하고, 그 위에
AI LENS에 맞는 지표를 얹는 방향으로 진행했다.

## 한 것

### 1. KPI 재정의 — 전략 아티팩트 작성
- 전통 KPI(PV, 세션 수, MAU/DAU, 체류시간, 스크롤 깊이, 뉴스레터 오픈율/
  클릭률/구독취소율, ARPU/LTV/CAC 등)를 먼저 정리 — 전부 광고·구독
  매출을 정당화하는 관심경제 지표라는 공통점 확인.
- 핵심 재정의: "오래 머무르게 하기"라는 사용자의 사업적 목표를
  **콘텐츠 단위 체류**(포맷당 완주율 — 짧을수록 좋을 수 있음, "3초 안에
  이해"라는 제품 약속과 정렬)와 **관계 단위 체류**(세션당 소비 개수,
  재방문 빈도 — 여기가 "오래 머무르기"가 실제로 사는 자리)로 분리해서
  풀었다. 하나의 체류시간 지표로 뭉치면 두 목표가 서로 충돌한다는 게
  핵심 논리.
- 최종 6개 축: 포맷별 완주율 / 포맷 간 이동(빠른 포맷→깊은 포맷) /
  비알림 자발 재방문 / 원문 클릭의 신뢰 맥락 / 세션당 소비 깊이 /
  발행당 비용 대비 만족도(Bedrock 비용 태그 atlas-4444와 연결 가능).
- "왜"를 반복해서 사고 흐름이 이어지는 에세이 스타일로 작성, 전통 KPI
  재해석 표 + 최종 KPI 세트 표를 붙여 HTML 아티팩트로 발행(보고용).

### 2. 계측 인프라 확인 — GA4는 이미 있었다
- 코드베이스 확인 결과 GA4(측정 ID `G-BJZ09B6PB6`)가 `layout.tsx`에
  이미 연동돼 있었고, `shared/lib/tracking/trackEvent.ts` 헬퍼도 이미
  존재 — 다만 사주 위젯·게임·뉴스레터 가입 같은 데만 쓰이고 있었고
  핵심 뉴스 소비(웹툰/영상/팟캐스트/포맷전환) 이벤트는 하나도 안
  붙어있었다.
- GA4 UI만으로는 "포맷 전환율"처럼 여러 이벤트를 교차 조회해야 하는
  지표를 정확히 못 뽑는다(탐색 리포트 샘플링·차원 개수 제한) — 무료
  BigQuery daily export를 사용자가 직접 GA4 관리자 화면에서 연결(기존
  `mbti-497410` GCP 프로젝트 재사용). Microsoft Clarity는 "왜 이탈하는가"
  같은 정성 신호를 보완하는 별도 도구로 안내(이번엔 미설치, 필요시 추가).

### 3. GA4 커스텀 이벤트 5종 실제 구현
- `webtoon_cut_view(article_id, cut_index)` — IntersectionObserver
  (threshold 0.5) 기반, lens 4유형 페이지·독립 `/webtoon/[slug]` 페이지
  둘 다.
- `media_progress(article_id, format, pct)` — 영상·팟캐스트 25/50/75/100%
  재생 완주, `timeupdate` 리스닝. lens 4유형·`/video/[slug]`·
  `/listen/[slug]` 전부.
- `format_switch(article_id, from_format, to_format)` — 4유형 탭 전환.
  4유형 설계 자체("빠르게 훑고 → 궁금하면 깊이")가 실제로 작동하는지
  검증하는 핵심 지표.
- `source_link_click(article_id, format)` — "원문 보기" 클릭
  (`AiDisclaimer` 공용 컴포넌트 + lens 상단 별도 링크).
- `session_source(source)` — `utm_source` 유무로 세션 유입 구분.
  AI LENS엔 아직 푸시 알림 인프라가 없어 당장은 전부 `'direct'`로만
  찍히지만, 나중에 알림·캠페인 링크에 UTM만 붙이면 바로 구분됨 —
  계측을 인프라보다 먼저 깔아두는 쪽을 택함.
- hooks는 `.map()` 루프 안에서 못 써서(Rules of Hooks), `AutoPlayVideo`
  와 같은 패턴으로 `TrackedAudio`/`WebtoonCutGallery` 두 컴포넌트를
  추출해서 재사용.

### 4. 부수 발견·수정
- `/video/[slug]`가 `resolveVideo()`(유튜브/네이버TV 전용)만 처리하고
  있어서, 우리가 S3에 직접 올리는 mp4(오늘 신설한 video 채널 독립 글)는
  재생 분기 자체가 없어 "영상을 준비 중이에요"만 뜨고 있었다 —
  `isDirectVideoUrl` 추가 + 네이티브 `<video>` 폴백 분기로 고침(렌즈
  4유형 페이지는 이미 이 경로가 있어서 정상 재생됐던 것과 대조).

## 결정

- KPI는 "오래 머무르게" 하나로 뭉치지 않고 콘텐츠/관계 두 층위로
  분리하기로 함 — 제품의 "3초 안에 이해" 약속과 사업적 리텐션 목표가
  같은 지표 안에서 충돌하지 않도록.
- Clarity는 이번엔 설치 보류, GA4+BigQuery만 우선 갖춤.

## 다음

- 이벤트가 며칠 쌓이면 BigQuery로 포맷별 완주율·포맷 전환율 실제
  수치를 뽑아 KPI 아티팩트에 반영.
- 완주율·포맷전환율 외 나머지 축(재방문, 신뢰, 효율)은 기존 GA4
  표준 리포트(리텐션·세션)로도 상당 부분 확인 가능 — 별도 대시보드
  구성 여부는 데이터 쌓인 뒤 판단.
