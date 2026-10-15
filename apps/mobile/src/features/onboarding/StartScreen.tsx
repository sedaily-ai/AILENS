import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../../ui/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { GLANCES, MOMENTS, PERSONAS, euro, resolveFormat, resultTitle, type Glance, type Moment } from '@ailens/domain';
import { listPosts, type LensPost } from '@ailens/api-client';
import { colors } from '../../theme';
import { FORMATS } from '../article/FormatPanels';
import { pickPaperSection } from '../home/model';
import { markOnboardingCompleted, saveFormat } from './prefs';

const BLUE = '#5b8def';
const FORMAT_SHORT = ['레터', '웹툰', '팟캐스트', '영상'];

/**
 * 시작하기 — 질문 2개 + 결과(웹 /start 대응). 1) 뉴스를 주로 언제 보는지 2) 그때 무엇이 먼저 보이는지 → 내 유형과 추천 형식,
 * 그 자리에서 오늘의 1면 기사를 추천 형식으로 열어 볼 수 있다. 선택한 형식은 기사 상세의 기본 탭이 된다. 구독·관심 분야는 여기서 묻지 않는다.
 */
export function StartScreen() {
  const router = useRouter();
  const [moment, setMoment] = useState<Moment | null>(null);
  const [glance, setGlance] = useState<Glance | null>(null);
  const [formatIndex, setFormatIndex] = useState(0);
  const [top, setTop] = useState<LensPost | null>(null);

  // 결과 화면에서 바로 열 오늘의 1면 기사(지면 "전체" 첫 건, 없으면 최신 글).
  useEffect(() => {
    const ctrl = new AbortController();
    listPosts<LensPost>('lens', { limit: 100, signal: ctrl.signal }).then(
      (posts) => setTop(pickPaperSection(posts, '전체')[0] ?? posts[0] ?? null),
      () => {},
    );
    return () => ctrl.abort();
  }, []);

  const resolved = useMemo(() => (moment && glance ? resolveFormat(moment, glance) : null), [moment, glance]);
  useEffect(() => {
    if (resolved) setFormatIndex(resolved.formatIndex);
  }, [resolved]);

  const later = () => {
    void markOnboardingCompleted();
    router.replace('/');
  };
  const open = () => {
    void saveFormat(formatIndex);
    void markOnboardingCompleted();
    router.replace(top ? { pathname: '/article/[slug]', params: { slug: top.id, format: String(formatIndex) } } : '/');
  };

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.top}>
        <Text style={styles.brand}>AI LENS</Text>
        <Pressable onPress={later} hitSlop={10} accessibilityRole="button"><Text style={styles.skip}>나중에 할게요</Text></Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.body}>
        {!moment ? (
          <>
            <Text style={styles.step}>1 / 2</Text>
            <Text style={styles.h1}>뉴스, 주로 언제{'\n'}보게 되나요?</Text>
            <Text style={styles.sub}>가장 가까운 하나만 눌러 주세요. 어려우면 나중에 해도 괜찮아요.</Text>
            {MOMENTS.map((m) => (
              <Pressable key={m.id} style={styles.card} onPress={() => setMoment(m)} accessibilityRole="button">
                <Text style={styles.cardTitle}>{m.tag}</Text>
                <Text style={styles.cardSub}>{m.scene}</Text>
              </Pressable>
            ))}
          </>
        ) : !glance ? (
          <>
            <Text style={styles.step}>2 / 2</Text>
            <Text style={styles.h1}>그때 뉴스를 열면,{'\n'}가장 먼저 눈이 가는 건?</Text>
            <Text style={styles.sub}>{moment.tag} · {moment.scene}</Text>
            {GLANCES.map((g) => (
              <Pressable key={g.id} style={styles.card} onPress={() => setGlance(g)} accessibilityRole="button">
                <Text style={styles.cardTitle}>{g.label}</Text>
                <Text style={styles.cardSub}>{g.hint}</Text>
              </Pressable>
            ))}
            <Pressable onPress={() => setMoment(null)} style={styles.back} accessibilityRole="button"><Text style={styles.backText}>← 이전 질문</Text></Pressable>
          </>
        ) : (
          <>
            <Text style={styles.step}>내 유형</Text>
            <Text style={styles.h1}>{moment.short} {glance.name}</Text>
            <Text style={styles.sub}>{PERSONAS[moment.id][glance.id].life}</Text>
            <View style={styles.result}>
              <Text style={styles.resTitle}>{resultTitle(moment, glance)}</Text>
              <Text style={styles.resLine}>
                {formatIndex !== resolved!.formatIndex
                  ? `지금은 ${FORMAT_SHORT[formatIndex]}${euro(FORMAT_SHORT[formatIndex])} 보고 있어요.`
                  : resolved!.reason
                    ? `${glance.hook} 다만 ${resolved!.reason} ${FORMAT_SHORT[formatIndex]}${euro(FORMAT_SHORT[formatIndex])} 보여드릴게요.`
                    : `${glance.hook} ${FORMAT_SHORT[formatIndex]}${euro(FORMAT_SHORT[formatIndex])} 보여드릴게요.`}
              </Text>
            </View>
            <Text style={styles.sec}>다른 방식으로 볼래요</Text>
            <View style={styles.chips}>
              {FORMATS.map((f, i) => (
                <Pressable key={f.label} onPress={() => setFormatIndex(i)} style={[styles.chip, formatIndex === i && styles.chipOn]} accessibilityRole="button" accessibilityState={{ selected: formatIndex === i }}>
                  <Text style={[styles.chipText, formatIndex === i && styles.chipTextOn]}>{FORMAT_SHORT[i]}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable style={[styles.cta, !top && { opacity: 0.6 }]} onPress={open} accessibilityRole="button">
              <Text style={styles.ctaText}>{top ? '오늘의 1면 기사 보기' : '홈으로 가기'}</Text>
            </Pressable>
            {top ? <Text style={styles.preview} numberOfLines={2}>{top.headline}</Text> : null}
            <Pressable onPress={() => setGlance(null)} style={styles.back} accessibilityRole="button"><Text style={styles.backText}>← 다시 고르기</Text></Pressable>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 22, paddingVertical: 14 },
  brand: { fontSize: 20, fontWeight: '800', letterSpacing: -0.5, color: colors.brand },
  skip: { fontSize: 13.5, color: colors.textFaint },
  body: { padding: 22, paddingBottom: 48 },
  step: { fontSize: 12.5, fontWeight: '700', color: colors.textFaint },
  h1: { marginTop: 8, fontSize: 27, lineHeight: 37, fontWeight: '800', letterSpacing: -0.6, color: '#0f172a' },
  sub: { marginTop: 10, marginBottom: 18, fontSize: 14, lineHeight: 22, color: colors.textMuted },
  card: { padding: 16, borderRadius: 16, borderWidth: 1, borderColor: colors.line, backgroundColor: '#fff', marginBottom: 10 },
  cardTitle: { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  cardSub: { marginTop: 4, fontSize: 13, lineHeight: 19, color: colors.textMuted },
  back: { marginTop: 12, alignSelf: 'flex-start', paddingVertical: 8 },
  backText: { fontSize: 14, color: colors.textMuted },
  result: { marginTop: 4, padding: 18, borderRadius: 16, backgroundColor: '#f0f6ff', borderWidth: 1, borderColor: '#dbeafe' },
  resTitle: { fontSize: 20, fontWeight: '800', color: colors.brand },
  resLine: { marginTop: 8, fontSize: 14.5, lineHeight: 22, color: '#1f2937' },
  sec: { marginTop: 22, fontSize: 14, fontWeight: '800', color: colors.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  chip: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 999, borderWidth: 1, borderColor: colors.line },
  chipOn: { backgroundColor: BLUE, borderColor: BLUE },
  chipText: { fontSize: 14, fontWeight: '600', color: colors.textSub },
  chipTextOn: { color: '#fff', fontWeight: '700' },
  cta: { marginTop: 24, height: 54, borderRadius: 12, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  ctaText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  preview: { marginTop: 12, fontSize: 13.5, lineHeight: 20, color: colors.textMuted, textAlign: 'center' },
});
