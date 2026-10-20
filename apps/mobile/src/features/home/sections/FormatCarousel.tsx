import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { Text } from '../../../ui/Text';
import { BookOpenText, Headphones, ImageSquare, VideoCamera } from '../../../ui/icons';
import { colors, surface } from '../../../theme';
import { formatCards, momentOf, type SituationKey } from '../editorVoice';

/**
 * 지금 맞는 형식 넘기기 — 시간·상황(출근길=듣기, 점심=웹툰, 퇴근 후=읽기, 밤=소리)에 맞는 형식이 맨 앞에 온다.
 * 같은 소식을 4가지 형식(읽기·웹툰·듣기·영상)으로 볼 수 있다는 서비스의 약속을 홈에서 한 번 보여 준다.
 */
const ICON = { 0: BookOpenText, 1: ImageSquare, 2: Headphones, 3: VideoCamera } as const;
const ROUTE: Record<0 | 1 | 2 | 3, Href> = { 0: '/letter', 1: '/webtoon', 2: '/listen', 3: '/video' };

export function FormatCarousel({ situation }: { situation: SituationKey | null }) {
  const router = useRouter();
  const cards = formatCards(momentOf(new Date(), situation));
  return (
    <View>
      <Text style={styles.title}>지금은 이렇게 볼까요?</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} style={styles.scroll}>
        {cards.map((c, i) => {
          const Icon = ICON[c.index];
          const first = i === 0;
          return (
            <Pressable key={c.index} onPress={() => router.push(ROUTE[c.index])} style={({ pressed }) => [styles.card, first && styles.first, pressed && { opacity: 0.88 }]} accessibilityRole="link" accessibilityLabel={`${c.label}, ${c.line}`}>
              <View style={[styles.icon, first && styles.iconFirst]}>
                <Icon size={22} color={first ? '#fff' : colors.textSub} weight={first ? 'fill' : 'regular'} />
              </View>
              <Text style={[styles.label, first && { color: '#fff' }]}>{c.label}</Text>
              <Text style={[styles.line, first && { color: 'rgba(255,255,255,0.78)' }]} numberOfLines={2}>{c.line}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { marginBottom: 12, fontSize: 20, fontWeight: '800', letterSpacing: -0.5, color: colors.text },
  scroll: { marginHorizontal: -20 },
  row: { paddingHorizontal: 20, gap: 10 },
  card: { ...surface.card, width: 150, padding: 14, borderRadius: 20 },
  first: { backgroundColor: colors.brand, borderColor: colors.brand },
  icon: { width: 40, height: 40, borderRadius: 13, backgroundColor: '#f1f3f6', alignItems: 'center', justifyContent: 'center' },
  iconFirst: { backgroundColor: 'rgba(255,255,255,0.16)' },
  label: { marginTop: 12, fontSize: 16, fontWeight: '800', color: colors.text },
  line: { marginTop: 3, fontSize: 12.5, lineHeight: 18, color: colors.textMuted },
});
