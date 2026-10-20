import { useMemo, useRef, useState } from 'react';
import { Image, LayoutAnimation, Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { categoryForDataLabel, type LetterEditor } from '@ailens/domain';
import { getApiConfig, type LensPost } from '@ailens/api-client';
import { Text } from '../../../ui/Text';
import { ArrowRight, CaretDown, CaretUp, Fire, GearSix } from '../../../ui/icons';
import { accent, colors, surface } from '../../../theme';
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

function Face({ editor, size }: { editor: LetterEditor; size: number }) {
  const uri = editor.image ? `${getApiConfig().cmsApiUrl}${editor.image}` : null;
  return (
    <View style={[styles.ring, { width: size + 8, height: size + 8, borderRadius: (size + 8) / 2, backgroundColor: accent.soft }]}>
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
  questionCount,
  streak,
  onChangeEditor,
  onOpenSettings,
  onOpened,
}: {
  editor: LetterEditor;
  picked: boolean;
  lens: LensPost[];
  interests: string[];
  readIds: Set<string>;
  situation: SituationKey | null;
  /** 보여 줄 질문 개수(오늘 설정의 볼 시간에서 온다). */
  questionCount: number;
  streak: number;
  onChangeEditor: () => void;
  onOpenSettings: () => void;
  /** 질문이 열렸을 때 호출 — 열린 칩의 맨 위가 카드 안 어디인지(px)를 알려 홈이 그 자리로 스크롤한다. */
  onOpened?: (yInCard: number) => void;
}) {
  const router = useRouter();
  const voice = voiceOf(editor.group);
  const moment = momentOf(new Date(), situation);
  const [openId, setOpenId] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  // 칩 목록과 각 칩의 위치(레이아웃). 칩이 열리면 그 칩의 맨 위가 화면 위쪽에 오도록 홈에 알린다.
  const listY = useRef(0);
  const itemY = useRef<Record<string, number>>({});

  const chips = useMemo(
    () =>
      pickQuestions(lens, {
        interests,
        editorSlugs: categoriesOf(editor.id),
        editorTopics: editor.topics.map((t) => t.name),
        readIds,
        slugOf: (c) => categoryForDataLabel(c)?.slug ?? null,
        count: questionCount,
      }),
    [lens, interests, editor, readIds]
  );
  
  // 펼치고 접힐 때 위아래 요소가 순간이동하지 않고 부드럽게 밀리게 한다(움직임이 곧 "열렸다/닫혔다"는 신호).
  const animate = () => LayoutAnimation.configureNext(LayoutAnimation.create(220, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity));
  const select = (qa: QA) => {
    animate();
    setMore(false);
    if (openId === qa.id) return setOpenId(null);
    setOpenId(qa.id);
    void markStep('read');
    // 이전 질문이 접히며 높이가 바뀐 뒤의 위치를 쓰도록 한 프레임 뒤에 알린다.
    setTimeout(() => onOpened?.(listY.current + (itemY.current[qa.id] ?? 0)), 260);
  };
  const openArticle = (qa: QA, index?: number) =>
    router.push({ pathname: '/article/[slug]', params: index === undefined ? { slug: qa.id } : { slug: qa.id, format: String(index) } });

  const voiceUri = editor.voice ? `${getApiConfig().cmsApiUrl}${editor.voice}` : null;

  return (
    <View>
      {/* 바깥 카드·테두리 없이 페이지 바탕 위에 대화가 바로 놓인다. 위에는 에디터 이름 줄(바꾸기 · 연속 일수 · 설정), 아래는 말풍선 대화. */}
      <View style={styles.metaRow}>
        <Pressable onPress={onChangeEditor} style={styles.metaWho} hitSlop={8} accessibilityRole="button" accessibilityLabel={`${picked ? '내' : '오늘의'} 에디터 ${editor.name}, 바꾸기`}>
          <Text style={styles.metaName} numberOfLines={1}>{editor.name}</Text>
          <CaretDown size={13} color={colors.textMuted} weight="bold" />
        </Pressable>
        {streak > 0 ? (
          <View style={styles.streak}>
            <Fire size={13} color="#ea580c" weight="fill" />
            <Text style={styles.streakText}>{streak}일째</Text>
          </View>
        ) : null}
        <Pressable onPress={onOpenSettings} hitSlop={10} accessibilityRole="button" accessibilityLabel="오늘 설정 열기" style={styles.gear}>
          <GearSix size={21} color={colors.textMuted} />
        </Pressable>
      </View>

      <View style={styles.chatRow}>
        <Pressable onPress={onChangeEditor} accessibilityRole="button" accessibilityLabel="에디터 바꾸기">
          <Face editor={editor} size={46} />
        </Pressable>
        <View style={styles.bubbleCol}>
          <View style={styles.bubble}>
            <Text style={styles.bubbleText}>{openingLine(voice, moment)}</Text>
          </View>
          {voiceUri ? (
            <View style={styles.voiceRow}>
              <EditorVoice key={editor.id} src={voiceUri} name={editor.name} tint={{ bg: accent.soft, fg: accent.ink }} compact />
            </View>
          ) : null}
        </View>
      </View>

      {chips.length > 0 ? (
        <>
          <Text style={styles.label}>이런 게 궁금하실 것 같아요</Text>
          {/* 질문은 제자리에서 펼쳐지고 접힌다(아코디언). 다른 질문을 열면 이전 질문이 접히고, 목록 순서는 바뀌지 않는다. */}
          <View style={styles.chips} onLayout={(e) => (listY.current = e.nativeEvent.layout.y)}>
            {chips.map((c, idx) => {
              const on = c.id === openId;
              return (
                <View key={c.id} style={[styles.item, on && styles.itemOn, !on && idx > 0 && styles.itemRule]} onLayout={(e) => (itemY.current[c.id] = e.nativeEvent.layout.y)}>
                  <Pressable
                    onPress={() => select(c)}
                    style={({ pressed }) => [styles.chip, on && styles.chipOn, pressed && !on && { backgroundColor: accent.soft }]}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: on }}
                    accessibilityLabel={`${c.question} ${on ? '접기' : '펼치기'}`}
                  >
                    <Text style={[styles.chipText, on && { color: '#fff' }]} numberOfLines={on ? 4 : 2}>{c.question}</Text>
                    {on ? <CaretUp size={16} color="#fff" weight="bold" /> : <CaretDown size={16} color={accent.main} weight="bold" />}
                  </Pressable>
                  {on ? (
                    <View style={styles.answer}>
                      <Text style={styles.lead}>{answerLead(voice)}</Text>
                      {c.points.map((p, i) => (
                        <View key={i} style={styles.point}>
                          <Text style={styles.num}>{i + 1}</Text>
                          <Text style={styles.pointText}>{p}</Text>
                        </View>
                      ))}
                      {c.terms.length > 0 ? (
                        <View style={styles.terms}>
                          <Text style={styles.termsLabel}>용어 풀이</Text>
                          {c.terms.map((t) => (
                            <View key={t.term} style={styles.term}>
                              <Text style={styles.termName}>{t.term}</Text>
                              <Text style={styles.termExplain}>{t.explain}</Text>
                            </View>
                          ))}
                        </View>
                      ) : null}
                      {c.detail.length > 0 ? (
                        <>
                          <Pressable
                            onPress={() => {
                              animate();
                              setMore((m) => !m);
                            }}
                            style={styles.moreBtn}
                            accessibilityRole="button"
                            accessibilityState={{ expanded: more }}
                          >
                            <Text style={styles.moreText}>{more ? '자세한 내용 접기' : `더 자세히 보기 (${c.detail.length})`}</Text>
                            {more ? <CaretUp size={14} color={accent.ink} weight="bold" /> : <CaretDown size={14} color={accent.ink} weight="bold" />}
                          </Pressable>
                          {more ? c.detail.map((d, i) => <Text key={i} style={styles.detail}>· {d}</Text>) : null}
                        </>
                      ) : null}
                      <Pressable onPress={() => openArticle(c)} style={({ pressed }) => [styles.source, pressed && { opacity: 0.88 }]} accessibilityRole="link">
                        <Text style={styles.sourceText}>이 소식 전체 읽기</Text>
                        <ArrowRight size={16} color="#fff" weight="bold" />
                      </Pressable>
                      {c.followUps.length > 0 ? (
                        <View>
                          <Text style={styles.next}>{nextLead(voice)}</Text>
                          <View style={styles.followRow}>
                            {c.followUps.map((f) => (
                              <Pressable key={f.index} onPress={() => openArticle(c, f.index)} style={styles.follow} accessibilityRole="link">
                                <Text style={styles.followText}>{f.text}</Text>
                                <ArrowRight size={13} color={accent.ink} weight="bold" />
                              </Pressable>
                            ))}
                          </View>
                        </View>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  metaWho: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaName: { flexShrink: 1, fontSize: 15, fontWeight: '800', letterSpacing: -0.3, color: colors.text },
  chatRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  bubbleCol: { flex: 1, minWidth: 0 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  who: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12 },
  ring: { alignItems: 'center', justifyContent: 'center' },
  kicker: { fontSize: 12.5, fontWeight: '800', color: accent.ink },
  name: { marginTop: 3, fontSize: 17, fontWeight: '800', letterSpacing: -0.4, color: colors.text },
  streak: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 9, height: 26, borderRadius: 999, backgroundColor: '#fff3e8' },
  streakText: { fontSize: 12, fontWeight: '800', color: '#c2410c' },
  gear: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  kickerRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  changePill: { paddingHorizontal: 8, height: 22, borderRadius: 999, backgroundColor: accent.soft, alignItems: 'center', justifyContent: 'center' },
  changeText: { fontSize: 12, fontWeight: '800', color: accent.ink },

  bubble: { paddingHorizontal: 16, paddingVertical: 14, borderRadius: 20, borderTopLeftRadius: 6, backgroundColor: accent.soft },
  bubbleText: { fontSize: 15.5, lineHeight: 24, fontWeight: '600', color: colors.text },
  voiceRow: { marginTop: 8 },

  label: { marginTop: 22, marginBottom: 10, marginLeft: 2, fontSize: 13.5, fontWeight: '800', color: colors.textMuted },
  chips: { marginTop: 2 },
  item: { backgroundColor: '#fff', overflow: 'hidden' },
  itemOn: { borderRadius: 18, borderWidth: 1.5, borderColor: accent.main, marginVertical: 6 },
  itemRule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#e6eaf1' },
  chip: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 2, paddingVertical: 12 },
  chipOn: { backgroundColor: accent.main, paddingLeft: 16, paddingRight: 14 },
  chipText: { flex: 1, fontSize: 15, lineHeight: 22, fontWeight: '600', letterSpacing: -0.2, color: colors.text },

  answer: { padding: 14, backgroundColor: '#f6f9ff', gap: 10 },
  lead: { fontSize: 13.5, fontWeight: '800', color: accent.ink },
  point: { flexDirection: 'row', gap: 10 },
  num: { width: 16, fontSize: 14, fontWeight: '800', lineHeight: 22, color: accent.ink },
  pointText: { flex: 1, fontSize: 14.5, lineHeight: 22, color: colors.text },
  terms: { gap: 6 },
  termsLabel: { fontSize: 12.5, fontWeight: '800', color: colors.textSub },
  term: { padding: 10, borderRadius: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e8ecf3' },
  termName: { fontSize: 13, fontWeight: '800', color: accent.ink },
  termExplain: { marginTop: 2, fontSize: 13, lineHeight: 19, color: colors.textSub },
  moreBtn: { alignSelf: 'stretch', height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 12, backgroundColor: '#fff', borderWidth: 1.5, borderColor: accent.line },
  moreText: { fontSize: 14, fontWeight: '800', color: accent.ink },
  detail: { fontSize: 13.5, lineHeight: 21, color: colors.textSub },
  source: { height: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 14, backgroundColor: accent.main, marginTop: 2 },
  sourceText: { fontSize: 15, fontWeight: '800', color: '#fff' },
  next: { marginBottom: 8, fontSize: 13.5, fontWeight: '700', color: colors.textSub },
  followRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  follow: { flexDirection: 'row', gap: 6, paddingHorizontal: 14, height: 44, borderRadius: 999, borderWidth: 1.5, borderColor: accent.line, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  followText: { fontSize: 14, fontWeight: '700', color: accent.ink },
});
