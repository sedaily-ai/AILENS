import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import type { LetterBlock, LetterSegment } from '@ailens/api-client';
import { colors } from '../../theme';

/** 문단 한 개(조각 배열) → 시각 블록이면 블록, 아니면 글 + 인라인 링크 문단. 웹 LetterBlocks 대응. */
export function Paragraph({ para, scale = 1 }: { para: LetterSegment[]; scale?: number }) {
  const first = para[0];
  if (first && typeof first !== 'string' && 'block' in first) return <Block block={first} scale={scale} />;
  return (
    <Text style={[styles.p, { fontSize: 16 * scale, lineHeight: 27 * scale }]}>
      {para.map((seg, i) =>
        typeof seg === 'string' ? (
          seg
        ) : 'href' in seg ? (
          <Text key={i} style={styles.link} onPress={() => void Linking.openURL(seg.href)} accessibilityRole="link">
            {seg.text}
          </Text>
        ) : null,
      )}
    </Text>
  );
}

function Block({ block, scale }: { block: LetterBlock; scale: number }) {
  switch (block.block) {
    case 'timeline':
      return (
        <View style={styles.box}>
          {block.items.map((it, i) => (
            <View key={i} style={styles.tl}>
              <View style={styles.dotCol}>
                <View style={styles.dot} />
                {i < block.items.length - 1 ? <View style={styles.line} /> : null}
              </View>
              <View style={{ flex: 1, paddingBottom: 14 }}>
                <Text style={styles.tlLabel}>{it.label}</Text>
                <Text style={[styles.tlText, { fontSize: 15 * scale, lineHeight: 23 * scale }]}>{it.text}</Text>
              </View>
            </View>
          ))}
        </View>
      );
    case 'stats':
      return (
        <View style={styles.stats}>
          {block.items.map((it, i) => (
            <View key={i} style={styles.stat}>
              <Text style={styles.statLabel}>{it.label}</Text>
              <Text style={styles.statValue}>{it.value}</Text>
              {it.sub ? <Text style={styles.statSub}>{it.sub}</Text> : null}
            </View>
          ))}
        </View>
      );
    case 'bars': {
      const max = Math.max(...block.items.map((i) => i.value), 1);
      return (
        <View style={styles.box}>
          {block.title ? <Text style={styles.boxTitle}>{block.title}</Text> : null}
          {block.items.map((it, i) => (
            <View key={i} style={styles.barRow}>
              <Text style={styles.barLabel} numberOfLines={1}>{it.label}</Text>
              <View style={styles.track}><View style={[styles.fill, { width: `${Math.max(2, (it.value / max) * 100)}%` }]} /></View>
              <Text style={styles.barValue}>{it.value.toLocaleString('ko-KR')}{block.unit ?? ''}</Text>
            </View>
          ))}
        </View>
      );
    }
    case 'versus':
      return (
        <View style={{ gap: 10, marginTop: 16 }}>
          {[{ s: block.left, bg: '#eff6ff', bd: '#bfdbfe' }, { s: block.right, bg: '#fef2f2', bd: '#fecaca' }].map(({ s, bg, bd }) => (
            <View key={s.label} style={[styles.vs, { backgroundColor: bg, borderColor: bd }]}>
              <Text style={styles.boxTitle}>{s.label}</Text>
              <Text style={[styles.tlText, { marginTop: 6, fontSize: 15 * scale, lineHeight: 23 * scale }]}>{s.text}</Text>
            </View>
          ))}
        </View>
      );
    case 'fold':
      return <Fold title={block.title} text={block.text} scale={scale} />;
    case 'callout':
      return (
        <View style={styles.callout}>
          <Text style={[styles.tlText, { fontSize: 15.5 * scale, lineHeight: 24 * scale, fontWeight: '600' }]}>{block.text}</Text>
        </View>
      );
  }
}

function Fold({ title, text, scale }: { title: string; text: string; scale: number }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.fold}>
      <Pressable onPress={() => setOpen((o) => !o)} accessibilityRole="button" accessibilityState={{ expanded: open }}>
        <Text style={styles.boxTitle}>{open ? '▾' : '▸'} {title}</Text>
      </Pressable>
      {open ? <Text style={[styles.tlText, { marginTop: 8, fontSize: 15 * scale, lineHeight: 23 * scale }]}>{text}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  p: { marginTop: 14, color: '#1f2937' },
  link: { color: '#2563eb', textDecorationLine: 'underline' },
  box: { marginTop: 16, padding: 14, borderRadius: 12, backgroundColor: '#f9fafb', borderWidth: 1, borderColor: colors.line },
  boxTitle: { fontSize: 14, fontWeight: '800', color: colors.text },
  tl: { flexDirection: 'row', gap: 12 },
  dotCol: { alignItems: 'center', width: 12 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#5b8def', marginTop: 5 },
  line: { flex: 1, width: 2, backgroundColor: '#dbeafe', marginTop: 2 },
  tlLabel: { fontSize: 12.5, fontWeight: '800', color: '#2563eb' },
  tlText: { color: '#1f2937' },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 16 },
  stat: { flexGrow: 1, flexBasis: '45%', padding: 14, borderRadius: 12, backgroundColor: '#f0f6ff' },
  statLabel: { fontSize: 12, color: colors.textMuted },
  statValue: { marginTop: 4, fontSize: 19, fontWeight: '800', color: colors.brand },
  statSub: { marginTop: 2, fontSize: 11.5, color: colors.textFaint },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  barLabel: { width: 76, fontSize: 12.5, color: colors.textSub },
  track: { flex: 1, height: 12, borderRadius: 6, backgroundColor: '#e5e7eb', overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: '#5b8def' },
  barValue: { minWidth: 56, textAlign: 'right', fontSize: 12.5, fontWeight: '700', color: colors.text },
  vs: { padding: 14, borderRadius: 12, borderWidth: 1 },
  fold: { marginTop: 16, padding: 14, borderRadius: 12, backgroundColor: '#f9fafb', borderWidth: 1, borderColor: colors.line },
  callout: { marginTop: 16, padding: 14, borderRadius: 12, backgroundColor: '#fff7ed', borderWidth: 1, borderColor: '#fed7aa' },
});
