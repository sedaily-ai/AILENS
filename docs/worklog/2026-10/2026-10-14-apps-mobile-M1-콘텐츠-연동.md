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

- 홈 재설계(웹 모바일 홈 구조): 밝은 테마 토큰, 상단바·카테고리 칩·미니 플레이어, 오늘의 지면 히어로, 최신 뉴스 그리드, 카테고리 섹션, 웹툰·영상·오디오. 설계는 `docs/architecture/apps-mobile-홈-설계.md`. `app/category/[slug].tsx` 신설, api-client 에 webtoon·video·home_player 타입 추가.

- 내비게이션 확정: 햄버거 없이 뉴닉 구조(하단 4탭 홈/발견/듣기/나의 LENS + 상단 검색·프로필). 카테고리 칩·카테고리 섹션·웹툰·영상·레터는 홈에서 발견 탭으로 이동, 프로필 아이콘은 `/account`(로그인·약관). 기존 LENS·레터 탭은 제거.

- 검색 화면(`app/search.tsx`): 웹 검색 순수 로직을 `@ailens/domain` 으로 승격(웹은 재수출로 유지, 웹 테스트 22건 통과), 앱은 웹과 같은 `/api/search-index` 를 받아 기기에서 검색. 최근 검색어·요즘 키워드·정렬·기간·분류 탭·무한 스크롤. 웹 코드 변경이 있어 웹 배포는 별도(동작 불변).

- 로그인 화면(`app/login.tsx`, 모달): Google + 이메일 로그인·회원가입(이름·이메일·비밀번호 정책 체크리스트)·이메일 인증 코드(재전송 30초 쿨다운, 가입 직후 자동 로그인)·비밀번호 찾기/재설정. 규칙·문구는 웹 AuthContext 와 동일(계정 열거 방지 포함)하게 `src/auth/emailAuth.ts` 에 두고, 비밀번호 정책은 `@ailens/domain` 으로 승격(웹은 재수출, 웹 tsc 통과). 진입점은 나의 LENS·내 계정 화면.
- 서버 검증: Cognito 에 SRP 이메일 로그인 호출이 닿는 것 확인(없는 계정 → UserNotFound → 앱에서 "이메일 또는 비밀번호가 올바르지 않습니다"로 통일). 실제 가입·로그인·Google 흐름은 실기기 미확인.

- 웹툰·영상·오디오 전용 화면: `/webtoon`(목록·컷 세로 보기), `/video`(목록·expo-video 플레이어), `/listen/[slug]`(오디오 상세·배속·대본), 전역 `PlayerProvider`(expo-audio) 로 미니 플레이어·듣기 탭을 연결(큐·자동 다음 곡·잠금화면·백그라운드). `getPost` 에 channel 옵션, api 타입에 panels·transcript 추가. 네이티브 모듈 추가로 EAS 개발 빌드 재생성 필요.

- **로그인 redirect 정정**: 개발 빌드에서 `InvalidAppSchemeException`(앱 시작 시) 발생 → Amplify RN 소스(`getRedirectUrl.native`) 확인 결과 https redirect 불가. 앱 스킴 `ailens://auth/callback`·`ailens://auth/signout` 로 변경, Cognito 콜백·로그아웃 URL 에 추가 필요(스크립트 `cognito-add-app-scheme.sh`, 사용자 실행). 앞서 등록한 https URL·assetlinks 는 향후 자체 PKCE 전환 대비로 유지.

- 기사 상세 고도화: 웹 레터 파서·인라인 서식·용어집 분할 등 순수 로직을 `@ailens/domain` 으로 승격(웹은 재수출·사용으로 전환, 웹 vitest 95·레터 파서 12 통과, eslint 이상 없음). 앱은 4형식 탭·레터 블록·용어 시트·투표·글자 크기·진행바·공유·같은 분류 글·letters 전용 본문(차트·이미지·리치텍스트). 실제 글 20건으로 파서가 예외 없이 도는 것을 확인(소제목 74·비교 8·특별 칸 57).

- 나머지 웹 기능 이식 1차: 나의 LENS(서랍·저장·읽은 글·관심 분야·읽기 통계), 문장 저장, 비밀번호 변경, 카테고리 하위 분류·페이지네이션, 검색 범위·하위 분류 필터, 그날로 떠나요(타임머신)·지난 지면. 웹 "나의 LENS"는 대부분 브라우저 저장·초안 단계이고 서버(리워드·저장 동기화·개인화 푸시)가 미구현이라 해당 부분은 이식 대상에서 제외(백엔드 인수인계 문서 참고).

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
