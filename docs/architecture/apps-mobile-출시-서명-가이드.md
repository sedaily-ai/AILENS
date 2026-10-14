# apps/mobile 출시·서명 가이드 (Expo → 기존 Play 앱 업데이트)

작성: 2026-10-14. 상위: `apps-mobile-Expo-설계.md`. 이 문서에는 비밀값(비밀번호·키 파일)을 적지 않는다.

## 전제 (2026-10-14 Play Console 확인)

- 앱: `LENS(MY STYLE) NEWS`, 패키지명 `ai.sedaily.lens` — 이미 발행돼 사용자가 있다(월간 활성 기기 11, 지난 28일 기준).
- 서명 방식: **Play 앱 서명 사용**. 사용자 기기에 설치된 앱은 Google 이 관리하는 앱 서명 키로 서명되고, 개발자는 **업로드 키**로 서명해 올린다.
- 업로드 키(Play Console 등록값) SHA-1 `EB:EB:0C:40:6D:38:CF:1A:D1:9E:9C:52:3D:32:2A:21:85:53:D3:E3` = 기존 `mobile-capacitor` 의 `release.keystore`(별칭 `ailens`, 2026-09-02 생성)와 일치 확인.
- 옛 TWA 키(`mobile/android.keystore`)는 Play 에 등록돼 있지 않다. 업데이트에 쓰이지 않는다.

따라서 Expo 앱은 **같은 패키지명 + 같은 업로드 키**로 올리면 신규 앱이 아니라 업데이트가 된다.

## 키 보관 (저장소 밖)

| 항목 | 위치 |
|---|---|
| 업로드 키 + 비밀번호 파일 | `~/ailens-secrets/android-signing/capacitor-upload-key/` (`release.keystore`, `keystore.properties`) |
| 옛 TWA 키(보관용) | `~/ailens-secrets/android-signing/legacy-twa/android.keystore` |

- 이 로컬 폴더는 1차 사본일 뿐이다. **팀 비밀번호 관리자 등 별도 채널에 2차 백업이 필요하다**(미완료).
- 저장소의 `docs/`·코드·`apps/mobile`에는 키 파일을 두지 않는다(`apps/mobile/.gitignore`에 `*.keystore`·`credentials.json` 차단 추가).
- 업로드 키를 잃으면 Play Console `앱 서명 > 업로드 키 재설정 요청`으로 복구할 수 있으나 며칠 걸린다.

## 출시 절차

1. EAS 로그인·프로젝트 연결(1회): `cd apps/mobile && npx eas-cli login && npx eas-cli init` → `app.config.ts` 에 projectId 반영.
2. 업로드 키 등록(1회): `npx eas-cli credentials --platform android` → production 프로파일 → Keystore 에 기존 `release.keystore`·별칭 `ailens`·비밀번호를 업로드(EAS 가 새 키를 만들게 두지 않는다).
3. versionCode 기준선 설정(1회): Play Console `앱 번들 탐색기`에서 현재 최대 versionCode 를 확인한 뒤 `npx eas-cli build:version:set --platform android` 로 그 값 이상으로 맞춘다. `eas.json` 이 `appVersionSource: remote` + `autoIncrement` 라 이후엔 자동 증가한다. (Capacitor 저장소 기준 마지막 값은 11, 실제 업로드 값은 미확인.)
4. 빌드: `npx eas-cli build --platform android --profile production` → AAB 산출.
5. 업로드: Play Console `내부 테스트` 트랙에 AAB 업로드(또는 `eas submit` — 서비스 계정 JSON 필요). 실기기 검증 후 프로덕션 승급.
6. 이후 JS 변경은 `eas update --channel production`(OTA), 네이티브 변경만 5번 재제출.

## 주의

- 현재 `apps/mobile` 은 M1 셸이다. 프로덕션 트랙에 올리면 기존 Capacitor 사용자에게 기능 퇴보가 된다. 설계 문서 M5 전까지 **내부 테스트 트랙만** 쓴다.
- 패키지명(`ai.sedaily.lens`)·업로드 키를 바꾸면 업데이트가 끊긴다.
- `mobile-capacitor/` 는 Expo 출시 후 archive 로 옮길 때 keystore 를 먼저 위 보관 위치에서 확인한다.
