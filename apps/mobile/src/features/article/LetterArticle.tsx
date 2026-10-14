import { Image, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import RenderHtml from 'react-native-render-html';
import type { LetterPost } from '@ailens/api-client';
import { colors } from '../../theme';
import { LetterBody } from './LetterBody';

// letters 채널 전용 글(LENS 4형식이 없는 글)의 본문. 웹 letters/[id] 대응: 리치텍스트(body_html) 또는 문단(body), 핵심 요약, 이미지, 수치 차트, 마무리 문장.
// API 의 letters 응답에는 아래 필드가 더 있다(앱 목록 타입 LetterPost 는 목록용 부분집합이라 여기서 확장해 읽는다).
interface LetterFull extends LetterPost {
  body_html?: string | null;
  key_points: string[];
  keywords?: Array<{ term: string; explain: string }>;
  images?: Array<{ url: string; alt?: string; caption?: string; credit?: string }>;
  chart?: { title: string; unit: string; series: Array<{ label: string; value: number }> } | null;
  closing_line?: string | null;
}

export function LetterArticle({ post, scale, onSaveText }: { post: LetterPost; scale: number; onSaveText?: (text: string) => void }) {
  const p = post as LetterFull;
  const { width } = useWindowDimensions();
  return (
    <View>
      {p.subtitle ? <Text style={[styles.subtitle, { fontSize: 16 * scale, lineHeight: 25 * scale }]}>{p.subtitle}</Text> : null}

      {p.key_points?.length > 0 ? (
        <View style={styles.points}>
          <Text style={styles.pointsHead}>핵심 요약</Text>
          {p.key_points.map((k, i) => (
            <Text key={i} style={[styles.point, { fontSize: 15.5 * scale, lineHeight: 24 * scale }]}>
              • {k}
            </Text>
          ))}
        </View>
      ) : null}

      {p.body_html ? (
        // 리치텍스트(Tiptap) 본문 — 굵게·목록·이미지 위치를 그대로 보존한다.
        <RenderHtml
          contentWidth={width - 40}
          source={{ html: p.body_html }}
          baseStyle={{ color: '#1f2937', fontSize: 16 * scale, lineHeight: 26 * scale }}
          tagsStyles={{ h2: { fontSize: 21 * scale, marginTop: 28 }, h3: { fontSize: 18 * scale, marginTop: 22 }, p: { marginTop: 14, marginBottom: 0 }, a: { color: '#2563eb' }, blockquote: { borderLeftWidth: 3, borderLeftColor: '#5b8def', paddingLeft: 12, marginLeft: 0 } }}
        />
      ) : (
        <LetterBody paragraphs={p.body ?? []} headline={p.headline} glossary={p.keywords} slug={p.id} scale={scale} onSaveText={onSaveText} />
      )}

      {p.images?.map((img, i) => (
        <View key={i} style={styles.fig}>
          <Image source={{ uri: img.url }} style={styles.figImg} resizeMode="cover" accessibilityLabel={img.alt} />
          {img.caption || img.credit ? <Text style={styles.cap}>{[img.caption, img.credit].filter(Boolean).join(' · ')}</Text> : null}
        </View>
      ))}

      {p.chart && p.chart.series.length > 0 ? <Chart chart={p.chart} /> : null}

      {p.closing_line ? <Text style={[styles.closing, { fontSize: 16 * scale, lineHeight: 26 * scale }]}>{p.closing_line}</Text> : null}
    </View>
  );
}

/** 레터 실수치 차트(AI 생성 아님) — 가로 막대. 웹 LetterChartBlock 의 단순화 판. */
function Chart({ chart }: { chart: NonNullable<LetterFull['chart']> }) {
  const max = Math.max(...chart.series.map((s) => s.value), 1);
  return (
    <View style={styles.chart}>
      <Text style={styles.chartTitle}>{chart.title}</Text>
      {chart.series.map((s) => (
        <View key={s.label} style={styles.row}>
          <Text style={styles.rowLabel} numberOfLines={1}>{s.label}</Text>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${Math.max(2, (s.value / max) * 100)}%` }]} />
          </View>
          <Text style={styles.rowValue}>{s.value.toLocaleString('ko-KR')}{chart.unit}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  subtitle: { color: '#4b5563', marginTop: 4 },
  points: { marginTop: 20, padding: 16, borderRadius: 14, backgroundColor: '#f0f6ff', borderWidth: 1, borderColor: '#dbeafe' },
  pointsHead: { fontSize: 14, fontWeight: '800', color: colors.text },
  point: { marginTop: 8, color: '#1f2937' },
  fig: { marginTop: 20 },
  figImg: { width: '100%', aspectRatio: 16 / 10, borderRadius: 12, backgroundColor: colors.imagePlaceholder },
  cap: { marginTop: 6, fontSize: 12.5, color: colors.textFaint },
  chart: { marginTop: 24, padding: 16, borderRadius: 14, backgroundColor: '#f9fafb', borderWidth: 1, borderColor: colors.line },
  chartTitle: { fontSize: 15, fontWeight: '800', color: colors.text, marginBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  rowLabel: { width: 72, fontSize: 12.5, color: colors.textSub },
  track: { flex: 1, height: 12, borderRadius: 6, backgroundColor: '#e5e7eb', overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: '#5b8def' },
  rowValue: { minWidth: 64, textAlign: 'right', fontSize: 12.5, fontWeight: '700', color: colors.text },
  closing: { marginTop: 28, color: '#374151', fontWeight: '600' },
});
