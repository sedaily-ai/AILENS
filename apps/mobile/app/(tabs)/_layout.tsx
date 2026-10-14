import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];
const icon = (on: IconName, off: IconName) => ({ focused, color }: { focused: boolean; color: import('react-native').ColorValue }) => (
  <Ionicons name={focused ? on : off} size={24} color={color as string} />
);

// 하단 탭 4개(뉴닉 구조를 따름): 홈 / 발견 / 듣기 / 나의 LENS. 햄버거 메뉴는 없다.
// 각 화면이 자기 상단바(AppHeader)를 그리므로 탭 기본 헤더는 끈다.
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.textFaint,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tabs.Screen name="index" options={{ title: '홈', tabBarIcon: icon('home', 'home-outline') }} />
      <Tabs.Screen name="discover" options={{ title: '발견', tabBarIcon: icon('compass', 'compass-outline') }} />
      <Tabs.Screen name="listen" options={{ title: '듣기', tabBarIcon: icon('headset', 'headset-outline') }} />
      <Tabs.Screen name="me" options={{ title: '나의 LENS', tabBarIcon: icon('bookmark', 'bookmark-outline') }} />
    </Tabs>
  );
}
