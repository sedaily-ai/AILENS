import { useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../../ui/Text';
import { Link } from 'expo-router';
import type { LensPost } from '@ailens/api-client';
import { displayHeadline } from '@ailens/domain';
import { colors, radius } from '../../../theme';
import { kstDateTime } from '../../../lib/format';
import { PAPER_TABS, paperTitle, pickPaperSection } from '../model';

const ACCENT = '#2563eb';

/** 오늘의 지면 — 4개 탭(지면/증권/산업/시그널), 고른 지면의 기사 최대 4건: 대표 1 + 작은 카드 3. 웹 LensPreviewSection 의 홈 변형. */
export function PaperHero({ lens, linkPast = true }: { lens: LensPost[]; linkPast?: boolean }) {
  const [tab, setTab] = useState(0);
  const picks = useMemo(() => PAPER_TABS.map((t) => pickPaperSection(lens, t.paperSection)), [lens]);
  const items = picks[tab];
  // 탭에 기사가 하나도 없으면 첫 번째로 기사가 있는 탭을 기본으로 보여 준다.
  const firstDate = (picks.find((p) => p.length > 0) ?? [])[0]?.date;
  if (picks.every((p) => p.length === 0)) return null;
  const [hero, ...rest] = items;

  return (
    <View>
      <View style={styles.titleRow}>
        <Text style={styles.eyebrow}>{paperTitle(firstDate)}</Text>
        {linkPast && firstDate ? (
          <Link href={{ pathname: '/paper/[date]', params: { date: firstDate } }} asChild>
            <Pressable accessibilityRole="link"><Text style={styles.past}>지난 지면 →</Text></Pressable>
          </Link>
        ) : null}
      </View>
      <View style={styles.tabs}>
        {PAPER_TABS.map((t, i) => (
          <Pressable key={t.key} onPress={() => setTab(i)} style={styles.tab} accessibilityRole="tab" accessibilityState={{ selected: tab === i }}>
            <Text style={[styles.tabText, tab === i && styles.tabTextOn]}>{t.label}</Text>
            <View style={[styles.indicator, tab === i && { backgroundColor: ACCENT }]} />
          </Pressable>
        ))}
      </View>

      {!hero ? (
        <Text style={styles.empty}>{PAPER_TABS[tab].label}에 올라온 기사가 아직 없어요.</Text>
      ) : (
        <>
          <Link href={{ pathname: '/article/[slug]', params: { slug: hero.id } }} asChild>
            <Pressable accessibilityRole="link">
              <View style={styles.heroThumb}>
                {hero.photo_image_url ? <Image source={{ uri: hero.photo_image_url }} style={styles.img} resizeMode="cover" /> : null}
              </View>
              <Text style={styles.heroTitle} numberOfLines={3}>
                {displayHeadline(hero.headline)}
              </Text>
              {hero.context ? (
                <Text style={styles.heroDesc} numberOfLines={2}>
                  {hero.context}
                </Text>
              ) : null}
              <Text style={styles.meta}>
                {[hero.category, kstDateTime(hero.published_at, hero.date)].filter(Boolean).join('  ')}
              </Text>
            </Pressable>
          </Link>
          {rest.map((l) => (
            <Link key={l.id} href={{ pathname: '/article/[slug]', params: { slug: l.id } }} asChild>
              <Pressable style={styles.smallRow} accessibilityRole="link">
                <View style={styles.smallText}>
                  <Text style={styles.smallTitle} numberOfLines={3}>
                    {displayHeadline(l.headline)}
                  </Text>
                  <Text style={styles.meta}>{[l.category, kstDateTime(l.published_at, l.date)].filter(Boolean).join('  ')}</Text>
                </View>
                <View style={styles.smallThumb}>
                  {l.photo_image_url ? <Image source={{ uri: l.photo_image_url }} style={styles.img} resizeMode="cover" /> : null}
                </View>
              </Pressable>
            </Link>
          ))}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  titleRow: { marginBottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  past: { fontSize: 13, fontWeight: '600', color: colors.textFaint },
  eyebrow: { fontSize: 13, fontWeight: '800', letterSpacing: 0.4, color: colors.text },
  tabs: { flexDirection: 'row', marginBottom: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  tab: { flex: 1, alignItems: 'center', paddingTop: 8 },
  tabText: { fontSize: 14, fontWeight: '600', color: colors.textFaint, paddingBottom: 8 },
  tabTextOn: { color: ACCENT, fontWeight: '800' },
  indicator: { height: 2, alignSelf: 'stretch', backgroundColor: 'transparent' },
  empty: { color: colors.textMuted, textAlign: 'center', paddingVertical: 36 },
  heroThumb: { width: '100%', aspectRatio: 16 / 10, borderRadius: radius.thumb, overflow: 'hidden', backgroundColor: colors.imagePlaceholder },
  img: { width: '100%', height: '100%' },
  heroTitle: { marginTop: 12, fontSize: 21, lineHeight: 29, fontWeight: '800', letterSpacing: -0.3, color: colors.text },
  heroDesc: { marginTop: 8, fontSize: 14, lineHeight: 21, color: colors.textMuted },
  meta: { marginTop: 8, fontSize: 12, color: colors.textFaint },
  smallRow: { flexDirection: 'row', gap: 14, paddingVertical: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, marginTop: 14 },
  smallText: { flex: 1 },
  smallTitle: { fontSize: 16, lineHeight: 23, fontWeight: '700', color: colors.text },
  smallThumb: { width: 96, height: 72, borderRadius: 8, overflow: 'hidden', backgroundColor: colors.imagePlaceholder },
});
