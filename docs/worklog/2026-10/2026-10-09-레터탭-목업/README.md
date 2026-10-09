# 2026-10-09 레터 탭 목업 (모아쓰기 레터, 프론트 먼저)

방침: 백엔드는 나중에, 목업 데이터로 화면을 먼저 확정한 뒤 구조를 확정한다(기획서: docs/product/모아쓰기레터/README.md).

## 한 것
- 헤더에 "레터" 탭 신설(분류 9개 뒤, 더보기 앞). `/letter`·`/letter/{slug}` 활성 표시(`ArticlePageShell`에 `activeTab` prop).
- `/letter`: 오늘의 레터(피처드 카드) + 지난 레터 그리드 + 분류 필터. 카드에 3축 배지(소식·실체·다른 시각)와 "기사 N건".
- `/letter/{slug}`: 헤더(분류·호수·제목·축별 한 줄) → "이 레터에 쓰인 기사" 패널(본문 앞) → 1분 요약(접기) → 섹션별 "핵심:" 라벨 + 인라인 링크 본문 → 에디터 한마디 → 투표(목업 집계) → 이전/다음.
- 목업 데이터 5편: 삼성전자 107조(기획서 예시 문구만, mock), 라네즈·종로3가·부캉이(작성된 샘플 본문 그대로), 경매 25억(카드만, mock). `features/letter/data/mockLetters.ts`.
- 이모지 대신 색 점+글자 배지, 손글씨 폰트 없음, 서울경제 파랑 `#5b8def`, 모바일 우선. 한글 `word-break: keep-all`.
- 목업이라 두 페이지 모두 `noindex`, 사이트맵에 넣지 않음.

## 같이 고친 것 (발견)
- 사이트맵 분할 때 만든 `app/sitemap.xml/route.ts`가 개발 서버에서 `Conflicting route and metadata at /sitemap.xml`로 앱 전체를 500으로 만들었다(프로덕션 빌드는 통과해서 놓쳤음). 색인 라우트를 `app/sitemap-index/route.ts`로 옮기고 `next.config.ts` rewrites(beforeFiles)로 `/sitemap.xml`에 연결. 개발·프로덕션 모두 `/sitemap.xml` 200, 캐시 헤더 유지 확인.

## 검증
tsc·eslint·vitest 59·`npm run build`·프로덕션 `next start`: `/letter` 200, 상세 200, 없는 슬러그 404, `<meta robots noindex>`, 개발 서버 하이드레이션 오류 0.

## 화면 (before/after)
- before: before_d.png, before_m.png (라이브 홈 헤더, 레터 탭 없음)
- after: after_list_d/m.png, after_detail_d/m.png

## 확정할 것 (화면을 보고)
- 카드·헤더·패널 디자인, 축 배지 색, 섹션 구성, 투표 문구. 기획서 §9 질문(Q1~Q8) 중 Q1(이름)·Q2(경로)는 이 목업에서 `레터`·`/letter`로 가정.
- 기사 상세의 4형식 첫 탭 "레터"와 이름이 겹치는 문제는 아직 그대로(권장: "읽기"로 변경 — 승인 후).
