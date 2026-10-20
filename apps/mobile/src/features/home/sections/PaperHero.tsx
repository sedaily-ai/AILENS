import { useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../../ui/Text';
import { HandLine } from '../../../ui/Hand';
import { Link } from 'expo-router';
import type { LensPost } from '@ailens/api-client';
import { displayHeadline } from '@ailens/domain';
import { kstDateTime } from '../../../lib/format';
import { PAPER_TABS, paperTitle, pickPaperSection } from '../model';

// 웹 LensPreviewSection(.lz-paper)의 지면 카드를 그대로 옮긴 것: 종이색 면 + 얇은 테두리 + 둥근 모서리,
// 제호 줄(날짜 지면 · 전체 보기, 손으로 그은 선) → 알약형 세그먼트 탭 → 대표 기사(세리프 제목) → 이중선 → 작은 기사.
const INK = '#111827';
const ACCENT_STRONG = '#2563eb';

/** 오늘의 지면 — 4개 탭(지면/증권/산업/시그널), 고른 지면의 기사 최대 4건: 대표 1 + 작은 카드 3. */
export function PaperHero({ lens, linkPast = true, compact = false }: { lens: LensPost[]; linkPast?: boolean; compact?: boolean }) {
  const [tab, setTab] = useState(0);
  const picks = useMemo(() => PAPER_TABS.map((t) => pickPaperSection(lens, t.paperSection)), [lens]);
  const items = picks[tab];
  // 탭에 기사가 하나도 없으면 첫 번째로 기사가 있는 탭을 기본으로 보여 준다.
  const firstDate = (picks.find((p) => p.length > 0) ?? [])[0]?.date;
  if (picks.every((p) => p.length === 0)) return null;
  const [hero, ...rest] = items;

  return (
    <View style={[styles.card, compact && styles.cCard]}>
      <View style={[styles.mast, compact && styles.cMast]}>
        <Text style={[styles.kick, compact && styles.cKick]}>{paperTitle(firstDate)}</Text>
        {linkPast && firstDate ? (
          <Link href={{ pathname: '/paper/[date]', params: { date: firstDate } }} asChild>
            <Pressable accessibilityRole="link" hitSlop={8}>
              <Text style={styles.all}>전체 보기 →</Text>
            </Pressable>
          </Link>
        ) : null}
      </View>
      <HandLine height={6} color="#c4c7cd" opacity={1} strokeWidth={1.6} style={styles.mastLine} />

      <View style={[styles.tabs, compact && styles.cTabs]}>
        {PAPER_TABS.map((t, i) => {
          const on = tab === i;
          return (
            <Pressable
              key={t.key}
              onPress={() => setTab(i)}
              style={[styles.tab, compact && styles.cTab, on && styles.tabOn]}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
            >
              <Text style={[styles.tabText, compact && styles.cTabText, on && styles.tabTextOn]} numberOfLines={1}>
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {!hero ? (
        <Text style={styles.empty}>{PAPER_TABS[tab].label}에 올라온 기사가 아직 없어요.</Text>
      ) : (
        <>
          {compact ? (
            // 앱 홈용 압축형: 큰 사진 대신 제목(세리프)과 작은 썸네일을 한 줄에 둔다. 화면을 덜 차지하고 4개 코너를 한눈에 훑는다.
            <Link href={{ pathname: '/article/[slug]', params: { slug: hero.id } }} asChild>
              <Pressable style={styles.cHero} accessibilityRole="link">
                <View style={styles.cHeroText}>
                  <Text style={styles.cHeroTitle} numberOfLines={3}>
                    {displayHeadline(hero.headline)}
                  </Text>
                </View>
                {hero.photo_image_url ? (
                  <View style={styles.cHeroThumb}>
                    <Image source={{ uri: hero.photo_image_url }} style={styles.img} resizeMode="cover" />
                  </View>
                ) : null}
              </Pressable>
            </Link>
          ) : (
          <Link href={{ pathname: '/article/[slug]', params: { slug: hero.id } }} asChild>
            <Pressable accessibilityRole="link">
              {hero.photo_image_url ? (
                <View style={styles.heroThumb}>
                  <Image source={{ uri: hero.photo_image_url }} style={styles.img} resizeMode="cover" />
                </View>
              ) : null}
              <View style={styles.heroBody}>
                <View style={styles.chipRow}>
                  <View style={styles.chip}>
                    <Text style={styles.chipText}>{PAPER_TABS[tab].label}</Text>
                  </View>
                  <Text style={styles.heroDate}>{kstDateTime(hero.published_at, hero.date)}</Text>
                </View>
                <Text style={styles.heroTitle} numberOfLines={2}>
                  {displayHeadline(hero.headline)}
                </Text>
                {hero.context ? (
                  <Text style={styles.heroDesc} numberOfLines={2}>
                    {hero.context}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          </Link>
          )}
          {/* 웹 .lz-hero-col 의 4px double 밑줄(RN 은 double 테두리가 없어 가는 선 두 줄로 그린다). */}
          <View style={styles.doubleRule}>
            <View style={styles.ruleLine} />
            <View style={styles.ruleLine} />
          </View>

          {rest.map((l, idx) => (
            <Link key={l.id} href={{ pathname: '/article/[slug]', params: { slug: l.id } }} asChild>
              <Pressable style={StyleSheet.flatten([styles.minor, compact && styles.cMinor, idx > 0 && styles.minorDivider])} accessibilityRole="link">
                <View style={styles.minorText}>
                  <Text style={[styles.minorTitle, compact && styles.cMinorTitle]} numberOfLines={2}>
                    {displayHeadline(l.headline)}
                  </Text>
                  {!compact && l.context ? (
                    <Text style={styles.minorDesc} numberOfLines={1}>
                      {l.context}
                    </Text>
                  ) : null}
                  {!compact ? <Text style={styles.minorDate}>{kstDateTime(l.published_at, l.date)}</Text> : null}
                </View>
                {l.photo_image_url ? (
                  <View style={[styles.minorThumb, compact && styles.cMinorThumb]}>
                    <Image source={{ uri: l.photo_image_url }} style={styles.img} resizeMode="cover" />
                  </View>
                ) : null}
              </Pressable>
            </Link>
          ))}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#f8f8f6',
    borderWidth: 1,
    borderColor: '#e4e4df',
    borderRadius: 12,
    paddingTop: 14,
    paddingHorizontal: 16,
    paddingBottom: 16,
    // 웹 box-shadow: 0 1px 2px rgba(60,55,45,.06), 0 8px 24px -14px rgba(60,55,45,.16) 의 근사.
    elevation: 1.5,
    shadowColor: '#3c372d',
  },
  mast: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 10,
    paddingBottom: 11,
    borderTopWidth: 1,
    borderTopColor: '#b8bbc2',
  },
  kick: { fontSize: 18, fontWeight: '800', letterSpacing: -0.36, color: INK },
  all: { fontSize: 14, fontWeight: '700', color: '#4b5563' },
  mastLine: { marginBottom: 12 },

  tabs: { flexDirection: 'row', gap: 2, padding: 4, borderRadius: 999, backgroundColor: 'rgba(17,24,39,0.055)', marginBottom: 16 },
  tab: { flex: 1, minHeight: 38, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, borderRadius: 999 },
  tabOn: { backgroundColor: '#fff', elevation: 2, shadowColor: INK },
  tabText: { fontSize: 13.5, fontWeight: '600', letterSpacing: -0.14, color: '#6b7280' },
  tabTextOn: { fontWeight: '700', color: INK },

  empty: { color: '#6b7280', textAlign: 'center', paddingVertical: 36 },
  img: { width: '100%', height: '100%' },
  heroThumb: { width: '100%', aspectRatio: 21 / 9, borderRadius: 3, overflow: 'hidden', backgroundColor: '#f3f4f6' },
  heroBody: { paddingTop: 16, paddingBottom: 20 },
  chipRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 8 },
  chip: { alignSelf: 'flex-start', backgroundColor: 'rgba(37,99,235,0.08)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  chipText: { fontSize: 11.5, fontWeight: '800', letterSpacing: 0.23, color: ACCENT_STRONG },
  heroDate: { fontSize: 13, fontWeight: '600', color: '#9ca3af' },
  heroTitle: { fontFamily: 'NotoSerifKR-Bold', fontSize: 24, lineHeight: 29, letterSpacing: -0.72, color: INK },
  heroDesc: { marginTop: 10, fontSize: 15, lineHeight: 25, color: '#6b7280' },

  cCard: { paddingTop: 8, paddingHorizontal: 14, paddingBottom: 10 },
  cMast: { paddingTop: 6, paddingBottom: 8 },
  cKick: { fontSize: 16 },
  cTabs: { marginBottom: 10, padding: 3 },
  cTab: { minHeight: 32 },
  cTabText: { fontSize: 13 },
  cMinor: { paddingTop: 10, gap: 12 },
  cMinorTitle: { fontSize: 14, lineHeight: 19 },
  cMinorThumb: { width: 64, height: 48, borderRadius: 8 },
  cHero: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', paddingBottom: 10 },
  cHeroText: { flex: 1, minWidth: 0 },
  cHeroTitle: { marginTop: 0, fontFamily: 'NotoSerifKR-Bold', fontSize: 17, lineHeight: 24, letterSpacing: -0.4, color: INK },
  cHeroThumb: { width: 88, height: 66, borderRadius: 10, overflow: 'hidden', backgroundColor: '#f3f4f6' },
  doubleRule: { gap: 1.4 },
  ruleLine: { height: 1.3, backgroundColor: '#b9b9b1' },

  minor: { flexDirection: 'row', gap: 14, paddingTop: 18 },
  minorDivider: { marginTop: 4, borderTopWidth: 1, borderTopColor: 'rgba(17,24,39,0.08)' },
  minorText: { flex: 1, minWidth: 0 },
  minorTitle: { fontSize: 14.5, fontWeight: '700', letterSpacing: -0.22, lineHeight: 20, color: '#1c1917' },
  minorDesc: { marginTop: 5, fontSize: 12.5, lineHeight: 19, color: '#6b7280' },
  minorDate: { marginTop: 6, fontSize: 11.5, fontWeight: '600', color: '#9ca3af' },
  minorThumb: { width: 96, height: 60, borderRadius: 3, overflow: 'hidden', backgroundColor: '#f3f4f6' },
});
