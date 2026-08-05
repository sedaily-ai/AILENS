# AI LENS — Phase 작업 로그 (2026-05-14 세션)

> 팀원이 빠르게 따라잡을 수 있게 단계별 Before / After / 변경 파일 / 의사결정 정리.
> 같은 폴더의 `01-..` ~ `05-..` 문서 순서대로 읽으면 흐름이 이어집니다.

## 한 줄 요약
오늘(2026-05-14) 세션 = **"오늘 페이지" 본문이 mock 4편 → 진짜 자동 letter 4편으로 가는 길의 마지막 한 층 깔기 + 시연용 UI/콘텐츠 다듬기**.

## 단계 목록

| Phase | 제목 | 영역 | 상태 |
|-------|------|------|------|
| 01 | `/timeline` 글로벌 헤더 z-index 충돌 수정 | 프론트 (작은 fix) | ✓ LANDED |
| 02 | `/today` 페이지 4 다른 letter 박기 + mock 데이터 분기 | 프론트 + mock 데이터 | ✓ LANDED |
| 03 | "오늘 페이지" 백엔드 자동 파이프라인 — Editor Pick | 백엔드 (Phase 1 코드 완료, Phase 2 사용자 손 대기) | 진행 중 |
| 04 | SideRail 띠별 "오늘의 재운" 카드 시도 → 제거 | 프론트 (사주 도메인 위험으로 베타 제외) | ⨯ REVERTED |
| 05 | 베타 단계 비용 절감 — Opus 4.6 → Haiku 4.5 | 백엔드 모델 ID 교체 | ✓ LANDED |

## 전체 흐름 (서비스 측 = 프론트, 운영 측 = 백엔드)

```
                                  [매일 자동, 5분 cron으로 이미 작동 중]
                                  v2 Collector → Selector → Transform
                                          ↓
                                  ~80 article × 4 MBTI 본문 (오늘 31개)
                                          ↓
[Phase 03 가 추가하는 한 층]      Editor Pick Lambda (KST 05:30, 1 회/일)
                                  Haiku 4.5 1 invoke → 4 에디터 × 1편 letter
                                          ↓
                                  daily_letters 테이블 4 row
                                          ↓
                                  GET /api/v2/today-letters
                                          ↓
[Phase 02 가 준비한 자리]         프론트 mockTodayFeed → API fetch 교체
                                          ↓
                                  /today 4 letter 카드 + /letters/[id] 본문
                                          ↓
[Phase 04 — 베타 제외]            SideRail "오늘의 재운" 시도 → 사주 도메인 위험으로 REVERTED
```

## 라이브 시연 가능한 페이지

- https://mbti.sedaily.ai/  — /today (4 letter + SideRail + 띠 재운)
- https://mbti.sedaily.ai/letters/nt-2026-05-14  — NT 민철 letter (한은 동결)
- https://mbti.sedaily.ai/letters/nf-2026-05-14  — NF 하은 letter (김범수)
- https://mbti.sedaily.ai/letters/st-2026-05-14  — ST 준서 letter (HBM4)
- https://mbti.sedaily.ai/letters/sf-2026-05-14  — SF 소율 letter (다이슨)
- https://mbti.sedaily.ai/calendar
- https://mbti.sedaily.ai/editors
- https://mbti.sedaily.ai/fortune
- https://mbti.sedaily.ai/timeline
- https://mbti.sedaily.ai/dna

## 미완 (다음 세션)

- **Phase 03 Phase 2** (사용자 콘솔 작업 필요) — `daily_letters` 테이블 마이그레이션 + Lambda 함수 2 개 신규 생성. 끝나면 Claude 가 자동으로 코드 push · 환경변수 · EventBridge cron · API Gateway 라우트 · 프론트 fetch 교체.
- 영문 사이트(en.sedaily.com) 띠 재운 통합 — 내일 미팅에서 컨셉 토의.
- 모바일 viewport 점검 + OG 공유 카드.
