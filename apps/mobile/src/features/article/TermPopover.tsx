import { useRef, useState } from 'react';
import { Animated, Modal, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Text } from '../../ui/Text';

export interface TermAnchor {
  term: string;
  explain: string;
  /** 용어를 누른 화면 좌표(pageX/pageY). */
  x: number;
  y: number;
}

/**
 * 용어 해설 말풍선 — 웹 TermTooltip 카드(흰 면·radius 14·퍼지는 그림자, "용어" 라벨 + 용어명 + 설명)를 눌린 자리 위에 띄운다.
 * 위쪽 공간이 모자라면(상단 150 미만) 아래로 뒤집고, 좌우는 화면 안(여백 16)으로 밀어 넣는다. 나타날 때 4px 떠오르며 페이드 인.
 */
export function TermPopover({ anchor, onClose }: { anchor: TermAnchor | null; onClose: () => void }) {
  const { width } = useWindowDimensions();
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const fade = useRef(new Animated.Value(0)).current;

  const MARGIN = 16;
  const cardW = Math.min(300, width - 32);
  let left = 0;
  let top = 0;
  let below = false;
  if (anchor && size) {
    left = Math.min(Math.max(anchor.x - size.w / 2, MARGIN), width - MARGIN - size.w);
    below = anchor.y - size.h - 24 < 150;
    top = below ? anchor.y + 22 : anchor.y - size.h - 14;
  }

  return (
    <Modal
      visible={!!anchor}
      transparent
      animationType="none"
      onRequestClose={onClose}
      onShow={() => Animated.timing(fade, { toValue: 1, duration: 160, useNativeDriver: true }).start()}
    >
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={() => {
          fade.setValue(0);
          setSize(null);
          onClose();
        }}
        accessibilityLabel="닫기"
      >
        {anchor ? (
          <Animated.View
            onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
            style={[
              styles.card,
              { width: cardW, left, top, opacity: size ? fade : 0, transform: [{ translateY: fade.interpolate({ inputRange: [0, 1], outputRange: [below ? -4 : 4, 0] }) }] },
            ]}
          >
            <Text style={styles.kicker}>용어</Text>
            <Text style={styles.name}>{anchor.term}</Text>
            <Text style={styles.explain}>{anchor.explain}</Text>
          </Animated.View>
        ) : null}
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    paddingTop: 12,
    paddingHorizontal: 14,
    paddingBottom: 13,
    backgroundColor: '#fff',
    borderRadius: 14,
    // box-shadow: 0 12px 32px rgba(15,23,42,.16), 0 1px 3px rgba(15,23,42,.08)
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.16,
    shadowRadius: 16,
    elevation: 12,
  },
  kicker: { fontSize: 11, fontWeight: '800', letterSpacing: 0.66, color: '#a16207', marginBottom: 4 },
  name: { fontSize: 14.5, fontWeight: '800', lineHeight: 20, color: '#111827' },
  explain: { marginTop: 4, fontSize: 13.5, lineHeight: 21.5, color: '#4b5563' },
});
