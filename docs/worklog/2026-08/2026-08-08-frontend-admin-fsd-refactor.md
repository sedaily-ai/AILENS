# 2026-08-08 프론트/admin 구조 리팩토링 — 죽은 코드 삭제 + FSD boundaries 정리

작성: Claude Code
관련: 커밋 a302756, 6726435, fc3fead, c98f949, fcc8f99, dfe4627, 71984be (main)

## 배경

SSR 전환·SSE 무효화 아키텍처 작업(같은 날 `2026-08-08-frontend-ssr-migration.md`)이 끝난
뒤, 사용자가 "코드 대용량 리팩토링 계획세우시고, 구조화잘되었는지 파일명 바꿔도됨.
허가없이 바로 진행하세요"라고 요청. 파일명 변경 허가 + 매 스텝 확인 없이 진행하라는
포괄 승인을 받고 시작한 세션.

## 한 것

1. **죽은 코드 삭제** — exhaustive grep으로 외부 참조 0건 확인 후 삭제. frontend 9개
   (`StoryNewsFeed.tsx`, `Character3D.tsx`, `SajuIcon.tsx`, `LetterTransition.tsx`,
   `SocialFooter.tsx`, `mockOneShot.ts`, `onboardingCopy.ts`, `mockArticles.ts`,
   `userApi.ts`) + backend 2개(`article_filter_service.py`, `pg_client.py`).

2. **`eslint-plugin-boundaries` 실질 무력화 상태를 발견·수정** — 4중 원인이 겹쳐 FSD
   레이어 위반 검출이 사실상 0건이었다: (1) `public/games/**/*.js`가 ignore에
   없어 1446건 노이즈에 진짜 이슈가 묻힘, (2) deprecated된 `boundaries/element-types`
   를 그대로 씀, (3) v6에서 바뀐 객체 셀렉터 문법(`allow: {to: {type: [...]}}`)
   대신 옛 문자열 배열 문법을 써서 "legacy selector syntax" 경고만 뜨고 검출 0건,
   (4) `import/resolver` 설정 자체가 없어 `@/` tsconfig 별칭 import를 전부
   "미해석" 취급 — 이 코드베이스는 거의 모든 import가 `@/`라 사실상 전체 무력화.
   네 가지 다 고치고 나서야 실제 위반 16건이 드러났다.

3. **frontend 구조 이관** (`eslint.config.mjs`의 `boundaries/dependencies` 규칙 기준):
   - `FeedPage.tsx`: `components/mbti/` → `widgets/FeedPage/`
   - `SmartSearchOverlay.tsx`: `components/mbti/` → `shared/ui/`
   - `StaticPageShell.tsx`: `shared/ui/` → `widgets/StaticPageShell/` (Header 위젯을
     합성하므로 shared보다 widgets가 맞는 레이어)
   - `NewsTimeMachine.tsx`(892줄): `components/timeline/` → `features/timeline/`
   - features 간 lateral import 8건 해소: `fortune/lib/engine.ts` +
     `ideal-match/lib/personaDictionary.ts`(사주 원국·궁합 연산 — couple-match/
     ideal-match/news-feed/dna 4개 feature가 공유)를 신설 `entities/saju/`로 통합.
     `auth/contexts/AuthContext.tsx`(세션 상태)를 신설 `entities/user/`로 옮기고
     `features/auth`는 재수출만 유지. `news-feed`의 범용 `useCountUp` 훅은
     `shared/lib/`로.
   - `eslint.config.mjs`에 `widgets → widgets` 의존 허용 추가(Header 같은 전역
     chrome을 페이지 단위 widget이 재사용하는 패턴이 이미 있어서).
   - 결과: `boundaries/dependencies` 위반 16건 → 0건.

4. **admin 구조 정리**:
   - `posts/page.tsx`·`letters/page.tsx`에 동일하게 있던 focus/visibilitychange
     → 강제 리로드 로직(2026-08-08 stale 목록 버그 수정 코드)을
     `lib/useReloadOnVisible.ts` 훅으로 통합. `posts/page.tsx`는 일괄 작업 후
     리로드도 필요해 별도 `bulkReloadKey`를 훅의 `reloadKey`와 함께 합성.
   - `PostForm.tsx`(855줄, mode 5종 + 서브컴포넌트 4개가 한 파일에)를
     `components/PostForm/` 디렉터리로 분리 — mode별 파일(`PostMode`/
     `TrendCardMode`/`WebtoonMode`/`VideoMode`/`LetterMode`) + 서브컴포넌트별
     파일 + `bodyUtils.ts`(순수 헬퍼) + `shared.ts`(공통 타입/상수) + `index.ts`
     배럴. 소비자 3곳의 `@/components/PostForm` import 경로는 그대로 유지.
     최대 파일 205줄(`WebtoonPanelsEditor.tsx`)로 축소.

각 단계마다 `tsc --noEmit` + `eslint` + `npm run build` 로 검증 후 커밋·푸시.

## 결정

- `entities/` 레이어를 이번에 처음 실사용 — CLAUDE.md에 "계획됐지만 아직 없음"으로
  적혀 있던 레이어. 사주 연산 로직과 인증 세션이 여러 feature에 걸쳐 재사용되는
  전형적인 FSD entity 케이스라 판단해 도입.
- `useAuth`/`AuthProvider`를 `entities/user`로 옮기되 `UserMenu`/`LoginButton`은
  `features/auth`에 남김 — 전자는 순수 세션 상태(entity), 후자는 feature 수준 UI로
  성격이 다르다고 판단. `features/auth/index.ts`는 하위 호환을 위해 재수출만.
- `PostForm` 분리 시 각 mode 컴포넌트에 `ModeProps`(value/body/patch/patchBody)를
  공통 타입으로 넘기는 얕은 조합 방식을 택함 — mode마다 필요한 하위집합이 달라도
  하나의 인터페이스로 통일하는 게 5개 파일 유지보수에 더 단순하다고 판단.

## 다음

- 이번 리팩토링에서 다룬 범위는 사용자가 지정한 8개 태스크(#51~#58)로 끝. 추가로
  발견됐지만 태스크화하지 않은 것: `admin/backend/shared/notify.py`(SSE 무효화
  webhook 호출용, SSR 마이그레이션 세션에서 신설)와 `admin/backend/shared/
  ssm_client.py`가 SSM 시크릿 접근을 서로 다른 방식으로 하고 있어 컨벤션 통일
  여지가 있음 — 별도 세션에서 검토 필요.
