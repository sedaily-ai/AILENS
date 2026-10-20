import { FlatList, Image, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../../ui/Text';
import { Link } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { HomePlayerPost, VideoPost, WebtoonPost } from '@ailens/api-client';
import { displayHeadline } from '@ailens/domain';
import { colors, radius } from '../../../theme';
import { kstDateTime } from '../../../lib/format';
import { SectionHeader } from './SectionHeader';

type Pathname = '/webtoon/[slug]' | '/video/[slug]' | '/listen/[slug]';

interface RailItem {
  id: string;
  title: string;
  imageUrl?: string | null;
  meta: string;
  badge?: 'play';
}

// 웹툰·영상은 각자 전용 화면(/webtoon, /video)으로, 오디오는 /listen 으로 연결한다.
function Rail({ title, items, ratio, detail, list }: { title: string; items: RailItem[]; ratio: number; detail: Pathname; list: '/webtoon' | '/video' }) {
  if (items.length === 0) return null;
  return (
    <View>
      <Link href={list} asChild>
        <Pressable accessibilityRole="link">
          <SectionHeader title={title} right="더 보기" />
        </Pressable>
      </Link>
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={items}
        keyExtractor={(i) => i.id}
        ItemSeparatorComponent={() => <View style={{ width: 14 }} />}
        renderItem={({ item }) => (
          <Link href={{ pathname: detail, params: { slug: item.id } }} asChild>
            <Pressable style={styles.card} accessibilityRole="link">
              <View style={[styles.thumb, { aspectRatio: ratio }]}>
                {item.imageUrl ? <Image source={{ uri: item.imageUrl }} style={styles.img} resizeMode="cover" /> : null}
                {item.badge ? (
                  <View style={styles.play}>
                    <Ionicons name="play" size={18} color="#fff" style={{ marginLeft: 2 }} />
                  </View>
                ) : null}
              </View>
              <Text style={styles.cardTitle} numberOfLines={2}>
                {item.title}
              </Text>
              <Text style={styles.meta}>{item.meta}</Text>
            </Pressable>
          </Link>
        )}
      />
    </View>
  );
}

export function WebtoonSection({ items }: { items: WebtoonPost[] }) {
  return (
    <Rail
      title="웹툰"
      ratio={4 / 5}
      detail="/webtoon/[slug]"
      list="/webtoon"
      items={items.slice(0, 8).map((w) => ({
        id: w.id,
        title: displayHeadline(w.title),
        imageUrl: w.cover_image_url,
        meta: [w.category, kstDateTime(w.published_at, w.date)].filter(Boolean).join('  '),
      }))}
    />
  );
}

export function VideoSection({ items }: { items: VideoPost[] }) {
  return (
    <Rail
      title="영상"
      ratio={16 / 9}
      detail="/video/[slug]"
      list="/video"
      items={items.slice(0, 8).map((v) => ({
        id: v.id,
        title: displayHeadline(v.title),
        imageUrl: v.thumbnail_url,
        meta: kstDateTime(v.published_at, v.date),
        badge: 'play',
      }))}
    />
  );
}

/** 오디오 — 웹 AudioPreviewSection 처럼 텍스트 목록. 항목을 누르면 재생이 시작되고 하단 미니 플레이어가 이어 준다. */
export function AudioSection({ items }: { items: HomePlayerPost[] }) {
  if (items.length === 0) return null;
  return (
    <View>
      <Link href="/listen" asChild>
        <Pressable accessibilityRole="link">
          <SectionHeader title="귀로 듣는 오늘의 기사" right="더 보기" />
        </Pressable>
      </Link>
      {items.slice(0, 5).map((a, i) => (
        <Link key={a.id} href={{ pathname: '/listen/[slug]', params: { slug: a.id } }} asChild>
          <Pressable style={styles.audioRow} accessibilityRole="link">
            <Text style={styles.audioNo}>{i + 1}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.audioTitle} numberOfLines={2}>
                {displayHeadline(a.title)}
              </Text>
              <Text style={styles.meta}>{[a.category, kstDateTime(a.published_at, a.date)].filter(Boolean).join('  ')}</Text>
            </View>
            <Ionicons name="headset-outline" size={20} color={colors.textFaint} />
          </Pressable>
        </Link>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { width: 190 },
  thumb: { width: '100%', borderRadius: radius.thumb, overflow: 'hidden', backgroundColor: colors.imagePlaceholder },
  img: { width: '100%', height: '100%' },
  play: { position: 'absolute', right: 10, bottom: 10, width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(16,28,61,0.85)', alignItems: 'center', justifyContent: 'center' },
  cardTitle: { marginTop: 8, fontSize: 14.5, lineHeight: 20, fontWeight: '700', color: colors.text },
  meta: { marginTop: 4, fontSize: 12, color: colors.textFaint },
  audioRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  audioNo: { width: 22, fontSize: 15, fontWeight: '800', color: colors.beta.text },
  audioTitle: { fontSize: 15, lineHeight: 21, fontWeight: '600', color: colors.text },
});
