import type { ExpoConfig } from 'expo/config';

// AI LENS 네이티브 앱 설정. 딥링크 scheme=ailens (유니버설 링크·Cognito redirect 용).
// 번들ID(ai.sedaily.lens)는 Play 에 이미 발행된 앱과 동일해야 한다 — 바꾸면 업데이트가 아니라 신규 앱이 된다.
// 서명: Play 앱 서명 사용 중. 업로드 키는 기존 mobile-capacitor 의 release.keystore(별칭 ailens)를 EAS 에 등록해 쓴다.
// 절차·주의: docs/architecture/apps-mobile-출시-서명-가이드.md
// versionCode/buildNumber 는 eas.json 의 appVersionSource=remote + autoIncrement 가 관리한다(이 파일에 쓰지 않는다).
const config: ExpoConfig = {
  name: 'AI LENS',
  slug: 'ailens',
  scheme: 'ailens',
  version: '0.0.1',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  // OTA(EAS Update)는 네이티브 호환 버전(version) 단위로 묶는다. updates.url 은 `eas init`·`eas update:configure` 후 채워진다.
  runtimeVersion: { policy: 'appVersion' },
  ios: {
    bundleIdentifier: 'ai.sedaily.lens',
    supportsTablet: true,
  },
  android: {
    package: 'ai.sedaily.lens',
  },
  plugins: ['expo-router', 'expo-secure-store'],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    // 런타임 config 주입(api-client). EXPO_PUBLIC_* 또는 EAS env 로 덮어쓴다.
    apiUrl: process.env.EXPO_PUBLIC_API_URL ?? 'https://chzwwtjtgk.execute-api.us-east-1.amazonaws.com/dev',
    cmsApiUrl: process.env.EXPO_PUBLIC_CMS_API_URL ?? 'https://ailens.sedaily.ai',
  },
};

export default config;
