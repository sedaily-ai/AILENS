import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../../ui/Text';
import { Link } from 'expo-router';
import type { IssueLetterCard } from '@ailens/api-client';
import { colors } from '../../../theme';
import { kstDateTime } from '../../../lib/format';
import { SectionHeader } from './SectionHeader';

/** 이슈 레터 최근 6건(텍스트 목록). 한 이슈를 소식·실체·다른 시각으로 정리한 레터로 연결한다. */
export function LettersSection({ items }: { items: IssueLetterCard[] }) {
  if (items.length === 0) return null;
  return (
    <View>
      <Link href="/letter" asChild>
        <Pressable accessibilityRole="link">
          <SectionHeader title="이슈 레터" right="전체 보기 →" />
        </Pressable>
      </Link>
      {items.slice(0, 6).map((l) => (
        <Link key={l.slug} href={{ pathname: '/letter/[slug]', params: { slug: l.slug } }} asChild>
          <Pressable style={styles.row} accessibilityRole="link">
            <Text style={styles.title} numberOfLines={2}>{l.title}</Text>
            <Text style={styles.deck} numberOfLines={1}>{l.deck}</Text>
            <Text style={styles.meta}>{[l.categories?.[0], kstDateTime(l.published_at)].filter(Boolean).join('  ')}</Text>
          </Pressable>
        </Link>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  title: { fontSize: 15.5, lineHeight: 22, fontWeight: '700', color: colors.text },
  deck: { marginTop: 4, fontSize: 13, color: colors.textMuted },
  meta: { marginTop: 5, fontSize: 12, color: colors.textFaint },
});
