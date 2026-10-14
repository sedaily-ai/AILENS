import type { ExpoConfig } from 'expo/config';

// AI LENS 네이티브 앱 설정. 딥링크 scheme=ailens (유니버설 링크·Cognito redirect 용).
// 번들ID(ai.sedaily.lens)는 Play 에 이미 발행된 앱과 동일해야 한다 — 바꾸면 업데이트가 아니라 신규 앱이 된다.
// 서명: Play 앱 서명 사용 중. 업로드 키는 기존 mobile-capacitor 의 release.keystore(별칭 ailens)를 EAS 에 등록해 쓴다.
// 절차·주의: docs/architecture/apps-mobile-출시-서명-가이드.md
// versionCode/buildNumber 는 eas.json 의 appVersionSource=remote + autoIncrement 가 관리한다(이 파일에 쓰지 않는다).
// expo.dev/accounts/seoul-economic-daily/projects/ailens 의 프로젝트 ID(비밀 아님).
const EAS_PROJECT_ID = '14a4f279-f7dd-467b-8a06-01e34e862231';

const config: ExpoConfig = {
  name: 'AI LENS',
  slug: 'ailens',
  // EAS 프로젝트 소유자 — 개인 계정이 아니라 회사 조직(expo.dev/accounts/seoul-economic-daily)이 소유한다.
  owner: 'seoul-economic-daily',
  scheme: 'ailens',
  version: '0.0.1',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  // OTA(EAS Update)는 네이티브 호환 버전(version) 단위로 묶는다.
  runtimeVersion: { policy: 'appVersion' },
  updates: { url: `https://u.expo.dev/${EAS_PROJECT_ID}` },
  ios: {
    bundleIdentifier: 'ai.sedaily.lens',
    supportsTablet: true,
    // 유니버설 링크: 웹 도메인의 /.well-known/apple-app-site-association 에 이 앱(TeamID.번들ID)이 등록돼 있어야 한다.
    associatedDomains: ['applinks:ailens.sedaily.ai'],
  },
  android: {
    package: 'ai.sedaily.lens',
    // 앱 링크(autoVerify): /.well-known/assetlinks.json 에 Play 앱 서명 키 지문이 등록돼 있어야 검증된다.
    // 웹 로그인(/auth/callback)과 충돌하지 않도록 앱 전용 경로(/app/...)만 가로챈다.
    intentFilters: [
      {
        action: 'VIEW',
        autoVerify: true,
        data: [{ scheme: 'https', host: 'ailens.sedaily.ai', pathPrefix: '/app/' }],
        category: ['BROWSABLE', 'DEFAULT'],
      },
    ],
  },
  plugins: ['expo-router', 'expo-secure-store'],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    eas: { projectId: EAS_PROJECT_ID },
    // 런타임 config 주입(api-client). EXPO_PUBLIC_* 또는 EAS env 로 덮어쓴다.
    apiUrl: process.env.EXPO_PUBLIC_API_URL ?? 'https://chzwwtjtgk.execute-api.us-east-1.amazonaws.com/dev',
    cmsApiUrl: process.env.EXPO_PUBLIC_CMS_API_URL ?? 'https://ailens.sedaily.ai',
  },
};

export default config;
