import { Tabs } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { accent, colors } from '../../src/theme';
import { BookmarkSimple, Compass, House } from '../../src/ui/icons';

type PhosphorIcon = typeof House;
// 선택된 탭은 아이콘이 면으로 채워지고 연한 파랑 알약 배경 위에 놓인다(눌린 탭이 한눈에 보이게). 나머지는 가는 선 아이콘.
const icon = (Icon: PhosphorIcon) => ({ focused, color }: { focused: boolean; color: import('react-native').ColorValue }) => (
  <View style={[styles.pill, focused && styles.pillOn]}>
    <Icon size={24} color={focused ? accent.ink : (color as string)} weight={focused ? 'fill' : 'regular'} />
  </View>
);

// 하단 탭 3개: 홈 / 발견 / 나의 LENS. 듣기는 탭이 아니라 홈·발견에서 들어가는 화면이다(오디오는 어디서든 미니 플레이어가 이어 준다). 4번째 자리는 에이전트 "물어보기"가 생기면 채운다. 햄버거 메뉴는 없다.
// 각 화면이 자기 상단바(AppHeader)를 그리므로 탭 기본 헤더는 끈다.
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: accent.ink,
        tabBarInactiveTintColor: colors.textFaint,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
        tabBarStyle: { backgroundColor: '#fff', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#e6eaf1', elevation: 0 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: '홈', tabBarIcon: icon(House) }} />
      <Tabs.Screen name="discover" options={{ title: '발견', tabBarIcon: icon(Compass) }} />
      <Tabs.Screen name="me" options={{ title: '나의 LENS', tabBarIcon: icon(BookmarkSimple) }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  pill: { width: 56, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  pillOn: { backgroundColor: accent.soft },
});
