import { Image, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { EDITORS, type LetterEditor } from '@ailens/domain';
import { getApiConfig } from '@ailens/api-client';
import { Text } from '../../../ui/Text';
import { Check, X } from '../../../ui/icons';
import { colors } from '../../../theme';
import { chooseEditor } from '../myEditor';

/** 에디터 선택 시트(제어형). 홈 에디터 대화 카드의 "바꾸기"가 연다. 고르면 기기에 저장되고 홈의 질문·말투가 바뀐다. */
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

export function EditorPicker({ open, onClose, editor }: { open: boolean; onClose: () => void; editor: LetterEditor }) {
  return (
    <>
      <Modal visible={open} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="닫기" />
        <View style={styles.sheet}>
          <View style={styles.sheetHead}>
            <Text style={styles.sheetTitle}>누구와 오늘을 시작할까요?</Text>
            <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="닫기">
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
                    onClose();
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
