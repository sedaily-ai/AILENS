# @ailens/mobile — AI LENS 네이티브 앱 (Expo)

Expo SDK 57 + expo-router. 모노레포 `apps/mobile`. 공유코드 `@ailens/{domain,auth}` 소비.
설계: `docs/architecture/apps-mobile-Expo-설계.md`, `auth-env-공유설계-Amplify.md`.

## 구조 (M1 셸)

```
app/
├─ _layout.tsx          루트 Stack(탭 그룹 + 기사 상세)
├─ (tabs)/
│  ├─ _layout.tsx       하단 탭(홈/LENS/레터)
│  ├─ index.tsx         홈 — 오늘의 레터 목록
│  ├─ lens.tsx          LENS 피드
│  ├─ letter.tsx        레터 아카이브(최근 100건)
│  └─ me.tsx            내 서랍 — Google 로그인/로그아웃
└─ article/[slug].tsx   기사 상세 — letters·lens 공용(딥링크 ailens://article/<id>)
src/
├─ auth/                configureAuth(Amplify+SecureStore), authProvider(authFetch), AuthContext(useAuth)
├─ components/          AsyncView(로딩·오류·재시도), PostCard
└─ lib/                 useAsync(abort·재시도), format
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
- [x] api-client config 주입 + 글 조회(`listPosts`/`getPost`, 읽기 전용·인증 불필요)
- [x] 앱용 인증(aws-amplify RN + expo-secure-store 토큰 저장 + 딥링크 redirect) — 코드 완료, 로그인 동작은 Cognito 콜백 등록·dev build 필요
- [ ] Cognito App Client 에 ailens://auth/callback 추가(AWS 권한 필요)
- [x] 홈(오늘의 레터)·LENS·레터 목록·기사 상세 실제 콘텐츠 연동(읽기 전용)
- [ ] 상세 고도화(body_html 리치텍스트·차트·이미지 삽입·팟캐스트) — M4
- [ ] (M2) expo-notifications 푸시 등록

## 안 하는 것

- mobile-capacitor/ (웹뷰 셸) 는 이 앱으로 대체 — 폐기 대상.
- 웹 UI 컴포넌트 재사용 금지(UI 는 네이티브 신규, 그 아래 @ailens/* 만 공유).
