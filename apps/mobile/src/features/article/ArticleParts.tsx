import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Linking, Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'react-native';
import { Link } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { displayCategoryLabel, categoryForDataLabel, displayHeadline } from '@ailens/domain';
import type { LensPost } from '@ailens/api-client';
import { kstDateTime } from '../../lib/format';
import { READING_ACCENT, formatColors } from '../../theme';
import { FONT, Text } from '../../ui/Text';
import { RichText } from './RichText';
import { Blob, HandLine } from '../../ui/Hand';

const ACCENT_BLUE = '#3b82f6'; // 웹 LENS_ACCENT(배지)

/** 사진처럼 종이 위에 놓인 듯한 3겹 그림자(웹 PHOTO_SHADOW 근사). */
const photoShadow = { shadowColor: '#111827', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.14, shadowRadius: 16, elevation: 5 } as const;

/** 한 줄 손맛 구분선(웹 .rule 의 손으로 그은 획 근사). */
export function Rule() {
  return <HandLine style={styles.rule} />;
}

/** 기사 머리 — 카테고리 아이브로우(+4가지 시선 배지) → 세리프 헤드라인 → 리드 → 바이라인. 웹 LensViewClient 의 .lw 머리와 같은 순서·크기. */
export function ArticleHeader({ lens, scale }: { lens: LensPost; scale: number }) {
  const cat = lens.category ? displayCategoryLabel(lens.category) : null;
  return (
    <View>
      <View style={styles.eyebrowRow}>
        {cat ? (
          categoryForDataLabel(lens.category) ? (
            <Link href={{ pathname: '/category/[slug]', params: { slug: categoryForDataLabel(lens.category)!.slug } }} asChild>
              <Pressable accessibilityRole="link"><Text style={styles.eyebrow}>{cat}{lens.subcategory ? ` · ${lens.subcategory}` : ''}</Text></Pressable>
            </Link>
          ) : (
            <Text style={styles.eyebrow}>{cat}</Text>
          )
        ) : null}
        <View style={styles.badge}>
          <Text style={styles.badgeText}>4가지 시선</Text>
        </View>
      </View>
      <Text style={styles.h1}>{displayHeadline(lens.headline)}</Text>
      {lens.context ? (
        <RichText text={lens.context} style={[styles.lede, { fontSize: 18 * scale, lineHeight: 18 * scale * 1.65 }]} />
      ) : null}
      <Text style={styles.byline}>
        <Text style={styles.bylineStrong}>AI LENS 편집팀</Text>
        {' · 입력 '}
        {kstDateTime(lens.published_at, lens.date)}
      </Text>
      <Rule />
    </View>
  );
}

/** 대표 사진 + 캡션 줄(출처·원문 링크). 웹: 16:9, radius 16, 3겹 그림자, 캡션 11.5px #9ca3af. */
export function ArticlePhoto({ lens }: { lens: LensPost }) {
  const photo = lens.photo_image_url;
  const source = lens.source_url;
  const link = source ? (
    <Pressable onPress={() => void Linking.openURL(source)} accessibilityRole="link" hitSlop={8}>
      <Text style={styles.lnk}>기사 원문 보기 ↗</Text>
    </Pressable>
  ) : null;
  if (!photo) return link ? <View style={{ alignItems: 'flex-end', marginTop: 12 }}>{link}</View> : null;
  return (
    <View style={{ marginTop: 20 }}>
      <View style={[styles.photo, photoShadow]}>
        <Image source={{ uri: photo }} style={styles.photoImg} resizeMode="cover" accessibilityLabel={displayHeadline(lens.headline)} />
      </View>
      <View style={styles.capRow}>
        <Text style={styles.cap}>사진 · 서울경제</Text>
        {link}
      </View>
    </View>
  );
}

/** 30초 핵심 — 레터 → 팟캐스트 → 영상 → 웹툰 순으로 불릿이 있는 첫 형식에서 최대 4건(웹 coreSummaryBullets). */
export function coreSummary(lens: LensPost): string[] {
  for (const label of ['레터', '팟캐스트', '영상', '웹툰']) {
    const bullets = lens.lenses?.find((l) => l.label === label)?.bullets?.filter((b) => b && b.trim());
    if (bullets && bullets.length > 0) return bullets.slice(0, 4);
  }
  return [];
}

export function SummaryCard({ bullets, scale }: { bullets: string[]; scale: number }) {
  if (bullets.length === 0) return null;
  return (
    <Blob fill="#f6f7f9" radii={{ h: [26, 22, 28, 20], v: [22, 27, 20, 26] }} style={styles.sum}>
      <View style={styles.sumHead}>
        <Ionicons name="stopwatch-outline" size={22} color={READING_ACCENT} />
        <Text style={styles.sumTitle}>30초 핵심</Text>
      </View>
      <Text style={styles.sumSub}>바쁘시면 여기까지만 읽어도 돼요</Text>
      <View style={{ gap: 18 }}>
        {bullets.map((t, i) => (
          <View key={i} style={styles.sumItem}>
            <View style={styles.sumNo}>
              <Text style={styles.sumNoText}>{i + 1}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <RichText text={t} numbers style={[styles.sumText, { fontSize: 17 * scale, lineHeight: 17 * scale * 1.7 }]} />
            </View>
          </View>
        ))}
      </View>
    </Blob>
  );
}

export interface PickerTab {
  key: 'letter' | 'webtoon' | 'podcast' | 'video';
  name: string;
  amount: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
}

/**
 * 형식 선택기 — 회색 트랙 위를 흰 알약이 미끄러지며 선택을 알려 준다(웹 .fmt-row/.fmt-thumb). 이름 + 분량(약 2분 / 8컷 / 음성 / 영상),
 * 선택된 칸은 이름이 굵고 아이콘이 형식 색으로 물든다.
 */
export function FormatPicker({ tabs, active, onSelect }: { tabs: PickerTab[]; active: number; onSelect: (i: number) => void }) {
  const [trackW, setTrackW] = useState(0);
  const x = useRef(new Animated.Value(active)).current;
  useEffect(() => {
    Animated.timing(x, { toValue: active, duration: 300, easing: Easing.bezier(0.22, 0.85, 0.2, 1), useNativeDriver: true }).start();
  }, [active, x]);
  const thumbW = trackW > 0 ? (trackW - 8) / tabs.length : 0;
  return (
    <View style={styles.fmtRow} onLayout={(e) => setTrackW(e.nativeEvent.layout.width)} accessibilityRole="tablist">
      {thumbW > 0 ? (
        <Animated.View style={[styles.fmtThumb, { width: thumbW, transform: [{ translateX: x.interpolate({ inputRange: [0, tabs.length - 1 || 1], outputRange: [0, thumbW * (tabs.length - 1)] }) }] }]} />
      ) : null}
      {tabs.map((t, i) => {
        const on = i === active;
        return (
          <Pressable key={t.key} style={styles.fmt} onPress={() => onSelect(i)} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={`${t.name}, ${t.amount}`}>
            <Text style={[styles.fmtName, on && styles.fmtNameOn]}>{t.name}</Text>
            <View style={styles.fmtAmt}>
              <Ionicons name={t.icon} size={18} color={on ? formatColors[t.key].accent : '#9ca3af'} />
              <Text style={[styles.fmtAmtText, on && { color: '#6b7280' }]}>{t.amount}</Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  rule: { marginTop: 16 },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 8 },
  eyebrow: { fontSize: 13, fontWeight: '700', letterSpacing: 0.26, color: '#6b7280' },
  badge: { paddingHorizontal: 9, paddingVertical: 2, borderRadius: 999, backgroundColor: `${ACCENT_BLUE}24` },
  badgeText: { fontSize: 11.5, fontWeight: '700', color: ACCENT_BLUE },
  h1: { fontFamily: FONT.serif, fontSize: 28, lineHeight: 37.8, letterSpacing: -0.7, color: '#111827', marginBottom: 14 },
  lede: { color: '#374151', marginBottom: 18 },
  byline: { fontSize: 13, lineHeight: 20, color: '#6b7280', paddingBottom: 16 },
  bylineStrong: { color: '#111827', fontWeight: '700' },
  photo: { width: '100%', aspectRatio: 16 / 9, borderRadius: 16, overflow: 'hidden', backgroundColor: '#f6f7f9' },
  photoImg: { width: '100%', height: '100%' },
  capRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, gap: 12 },
  cap: { fontSize: 11.5, color: '#9ca3af' },
  lnk: { fontSize: 13, fontWeight: '600', color: '#4b5563', textDecorationLine: 'underline', textDecorationColor: 'rgba(17,24,39,0.28)' },
  // 30초 핵심(웹 .sum): 연한 회색 면, 불규칙한 큰 모서리, 번호는 작은 흰 배지.
  sum: { marginTop: 20, paddingTop: 24, paddingHorizontal: 22, paddingBottom: 26 },
  sumHead: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 4 },
  sumTitle: { fontSize: 16, fontWeight: '800', letterSpacing: -0.24, color: '#111827' },
  sumSub: { marginBottom: 22, marginLeft: 31, fontSize: 14, lineHeight: 21, color: '#6b7280', letterSpacing: -0.14 },
  sumItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  sumNo: { width: 26, height: 26, marginTop: 1, alignItems: 'center', justifyContent: 'center', borderTopLeftRadius: 14, borderTopRightRadius: 12, borderBottomRightRadius: 14, borderBottomLeftRadius: 12, backgroundColor: '#fff', shadowColor: '#111827', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 3, elevation: 2 },
  sumNoText: { fontSize: 12, fontWeight: '800', color: '#4467ae' },
  sumText: { color: '#1f2937', letterSpacing: -0.17 },
  fmtRow: { flexDirection: 'row', padding: 4, backgroundColor: '#f2f3f5', borderRadius: 16 },
  fmtThumb: { position: 'absolute', top: 4, bottom: 4, left: 4, backgroundColor: '#fff', borderRadius: 12, shadowColor: '#111827', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 3 },
  fmt: { flex: 1, minHeight: 56, paddingVertical: 8, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center', gap: 3 },
  fmtName: { fontSize: 14, fontWeight: '600', color: '#6b7280', letterSpacing: -0.14 },
  fmtNameOn: { fontWeight: '800', color: '#111827' },
  fmtAmt: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  fmtAmtText: { fontSize: 12.5, color: '#9ca3af' },
});
