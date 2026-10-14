import { Tabs } from 'expo-router';

// 하단 탭: 홈 / LENS 피드 / 레터 / 내 서랍. 웹 라우트(/ , /lens , /letter, 로그인 영역)와 대응. 각 화면이 제목·상단 여백을 직접 그린다.
export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" options={{ title: '홈' }} />
      <Tabs.Screen name="lens" options={{ title: 'LENS' }} />
      <Tabs.Screen name="letter" options={{ title: '레터' }} />
      <Tabs.Screen name="me" options={{ title: '내 서랍' }} />
    </Tabs>
  );
}
