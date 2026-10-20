# 2026-10-15 모바일 capacitor 삭제와 폴더 구조 재편 롤백

작성: 사용자 + Claude Code
관련: PR #117(`chore/remove-mobile-capacitor`), `docs/architecture/모노레포-정석구조-설계.md`, `docs/architecture/apps-mobile-출시-서명-가이드.md`

## 배경

Expo 앱이 정본이 되어 옛 Capacitor 셸이 불필요해졌고, "앱 관련은 한 폴더로" 모으고 싶다는 요청이 있었다.

## 한 것

- `mobile-capacitor/` 삭제(추적 113개, git 기록에 남음) 후 `.dockerignore`·`.easignore`·앱 README·`app.config.ts` 주석·서명 가이드·운영 런북의 언급 갱신. 삭제 전 업로드 키 `release.keystore` 해시가 `~/ailens-secrets/android-signing/` 백업과 일치함을 확인.
- `service/frontend`→`apps/web`, `admin/*`→`apps/admin`·`services/admin-api`, `service/*`→`services/*` 이동을 시도: 경로 참조 252개 파일 갱신, 웹 `tsc`·vitest 125건·`next build`·admin 빌드 통과, 파이썬 경로(문자열을 쪼개 만든 경로 5곳 포함) 수정. Docker 빌드는 시간이 길어 중단.

## 결정

- 폴더 재편은 **롤백**(사용자 결정, "리팩토링 안 한다"). `main` 체크아웃으로 복귀, 브랜치 삭제. 되살릴 때는 `pipelines/` 이동(깊이가 1단계라 `../..` 경로 가정 스크립트가 깨짐)과 `admin-api` 배포 스크립트가 `pipelines/`·`service/backend` 파일을 복사해 가는 점을 먼저 처리해야 함.
- `packages/`(domain·api-client·auth)는 웹이 import하는 공용 코드라 앱 폴더로 옮기지 않음.

## 다음

- 업로드 키 2차 백업(외장 드라이브·비밀번호 관리자) — 로컬 사본만 있는 상태.
