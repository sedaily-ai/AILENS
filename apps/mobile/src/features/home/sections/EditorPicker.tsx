import { useMemo, useState } from 'react';
import { Image, LayoutAnimation, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { EDITORS, type LetterEditor } from '@ailens/domain';
import { getApiConfig } from '@ailens/api-client';
import { Text } from '../../../ui/Text';
import { CaretDown, Check, X } from '../../../ui/icons';
import { accent, colors } from '../../../theme';
import { categoriesOf, chooseEditor } from '../myEditor';

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

/** 처음에는 대표 4명(웹에서 MBTI 가 정해진 에디터)만 보이고 나머지는 "더 많은 에디터"로 펼친다 — 한 화면 선택지를 4개로 줄여 고르는 부담을 낮춘다. */
const FEATURED = ['mincheol', 'haeun', 'junseo', 'soyul'];

export function EditorPicker({ open, onClose, editor, interests = [] }: { open: boolean; onClose: () => void; editor: LetterEditor; interests?: string[] }) {
  const [more, setMore] = useState(false);
  // 내 관심 분야·화두와 담당이 겹치는 에디터에 "내 관심과 잘 맞아요"를 붙이고 맨 위로 올린다(대표/나머지 구분 안에서).
  const fit = useMemo(() => {
    const m = new Map<string, boolean>();
    for (const e of EDITORS) m.set(e.id, categoriesOf(e.id).some((c) => interests.includes(c)));
    return m;
  }, [interests]);
  const sort = (list: LetterEditor[]) => [...list].sort((a, b) => Number(fit.get(b.id)) - Number(fit.get(a.id)));
  const featured = sort(EDITORS.filter((e) => FEATURED.includes(e.id)));
  const rest = sort(EDITORS.filter((e) => !FEATURED.includes(e.id)));
  // 지금 내 에디터가 나머지 쪽이면 처음부터 펼쳐 두어 선택 표시가 보이게 한다.
  const showRest = more || rest.some((e) => e.id === editor.id);

  const row = (e: LetterEditor) => {
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
        <Face editor={e} size={56} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={styles.nameRow}>
            <Text style={styles.rowName} numberOfLines={1}>{e.name}</Text>
            {fit.get(e.id) ? <View style={styles.fit}><Text style={styles.fitText}>내 관심과 잘 맞아요</Text></View> : null}
          </View>
          <Text style={styles.rowNick} numberOfLines={1}>{e.nickname}{e.mbti ? ` · ${e.mbti}` : ''}</Text>
          <Text style={styles.rowFor} numberOfLines={2}>{e.forWhom}</Text>
        </View>
        <View style={[styles.radio, on && styles.radioOn]}>{on ? <Check size={13} color="#fff" weight="bold" /> : null}</View>
      </Pressable>
    );
  };

  return (
    <>
      <Modal visible={open} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="닫기" />
        <View style={styles.sheet}>
          <View style={styles.grab} />
          <View style={styles.sheetHead}>
            <View style={{ flex: 1 }}>
              <Text style={styles.sheetTitle}>누구와 오늘을 시작할까요?</Text>
              <Text style={styles.sheetSub}>언제든 바꿀 수 있어요</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="닫기">
              <X size={22} color={colors.textMuted} />
            </Pressable>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 8 }}>
            {featured.map(row)}
            {showRest ? (
              <>
                <Text style={styles.more}>더 많은 에디터</Text>
                {rest.map(row)}
              </>
            ) : (
              <Pressable
                onPress={() => {
                  LayoutAnimation.configureNext(LayoutAnimation.create(200, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity));
                  setMore(true);
                }}
                style={styles.moreBtn}
                accessibilityRole="button"
              >
                <Text style={styles.moreBtnText}>더 많은 에디터 보기 ({rest.length})</Text>
                <CaretDown size={14} color={accent.ink} weight="bold" />
              </Pressable>
            )}
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  face: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  backdrop: { flex: 1, backgroundColor: 'rgba(17,24,39,0.45)' },
  sheet: { maxHeight: '88%', backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 24 },
  grab: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#dfe3ea', marginBottom: 14 },
  sheetHead: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 },
  sheetTitle: { fontSize: 22, fontWeight: '800', letterSpacing: -0.6, color: colors.text },
  sheetSub: { marginTop: 4, fontSize: 14, color: colors.textMuted },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, paddingHorizontal: 12, borderRadius: 20 },
  rowOn: { backgroundColor: accent.soft },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  rowName: { fontSize: 16.5, fontWeight: '800', letterSpacing: -0.3, color: colors.text },
  fit: { paddingHorizontal: 8, height: 22, borderRadius: 11, backgroundColor: accent.soft, alignItems: 'center', justifyContent: 'center' },
  fitText: { fontSize: 11.5, fontWeight: '800', color: accent.ink },
  rowNick: { marginTop: 2, fontSize: 12.5, fontWeight: '700', color: accent.ink },
  rowFor: { marginTop: 3, fontSize: 13.5, lineHeight: 20, color: colors.textMuted },
  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: '#d3d9e3', alignItems: 'center', justifyContent: 'center' },
  radioOn: { backgroundColor: accent.main, borderColor: accent.main },
  more: { marginTop: 16, marginBottom: 4, marginLeft: 12, fontSize: 13.5, fontWeight: '800', color: colors.textSub },
  moreBtn: { marginTop: 8, height: 48, borderRadius: 14, backgroundColor: '#f4f6f9', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  moreBtnText: { fontSize: 14.5, fontWeight: '800', color: accent.ink },
});
