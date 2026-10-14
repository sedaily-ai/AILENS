import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Link } from 'expo-router';
import type { LetterPost } from '@ailens/api-client';
import { displayHeadline } from '@ailens/domain';
import { colors } from '../../../theme';
import { kstDateTime } from '../../../lib/format';
import { SectionHeader } from './SectionHeader';

/** 최근 레터 목록(텍스트). 웹 /letters 아카이브의 앱 축약판 — lens 와 겹치는 글은 이미 다른 섹션에 있어 letters 채널 그대로 쓴다. */
export function LettersSection({ items }: { items: LetterPost[] }) {
  if (items.length === 0) return null;
  return (
    <View>
      <SectionHeader title="레터" right="전체 보기 →" />
      {items.slice(0, 6).map((l) => (
        <Link key={l.id} href={{ pathname: '/article/[slug]', params: { slug: l.id } }} asChild>
          <Pressable style={styles.row} accessibilityRole="link">
            <Text style={styles.title} numberOfLines={2}>
              {displayHeadline(l.headline)}
            </Text>
            <Text style={styles.meta}>{[l.category, kstDateTime(l.published_at, l.publish_date)].filter(Boolean).join('  ')}</Text>
          </Pressable>
        </Link>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  title: { fontSize: 15.5, lineHeight: 22, fontWeight: '600', color: colors.text },
  meta: { marginTop: 5, fontSize: 12, color: colors.textFaint },
});
