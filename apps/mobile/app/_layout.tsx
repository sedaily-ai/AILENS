import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { configureApiClient } from '@ailens/api-client';

// api-client 공용화: 웹은 Next env, 앱은 app.config extra 로 같은 홀더에 베이스 URL 을 주입한다.
// 모듈 로드 시 1회(앱 진입점). 웹의 shared/config/apiClient.ts 와 동일 역할.
const extra = (Constants.expoConfig?.extra ?? {}) as { apiUrl?: string; cmsApiUrl?: string };
configureApiClient({
  apiUrl: extra.apiUrl ?? 'https://chzwwtjtgk.execute-api.us-east-1.amazonaws.com/dev',
  cmsApiUrl: extra.cmsApiUrl ?? 'https://ailens.sedaily.ai',
});

// 루트 레이아웃. M1: 탭 그룹 + 상세 스택. 인증 게이트·푸시 등록은 M2 에서 붙인다.
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="article/[slug]" options={{ headerShown: true, title: '기사' }} />
      </Stack>
    </SafeAreaProvider>
  );
}
