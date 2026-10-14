import { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { BADGE_HEAD, parseLetterBlocks, parseVoteChoices, type GlossaryTerm, type LetterBlock } from '@ailens/domain';
import { colors } from '../../theme';
import { PostVote } from './PostVote';
import { RichText } from './RichText';

const ACCENT = '#5b8def'; // 웹 READING_ACCENT

/** 문장 단위로 쪼갠다(비교 칸의 긴 문단을 읽기 쉽게). 웹 LetterReadingBody 의 splitSentences 와 같은 규칙. */
const splitSentences = (text: string) =>
  text.split(/(?<=[.!?다요죠])\s+(?=[가-힣A-Z0-9"'“‘(])/u).map((t) => t.trim()).filter(Boolean);

/**
 * 레터 형식의 본문 — parseLetterBlocks 가 소제목·목록·인용·구분선·특별 칸(한 가지만 기억·에디터 노트·투표·더 보기)·좌우 비교를 풀어 주므로
 * 프롬프트 출력 형식이 바뀌어도 마크다운 기호가 그대로 보이지 않는다(웹 LetterReadingBody 대응).
 * scale 은 글자 크기 설정(0.9~1.3)이다.
 */
export function LetterBody({
  paragraphs,
  headline,
  glossary,
  summaryBullets,
  slug,
  scale = 1,
}: {
  paragraphs: string[];
  headline?: string;
  glossary?: readonly GlossaryTerm[];
  /** 새 레터 틀(특별 칸이 있는 글)의 "1분 요약". */
  summaryBullets?: string[];
  slug: string;
  scale?: number;
}) {
  const blocks = useMemo(() => parseLetterBlocks(paragraphs, { headline }), [paragraphs, headline]);
  const [term, setTerm] = useState<{ term: string; explain: string } | null>(null);
  const total = blocks.filter((b) => b.type === 'sub').length;
  const isNewFormat = blocks.some((x) => x.type === 'box' || (x.type === 'sub' && BADGE_HEAD.test(x.head) && !!x.question));
  const fs = (n: number) => ({ fontSize: n * scale, lineHeight: n * scale * 1.65 });
  const onTerm = (t: string, explain: string) => setTerm({ term: t, explain });

  const rt = (text: string, numbers = false, style?: object) => (
    <RichText text={text} glossary={glossary} numbers={numbers} onTerm={onTerm} style={[styles.p, fs(16), style]} />
  );

  const plain = (b: LetterBlock, key: number) => {
    if (b.type === 'ul' || b.type === 'ol')
      return (
        <View key={key} style={styles.list}>
          {b.items.map((it, ii) => (
            <View key={ii} style={styles.li}>
              <Text style={[styles.bullet, fs(16)]}>{b.type === 'ol' ? `${ii + 1}.` : '•'}</Text>
              <View style={{ flex: 1 }}>{rt(it, true, { marginTop: 0 })}</View>
            </View>
          ))}
        </View>
      );
    if (b.type === 'quote')
      return (
        <View key={key} style={styles.quote}>
          {rt(b.text, false, { marginTop: 0, color: '#374151' })}
        </View>
      );
    if (b.type === 'p' || b.type === 'lead') return <View key={key}>{rt(b.text, true)}</View>;
    return null;
  };

  return (
    <View>
      {isNewFormat && summaryBullets && summaryBullets.length > 0 ? (
        <View style={styles.summary}>
          <Text style={styles.boxTitle}>⏱️ 1분 요약</Text>
          {summaryBullets.map((s, i) => (
            <View key={i}>{rt(s, false, { marginTop: 8 })}</View>
          ))}
          <Text style={styles.hint}>5분 정도 여유가 있다면 아래 본문도 가볍게 읽어보세요.</Text>
        </View>
      ) : null}

      {blocks.map((b, bi) => {
        switch (b.type) {
          case 'lead':
            return <View key={bi}>{rt(b.text, false, { fontWeight: '600', color: '#111827', marginTop: 4 })}</View>;
          case 'sub':
            return (
              <View key={bi} style={styles.sub}>
                <Text style={styles.chNo}>
                  {String(b.no + 1).padStart(2, '0')} <Text style={styles.chTotal}>/ {String(total).padStart(2, '0')}</Text>
                </Text>
                <RichText text={b.head} glossary={glossary} onTerm={onTerm} style={[styles.chTitle, fs(21)]} />
                {b.question ? <RichText text={b.question} glossary={glossary} onTerm={onTerm} style={[styles.chQ, fs(15)]} /> : null}
              </View>
            );
          case 'hr':
            return (
              <Text key={bi} style={styles.hr} accessibilityElementsHidden>
                ···
              </Text>
            );
          case 'compare':
            return (
              <View key={bi} style={{ marginTop: 20 }}>
                {b.intro ? rt(b.intro) : null}
                {[
                  { side: b.a, style: styles.cmpA },
                  { side: b.b, style: styles.cmpB },
                ].map(({ side, style }) => (
                  <View key={side.label} style={[styles.cmp, style]}>
                    <Text style={styles.boxTitle}>{side.label}</Text>
                    {splitSentences(side.text).map((t, ti) => (
                      <View key={ti}>{rt(t, true, { marginTop: 8 })}</View>
                    ))}
                  </View>
                ))}
                {b.outro ? rt(b.outro) : null}
              </View>
            );
          case 'box': {
            const choices = b.kind === 'vote' ? parseVoteChoices(b.children.flatMap((c) => (c.type === 'p' ? [c.text] : []))) : null;
            const title = [b.head, b.question].filter(Boolean).join(b.kind === 'vote' ? ' ' : ': ');
            if (choices && choices.length >= 2) return <PostVote key={bi} slug={slug} title={title} choices={choices} />;
            if (b.kind === 'more') return <MoreBox key={bi} title={title}>{b.children.map(plain)}</MoreBox>;
            return (
              <View key={bi} style={[styles.box, b.kind === 'takeaway' ? styles.boxTake : b.kind === 'note' ? styles.boxNote : styles.boxVote]}>
                <Text style={styles.boxTitle}>{title}</Text>
                {choices ? choices.map((c, ci) => <Text key={ci} style={[styles.p, fs(16)]}>{c}</Text>) : b.children.map(plain)}
              </View>
            );
          }
          default:
            return plain(b, bi);
        }
      })}

      <TermSheet term={term} onClose={() => setTerm(null)} />
    </View>
  );
}

function MoreBox({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.more}>
      <Pressable onPress={() => setOpen((o) => !o)} accessibilityRole="button" accessibilityState={{ expanded: open }}>
        <Text style={styles.moreHead}>
          {open ? '▾' : '▸'} {title}
        </Text>
      </Pressable>
      {open ? children : null}
    </View>
  );
}

function TermSheet({ term, onClose }: { term: { term: string; explain: string } | null; onClose: () => void }) {
  return (
    <Modal visible={!!term} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="닫기">
        <View style={styles.sheet}>
          <Text style={styles.termName}>{term?.term}</Text>
          <Text style={styles.termExplain}>{term?.explain}</Text>
          <Text style={styles.termClose}>탭하면 닫혀요</Text>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  p: { color: '#1f2937', marginTop: 16 },
  list: { marginTop: 14, gap: 6 },
  li: { flexDirection: 'row', gap: 8 },
  bullet: { color: ACCENT, fontWeight: '800', width: 22, marginTop: 0 },
  quote: { marginTop: 16, paddingLeft: 14, borderLeftWidth: 3, borderLeftColor: ACCENT },
  sub: { marginTop: 36 },
  chNo: { fontSize: 13, fontWeight: '800', color: ACCENT, letterSpacing: 0.5 },
  chTotal: { color: colors.textFaint, fontWeight: '600' },
  chTitle: { marginTop: 6, fontWeight: '800', color: colors.text, letterSpacing: -0.3 },
  chQ: { marginTop: 6, color: colors.textMuted, fontWeight: '600' },
  hr: { textAlign: 'center', color: colors.textFaint, fontSize: 22, marginTop: 24, letterSpacing: 6 },
  summary: { padding: 16, borderRadius: 14, backgroundColor: '#f0f6ff', borderWidth: 1, borderColor: '#dbeafe' },
  boxTitle: { fontSize: 14, fontWeight: '800', color: colors.text },
  hint: { marginTop: 12, fontSize: 12.5, color: colors.textMuted },
  box: { marginTop: 20, padding: 16, borderRadius: 14, borderWidth: 1 },
  boxTake: { backgroundColor: '#fff7ed', borderColor: '#fed7aa' },
  boxNote: { backgroundColor: '#f8fafc', borderColor: '#e2e8f0' },
  boxVote: { backgroundColor: '#f8fafc', borderColor: '#e2e8f0' },
  cmp: { marginTop: 12, padding: 14, borderRadius: 12, borderWidth: 1 },
  cmpA: { backgroundColor: '#eff6ff', borderColor: '#bfdbfe' },
  cmpB: { backgroundColor: '#fef2f2', borderColor: '#fecaca' },
  more: { marginTop: 20, padding: 14, borderRadius: 12, backgroundColor: '#f9fafb', borderWidth: 1, borderColor: colors.line },
  moreHead: { fontSize: 15, fontWeight: '700', color: colors.text },
  scrim: { flex: 1, backgroundColor: 'rgba(17,24,39,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40 },
  termName: { fontSize: 18, fontWeight: '800', color: colors.text },
  termExplain: { marginTop: 10, fontSize: 16, lineHeight: 25, color: '#374151' },
  termClose: { marginTop: 16, fontSize: 12, color: colors.textFaint },
});
