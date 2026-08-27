# 2026-08-26 TWA 다크모드 근본 원인 확인 — androidbrowserhelper 하드코딩 + 삼성 인터넷

작성: 문영광 + Claude Code
관련: `mobile/app/src/main/java/ai/sedaily/lens/LauncherActivity.java`,
`mobile/twa-manifest.json`, `mobile/app/build.gradle`, 전날 worklog
`2026-08-25-mustknow-auto-tab-threshold-and-twa-dark-mode.md`

## 배경

8/25에 넣은 두 수정(`forceDarkAllowed=false`, 사이트 `color-scheme: light`)이
실기기에서 여전히 안 먹혔다. Play Console 업로드→테스터 배포→기기 반영까지
매번 왕복이 길어서(오늘 하루에만 수 시간), 이 세션에서 로컬 adb 사이드로드
테스트 체계로 먼저 전환하고 그 위에서 근본 원인을 다시 짚었다.

## 한 것

### 로컬 테스트 체계 전환
- 삼성 "자동 차단(Auto Blocker)"이 USB 디버깅을 막고 있어 사용자가 해제.
- `adb install`은 Play 서명(Google Play 앱 서명)과 로컬 키스토어 서명이 달라
  `INSTALL_FAILED_UPDATE_INCOMPATIBLE`로 실패 — `adb uninstall` 후 재설치로
  우회. 이후 빌드부터는 Play Console 업로드 전에 adb로 먼저 실기기 확인하는
  흐름으로 전환.

### 근본 원인 확인
- `androidbrowserhelper` 2.6.2(현재 프로젝트 고정 버전)와 최신 2.7.3 AAR을
  둘 다 `javap`로 디컴파일 — `LauncherActivity.launchTwa()`가
  `TrustedWebActivityIntentBuilder.setColorScheme(0)`(`COLOR_SCHEME_SYSTEM`)을
  **하드코딩** 호출. `twa-manifest.json` 어떤 필드로도 못 바꾸는 라이브러리
  자체 제약 — 2.7.3까지도 안 고쳐져 있음.
- versionCode 7(이 하드코딩을 우회하려고 `createTwaLauncher()`를 오버라이드해
  colorScheme을 LIGHT로 재지정한 첫 시도)을 로컬 sideload로 테스트했는데도
  여전히 검게 나옴 → `adb logcat`으로 직접 확인.
- 로그에서 결정적 단서 발견: TWA를 실제로 그리는 게 Chrome이 아니라
  **삼성 인터넷**(`com.sec.android.app.sbrowser`, `SBrowserLauncherActivity`/
  `customtabs.CustomTabActivity`)이었음. `TwaLauncher`가 provider package를
  안 지정하면 `CustomTabsClient.getPackageName()`으로 기기에 설치된 것 중
  "가장 적합한" 브라우저를 자동 선택하는데, 이 기기는 삼성 인터넷이 뽑힘.
  삼성 인터넷 자체 다크모드 설정(사용자가 껐더니 즉시 정상 렌더링 확인)이
  Custom Tabs의 colorScheme extra보다 우선하는 것으로 보임.
- 사용자마다 기본/우선 브라우저가 다르므로 "삼성인터넷 다크모드 꺼주세요"는
  근본 해결이 아니라고 판단 — provider package를 명시적으로
  `com.android.chrome`으로 고정하도록 재수정(`TwaLauncher(this, "com.android.chrome")`).
  Chrome은 GMS 인증 기기엔 사실상 항상 설치돼 있어 안전한 기본값으로 판단.
- versionCode 8로 재빌드+로컬 sideload, 삼성 인터넷 다크모드를 다시 켠 채로
  재테스트 요청 — 결과 확인은 사용자 쪽에서 진행 중(이 worklog 시점 미확정).

## 결정

- provider package를 `com.android.chrome`으로 고정하는 방향으로 확정. PWA
  ("홈 화면에 추가")로 전환하는 대안도 검토했으나, 이 버그를 피할 순 있어도
  Play 스토어 검색/설치 노출을 전부 포기해야 해서 기각 — TWA 유지 + 이번
  코드 수정으로 근본 해결을 우선한다.
- 이후 릴리스 프로세스는 "로컬 adb 사이드로드로 먼저 확인 → 이상 없으면
  Play Console 업로드"로 변경. 기존 "업로드→테스터 반영 대기→실기기 확인"
  왕복은 한 버그당 수 시간이 걸려 비효율적이었음.

## 다음

- versionCode 8이 삼성 인터넷 다크모드 ON 상태에서도 정상 렌더링되는지
  사용자 확인 대기 — 확인되면 Play Console에 정식 업로드.
- Chrome이 없는(또는 비활성화된) 기기에서 `TwaLauncher(this, "com.android.chrome")`
  생성자가 어떻게 동작하는지(설치 안 됐을 때 폴백 여부) 아직 실기기로
  검증 안 함 — 극히 드문 케이스로 보고 우선순위 낮게 둠.
