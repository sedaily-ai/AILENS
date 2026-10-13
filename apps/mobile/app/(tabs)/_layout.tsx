import { Tabs } from 'expo-router';

// 하단 탭: 홈(오늘 1면) / LENS 피드 / 레터. 웹 라우트(/ , /lens , /letter)와 대응.
export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: true }}>
      <Tabs.Screen name="index" options={{ title: '홈' }} />
      <Tabs.Screen name="lens" options={{ title: 'LENS' }} />
      <Tabs.Screen name="letter" options={{ title: '레터' }} />
    </Tabs>
  );
}
