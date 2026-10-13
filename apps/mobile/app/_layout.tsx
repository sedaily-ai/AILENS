import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

// 루트 레이아웃. M1: 탭 그룹 + 상세 스택. 인증 게이트·푸시 등록은 M2 에서 여기 붙인다.
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
