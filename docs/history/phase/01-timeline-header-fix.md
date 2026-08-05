# Phase 01 — `/timeline` 글로벌 헤더 z-index 충돌 수정

작성: 2026-05-14 · 상태: LANDED (배포 완료)

## Why
사용자 보고: "신문 넘어가는 것처럼 지금 UI/UX 안 되어있는데?"  
타임라인 페이지 진입 시 좌우 화살표(전일/다음일) + 시간대 progress bar (아침→오전→오후→저녁→밤) 자체가 안 보이는 상태였음.

## Before
- 글로벌 헤더(다른 페이지와 통일된 탭 네비) `position: sticky · top: 0 · z-index: 100`
- `TimelineNewsFeed` 자체 헤더(홈/날짜/좌우 화살표) `position: sticky · top: 0 · z-index: 50`
- 시간대 progress bar `sticky top-[73px]`
- → 글로벌 헤더가 timeline 자체 헤더와 같은 위치에 박혀서 **z-100 글로벌 헤더가 z-50 timeline 헤더와 progress bar 를 덮어 가림**.

## After
TimelineNewsFeed 자체 헤더의 top 값만 글로벌 헤더 높이(56px)만큼 밀어내림. 두 헤더가 차곡차곡 쌓이고, 그 아래에 시간대 progress bar 가 자연스럽게 깔림.

| 요소 | Before | After |
|------|--------|-------|
| 글로벌 헤더 | `top-0 z-100` | (변경 없음) |
| Timeline 자체 헤더 | `top-0 z-50` | **`top-[56px] z-50`** |
| 시간대 progress bar | `top-[73px] z-40` | **`top-[129px] z-40`** |

## 변경 파일
- `frontend-next/src/components/timeline/TimelineNewsFeed.tsx` (2 줄, top 값만)

## 검증
- `npx tsc --noEmit` 통과
- `npm run build` 통과
- S3 sync + CloudFront invalidation 완료 → `https://mbti.sedaily.ai/timeline` 에서 좌우 화살표 + 시간대 그라데이션 전환 확인

## 다음 단계
없음. 단발성 fix.
