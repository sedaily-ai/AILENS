# mobile-capacitor — AI LENS Android/iOS 앱 (Capacitor)

`mobile/`(Bubblewrap TWA, 안드로이드 전용)을 대체하기 위한 Capacitor 프로젝트.
**원격 URL 모드**로 동작 — 로컬에 웹 빌드를 담지 않고 `capacitor.config.ts`의
`server.url`이 `https://ailens.sedaily.ai`(service/frontend, SSR)를 직접 가리킨다.
이 앱은 관리자 발행이 재빌드 없이 즉시 반영돼야 하는 SSR 구조라, Capacitor
기본 모드(정적 웹 번들 내장)를 쓰면 안 된다 — `capacitor.config.ts` 상단
주석 참조.

## 상태 (2026-09-02)

- Android: `npx cap add android` 완료, **디버그 APK 빌드 성공 확인**
  (`android/app/build/outputs/apk/debug/app-debug.apk`)
- iOS: `npx cap add ios` + `npx cap sync ios` 완료, Xcode 프로젝트
  (`ios/App/App.xcodeproj`) 생성 확인. **이 머신엔 정식 Xcode가 없어서
  (Command Line Tools만 설치됨) 실제 빌드/시뮬레이터 실행은 못 해봤다** —
  Mac App Store에서 Xcode 설치 후 `ios/App/App.xcworkspace`를 열어서
  진행할 것.
- Play 스토어 미발행 상태라 `appId: ai.sedaily.lens`를 `mobile/`(옛 TWA)과
  동일하게 재사용, 서명키는 새로 생성(아래 참조) — `mobile/`은 아직 안 지웠음.

## 빌드

### Android

⚠️ **JDK 버전 함정**: `~/.bubblewrap/jdk/jdk-17.0.11+9`(Bubblewrap이 설치한
JDK 17)로는 안 된다 — Capacitor 8.x의 Android 라이브러리가 Java 21 소스
호환성을 요구해서 `invalid source release: 21`로 빌드가 깨진다. 이 머신에
이미 설치돼 있는 시스템 JDK 21(`/Library/Java/JavaVirtualMachines/jdk-21.jdk`)을
써야 한다.

```bash
cd android
export ANDROID_HOME=~/.bubblewrap/android_sdk
export JAVA_HOME="/Library/Java/JavaVirtualMachines/jdk-21.jdk/Contents/Home"
./gradlew assembleDebug   # 디버그 APK
# 릴리스 서명 빌드는 mobile/의 android.keystore 패턴 참고해 별도 설정 필요
```

### iOS (Xcode 설치 후)

```bash
npx cap sync ios
open ios/App/App.xcworkspace
```

## 아이콘/스플래시 재생성

`assets/icon.png`(현재 `service/frontend/public/icon-512.png`와 동일 소스)를
바꾸고 나서:

```bash
npx capacitor-assets generate
```

`icons/`(PWA 전용 산출물)가 같이 생기는데 이 프로젝트엔 안 쓰니 생성되면 지울 것
(웹 앱 자체의 PWA 아이콘은 `service/frontend/public/`이 따로 관리).

## 스코프 밖 (아직 안 한 것)

- 푸시 알림(`@capacitor/push-notifications`) — 옛 TWA manifest의
  `enableNotifications: true`에 대응하는 기능, 미구현
- 팟캐스트 백그라운드 재생 등 OS 딥훅 — 별도 네이티브 플러그인 필요
- Play Console / App Store Connect 실제 제출
- `mobile/`(Bubblewrap TWA) 폐기 여부 — 아직 안 건드림, 이 프로젝트가
  실제로 잘 동작하는 거 확인되면 판단
