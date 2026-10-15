import { Stack, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { Text } from '../../src/ui/Text';
import { GAMES_BY_SLUG } from '@ailens/domain';
import { WebPage } from '../../src/components/WebPage';

// 게임 플레이 — 웹이 iframe 으로 띄우는 H5 게임 HTML(public/games/…)을 앱 안 WebView 로 연다(웹 /games/play/[slug] 대응).
export default function GamePlay() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const game = GAMES_BY_SLUG[slug];
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: game?.title ?? '게임' }} />
      {game ? (
        <WebPage path={game.src} />
      ) : (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text>게임을 찾을 수 없어요.</Text>
        </View>
      )}
    </>
  );
}
