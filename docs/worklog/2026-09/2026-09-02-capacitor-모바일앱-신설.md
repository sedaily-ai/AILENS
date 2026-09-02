# 2026-09-02 Capacitor 기반 Android/iOS 앱 프로젝트 신설

작성: Claude Code (세션 기반, 사용자 지시)
관련: 브랜치 `feat/capacitor-mobile-app`(머지됨, main `81d955a`), 후속 서명
설정 커밋 `587db2d`, `mobile-capacitor/README.md`

## 배경

기존 Android 앱은 `mobile/`에 Bubblewrap TWA(구조상 안드로이드 전용)로
되어 있었다. "TWA는 안 된다"(iOS로 못 감)는 지적 이후 PWA(iOS 앱스토어
등록이 애초에 안 돼서 목표를 못 채움)와 React Native(웹 코드베이스 완전
재작성 필요, 지금 규모에 안 맞음)를 검토했고, **Capacitor로 Android·iOS를
하나의 래퍼 전략으로 통일**하는 쪽으로 결정.

## 한 것

- `mobile-capacitor/` 신설(레포 루트, `mobile/`과 형제, 완전 독립 npm
  프로젝트 — 이 레포엔 workspace가 없어 기존 관행 그대로).
- `capacitor.config.ts` — `server.url: https://ailens.sedaily.ai`로
  지정하는 **원격 URL 모드**. 이 앱은 SSR(`next.config.ts`
  `output:"standalone"`, 관리자 발행 즉시반영 요구사항)이라 Capacitor
  기본 모드(정적 웹 번들 내장)를 쓰면 안 됨 — TWA와 동일한 방식.
- `npx cap add android` + **디버그 APK 빌드 성공 확인**
  (`android/app/build/outputs/apk/debug/app-debug.apk`).
- `npx cap add ios` + `cap sync` 성공, `ios/App/App.xcodeproj` 생성 확인 —
  단 이 머신엔 정식 Xcode가 없어(Command Line Tools만 설치) 실제 빌드는
  못 함.
- 앱 아이콘/스플래시 — `service/frontend/public/icon-512.png`(TWA와 동일
  소스)에서 `@capacitor/assets`로 양쪽 플랫폼 전체 사이즈 생성.
- 릴리스 서명 설정 — `android/keystore.properties`(gitignored)에서 읽는
  `signingConfig` 추가, 새 keystore(`release.keystore`, gitignored)로
  서명한 `app-release.aab` 빌드 성공 확인.
- Play Console 업로드 시도 → **실패**: "잘못된 키로 서명됨" 에러
  (기대 SHA1 `19:47:CA:...`). 확인 결과 `mobile/app-release-bundle.aab`
  (옛 TWA 산출물)의 서명과 정확히 일치 — Play Console에 `ai.sedaily.lens`
  앱을 등록하는 시점에 이미 그 키가 서명키로 고정된 상태였다(미발행
  상태에서도 앱 생성 자체가 키를 고정시킬 수 있음, 이번에 처음 확인).
  `mobile/android.keystore`의 비밀번호를 로컬(zsh 히스토리·bubblewrap
  설정·레포 전체)에서 못 찾음 — Keychain 접근은 권한 밖이라 확인 불가.
  **막힌 채로 남음** — 아래 "다음" 참조.

## 결정

- `appId`는 기존 TWA와 동일하게 `ai.sedaily.lens` 재사용(Play 스토어
  미발행 확인 후 진행, 원래는 자유롭게 바꿔도 됐음).
- `versionCode`는 옛 TWA(8까지 감)를 이어받지 않고 1부터 새로 시작 —
  별개 프로젝트로 취급.
- 기존 `mobile/`(Bubblewrap TWA)은 손 안 댐 — Capacitor 쪽이 실제로
  Play에 업로드까지 잘 되는 게 확인되면 그때 폐기 여부 판단.
- 새 keystore/keystore.properties는 의도적으로 git에 안 올림(비밀번호
  평문 포함) — 로컬에만 존재.

## 다음

- **막힘 — 사용자 확인 필요**: `mobile/android.keystore` 비밀번호를
  비밀번호 관리자 등에서 찾아야 함. 못 찾으면 Play Console의 "업로드 키
  재설정" 공식 절차(구글 검토 필요)로 우회 가능 — 앱이 미발행 상태라
  절차가 더 간단할 가능성 있음.
- 비밀번호 찾으면: 새로 만든 keystore 대신 `mobile/android.keystore`로
  다시 서명해서 `bundleRelease` 재실행 → Play Console 업로드 재시도.
- iOS: 사용자가 Xcode 설치 후 `ios/App/App.xcworkspace` 열어서 실제
  빌드/시뮬레이터 확인 필요(이 세션에서 못 한 부분).
- 스코프 밖으로 남겨둔 것: 푸시 알림(`@capacitor/push-notifications`),
  팟캐스트 백그라운드 재생 등 OS 딥훅, Play Console/App Store Connect
  실제 제출 절차.
