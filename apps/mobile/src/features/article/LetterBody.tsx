import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { BADGE_HEAD, parseLetterBlocks, parseVoteChoices, type GlossaryTerm, type LetterBlock } from '@ailens/domain';
import { READING_ACCENT } from '../../theme';
import { FONT, Text } from '../../ui/Text';
import { useChapterRegister } from './chapterContext';
import { PostVote } from './PostVote';
import { RichText } from './RichText';
import { TermPopover, type TermAnchor } from './TermPopover';

/** 문장 단위로 쪼갠다(비교 칸의 긴 문단을 읽기 쉽게). 웹 LetterReadingBody 의 splitSentences 와 같은 규칙. */
const splitSentences = (text: string) =>
  text.split(/(?<=[.!?다요죠])\s+(?=[가-힣A-Z0-9"'“‘(])/u).map((t) => t.trim()).filter(Boolean);

/** 웹의 불규칙한 손맛 모서리(border-radius: a b c d / …)를 모서리별 반지름으로 근사한다. */
const irregular = (tl: number, tr: number, br: number, bl: number) => ({ borderTopLeftRadius: tl, borderTopRightRadius: tr, borderBottomRightRadius: br, borderBottomLeftRadius: bl });

// 배지 소제목 4색(웹 .lread[data-tpl="v2"] .lread-sub[data-badge="0..3"] .ch-t).
const BADGE_COLORS = [
  { fg: '#4338ca', bg: '#eef2ff' },
  { fg: '#c2410c', bg: '#fff7ed' },
  { fg: '#047857', bg: '#ecfdf5' },
  { fg: '#b91c1c', bg: '#fef2f2' },
];

/**
 * 레터 형식의 본문 — 웹 LetterReadingBody + lensViewStyles(.lread*)의 크기·간격·색을 그대로 옮겼다.
 * 새 레터 틀(특별 칸·배지 소제목이 있는 글)은 15.5px/1.75·블록 간격 12, 옛 글은 17px/1.8·간격 1.4em 로 웹과 같이 두 가지 틀을 쓴다.
 * 소제목·인용은 Noto Serif KR, 본문은 Pretendard. scale 은 글자 크기 설정(0.9~1.3).
 */
export function LetterBody({
  paragraphs,
  headline,
  glossary,
  summaryBullets,
  slug,
  scale = 1,
  onSaveText,
}: {
  paragraphs: string[];
  headline?: string;
  glossary?: readonly GlossaryTerm[];
  /** 새 레터 틀(특별 칸이 있는 글)의 "1분 요약". */
  summaryBullets?: string[];
  slug: string;
  scale?: number;
  /** 본문 문단을 길게 누르면 그 문단 텍스트를 넘긴다(문장 저장). */
  onSaveText?: (text: string) => void;
}) {
  const chapter = useChapterRegister();
  const blocks = useMemo(() => parseLetterBlocks(paragraphs, { headline }), [paragraphs, headline]);
  const [term, setTerm] = useState<TermAnchor | null>(null);
  const total = blocks.filter((b) => b.type === 'sub').length;
  const v2 = blocks.some((x) => x.type === 'box' || (x.type === 'sub' && BADGE_HEAD.test(x.head) && !!x.question));

  // 틀별 본문 규격.
  const T = v2
    ? { size: 15.5, lh: 1.75, gap: 12, leadSize: 15.5, leadLh: 1.75, leadW: '400' as const, leadColor: '#1f2937', color: '#1f2937', subTop: 30, subBottom: 12, boxTop: 26, boxPad: [16, 18] as const, boxP: 14.5 }
    : { size: 17, lh: 1.8, gap: 24, leadSize: 19.5, leadLh: 1.75, leadW: '500' as const, leadColor: '#111827', color: '#191919', subTop: 52, subBottom: 18, boxTop: 34, boxPad: [18, 20] as const, boxP: 15 };
  const f = (size: number, lh: number) => ({ fontSize: size * scale, lineHeight: size * scale * lh });
  const onTerm = (t: string, explain: string, at: { x: number; y: number }) => setTerm({ term: t, explain, ...at });

  const text = (raw: string, o: { size?: number; lh?: number; color?: string; weight?: '400' | '500' | '600' | '700'; numbers?: boolean; top?: number; save?: boolean } = {}) => (
    <RichText
      text={raw}
      glossary={glossary}
      numbers={o.numbers}
      onTerm={onTerm}
      onLongPress={o.save !== false && onSaveText ? () => onSaveText(raw) : undefined}
      style={[f(o.size ?? T.size, o.lh ?? T.lh), { color: o.color ?? T.color, fontWeight: o.weight ?? '400', letterSpacing: -0.085 * scale }, o.top !== undefined && { marginTop: o.top }]}
    />
  );

  const plain = (b: LetterBlock, key: number, top = T.gap) => {
    if (b.type === 'ul' || b.type === 'ol')
      return (
        <View key={key} style={{ marginTop: top, gap: 0.55 * T.size }}>
          {b.items.map((it, ii) => (
            <View key={ii} style={styles.li}>
              <Text style={[f(T.size, T.lh), { width: 22 * scale, color: READING_ACCENT, fontWeight: '700' }]}>{b.type === 'ol' ? `${ii + 1}.` : '•'}</Text>
              <View style={{ flex: 1 }}>{text(it, { numbers: true })}</View>
            </View>
          ))}
        </View>
      );
    if (b.type === 'quote')
      return (
        <View key={key} style={[styles.quote, { marginTop: top + 0.4 * T.size }]}>
          <Text style={[styles.quoteMark, { color: READING_ACCENT }]}>“</Text>
          <RichText text={b.text} glossary={glossary} onTerm={onTerm} style={[{ fontFamily: FONT.serif, color: '#111827', letterSpacing: -0.2 }, f(19, 1.7)]} />
        </View>
      );
    if (b.type === 'p' || b.type === 'lead') return <View key={key} style={{ marginTop: top }}>{text(b.text, { numbers: true })}</View>;
    return null;
  };

  return (
    <View>
      {v2 && summaryBullets && summaryBullets.length > 0 ? (
        <View style={[styles.summary, { paddingVertical: 16, paddingHorizontal: 18 }]}>
          <Text style={styles.boxTitle}>⏱️ 1분 요약</Text>
          {summaryBullets.map((s, i) => (
            <View key={i} style={{ marginBottom: 7 }}>{text(s, { size: 14.5, lh: 1.7, save: false })}</View>
          ))}
          <Text style={styles.hint}>5분 정도 여유가 있다면 아래 본문도 가볍게 읽어보세요.</Text>
        </View>
      ) : null}

      {blocks.map((b, bi) => {
        const first = bi === 0;
        const top = first ? 0 : T.gap;
        switch (b.type) {
          case 'lead':
            return (
              <View key={bi} style={{ marginTop: top }}>
                {text(b.text, { size: T.leadSize, lh: T.leadLh, color: T.leadColor, weight: T.leadW })}
              </View>
            );
          case 'sub': {
            const badge = BADGE_HEAD.test(b.head) && !!b.question;
            const mt = first ? 0 : T.subTop;
            return (
              <View key={bi} style={{ marginTop: mt, marginBottom: T.subBottom }} ref={(n) => chapter?.register(b.no, n)} collapsable={false}>
                {badge ? (
                  <>
                    <View style={[styles.badge, { backgroundColor: BADGE_COLORS[b.no % 4].bg }, v2 && { paddingVertical: 3, paddingHorizontal: 9, borderRadius: 10 }]}>
                      <Text style={{ fontSize: v2 ? 12 : 12.5, fontWeight: '700', color: BADGE_COLORS[b.no % 4].fg }}>{b.head}</Text>
                    </View>
                    <RichText
                      text={b.question}
                      glossary={glossary}
                      onTerm={onTerm}
                      style={[v2 ? { ...f(19, 1.45), letterSpacing: -0.19, fontWeight: '700' } : { fontFamily: FONT.serif, ...f(22, 1.4), letterSpacing: -0.44 }, { color: '#111827' }]}
                    />
                  </>
                ) : (
                  <>
                    <View style={[styles.chNo, irregular(16, 11, 15, 10)]}>
                      <Text style={styles.chNoText}>
                        {String(b.no + 1).padStart(2, '0')} <Text style={styles.chNoTotal}>/ {String(total).padStart(2, '0')}</Text>
                      </Text>
                    </View>
                    <RichText text={b.head} glossary={glossary} onTerm={onTerm} style={[{ fontFamily: FONT.serif, color: '#111827', letterSpacing: -0.5 }, f(25, 1.35)]} />
                    {b.question ? (
                      <View style={[styles.chQ, irregular(15, 12, 16, 11)]}>
                        <RichText text={b.question} glossary={glossary} onTerm={onTerm} style={[f(15.5, 1.5), { color: '#4b5563', fontWeight: '500' }]} />
                      </View>
                    ) : null}
                  </>
                )}
              </View>
            );
          }
          case 'hr':
            return <View key={bi} style={styles.hr} />;
          case 'compare':
            return (
              <View key={bi} style={{ marginTop: top }}>
                {b.intro ? <View style={{ marginBottom: 12 }}>{text(b.intro)}</View> : null}
                {[
                  { side: b.a, bg: '#f0fdf4', fg: '#15803d' },
                  { side: b.b, bg: '#fef2f2', fg: '#b91c1c' },
                ].map(({ side, bg, fg }, i) => (
                  <View key={side.label} style={[styles.cmp, { backgroundColor: bg, marginTop: i === 0 ? 0 : 10 }]}>
                    <Text style={[styles.boxTitle, { color: fg }]}>{side.label}</Text>
                    {splitSentences(side.text).map((t, ti) => (
                      <View key={ti} style={{ marginBottom: 7 }}>{text(t, { size: 14.5, lh: 1.7, numbers: true, save: false })}</View>
                    ))}
                  </View>
                ))}
                {b.outro ? <View style={{ marginTop: 14 }}>{text(b.outro)}</View> : null}
              </View>
            );
          case 'box': {
            const choices = b.kind === 'vote' ? parseVoteChoices(b.children.flatMap((c) => (c.type === 'p' ? [c.text] : []))) : null;
            const title = [b.head, b.question].filter(Boolean).join(b.kind === 'vote' ? ' ' : ': ');
            if (choices && choices.length >= 2) return <PostVote key={bi} slug={slug} title={title} choices={choices} />;
            if (b.kind === 'more') return <MoreBox key={bi} title={title} top={18}>{b.children.map((c, ci) => <View key={ci} style={{ marginTop: 10 }}>{c.type === 'p' || c.type === 'lead' ? text(c.text, { size: T.boxP, lh: 1.7, numbers: true, save: false }) : plain(c, ci, 0)}</View>)}</MoreBox>;
            const take = b.kind === 'takeaway';
            return (
              <View key={bi} style={[styles.box, { marginTop: T.boxTop, paddingVertical: T.boxPad[0], paddingHorizontal: T.boxPad[1], backgroundColor: take ? '#eff6ff' : '#f9fafb' }]}>
                <Text style={[styles.boxTitle, take && { color: '#1d4ed8' }]}>{title}</Text>
                {choices
                  ? choices.map((c, ci) => <View key={ci} style={{ marginBottom: 7 }}>{text(c, { size: 14.5, lh: 1.7, save: false })}</View>)
                  : b.children.map((c, ci) => (c.type === 'p' || c.type === 'lead' ? <View key={ci} style={{ marginBottom: 8 }}>{text(c.text, { size: take ? 15.5 : T.boxP, lh: 1.7, numbers: true, save: false })}</View> : plain(c, ci, 8)))}
              </View>
            );
          }
          default:
            return plain(b, bi, top);
        }
      })}

      {/* 레터 사인오프 — 얇은 룰 + 감사 문장 + 발신인 라벨(웹 .lread-sign). */}
      <View style={styles.sign}>
        <Text style={[styles.thanks, f(17, 1.7)]}>끝까지 읽어주셔서 고마워요.</Text>
        <View style={styles.from}>
          <View style={styles.signMark} />
          <Text style={styles.signName}>AI LENS 편집팀</Text>
        </View>
      </View>

      <TermPopover anchor={term} onClose={() => setTerm(null)} />
    </View>
  );
}

function MoreBox({ title, top, children }: { title: string; top: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={[styles.more, { marginTop: top }]}>
      <Pressable onPress={() => setOpen((o) => !o)} accessibilityRole="button" accessibilityState={{ expanded: open }}>
        <Text style={styles.moreHead}>
          {open ? '▾' : '▸'} {title}
        </Text>
      </Pressable>
      {open ? children : null}
    </View>
  );
}

const styles = StyleSheet.create({
  li: { flexDirection: 'row' },
  quote: { paddingTop: 18, paddingBottom: 20, paddingHorizontal: 22, backgroundColor: '#edf2fd', borderTopLeftRadius: 20, borderTopRightRadius: 16, borderBottomRightRadius: 22, borderBottomLeftRadius: 15 },
  quoteMark: { fontFamily: FONT.serif, fontSize: 38, lineHeight: 30, marginBottom: 8 },
  badge: { alignSelf: 'flex-start', marginBottom: 10, paddingVertical: 4, paddingHorizontal: 11, borderRadius: 12 },
  // 챕터 번호 알약 "02 / 06": 형식색 15% 면 + 형식색 62% 글자(웹 color-mix 결과값).
  chNo: { alignSelf: 'flex-start', marginBottom: 12, paddingTop: 3, paddingBottom: 4, paddingHorizontal: 12, backgroundColor: '#e6eefd' },
  chNoText: { fontSize: 12, fontWeight: '800', letterSpacing: 0.48, color: '#4467ae' },
  chNoTotal: { fontWeight: '600', opacity: 0.55 },
  chQ: { alignSelf: 'flex-start', maxWidth: '100%', marginTop: 12, paddingVertical: 8, paddingHorizontal: 15, backgroundColor: '#f4f5f7' },
  hr: { alignSelf: 'center', width: 84, height: 2, marginTop: 30, marginBottom: 8, borderRadius: 1, backgroundColor: 'rgba(17,24,39,0.26)' },
  summary: { marginBottom: 24, borderRadius: 14, backgroundColor: '#f3f4f6' },
  boxTitle: { marginBottom: 9, fontSize: 13, fontWeight: '700', color: '#4b5563' },
  hint: { marginTop: 11, fontSize: 12.5, color: '#9ca3af' },
  box: { borderRadius: 14 },
  cmp: { paddingVertical: 14, paddingHorizontal: 16, borderRadius: 10 },
  more: { paddingVertical: 12, paddingHorizontal: 15, borderRadius: 10, backgroundColor: '#fffbeb' },
  moreHead: { fontSize: 14, fontWeight: '700', color: '#92400e' },
  sign: { marginTop: 36, alignItems: 'center' },
  thanks: { color: '#374151', fontWeight: '500', marginBottom: 14, textAlign: 'center' },
  from: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  signMark: { width: 30, height: 3, borderRadius: 2, backgroundColor: READING_ACCENT },
  signName: { fontSize: 13, fontWeight: '800', letterSpacing: 0.78, color: '#6b7280' },
});
