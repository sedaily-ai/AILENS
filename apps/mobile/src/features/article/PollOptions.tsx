import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '../../ui/Text';

/**
 * 투표 보기 목록(1기사 레터·이슈 레터 공용) — 웹 shared/ui/form/PollOptions 의 동작을 그대로 옮겼다.
 * 눌렀을 때 끊기지 않도록: 줄 높이를 고정해 레이아웃이 밀리지 않고, 고른 보기는 즉시 반응하며(체크 표시가 튀어 오름),
 * 집계가 오면 막대가 왼쪽에서 오른쪽으로 0.8초에 걸쳐 부드럽게 차오르고 숫자가 함께 올라간다(보기마다 70ms 어긋나게 시작).
 */
export interface PollOption {
  key: string;
  label: string;
  hint?: string | null;
  /** 색 구분: b 파랑(기본), w 앰버(우려류), n 회색(잘 모르겠어요) */
  tone?: 'b' | 'w' | 'n';
}

const TONES = {
  b: { c: '#2f5fcf', ct: '#e3ebfb' },
  w: { c: '#b7791f', ct: '#fbebcd' },
  n: { c: '#6b7280', ct: '#e5e7eb' },
} as const;
const EASE = Easing.bezier(0.22, 1, 0.36, 1);

export function PollOptions({
  options,
  myChoice,
  counts,
  pending,
  onPick,
  note,
  noteError,
}: {
  options: PollOption[];
  myChoice: string | null;
  counts: Record<string, number> | null;
  /** 서버 응답을 기다리는 중인 보기(고른 직후) */
  pending: string | null;
  onPick: (key: string) => void;
  note: string;
  noteError?: boolean;
}) {
  const total = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : 0;
  const done = counts !== null && total > 0;
  return (
    <View>
      <View style={{ gap: 8 }}>
        {options.map((o, i) => (
          <Row
            key={o.key}
            opt={o}
            index={i}
            pct={done ? Math.round(((counts?.[o.key] ?? 0) / total) * 100) : 0}
            done={done}
            mine={myChoice === o.key}
            pending={pending === o.key}
            waiting={pending !== null}
            disabled={myChoice === o.key || pending !== null}
            onPick={() => onPick(o.key)}
          />
        ))}
      </View>
      <Text style={[styles.note, noteError && { color: '#dc2626' }]}>{note}</Text>
    </View>
  );
}

function Row({ opt, index, pct, done, mine, pending, waiting, disabled, onPick }: { opt: PollOption; index: number; pct: number; done: boolean; mine: boolean; pending: boolean; waiting: boolean; disabled: boolean; onPick: () => void }) {
  const tone = TONES[opt.tone ?? 'b'];
  const fill = useRef(new Animated.Value(0)).current;
  const press = useRef(new Animated.Value(1)).current;
  const mark = useRef(new Animated.Value(0)).current;
  const [shown, setShown] = useState(0);

  // 집계가 오면 막대(와 숫자)가 차오른다. 집계가 사라지면(투표 전) 0 으로.
  useEffect(() => {
    const id = fill.addListener(({ value }) => setShown(Math.round(value * 100)));
    return () => fill.removeListener(id);
  }, [fill]);
  useEffect(() => {
    Animated.timing(fill, { toValue: done ? pct / 100 : 0, duration: done ? 800 : 0, delay: done ? index * 70 : 0, easing: EASE, useNativeDriver: false }).start();
  }, [done, pct, index, fill]);
  // 체크 표시: 고르는 즉시(또는 응답 대기 중) 튀어 오르며 나타난다.
  useEffect(() => {
    Animated.spring(mark, { toValue: mine || pending ? 1 : 0, friction: 5, tension: 160, useNativeDriver: true }).start();
  }, [mine, pending, mark]);

  const width = fill.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <Animated.View style={{ transform: [{ scale: press }], opacity: waiting && !pending ? 0.62 : 1 }}>
      <Pressable
        onPress={onPick}
        disabled={disabled}
        onPressIn={() => Animated.timing(press, { toValue: 0.985, duration: 90, useNativeDriver: true }).start()}
        onPressOut={() => Animated.timing(press, { toValue: 1, duration: 140, useNativeDriver: true }).start()}
        style={[styles.row, mine && { borderColor: '#e5e7eb' }]}
        accessibilityRole="button"
        accessibilityState={{ selected: mine, disabled }}
      >
        <Animated.View style={[styles.fill, { width, backgroundColor: mine ? tone.ct : '#eef0f3' }]} />
        <View style={[styles.mark, (mine || pending) && { backgroundColor: tone.c, borderColor: tone.c }]}>
          <Animated.View style={{ opacity: mark, transform: [{ scale: mark.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }] }}>
            <Ionicons name="checkmark" size={13} color="#fff" />
          </Animated.View>
        </View>
        <View style={styles.body}>
          <Text style={[styles.label, mine && { fontWeight: '700' }, done && !mine && { color: '#4b5563', fontWeight: '500' }]}>{opt.label}</Text>
          {opt.hint ? <Text style={styles.hint}>{opt.hint}</Text> : null}
        </View>
        <Text style={[styles.pct, { opacity: done ? 1 : 0 }, mine && { color: tone.c }]}>{shown}%</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 14, backgroundColor: '#fff', overflow: 'hidden' },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0 },
  mark: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: '#cdd2da', alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, paddingVertical: 14, gap: 2 },
  label: { fontSize: 15, fontWeight: '600', lineHeight: 22, color: '#111827' },
  hint: { fontSize: 12.5, color: '#6b7280' },
  pct: { minWidth: 44, textAlign: 'right', fontSize: 15, fontWeight: '700', color: '#9ca3af' },
  note: { marginTop: 10, minHeight: 18, fontSize: 12.5, color: '#9ca3af' },
});
