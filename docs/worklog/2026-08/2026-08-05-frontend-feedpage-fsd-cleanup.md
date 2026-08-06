# 2026-08-05 프론트엔드 정리 라운드 1 — FeedPage.tsx 죽은 코드 + FSD 배럴/역방향 의존성

작성: 영광 + Claude Code
관련: 커밋 `9a1c019`(`service/frontend/`), 브랜치 `refactor/frontend-cleanup` → `main`(fast-forward)

## 배경

백엔드 정리(같은 날 다른 항목) 이후 "프론트엔드 리팩토링은 됐나?" 질문을 받고
확인해보니 이번 세션엔 손을 안 댄 상태였다. 승인받고 Explore agent 조사(2개
완료, 3번째는 API 에러로 중단 — 재실행 없이 확보된 결과로 진행) → 계획 →
실행 순서로 진행.

## 한 것

### FeedPage.tsx 죽은 코드 제거

`/` 라우트의 실제 진입점이자 프론트 최대 파일.

**Before**: 2171줄
**After**: 1623줄

- 안 쓰는 lucide 아이콘 import 13개, `ScrollReveal` import 삭제
- `editorAvatars`, `getBodyText()`, `getWeekDays()` 미사용 함수 삭제
- 읽히지 않는 `useState` 13개 삭제(search/tag/comment/vote/ranking, dna/archive
  달력, birthday 관련 잔재)
- 도달 불가능한 팟캐스트 플레이어+페이월 블록(~550줄, state·로직·JSX 모달 2개)
  전체 삭제. 팟캐스트 재생은 이미 `/letters/[id]`로 이관돼 있었고, 이 블록의
  유일한 진입점(`startAudioBriefing`)의 유일한 호출자가 그 블록 자신의 모달
  안 "재시도" 버튼뿐이었다 — 직접 grep으로 확인

### FSD 배럴 파일 3개 신설

`features/dna/index.ts`, `widgets/NavProgress/index.ts`,
`widgets/SiteFooter/index.ts` — 기존 export 재노출만, 로직 변경 없음.
`app/dna/page.tsx`·`app/layout.tsx`·`app/providers.tsx`·`DnaContent.tsx`의
deep import 4건을 배럴 경유로 수정.

### shared → features 역방향 의존성 2건 해소

CLAUDE.md가 명시적으로 금지하는 패턴이었다.

- `CommunityPost`/`CommunityComment` 타입: `CommunityTab.tsx` 정의 →
  `shared/types/community.ts`로 이동
- `DailyQuestionItem` 타입: `QuestionTab.tsx` 정의 → `shared/types/question.ts`로 이동

각각 4개 파일(정의처, `features/*/index.ts`, `shared/lib/*Api.ts`, 소비하는
컴포넌트)을 새 경로로 갱신.

## 검증

- `npx tsc --noEmit` 클린
- `npm run build` 성공(35 라우트 정적 생성)
- grep으로 삭제된 함수/state/import 잔여 참조 없음 확인
- 브라우저 확장(claude-in-chrome)이 연결 안 돼 있어 계획했던 인터랙티브
  클릭스루(탭 전환, 커뮤니티 글쓰기 등) 검증은 못 했다. SSR 응답만 확인
  (`/`, `/dna`, `/calendar` 200, 에러 마커 없음) — 이 사실은 사용자에게
  그대로 보고했다

## 다음

- FeedPage.tsx의 커뮤니티/보관함 관련 모달(글쓰기, 게시글 상세, 문장 저장
  팝업)이 탭 컴포넌트가 features/로 나갈 때 같이 못 나가고 남아있음 — 실제
  구조 이동이라 이번 라운드에서는 안 함
- 나머지 deep-import 위반 18건(`fortune/lib/engine`이 6곳에서 우회, `couple-match`/
  `ideal-match` 간 lateral import 포함) — 파급 넓어 범위 밖
- `pages/`/`entities/` FSD 레이어는 0% 구현(폴더 자체가 없음), `src/components/`
  (6127줄)가 사실상 그 역할을 FSD 밖에서 담당 중 — 큰 구조 논의 필요, 이번엔
  CLAUDE.md에 현황만 반영
- 인터랙티브 브라우저 검증 — 확장 연결되면 재확인
