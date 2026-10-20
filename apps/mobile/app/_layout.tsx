// 인증 설정은 Amplify·난수 폴리필 때문에 다른 import 보다 먼저 로드한다.
import { configureAuth } from '../src/auth/configureAuth';
import { configureLabels } from '../src/features/interests/store';
import { labelOfCategory } from '../src/features/interests/dictionary';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { configureApiClient } from '@ailens/api-client';
import { AuthProvider } from '../src/auth/AuthContext';
import { PlayerProvider } from '../src/features/player/PlayerContext';
import { usePushNavigation } from '../src/features/push/pushSetup';

configureAuth();
configureLabels(labelOfCategory);

// api-client 공용화: 웹은 Next env, 앱은 app.config extra 로 같은 홀더에 베이스 URL 을 주입한다.
// 모듈 로드 시 1회(앱 진입점). 웹의 shared/config/apiClient.ts 와 동일 역할.
const extra = (Constants.expoConfig?.extra ?? {}) as { apiUrl?: string; cmsApiUrl?: string };
configureApiClient({
  apiUrl: extra.apiUrl ?? 'https://chzwwtjtgk.execute-api.us-east-1.amazonaws.com/dev',
  cmsApiUrl: extra.cmsApiUrl ?? 'https://ailens.sedaily.ai',
});

// 루트 레이아웃. 탭 그룹 + 상세 스택 + 인증 컨텍스트. 푸시 등록은 M2 에서 붙인다.
export default function RootLayout() {
  usePushNavigation();
  // 웹과 같은 글꼴(Pretendard 5굵기 + Noto Serif KR Bold). 한글 상용 2,350자 서브셋(약 3.6MB)이라 로딩은 한순간이다.
  // 글꼴이 준비되기 전에는 그리지 않아 시스템 글꼴이 번쩍 보이는 것을 막는다. 로딩 실패 시에도 앱은 열리고 시스템 글꼴을 쓴다.
  const [fontsLoaded, fontError] = useFonts({
    'Pretendard-Regular': require('../assets/fonts/Pretendard-Regular.otf'),
    'Pretendard-Medium': require('../assets/fonts/Pretendard-Medium.otf'),
    'Pretendard-SemiBold': require('../assets/fonts/Pretendard-SemiBold.otf'),
    'Pretendard-Bold': require('../assets/fonts/Pretendard-Bold.otf'),
    'Pretendard-ExtraBold': require('../assets/fonts/Pretendard-ExtraBold.otf'),
    'NotoSerifKR-Bold': require('../assets/fonts/NotoSerifKR-Bold.ttf'),
  });
  if (!fontsLoaded && !fontError) return null;
  return (
    <SafeAreaProvider>
      <AuthProvider>
       <PlayerProvider>
        <StatusBar style="auto" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="category/[slug]" />
          <Stack.Screen name="search" options={{ headerShown: false }} />
          <Stack.Screen name="login" options={{ headerShown: false, presentation: 'modal' }} />
          <Stack.Screen name="account" options={{ headerShown: true, title: '내 계정' }} />
          <Stack.Screen name="article/[slug]" options={{ headerShown: true, title: '기사' }} />
        </Stack>
       </PlayerProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
