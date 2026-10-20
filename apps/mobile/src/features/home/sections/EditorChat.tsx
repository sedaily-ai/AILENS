import { useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { categoryForDataLabel, type LetterEditor } from '@ailens/domain';
import { getApiConfig, type LensPost } from '@ailens/api-client';
import { Text } from '../../../ui/Text';
import { ArrowRight, CaretDown, CaretUp, Fire, GearSix } from '../../../ui/icons';
import { colors, surface } from '../../../theme';
import { answerLead, momentOf, nextLead, openingLine, voiceOf, type SituationKey } from '../editorVoice';
import { categoriesOf } from '../myEditor';
import { pickQuestions, type QA } from '../questions';
import { markStep } from '../dailyProgress';
import { EditorVoice } from './EditorVoice';

/**
 * 홈의 중심 — "내 에디터와 대화하는 카드".
 *  에디터 말풍선(시간·상황 인사) → 추천 질문 칩 → 칩을 누르면 같은 카드 안에서 풀이(핵심 정리·용어·더 자세히) → 근거 기사·다른 형식으로 이어가기.
 * 질문과 풀이는 모두 기사(lenses 의 question·bullets·keywords)에서 가져온다 — 생성한 문장은 없다. 에디터는 말투와 고르는 기준만 바꾼다.
 */
const chipsCount = 4;

function Face({ editor, size }: { editor: LetterEditor; size: number }) {
  const uri = editor.image ? `${getApiConfig().cmsApiUrl}${editor.image}` : null;
  return (
    <View style={[styles.ring, { width: size + 8, height: size + 8, borderRadius: (size + 8) / 2, backgroundColor: editor.tone.bg }]}>
      <View style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
        {uri ? <Image source={{ uri }} style={{ width: size, height: size }} resizeMode="cover" /> : <Text style={{ fontSize: size * 0.4, fontWeight: '800', color: editor.tone.fg }}>{editor.name.charAt(0)}</Text>}
      </View>
    </View>
  );
}

export function EditorChat({
  editor,
  picked,
  lens,
  interests,
  readIds,
  situation,
  streak,
  onChangeEditor,
  onOpenSettings,
}: {
  editor: LetterEditor;
  picked: boolean;
  lens: LensPost[];
  interests: string[];
  readIds: Set<string>;
  situation: SituationKey | null;
  streak: number;
  onChangeEditor: () => void;
  onOpenSettings: () => void;
}) {
  const router = useRouter();
  const voice = voiceOf(editor.group);
  const moment = momentOf(new Date(), situation);
  const [openId, setOpenId] = useState<string | null>(null);
  const [more, setMore] = useState(false);

  const chips = useMemo(
    () =>
      pickQuestions(lens, {
        interests,
        editorSlugs: categoriesOf(editor.id),
        editorTopics: editor.topics.map((t) => t.name),
        readIds,
        slugOf: (c) => categoryForDataLabel(c)?.slug ?? null,
        count: chipsCount,
      }),
    [lens, interests, editor, readIds]
  );
  const current: QA | undefined = chips.find((c) => c.id === openId);

  const select = (qa: QA) => {
    setMore(false);
    if (openId === qa.id) return setOpenId(null);
    setOpenId(qa.id);
    void markStep('read');
  };
  const openArticle = (qa: QA, index?: number) =>
    router.push({ pathname: '/article/[slug]', params: index === undefined ? { slug: qa.id } : { slug: qa.id, format: String(index) } });

  const voiceUri = editor.voice ? `${getApiConfig().cmsApiUrl}${editor.voice}` : null;

  return (
    <View style={styles.card}>
      <View style={styles.top}>
        <Pressable onPress={onChangeEditor} style={styles.who} accessibilityRole="button" accessibilityLabel={`${picked ? '내' : '오늘의'} 에디터 ${editor.name}, 바꾸기`}>
          <Face editor={editor} size={52} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.kicker, { color: editor.tone.fg }]}>{picked ? '내 에디터' : '오늘의 에디터'} · 바꾸기</Text>
            <Text style={styles.name} numberOfLines={1}>{editor.name}</Text>
          </View>
        </Pressable>
        {streak > 0 ? (
          <View style={styles.streak}>
            <Fire size={14} color="#ea580c" weight="fill" />
            <Text style={styles.streakText}>{streak}일</Text>
          </View>
        ) : null}
        <Pressable onPress={onOpenSettings} hitSlop={10} accessibilityRole="button" accessibilityLabel="오늘 설정 열기" style={styles.gear}>
          <GearSix size={22} color={colors.textMuted} />
        </Pressable>
      </View>

      <View style={[styles.bubble, { backgroundColor: editor.tone.bg }]}>
        <Text style={styles.bubbleText}>{openingLine(voice, moment)}</Text>
      </View>
      {voiceUri ? (
        <View style={styles.voiceRow}>
          <EditorVoice key={editor.id} src={voiceUri} name={editor.name} tint={editor.tone} compact />
        </View>
      ) : null}

      {chips.length > 0 ? (
        <>
          <Text style={styles.label}>이런 게 궁금하실 것 같아요</Text>
          <View style={styles.chips}>
            {/* 고른 질문은 아래 대화(내 말풍선)로 옮겨 가므로 칩 목록에서는 뺀다. */}
            {chips.filter((c) => c.id !== openId).map((c) => (
              <Pressable key={c.id} onPress={() => select(c)} style={styles.chip} accessibilityRole="button">
                <Text style={styles.chipText} numberOfLines={2}>{c.question}</Text>
              </Pressable>
            ))}
          </View>
        </>
      ) : null}

      {current ? (
        <View style={styles.thread}>
          <Pressable onPress={() => setOpenId(null)} style={styles.userBubble} accessibilityRole="button" accessibilityLabel="대화 닫기">
            <Text style={styles.userText}>{current.question}</Text>
          </Pressable>
          <View style={styles.answer}>
            <Text style={[styles.lead, { color: editor.tone.fg }]}>{answerLead(voice)}</Text>
            {current.points.map((p, i) => (
              <View key={i} style={styles.point}>
                <Text style={[styles.num, { color: editor.tone.fg }]}>{i + 1}</Text>
                <Text style={styles.pointText}>{p}</Text>
              </View>
            ))}
            {current.terms.length > 0 ? (
              <View style={styles.terms}>
                {current.terms.map((t) => (
                  <View key={t.term} style={styles.term}>
                    <Text style={styles.termName}>{t.term}</Text>
                    <Text style={styles.termExplain}>{t.explain}</Text>
                  </View>
                ))}
              </View>
            ) : null}
            {current.detail.length > 0 ? (
              <>
                <Pressable onPress={() => setMore((m) => !m)} style={styles.moreBtn} accessibilityRole="button">
                  <Text style={styles.moreText}>{more ? '접기' : '더 자세히 볼까요?'}</Text>
                  {more ? <CaretUp size={13} color={colors.textSub} weight="bold" /> : <CaretDown size={13} color={colors.textSub} weight="bold" />}
                </Pressable>
                {more ? current.detail.map((d, i) => <Text key={i} style={styles.detail}>· {d}</Text>) : null}
              </>
            ) : null}
            <Pressable onPress={() => openArticle(current)} style={styles.source} accessibilityRole="link">
              <Text style={styles.sourceText}>근거 기사 보기</Text>
              <ArrowRight size={15} color={colors.brand} weight="bold" />
            </Pressable>
          </View>
          {current.followUps.length > 0 ? (
            <View>
              <Text style={styles.next}>{nextLead(voice)}</Text>
              <View style={styles.followRow}>
                {current.followUps.map((f) => (
                  <Pressable key={f.index} onPress={() => openArticle(current, f.index)} style={styles.follow} accessibilityRole="link">
                    <Text style={styles.followText}>{f.text}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { ...surface.card, padding: 16 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  who: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12 },
  ring: { alignItems: 'center', justifyContent: 'center' },
  kicker: { fontSize: 12, fontWeight: '800' },
  name: { marginTop: 2, fontSize: 17, fontWeight: '800', letterSpacing: -0.4, color: colors.text },
  streak: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, height: 26, borderRadius: 999, backgroundColor: '#fff3e8' },
  streakText: { fontSize: 12, fontWeight: '800', color: '#c2410c' },
  gear: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },

  bubble: { marginTop: 14, padding: 14, borderRadius: 18, borderTopLeftRadius: 6 },
  bubbleText: { fontSize: 15.5, lineHeight: 24, fontWeight: '600', color: colors.text },
  voiceRow: { marginTop: 10 },

  label: { marginTop: 18, marginBottom: 10, fontSize: 13, fontWeight: '800', color: colors.textMuted },
  chips: { gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 11, borderRadius: 16, backgroundColor: '#f6f8fb', borderWidth: 1, borderColor: '#e8ecf3' },
  chipText: { fontSize: 14.5, lineHeight: 21, fontWeight: '700', letterSpacing: -0.2, color: colors.text },

  thread: { marginTop: 16, gap: 10 },
  userBubble: { alignSelf: 'flex-end', maxWidth: '88%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18, borderBottomRightRadius: 6, backgroundColor: colors.brand },
  userText: { fontSize: 14.5, lineHeight: 21, fontWeight: '700', color: '#fff' },
  answer: { padding: 14, borderRadius: 18, borderTopLeftRadius: 6, backgroundColor: '#f6f8fb', gap: 10 },
  lead: { fontSize: 13, fontWeight: '800' },
  point: { flexDirection: 'row', gap: 10 },
  num: { width: 16, fontSize: 14, fontWeight: '800', lineHeight: 22 },
  pointText: { flex: 1, fontSize: 14.5, lineHeight: 22, color: colors.text },
  terms: { gap: 6 },
  term: { padding: 10, borderRadius: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e8ecf3' },
  termName: { fontSize: 12.5, fontWeight: '800', color: colors.brand },
  termExplain: { marginTop: 2, fontSize: 13, lineHeight: 19, color: colors.textSub },
  moreBtn: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4 },
  moreText: { fontSize: 13, fontWeight: '700', color: colors.textSub },
  detail: { fontSize: 13.5, lineHeight: 21, color: colors.textSub },
  source: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  sourceText: { fontSize: 14, fontWeight: '800', color: colors.brand },
  next: { marginBottom: 8, fontSize: 13, fontWeight: '700', color: colors.textMuted },
  followRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  follow: { paddingHorizontal: 14, height: 38, borderRadius: 999, borderWidth: 1, borderColor: '#d9dee8', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  followText: { fontSize: 13.5, fontWeight: '700', color: colors.text },
});
