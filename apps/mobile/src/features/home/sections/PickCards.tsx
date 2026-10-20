import { useState } from 'react';
import { FlatList, Image, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Link } from 'expo-router';
import { Text } from '../../../ui/Text';
import { colors } from '../../../theme';
import type { BriefingPick } from '../briefing';

/**
 * 오늘 챙길 3가지 — 옆으로 넘기는 카드. 카드마다 "왜 이 글인가" 이유 한 줄을 붙여 에이전트가 골랐다는 것을 보여 준다.
 * 다 읽은 날(고를 글이 없을 때)에는 그려지지 않는다.
 */
const GAP = 12;
const SIDE = 20;

export function PickCards({ picks, readToday }: { picks: BriefingPick[]; readToday: Set<string> }) {
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  if (picks.length === 0) return null;
  const cardW = width - SIDE * 2;
  const step = cardW + GAP;

  return (
    <View>
      <View style={styles.head}>
        <Text style={styles.title}>오늘 챙길 {picks.length}가지</Text>
        <Text style={styles.count}>{index + 1} / {picks.length}</Text>
      </View>
      <FlatList
        data={picks}
        keyExtractor={(p) => p.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={step}
        snapToAlignment="start"
        decelerationRate="fast"
        contentContainerStyle={{ paddingHorizontal: SIDE, gap: GAP }}
        style={{ marginHorizontal: -SIDE }}
        onMomentumScrollEnd={(e) => setIndex(Math.min(picks.length - 1, Math.round(e.nativeEvent.contentOffset.x / step)))}
        renderItem={({ item }) => (
          // Link asChild 는 함수·배열 스타일을 못 받으므로 폭은 바깥 View 가 정하고 Pressable 은 정적 스타일만 쓴다.
          <View style={{ width: cardW }}>
          <Link href={{ pathname: '/article/[slug]', params: { slug: item.id } }} asChild>
            <Pressable style={styles.card} accessibilityRole="link">
              <View style={styles.thumb}>{item.imageUrl ? <Image source={{ uri: item.imageUrl }} style={styles.img} resizeMode="cover" /> : null}</View>
              <View style={styles.body}>
                <View style={styles.reasonRow}>
                  <View style={styles.reason}>
                    <Text style={styles.reasonText}>{item.reason}</Text>
                  </View>
                  {readToday.has(item.id) ? <Text style={styles.readMark}>읽었어요</Text> : null}
                </View>
                <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
                {item.excerpt ? <Text style={styles.excerpt} numberOfLines={2}>{item.excerpt}</Text> : null}
              </View>
            </Pressable>
          </Link>
          </View>
        )}
      />
      <View style={styles.dots}>
        {picks.map((p, i) => (
          <View key={p.id} style={[styles.dot, i === index && styles.dotOn]} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 },
  title: { fontSize: 20, fontWeight: '800', letterSpacing: -0.5, color: colors.text },
  count: { fontSize: 13, fontWeight: '700', color: colors.textFaint },
  card: { borderRadius: 22, backgroundColor: '#fff', overflow: 'hidden', borderWidth: 1, borderColor: '#e8ebf1' },
  thumb: { width: '100%', aspectRatio: 16 / 9, backgroundColor: colors.imagePlaceholder },
  img: { width: '100%', height: '100%' },
  body: { padding: 16, paddingTop: 14 },
  reasonRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  reason: { alignSelf: 'flex-start', paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, backgroundColor: 'rgba(37,99,235,0.08)' },
  readMark: { fontSize: 12, fontWeight: '700', color: colors.textFaint },
  reasonText: { fontSize: 12, fontWeight: '800', color: '#2563eb' },
  cardTitle: { fontSize: 19, lineHeight: 26, fontWeight: '800', letterSpacing: -0.4, color: colors.text },
  excerpt: { marginTop: 6, fontSize: 14, lineHeight: 21, color: colors.textMuted },
  dots: { marginTop: 12, flexDirection: 'row', justifyContent: 'center', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#d5dae4' },
  dotOn: { width: 18, backgroundColor: colors.brand },
});
