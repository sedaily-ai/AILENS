# @ailens/mobile — AI LENS 네이티브 앱 (Expo)

Expo SDK 57 + expo-router. 모노레포 `apps/mobile`. 공유코드 `@ailens/{domain,auth}` 소비.
설계: `docs/architecture/apps-mobile-Expo-설계.md`, `auth-env-공유설계-Amplify.md`.

## 구조 (M1 셸)

```
app/
├─ _layout.tsx          루트 Stack(탭 그룹 + 기사 상세)
├─ (tabs)/
│  ├─ _layout.tsx       하단 탭(홈/LENS/레터)
│  ├─ index.tsx         홈 — @ailens/domain(displayHeadline) 실사용 데모
│  ├─ lens.tsx          LENS 피드(뼈대)
│  └─ letter.tsx        레터(뼈대)
└─ article/[slug].tsx   기사 상세(딥링크 ailens://article/<slug>)
app.config.ts           번들ID ai.sedaily.lens, scheme ailens, extra(apiUrl 주입)
eas.json                development/preview/production + submit
```

## 실행 (의존 설치 후)

```
# 레포 루트에서(워크스페이스 설치)
npm install
# 앱 실행
npm run start --workspace @ailens/mobile   # 또는 cd apps/mobile && npm start
```

주의: `npm install` 은 react-native 등 큰 트리를 받는다(수백 MB). 메모리 여유 있을 때 실행.

## M1 범위 / 다음

- [x] Expo + expo-router 셸, 탭 3 + 상세, @ailens/domain 실사용
- [ ] createApiClient(config 주입) — api-client 공용화 검증(이 앱이 소비자)
- [ ] 앱용 AuthProvider(aws-amplify RN + expo-secure-store + 딥링크 redirect)
- [ ] Cognito App Client 에 ailens://auth/callback 추가(AWS 권한 필요)
- [ ] 홈/피드/상세 실제 콘텐츠 연동
- [ ] (M2) expo-notifications 푸시 등록

## 안 하는 것

- mobile-capacitor/ (웹뷰 셸) 는 이 앱으로 대체 — 폐기 대상.
- 웹 UI 컴포넌트 재사용 금지(UI 는 네이티브 신규, 그 아래 @ailens/* 만 공유).
