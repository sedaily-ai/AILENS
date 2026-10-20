import { Image, Pressable, StyleSheet, View } from 'react-native';
import { Link } from 'expo-router';
import { Text } from '../../../ui/Text';
import { ArrowRight } from '../../../ui/icons';
import { accent, colors, surface } from '../../../theme';
import type { Connection } from '../connections';

/** "이어져요" — 최근 읽은 글과 같은 분야의 안 읽은 소식. 읽은 기록이 없으면 그리지 않는다. */
export function Continues({ items }: { items: Connection[] }) {
  if (items.length === 0) return null;
  return (
    <View>
      <View>
        {items.map((c, i) => (
          <Link key={c.post.id} href={{ pathname: '/article/[slug]', params: { slug: c.post.id } }} asChild>
            <Pressable style={StyleSheet.flatten([styles.row, i > 0 && styles.divider])} accessibilityRole="link">
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.reason} numberOfLines={2}>{c.reason}</Text>
                <Text style={styles.headline} numberOfLines={2}>{c.post.headline}</Text>
              </View>
              {c.post.photo_image_url ? (
                <View style={styles.thumb}>
                  <Image source={{ uri: c.post.photo_image_url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                </View>
              ) : (
                <ArrowRight size={18} color={accent.main} weight="bold" />
              )}
            </Pressable>
          </Link>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { marginBottom: 12, fontSize: 20, fontWeight: '800', letterSpacing: -0.5, color: colors.text },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  reason: { fontSize: 12.5, fontWeight: '800', color: accent.ink },
  headline: { marginTop: 4, fontSize: 15.5, lineHeight: 22, fontWeight: '700', letterSpacing: -0.25, color: colors.text },
  thumb: { width: 64, height: 64, borderRadius: 14, overflow: 'hidden', backgroundColor: colors.imagePlaceholder },
});
