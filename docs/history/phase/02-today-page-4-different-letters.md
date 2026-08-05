# Phase 02 — `/today` 페이지 4 다른 letter 박기

작성: 2026-05-14 · 상태: LANDED (배포 완료)

## Why
"/today 페이지에 4 에디터 letter 가 있는데, 4 카드가 다 같은 부산시장 후보 인터뷰를 4 시각으로 해석한 mock 이라 데모용으로 약함." → 진짜 운영 모드처럼 **4 에디터가 각자 다른 기사 1편씩**을 picking 해서 letter 톤으로 쓴 결과물을 시연.

mock 형태이지만 톤·구조·길이가 진짜 운영 단계와 동일하게 보여야 다음 백엔드 자동화 단계 의사결정이 가능.

## Before
- `mockTodayFeed.ts` 의 4 letter 카드가 모두 같은 `newsId = '2KCD71F3FN'` (부산시장)
- `OneShotLetter` 컴포넌트가 fetch 실패 시 `MOCK_ONESHOT_RESPONSE` 단일 객체로 fallback → 4 카드 클릭해도 본문이 다 같은 부산시장 letter

## After
- `mockTodayFeed.ts` 4 letter 카드 = 각자 다른 가상 기사 picking
- `mockOneShot.ts` 에 `SAMPLE_*_LETTER` 4 객체 + `MOCK_LETTERS_BY_ID` 사전 + `getMockOneShot(newsId)` 헬퍼 추가
- `OneShotLetter` fallback 두 지점이 `getMockOneShot(topNewsId)` 사용 → newsId 별로 다른 본문 반환
- `topNewsId.startsWith('sample-')` 면 production API fetch 자체를 skip (404 round-trip 절감)

### 4 letter 라인업 (2026-05-14)

| 에디터 | mbti | 기사 (가상) | 헤드라인 |
|--------|------|------------|----------|
| 민철 | NT | 한은 5월 금통위 동결 + 미 4월 CPI | "동결, 그러나 '인하 시계'는 가을로 당겨졌습니다" |
| 하은 | NF | 김범수 카카오 의장 영장실질심사 | "범인을 묻기 전에, 우리가 왜 카카오에 익숙해졌는지부터" |
| 준서 | ST | 삼성전자 HBM4 양산 임박 | "HBM4 양산 — 숫자 4개로 정리합니다" |
| 소율 | SF | 다이슨 한국 첫 출시 AI 헤어드라이어 | "다이슨이 '학습하는' 드라이어를 한국에 먼저 풀었어요" |

## 변경 파일
| 파일 | 변경 종류 | 비고 |
|------|----------|------|
| `frontend-next/src/features/news-feed/data/mockTodayFeed.ts` | rewrite | TODAY_LETTERS 4편 갈아끼움. letterId = `{group}-2026-05-14` |
| `frontend-next/src/features/news-feed/data/mockOneShot.ts` | append | SAMPLE_NT/NF/ST/SF_LETTER 4 객체 + MOCK_LETTERS_BY_ID + getMockOneShot |
| `frontend-next/src/features/news-feed/components/OneShotLetter.tsx` | edit | fallback 두 지점 + sample-* skip 로직 |
| `frontend-next/src/features/news-feed/components/SideRail.tsx` | edit | HOT_LETTERS letterId 동기화 (st-..14 등) + shortTitle 갱신 |

## 의사결정

1. **모드 A vs C** — 4 에디터 다른 기사(A) vs 1 기사 4 해석(C). 운영은 A 가 기본, C 는 빅이벤트(한은 금통위·FOMC·삼성 실적·인수합병) 자동 감지 시만. 데모는 A 로.
2. **News_id prefix `sample-`** — production v2 API 에 없는 ID 라 fetch 시 자동 404 → mock fallback. 안전하게 운영 데이터와 격리.

## 검증
- `npx tsc --noEmit` 통과
- `npm run build` 통과 (4 letter 정적 페이지 생성)
- S3 sync + CloudFront invalidation 완료 → `/letters/nt-2026-05-14` ~ `/letters/sf-2026-05-14` 각각 다른 본문 확인

## 다음 단계
[Phase 03](./03-backend-editor-pick.md) — 이 mock 흐름을 진짜 자동 파이프라인으로 교체. mockTodayFeed → `GET /api/v2/today-letters`.
