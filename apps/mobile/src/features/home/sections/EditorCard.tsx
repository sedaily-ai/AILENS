import { useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { EDITORS, type LetterEditor } from '@ailens/domain';
import { getApiConfig } from '@ailens/api-client';
import { Text } from '../../../ui/Text';
import { CaretRight, Check, X } from '../../../ui/icons';
import { colors, surface } from '../../../theme';
import { chooseEditor } from '../myEditor';
import { EditorVoice } from './EditorVoice';

/**
 * 홈 맨 위 "내 에디터" 카드 — 웹 레터의 에디터 프로필을 그대로 쓴다(packages/domain 의 EDITORS).
 * 얼굴(웹 /editors 이미지) · 별명 · 역할 · 한 줄 소개 · 담당 주제 칩. 누르면 에디터를 바꾸는 시트가 열린다.
 * 에디터는 "누구의 관심 영역을 맡는가"로 나뉘고 기사 내용은 모두 같은 중립 원칙을 따른다 — 에디터는 고르는 방식을 바꿀 뿐 사실을 바꾸지 않는다.
 */
const imageUrl = (e: LetterEditor) => (e.image ? `${getApiConfig().cmsApiUrl}${e.image}` : null);

function Face({ editor, size }: { editor: LetterEditor; size: number }) {
  const uri = imageUrl(editor);
  return (
    <View style={[styles.face, { width: size, height: size, borderRadius: size / 2, backgroundColor: editor.tone.bg }]}>
      {uri ? (
        <Image source={{ uri }} style={{ width: size, height: size }} resizeMode="cover" />
      ) : (
        <Text style={{ fontSize: size * 0.4, fontWeight: '800', color: editor.tone.fg }}>{editor.name.charAt(0)}</Text>
      )}
    </View>
  );
}

export function EditorCard({ editor, picked }: { editor: LetterEditor; picked: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <View style={styles.card}>
        <Pressable style={styles.top} onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel={`내 에디터 ${editor.name}, 바꾸기`}>
          <View style={[styles.ring, { backgroundColor: editor.tone.bg }]}>
            <Face editor={editor} size={72} />
          </View>
          <View style={styles.body}>
            <Text style={[styles.kicker, { color: editor.tone.fg }]}>{picked ? '내 에디터' : '오늘의 에디터'}</Text>
            <Text style={styles.name} numberOfLines={1}>{editor.name}</Text>
            <View style={styles.chips}>
              <View style={[styles.chip, { backgroundColor: editor.tone.bg }]}>
                <Text style={[styles.chipText, { color: editor.tone.fg }]}>{editor.nickname}</Text>
              </View>
              {editor.mbti ? (
                <View style={styles.chipGray}>
                  <Text style={styles.chipGrayText}>{editor.mbti}</Text>
                </View>
              ) : null}
            </View>
          </View>
          <View style={styles.change}>
            <Text style={styles.changeText}>바꾸기</Text>
            <CaretRight size={13} color={colors.textMuted} weight="bold" />
          </View>
        </Pressable>
        <Text style={styles.summary}>{editor.summary}</Text>
        {editor.voice ? <EditorVoice key={editor.id} src={`${getApiConfig().cmsApiUrl}${editor.voice}`} name={editor.name} tint={editor.tone} /> : null}
      </View>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)} statusBarTranslucent>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} accessibilityLabel="닫기" />
        <View style={styles.sheet}>
          <View style={styles.sheetHead}>
            <Text style={styles.sheetTitle}>누구와 오늘을 시작할까요?</Text>
            <Pressable onPress={() => setOpen(false)} hitSlop={10} accessibilityRole="button" accessibilityLabel="닫기">
              <X size={22} color={colors.textMuted} />
            </Pressable>
          </View>
          <ScrollView showsVerticalScrollIndicator={false}>
            {EDITORS.map((e) => {
              const on = e.id === editor.id;
              return (
                <Pressable
                  key={e.id}
                  style={({ pressed }) => [styles.row, on && styles.rowOn, pressed && { opacity: 0.9 }]}
                  onPress={() => {
                    void chooseEditor(e.id);
                    setOpen(false);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                >
                  <Face editor={e} size={52} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.rowName} numberOfLines={1}>{e.name}</Text>
                    <Text style={styles.rowNick} numberOfLines={1}>{e.nickname}{e.mbti ? ` · ${e.mbti}` : ''}</Text>
                    <Text style={styles.rowFor} numberOfLines={2}>{e.forWhom}</Text>
                  </View>
                  {on ? <Check size={20} color={colors.brand} weight="bold" /> : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  face: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  card: { ...surface.card, padding: 16 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  ring: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, minWidth: 0 },
  kicker: { fontSize: 12, fontWeight: '800' },
  name: { marginTop: 2, fontSize: 19, fontWeight: '800', letterSpacing: -0.5, color: colors.text },
  chips: { marginTop: 7, flexDirection: 'row', gap: 6 },
  chip: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999 },
  chipText: { fontSize: 12, fontWeight: '800' },
  chipGray: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, backgroundColor: '#f1f3f6' },
  chipGrayText: { fontSize: 12, fontWeight: '700', color: colors.textMuted },
  change: { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start' },
  changeText: { fontSize: 13, fontWeight: '700', color: colors.textMuted },
  summary: { marginTop: 14, fontSize: 14.5, lineHeight: 22, color: colors.textSub },

  backdrop: { flex: 1, backgroundColor: 'rgba(17,24,39,0.45)' },
  sheet: { maxHeight: '82%', backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 24 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  sheetTitle: { fontSize: 20, fontWeight: '800', letterSpacing: -0.5, color: colors.text },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, paddingHorizontal: 10, borderRadius: 18 },
  rowOn: { backgroundColor: '#f4f6fb' },
  rowName: { fontSize: 16, fontWeight: '800', color: colors.text },
  rowNick: { marginTop: 1, fontSize: 12.5, fontWeight: '600', color: '#2563eb' },
  rowFor: { marginTop: 3, fontSize: 13, lineHeight: 19, color: colors.textMuted },
});
