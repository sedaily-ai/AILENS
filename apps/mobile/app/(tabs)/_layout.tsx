import { Tabs } from 'expo-router';
import { colors } from '../../src/theme';
import { BookmarkSimple, Compass, Headphones, House } from '../../src/ui/icons';

type PhosphorIcon = typeof House;
// 선택된 탭은 면을 채운(fill) 굵기, 나머지는 가는(regular) 선으로 보여 준다.
const icon = (Icon: PhosphorIcon) => ({ focused, color }: { focused: boolean; color: import('react-native').ColorValue }) => (
  <Icon size={25} color={color as string} weight={focused ? 'fill' : 'regular'} />
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
      <Tabs.Screen name="index" options={{ title: '홈', tabBarIcon: icon(House) }} />
      <Tabs.Screen name="discover" options={{ title: '발견', tabBarIcon: icon(Compass) }} />
      <Tabs.Screen name="listen" options={{ title: '듣기', tabBarIcon: icon(Headphones) }} />
      <Tabs.Screen name="me" options={{ title: '나의 LENS', tabBarIcon: icon(BookmarkSimple) }} />
    </Tabs>
  );
}
