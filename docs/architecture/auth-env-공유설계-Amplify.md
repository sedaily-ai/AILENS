# auth/env 공유 설계 — @ailens/auth (Amplify 공유, A안)

작성: 2026-10-13. 결정: **A안 — 웹·앱(Expo) 모두 aws-amplify 로 Cognito 사용**(사용자 확정). 선행: api-client 승격의 전제. 상위: `모노레포-정석구조-설계.md`, `apps-mobile-Expo-설계.md`.

## 결론 먼저

- Cognito User Pool(`us-east-1_ZS8PgF3iX`)·Client·Google OAuth 는 웹·앱이 **그대로 공유**. 백엔드(`verify_cognito_token`) 수정 0.
- `@ailens/auth` 에 authFetch 로직을 올리고, **플랫폼마다 다른 2가지만 주입**받는다: ①Amplify config(특히 redirect URL) ②토큰 저장소.
- `apiClient` 의 `process.env.NEXT_PUBLIC_*` 는 **런타임 config 주입**으로 바꿔 웹(Next env)·앱(Expo env)이 각자 값을 넣게 한다.

## 실측 (2026-10-13, 웹 코드)

```
authFetch.ts   loadAmplifyAuth() → auth.fetchAuthSession() → tokens.idToken → 'Authorization: Bearer <idToken>'
amplifyLoader  aws-amplify 지연 로딩(동적 import, 첫 번들 ~122KB 회피)
config/auth.ts Cognito User Pool + Google OAuth
               redirectSignIn: [SITE_URL/auth/callback, localhost:3000/auth/callback]  ← 웹 전용 URL
apiClient.ts   API_URL = process.env.NEXT_PUBLIC_API_URL ?? '<하드코딩 prod>'          ← Next 빌드타임 치환
```

핵심: authFetch 의 **로직(토큰 꺼내 Bearer 붙이기)은 플랫폼 중립**. 플랫폼에 묶인 건 ①redirect URL ②토큰이 저장되는 곳 ③env 치환 방식, 이 셋뿐.

## @ailens/auth 설계

```
packages/auth/src/
├─ authFetch.ts        # 플랫폼 중립. getIdToken 을 주입받아 Bearer 를 붙인다
├─ types.ts            # AuthProvider 인터페이스(아래)
└─ index.ts

// 주입 인터페이스 — 플랫폼이 구현해 넣는다
interface AuthProvider {
  getIdToken(): Promise<string | undefined>;   // 웹: Amplify fetchAuthSession / 앱: 동일(Amplify RN)
}
// authFetch 는 이 provider 만 받는다. Amplify 를 직접 import 하지 않는다.
authFetch(input, options, provider): Promise<Response>
```

- 웹: `createAmplifyProvider(webConfig)` — 기존 amplifyLoader 재사용, redirect=/auth/callback.
- 앱: `createAmplifyProvider(nativeConfig)` — aws-amplify RN, redirect=`ailens://auth/callback`(딥링크), 토큰 저장=expo-secure-store(Amplify RN 기본 저장소 교체).

즉 **authFetch 는 공유, Amplify 설정과 저장소는 앱/웹 각자 생성해 주입**. A안이되 플랫폼 결합을 provider 경계로 격리.

## env/config 주입

```
packages/api-client 는 baseURL 을 하드코딩/process.env 에서 읽지 않고 config 객체를 받는다:
  createApiClient({ apiUrl, cmsApiUrl, wsUrl })
웹:  Next 가 process.env.NEXT_PUBLIC_* 로 채워 주입
앱:  Expo 가 app.config.ts extra / EXPO_PUBLIC_* 로 채워 주입
```

- 지금 apiClient.ts 의 `process.env.NEXT_PUBLIC_API_URL ?? '<prod>'` 패턴은 Next 전용. api-client 승격 때 이 값을 **생성 시 주입**으로 바꿔 플랫폼 중립화한다.
- 하드코딩 prod URL(fallback)은 web 쪽 config 기본값으로 남긴다(동작 불변).

## Google 소셜 로그인

- 웹: Cognito Hosted UI(현행 oauth code flow, redirect=/auth/callback).
- 앱: 같은 Hosted UI 를 **expo-web-browser + 딥링크**로 받거나, 네이티브 Google SDK → Cognito federation. redirect=`ailens://auth/callback`.
- User Pool 의 Google IdP 설정은 공유. 앱 redirect URL 을 Cognito App Client 의 Callback URLs 에 **추가**해야 함(인프라 변경 1건, 콘솔/IaC).

## 승격·구현 순서

1. `@ailens/auth` 에 authFetch(provider 주입형) + AuthProvider 타입. **동작 불변**(웹은 createAmplifyProvider 로 기존과 동일 경로).
2. 웹 authFetch 호출부를 provider 주입형으로 교체(참조 소수). 타입체크+build.
3. api-client 승격 시 createApiClient(config) 로 env 주입화. 웹은 Next env 로 config 생성.
4. (앱 단계 M1) 앱용 createAmplifyProvider(nativeConfig) + expo-secure-store 저장소 + 딥링크 redirect. Cognito App Client 에 앱 redirect URL 추가.

## 인프라 변경 (앱 단계에서)

- **redirect 는 인증된 https 링크로 확정(2026-10-14, RFC 8252 권장 방식)**. 커스텀 스킴(`ailens://`)은 다른 앱이 가로챌 수 있어 쓰지 않는다.
  - 로그인 `https://ailens.sedaily.ai/app/auth/callback`, 로그아웃 `https://ailens.sedaily.ai/app/auth/signout`. 웹 로그인(`/auth/callback`)과 겹치면 모바일 브라우저의 웹 로그인이 앱으로 새므로 **앱 전용 경로 `/app/`** 를 쓴다.
  - Cognito App Client `66c9bq3ovmk007d0eepkle92k3` 의 Callback/SignOut URLs 에 위 두 URL 추가(웹 URL 은 유지 — 추가만).
  - Android: `app.config.ts` intentFilters(autoVerify) + `service/frontend/public/.well-known/assetlinks.json` 에 Play 앱 서명 키 SHA-256 등록.
  - iOS: `associatedDomains` + `/.well-known/apple-app-site-association`(Apple Team ID 필요, 미등록).
  - EAS development/preview 빌드는 서명 키가 달라 앱 링크 검증이 되지 않는다 — 해당 키 지문을 assetlinks 에 추가해 테스트한다.

## 안 하는 것

- authFetch 에서 Amplify 직접 import(provider 경계로 격리해야 앱이 저장소·config 를 갈아끼움).
- apiClient 가 process.env 를 직접 읽기(주입으로 바꿔 플랫폼 중립).
- 웹 redirect URL 을 앱과 공유(딥링크는 앱 전용 — Cognito 에 추가만).
