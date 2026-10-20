import { markStep } from '../home/dailyProgress';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../../ui/Text';
import { useRouter } from 'expo-router';
import { inlineSegments } from '@ailens/domain';
import { useAuth } from '../../auth/AuthContext';
import { saveSentence } from '../mylens/archiveApi';
import { accent, colors } from '../../theme';

/** 마크다운 표기(**굵게** 등)를 걷어 낸 평문. */
export const plainText = (raw: string) => inlineSegments(raw).map((s) => s.text).join('').trim();

const splitSentences = (text: string) =>
  text.split(/(?<=[.!?다요죠])\s+(?=[가-힣A-Z0-9"'“‘(])/u).map((t) => t.trim()).filter((t) => t.length >= 8);

/**
 * 문장 저장 시트 — 본문 문단을 길게 누르면 열리고, 문장 하나를 골라 "내 서랍"에 담는다(웹 SentenceSelectionPopover 의 모바일 대응:
 * 모바일 글자 선택 메뉴를 가로채지 않고 문장 단위로 고르게 한다). 로그인이 필요하다.
 */
export function SentenceSheet({
  text,
  article,
  onClose,
}: {
  text: string | null;
  article: { id: string; title: string; publishedAt?: string | null };
  onClose: () => void;
}) {
  const router = useRouter();
  const { state } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (text !== null) {
      setError(null);
      setBusy(null);
    }
  }, [text]);

  const sentences = text ? splitSentences(plainText(text)) : [];
  const signedIn = state.status === 'signedIn';

  const save = async (s: string) => {
    if (state.status !== 'signedIn' || busy) return;
    setBusy(s);
    setError(null);
    try {
      await saveSentence({ user_id: state.userId, text: s, article_id: article.id, article_title: article.title, article_published_at: article.publishedAt ?? undefined });
      setDone((d) => new Set(d).add(s));
      void markStep('save');
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장하지 못했어요.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal visible={text !== null} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="닫기" />
      <View style={styles.sheet}>
        <Text style={styles.title}>마음에 드는 문장을 내 서랍에 담아요</Text>
        {!signedIn ? (
          <View style={{ marginTop: 14 }}>
            <Text style={styles.msg}>로그인하면 문장을 저장하고 나의 LENS에서 모아 볼 수 있어요.</Text>
            <Pressable style={styles.cta} onPress={() => { onClose(); router.push('/login'); }} accessibilityRole="button">
              <Text style={styles.ctaText}>로그인 · 회원가입</Text>
            </Pressable>
          </View>
        ) : (
          <ScrollView style={{ maxHeight: 360 }} contentContainerStyle={{ paddingTop: 8 }}>
            {sentences.length === 0 ? <Text style={styles.msg}>저장할 수 있는 문장이 없어요.</Text> : null}
            {sentences.map((s) => (
              <View key={s} style={styles.row}>
                <Text style={styles.sentence}>{s}</Text>
                <Pressable style={[styles.btn, done.has(s) && styles.btnDone]} onPress={() => void save(s)} disabled={done.has(s) || !!busy} accessibilityRole="button">
                  {busy === s ? <ActivityIndicator size="small" color="#fff" /> : <Text style={[styles.btnText, done.has(s) && { color: colors.textMuted }]}>{done.has(s) ? '담음' : '담기'}</Text>}
                </Pressable>
              </View>
            ))}
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </ScrollView>
        )}
        <Pressable onPress={onClose} style={styles.close} accessibilityRole="button">
          <Text style={styles.closeText}>닫기</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(17,24,39,0.45)' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 28 },
  title: { fontSize: 16, fontWeight: '800', color: colors.text },
  msg: { fontSize: 14, lineHeight: 21, color: colors.textMuted },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  sentence: { flex: 1, fontSize: 15, lineHeight: 23, color: colors.text },
  btn: { minWidth: 56, height: 36, borderRadius: 18, backgroundColor: accent.main, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  btnDone: { backgroundColor: '#f3f4f6' },
  btnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  error: { marginTop: 10, fontSize: 13, color: '#dc2626' },
  cta: { marginTop: 14, height: 48, borderRadius: 10, backgroundColor: accent.main, alignItems: 'center', justifyContent: 'center' },
  ctaText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  close: { marginTop: 14, alignItems: 'center', paddingVertical: 8 },
  closeText: { fontSize: 14, color: colors.textMuted },
});
