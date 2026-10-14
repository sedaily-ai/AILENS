# 2026-10-14 apps/mobile M1 — 콘텐츠 읽기 전용 연동

작성: 사용자 + Claude Code
관련: 브랜치 `feat/mobile-m1-content-readonly`, `docs/architecture/apps-mobile-Expo-설계.md`

## 배경

Expo 정본 확정(같은 날 worklog 참조) 후 M1 셸의 남은 항목인 "홈·피드·상세 실제 콘텐츠 연동"을 진행. 로그인·푸시 없이 되는 읽기 전용 범위만 먼저 한다.

## 한 것

- `packages/api-client/src/posts.ts` 신규: `listPosts(channel, {date, limit})`, `getPost(id)`, `ApiError`, 앱이 쓰는 필드만 담은 `LetterPost`·`LensPost` 타입. 전역 fetch 만 사용(웹·앱 공용 가능). 웹의 `cmsPostsApi`(실패 시 빈 배열)와 달리 실패 시 throw — 앱이 "비어 있음"과 "실패"를 구분해 재시도 UI 를 보여야 해서.
- `apps/mobile`: 홈(오늘의 레터)·LENS·레터 탭을 목록으로, `article/[slug]`를 letters·lens 공용 상세로 구현. 공통 `AsyncView`(로딩/오류/재시도)·`PostCard`·`useAsync`(abort·재시도).
- 웹 코드는 건드리지 않음(웹은 기존 `cmsPostsApi` 유지).

- 앱 인증 코드 추가(A안: aws-amplify RN): `src/auth/{configureAuth,secureStorage,authProvider,AuthContext}`, `(tabs)/me.tsx`(로그인/로그아웃 화면), 루트에 `AuthProvider` 연결. 토큰은 SecureStore(Keychain/Keystore)에 저장, 웹과 같은 User Pool·App Client 공유, redirect=`https://ailens.sedaily.ai/app/auth/callback`(인증된 https 앱 링크, 아래 결정 참조).
- 의존성 추가: aws-amplify, @aws-amplify/react-native, @aws-amplify/rtn-web-browser, async-storage, netinfo, react-native-get-random-values(루트 package-lock 갱신).
- 탭 헤더를 끄고 각 화면이 제목·상단 여백을 직접 그리도록 정리(이중 여백 방지).

## 결정

- **로그인 redirect 는 커스텀 스킴이 아니라 인증된 https 링크(RFC 8252 권장)로 확정.** 100만 DL 목표라 나중에 바꾸는 비용을 피하려고 처음부터 정석으로 간다. 웹 로그인과 충돌하지 않게 앱 전용 경로 `/app/`을 쓴다.
- 라이브 `assetlinks.json` 의 지문(`D6:1C:…`)은 현재 Play 앱 서명 키(`41:03:4F:…`, Play Console 값)와 달라 검증이 안 되는 상태였음 → Play 앱 서명 키 지문 추가(기존 유지). 웹 배포 전.

- 단건 조회는 백엔드의 `GET /api/v2/posts/{slug}`(slug=글 id)를 사용(공개·무인증, 라이브 200 확인).
- 상세는 `lenses` 필드 유무로 letters/lens 를 구분.
- 웹과 api 모듈 통합(웹이 `listPosts` 를 쓰게 하는 것)은 이번 범위 밖 — 웹 동작 불변 원칙 유지.

## 확인

- 라이브 API 대상 Node 스모크: letters 3건, lens 3건(렌즈 4개), 상세 id 일치·본문 15문단, 없는 id → `ApiError` 404.
- `tsc --noEmit` 통과, `expo export --platform android` 번들 성공(2.6MB).
- 인증 코드 추가 후에도 `tsc` 통과, android 번들 성공(3.7MB). 미확인: 실제 로그인 흐름, 실기기·에뮬레이터 렌더링, ESLint(`apps/mobile`에 eslint 설정 없음).

## 다음

- [완료 2026-10-14] Cognito App Client(`66c9bq3ovmk007d0eepkle92k3`)의 Callback/SignOut URLs 에 `https://ailens.sedaily.ai/app/auth/callback`·`/app/auth/signout` 추가(기존 URL 유지, 변경 필드는 CallbackURLs·LogoutURLs 뿐임을 전후 비교로 확인, 사용자가 직접 실행)(현재 웹 3개 URL 만 등록, 공개 클라이언트·code flow 확인). 기존 URL 은 유지하고 추가만. 운영 인증 설정 변경이라 승인 후 실행.
- [완료 2026-10-14] 웹 `assetlinks.json` 배포(ECS 리비전 114, 라이브에서 지문 2개 확인). 추가한 지문 `41:03:4F:…`은 Play Console 앱 서명 키 SHA-256 과 재대조 필요. iOS 는 Apple Team ID 확보 후 `apple-app-site-association` 추가.
- Amplify RN 의 https redirect 동작(특히 iOS ASWebAuthenticationSession https 콜백은 iOS 17.4+) 은 개발 빌드에서 실측 필요 — 막히면 `ailens://` 폴백 검토.
- 로그인은 네이티브 모듈(rtn-web-browser)이 필요해 Expo Go 불가 — EAS development build 로 확인.
- 에뮬레이터/실기기에서 화면 확인.
- `apps/mobile` ESLint 설정 추가.
- Cognito 로그인(AuthProvider, App Client 콜백 추가는 AWS 권한 필요), M2 푸시.
- 상세 고도화(body_html·차트·이미지·팟캐스트).
