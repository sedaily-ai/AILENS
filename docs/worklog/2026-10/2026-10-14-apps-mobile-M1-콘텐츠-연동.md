# 2026-10-14 apps/mobile M1 — 콘텐츠 읽기 전용 연동

작성: 사용자 + Claude Code
관련: 브랜치 `feat/mobile-m1-content-readonly`, `docs/architecture/apps-mobile-Expo-설계.md`

## 배경

Expo 정본 확정(같은 날 worklog 참조) 후 M1 셸의 남은 항목인 "홈·피드·상세 실제 콘텐츠 연동"을 진행. 로그인·푸시 없이 되는 읽기 전용 범위만 먼저 한다.

## 한 것

- `packages/api-client/src/posts.ts` 신규: `listPosts(channel, {date, limit})`, `getPost(id)`, `ApiError`, 앱이 쓰는 필드만 담은 `LetterPost`·`LensPost` 타입. 전역 fetch 만 사용(웹·앱 공용 가능). 웹의 `cmsPostsApi`(실패 시 빈 배열)와 달리 실패 시 throw — 앱이 "비어 있음"과 "실패"를 구분해 재시도 UI 를 보여야 해서.
- `apps/mobile`: 홈(오늘의 레터)·LENS·레터 탭을 목록으로, `article/[slug]`를 letters·lens 공용 상세로 구현. 공통 `AsyncView`(로딩/오류/재시도)·`PostCard`·`useAsync`(abort·재시도).
- 웹 코드는 건드리지 않음(웹은 기존 `cmsPostsApi` 유지).

## 결정

- 단건 조회는 백엔드의 `GET /api/v2/posts/{slug}`(slug=글 id)를 사용(공개·무인증, 라이브 200 확인).
- 상세는 `lenses` 필드 유무로 letters/lens 를 구분.
- 웹과 api 모듈 통합(웹이 `listPosts` 를 쓰게 하는 것)은 이번 범위 밖 — 웹 동작 불변 원칙 유지.

## 확인

- 라이브 API 대상 Node 스모크: letters 3건, lens 3건(렌즈 4개), 상세 id 일치·본문 15문단, 없는 id → `ApiError` 404.
- `tsc --noEmit` 통과, `expo export --platform android` 번들 성공(2.6MB).
- 미확인: 실기기·에뮬레이터 렌더링, ESLint(`apps/mobile`에 eslint 설정 없음).

## 다음

- 에뮬레이터/실기기에서 화면 확인(development build 또는 Expo Go).
- `apps/mobile` ESLint 설정 추가.
- Cognito 로그인(AuthProvider, App Client 콜백 추가는 AWS 권한 필요), M2 푸시.
- 상세 고도화(body_html·차트·이미지·팟캐스트).
