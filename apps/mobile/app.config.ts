import type { ExpoConfig } from 'expo/config';

// AI LENS 네이티브 앱 설정. 딥링크 scheme=ailens (유니버설 링크·Cognito redirect 용).
// 번들ID 는 기존 mobile-capacitor 와 동일 네임스페이스(ai.sedaily.lens)를 재사용 — Play 미발행이라 자유.
const config: ExpoConfig = {
  name: 'AI LENS',
  slug: 'ailens',
  scheme: 'ailens',
  version: '0.0.1',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
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
