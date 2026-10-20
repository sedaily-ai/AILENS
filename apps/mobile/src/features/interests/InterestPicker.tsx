import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../../ui/Text';
import { Check, X } from '../../ui/icons';
import { accent, colors } from '../../theme';
import { categoryItems, subGroups, topicGroups, type Group } from './dictionary';
import { keyOf, type Interest } from './match';
import { MAX_INTERESTS, toggleInterest, useInterestItems } from './store';

/**
 * 내 관심 담기 시트 — 분야 / 섹터 / 화두 세 칸. 칩을 누르면 바로 담기고(파랑 체크), 다시 누르면 빠진다. 저장은 즉시 기기에 된다.
 * 분야는 큰 틀, 섹터는 분야의 세부 분류(국내증시·은행·바이오 …), 화두는 금리·반도체처럼 요즘 이야기되는 주제어다.
 */
type Tab = 'category' | 'sub' | 'topic';
const TABS: Array<[Tab, string, string]> = [
  ['category', '분야', '큰 틀로 골라요'],
  ['sub', '섹터', '세부 분야로 골라요'],
  ['topic', '화두', '요즘 이야기되는 주제로 골라요'],
];

export function InterestPicker({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { items } = useInterestItems();
  const [tab, setTab] = useState<Tab>('category');
  const [topics, setTopics] = useState<Group[]>([]);
  const [full, setFull] = useState(false);
  useEffect(() => {
    if (open) void topicGroups().then(setTopics);
  }, [open]);
  const picked = new Set(items.map(keyOf));

  const toggle = async (it: Interest) => {
    const ok = await toggleInterest(it);
    setFull(!ok);
  };

  const groups: Group[] = tab === 'category' ? [{ slug: 'all', label: '', items: categoryItems() }] : tab === 'sub' ? subGroups() : topics;

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="닫기" />
      <View style={styles.sheet}>
        <View style={styles.head}>
          <View>
            <Text style={styles.title}>내 관심 담기</Text>
            <Text style={[styles.count, full && { color: '#dc2626' }]}>{full ? `최대 ${MAX_INTERESTS}개까지 담을 수 있어요` : `${items.length}개 담았어요`}</Text>
          </View>
          <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="닫기">
            <X size={22} color={colors.textMuted} />
          </Pressable>
        </View>

        <View style={styles.tabs}>
          {TABS.map(([k, label]) => (
            <Pressable key={k} style={[styles.tab, tab === k && styles.tabOn]} onPress={() => setTab(k)} accessibilityRole="tab" accessibilityState={{ selected: tab === k }}>
              <Text style={[styles.tabText, tab === k && styles.tabTextOn]}>{label}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.hint}>{TABS.find((t) => t[0] === tab)?.[2]}</Text>

        {/* key 로 탭을 바꿀 때마다 맨 위에서 시작한다. */}
        <ScrollView key={tab} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 12 }}>
          {groups.map((g) => (
            <View key={g.slug} style={{ marginTop: g.label ? 16 : 4 }}>
              {g.label ? <Text style={styles.group}>{g.label}</Text> : null}
              <View style={styles.chips}>
                {g.items.map((it) => {
                  const on = picked.has(keyOf(it));
                  return (
                    <Pressable key={keyOf(it)} onPress={() => void toggle(it)} style={[styles.chip, on && styles.chipOn]} accessibilityRole="button" accessibilityState={{ selected: on }}>
                      {on ? <Check size={14} color="#fff" weight="bold" /> : null}
                      <Text style={[styles.chipText, on && { color: '#fff' }]}>{it.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ))}
          {tab === 'topic' && topics.length === 0 ? <Text style={styles.hint}>화두를 불러오는 중이에요…</Text> : null}
        </ScrollView>

        <Pressable style={({ pressed }) => [styles.done, pressed && { opacity: 0.88 }]} onPress={onClose} accessibilityRole="button">
          <Text style={styles.doneText}>{items.length > 0 ? `${items.length}개 담고 닫기` : '닫기'}</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(17,24,39,0.45)' },
  sheet: { maxHeight: '88%', backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 24 },
  head: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  title: { fontSize: 20, fontWeight: '800', letterSpacing: -0.5, color: colors.text },
  count: { marginTop: 3, fontSize: 13.5, fontWeight: '700', color: accent.ink },
  tabs: { marginTop: 14, flexDirection: 'row', gap: 2, padding: 4, borderRadius: 999, backgroundColor: 'rgba(17,24,39,0.055)' },
  tab: { flex: 1, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 999 },
  tabOn: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e6e9f0' },
  tabText: { fontSize: 14, fontWeight: '600', color: '#6b7280' },
  tabTextOn: { fontWeight: '800', color: colors.text },
  hint: { marginTop: 10, fontSize: 13, color: colors.textMuted },
  group: { marginBottom: 8, fontSize: 13.5, fontWeight: '800', color: colors.textSub },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 40, paddingHorizontal: 14, borderRadius: 999, backgroundColor: '#f1f3f6', borderWidth: 1.5, borderColor: 'transparent' },
  chipOn: { backgroundColor: accent.main },
  chipText: { fontSize: 14, fontWeight: '700', color: '#4b5563' },
  done: { marginTop: 12, height: 52, borderRadius: 16, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  doneText: { fontSize: 16, fontWeight: '800', color: '#fff' },
});
