import { FlatList, Image, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../src/ui/Text';
import { Link, Stack } from 'expo-router';
import { GAMES } from '@ailens/domain';

const SITE = 'https://ailens.sedaily.ai';

// 게임 목록 — 웹 /games 대응. 목록은 웹과 공용(@ailens/domain GAMES). 다크 아케이드 톤은 웹과 같이 의도적으로 사이트 기본 톤과 다르다.
export default function GamesList() {
  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: true, title: '게임' }} />
      <FlatList
        data={GAMES}
        keyExtractor={(g) => g.slug}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={{ height: 14 }} />}
        renderItem={({ item }) => (
          <Link href={{ pathname: '/games/[slug]', params: { slug: item.slug } }} asChild>
            <Pressable style={[styles.card, { borderColor: item.neon }]} accessibilityRole="link">
              <Image source={{ uri: `${SITE}${item.thumb}` }} style={styles.thumb} resizeMode="cover" />
              <View style={{ flex: 1 }}>
                <Text style={[styles.title, { color: item.neon }]}>{item.title}</Text>
                <Text style={styles.tag}>{item.tagline}</Text>
              </View>
            </Pressable>
          </Link>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0f1020' },
  list: { padding: 20 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: 16, borderWidth: 1.5, backgroundColor: '#17182c' },
  thumb: { width: 84, height: 84, borderRadius: 12, backgroundColor: '#23243d' },
  title: { fontSize: 17, fontWeight: '800' },
  tag: { marginTop: 6, fontSize: 13, lineHeight: 19, color: '#c7c9e0' },
});
