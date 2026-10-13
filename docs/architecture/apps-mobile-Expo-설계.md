# apps/mobile 설계 — Expo (React Native)

작성: 2026-10-13. 프레임워크: **Expo 확정**(근거: `앱-프레임워크-결정-Expo-vs-Capacitor.md`). 전제: 100만 DL, 앱 기능 전부, 운영 안정성·확장성 우선. 상위 구조: `모노레포-정석구조-설계.md`.

## 결론 먼저

- `apps/mobile`은 **Expo + expo-router(파일 기반 라우팅)** + **EAS(빌드·OTA·Submit)** 로 간다.
- UI만 신규 작성하고, 그 아래 전부(`packages/api-client`·`domain`·`auth`)는 웹과 공유한다.
- 인증은 웹과 동일한 **Cognito idToken → `Authorization: Bearer`** 계약을 그대로 쓴다. 백엔드 변경 0.
- 푸시는 `expo-notifications`로 토큰 발급, 서버 팬아웃은 `services/push`(별도 설계).

## 앱 내부 폴더 구조

```
apps/mobile/
├─ app/                          # expo-router(파일=라우트). 웹 app router와 1:1 대응 가능
│  ├─ _layout.tsx                # 루트: 폰트·테마·인증 게이트·푸시 등록
│  ├─ (tabs)/                    # 하단 탭 네비게이션
│  │  ├─ _layout.tsx
│  │  ├─ index.tsx               # 홈(오늘 1면)      ← 웹 /
│  │  ├─ lens.tsx                # LENS 피드         ← 웹 /lens
│  │  ├─ letter.tsx              # 레터             ← 웹 /letter
│  │  └─ me.tsx                  # 내 서랍/구독      ← 로그인 영역
│  ├─ category/[slug].tsx        # 카테고리 리스트    ← /economy, /finance ...
│  ├─ article/[...path].tsx      # 기사 상세         ← /{cat}/{y}/{m}/{d}/{slug}
│  ├─ lens/[slug].tsx            # LENS 상세
│  ├─ letter/[slug].tsx          # 레터 상세
│  ├─ listen/[slug].tsx          # 오디오 플레이어
│  ├─ paper/[date].tsx           # 지면
│  ├─ login.tsx                  # Cognito 로그인
│  └─ onboarding.tsx             # 온보딩
│
├─ src/
│  ├─ features/                  # 화면별 조립(홈/피드/상세/플레이어...)
│  ├─ components/                # 앱 전용 RN 컴포넌트(packages/ui-web과 별개)
│  ├─ navigation/                # 딥링크·탭·헤더 설정
│  ├─ push/                      # expo-notifications 등록·권한·수신 핸들러
│  ├─ auth/                      # Cognito 세션→packages/auth 어댑터(SecureStore 저장)
│  ├─ theme/                     # 디자인 토큰(웹 토큰에서 파생)
│  └─ lib/                       # 플랫폼 어댑터(storage, linking, analytics)
│
├─ assets/                       # 아이콘·스플래시(expo-asset)
├─ app.config.ts                 # Expo 설정(앱 이름·번들ID·플러그인·권한)
├─ eas.json                      # 빌드 프로파일(dev/preview/production) + Submit
├─ package.json
└─ tsconfig.json                 # paths로 packages/* 참조
```

### 왜 expo-router인가
파일 기반 라우팅이 웹 Next.js app router와 **1:1 멘탈모델**을 공유한다. 딥링크(`ailens://article/...`)와 유니버설 링크(https 공유 → 앱)가 라우트에 자동 매핑돼, 100만 DL에서 중요한 "링크 하나로 앱 특정 화면 열기"가 1급으로 지원된다.

## packages 소비 (공유 코드)

| 공유 패키지 | 앱이 쓰는 법 | 지금 웹 출처 |
|---|---|---|
| `packages/api-client` | 그대로 import. REST 호출·재시도 | `shared/lib/api/*`(9개) + `shared/config/apiClient` |
| `packages/domain` | 타입·순수 로직(날짜·투표·콘텐츠 선택) | `shared/types` + `shared/lib/{content,date,poll}` |
| `packages/auth` | Cognito 토큰 수명주기(플랫폼 저장소 주입) | `shared/lib/auth/{authFetch,amplifyLoader}` |

핵심 어댑터 포인트 — `packages/auth`는 토큰 저장소를 **주입**받게 만든다. 웹은 Amplify 기본(브라우저), 앱은 `expo-secure-store`. 이렇게 하면 `authFetch`의 `Authorization: Bearer <idToken>` 계약을 양쪽이 공유하면서 저장 매체만 플랫폼별로 갈린다.

## 인증 설계 (백엔드 변경 0)

```
앱 로그인(Amplify RN) ──▶ Cognito ──▶ idToken
                                   │ expo-secure-store 저장
API 호출 ──packages/auth.authFetch──▶ Authorization: Bearer <idToken>
                                   ▼
         기존 백엔드 core/auth.py:verify_cognito_token (그대로)
```

- 웹이 이미 `Authorization: Bearer <idToken>`로 호출하고 백엔드가 `verify_cognito_token`으로 검증 중. **앱도 동일 계약 → 서버 수정 없음.**
- Amplify는 RN을 공식 지원(`aws-amplify` + `@aws-amplify/react-native`). 같은 User Pool/Client 재사용.
- 소셜 로그인(카카오/구글)은 Cognito Hosted UI 또는 네이티브 SDK → Cognito federation. 웹 `auth/callback`과 동일 흐름을 앱 딥링크로 받는다.

## 푸시 설계 (프레임워크 측)

```
앱 ── expo-notifications ──▶ 권한 요청 ──▶ 디바이스 토큰(FCM/APNs)
                                        │
             POST services/push/register { user_id, token, platform }
```

- 프레임워크 책임: 권한 UX(iOS 거부율 관리), 포그라운드/백그라운드 수신, 알림 탭→딥링크 라우팅.
- 서버 책임(별도 `services/push` 설계): `push_tokens` 테이블, 발행 트리거 팬아웃, SNS/FCM 배치, 무효 토큰 정리. 100만 발송 본체는 여기.
- 테스트는 **development build 필요**(Expo Go는 SDK 53+에서 Android 푸시 미지원). 어차피 인증서·네이티브 설정은 필수이므로 EAS dev build로 처리.

## EAS — 빌드·배포·OTA

| 프로파일 | 용도 |
|---|---|
| `development` | dev client(핫리로드+네이티브 모듈, 푸시 테스트) |
| `preview` | 내부 테스터(TestFlight/내부공유 APK) |
| `production` | 스토어 제출 빌드 |

- **EAS Update(OTA)**: JS/자산 변경은 스토어 심사 없이 즉시 배포. 100만 DL에서 핫픽스 리드타임이 치명적이라 1급 기능으로 둔다. 네이티브 변경만 스토어 재제출.
- **EAS Submit**: App Store/Play 제출 자동화.
- 서명키: EAS가 관리하거나 기존 `mobile-capacitor`의 keystore 승계(비밀 채널 보관, git 제외). `appId: ai.sedaily.lens` 재사용 검토(미발행이라 자유).

## 화면 매핑 (웹 라우트 → 앱)

| 웹 라우트 | 앱 화면 | 비고 |
|---|---|---|
| `/` | `(tabs)/index` 홈 | 오늘 1면 |
| `/lens`, `/lens/[slug]` | `(tabs)/lens`, `lens/[slug]` | LENS 피드/상세 |
| `/letter`, `/letter/[slug]` | `(tabs)/letter`, `letter/[slug]` | 레터 |
| `/{economy,finance,...}` (10개) | `category/[slug]` | 카테고리 공통 화면 |
| `/{cat}/{y}/{m}/{d}/{slug}` | `article/[...path]` | 기사 상세 |
| `/listen/[slug]` | `listen/[slug]` | 오디오(백그라운드 재생=네이티브 이점) |
| `/paper/[date]` | `paper/[date]` | 지면 |
| `/games/play/[slug]` | `games/*` | 웹뷰 임베드 허용(게임은 예외) |
| `/login`, `/onboarding` | `login`, `onboarding` | Cognito |
| 구독/내 서랍 | `(tabs)/me` | 로그인 영역 |

원칙: 콘텐츠·리스트·플레이어는 네이티브. 게임 등 복잡 웹 자산만 선택적 웹뷰 임베드(예외를 명시).

## 마일스톤

1. **M0 선행(프레임워크 중립)**: `pnpm-workspace.yaml` + `packages/{api-client,domain,auth}` 승격. 웹 import 경로 교체, 동작 불변을 테스트로 증명.
2. **M1 앱 셸**: Expo 초기화, expo-router 탭 3개, Cognito 로그인, `packages/*` 연결, 홈·피드·상세 읽기 전용.
3. **M2 푸시 MVP**: expo-notifications 토큰 등록 + `services/push/register` + 단건 발송→수신 확인(dev build).
4. **M3 발송 팬아웃**: 발행 트리거 연동 + SNS/FCM 배치(services/push 설계).
5. **M4 기능 확장**: 오디오 백그라운드 재생, 딥링크/유니버설 링크, 오프라인 캐시, 내 서랍.
6. **M5 출시**: 아이콘·스플래시·권한 고지·스토어 메타, EAS production + Submit.

각 M은 독립 PR 묶음. M0는 어느 프레임워크든 선행되는 공통 작업이라 지금 바로 착수 가능.

## 미결 (다음 결정)

- 소셜 로그인 방식: Cognito Hosted UI vs 네이티브 SDK federation.
- 디자인 토큰 공유 방식: 웹 CSS 토큰 → RN 테마 변환 자동화 여부.
- `services/push` 발송 경로: SNS Mobile Push vs FCM 직결(별도 비교 문서).

## 안 하는 것

- 웹 UI 컴포넌트를 RN으로 억지 공유(플랫폼 특성 무시 금지).
- Expo Go에 의존한 푸시 테스트(dev build로).
- 서명키 git 커밋.
