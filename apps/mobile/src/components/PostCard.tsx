import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Link } from 'expo-router';
import { displayHeadline } from '@ailens/domain';
import { dateLabel } from '../lib/format';

export interface PostCardProps {
  id: string;
  title: string;
  summary?: string | null;
  category?: string | null;
  date?: string | null;
  imageUrl?: string | null;
}

/** 목록 공통 카드. 탭하면 기사 상세(article/[slug])로 간다. 제목은 웹과 같은 displayHeadline 로직을 쓴다. */
export function PostCard({ id, title, summary, category, date, imageUrl }: PostCardProps) {
  return (
    <Link href={{ pathname: '/article/[slug]', params: { slug: id } }} asChild>
      <Pressable style={styles.card} accessibilityRole="link">
        {imageUrl ? <Image source={{ uri: imageUrl }} style={styles.image} /> : null}
        <View style={styles.body}>
          <Text style={styles.meta}>{[category, dateLabel(date)].filter(Boolean).join(' · ')}</Text>
          <Text style={styles.title}>{displayHeadline(title)}</Text>
          {summary ? (
            <Text style={styles.summary} numberOfLines={2}>
              {summary}
            </Text>
          ) : null}
        </View>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#17181b', borderRadius: 12, borderWidth: 1, borderColor: '#26272b', overflow: 'hidden', marginBottom: 12 },
  image: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#26272b' },
  body: { padding: 14 },
  meta: { color: '#8ab4ff', fontSize: 12, fontWeight: '600', marginBottom: 6 },
  title: { color: '#f5f5f5', fontSize: 17, fontWeight: '700', lineHeight: 24 },
  summary: { color: '#9aa0a6', fontSize: 13, lineHeight: 19, marginTop: 6 },
});
