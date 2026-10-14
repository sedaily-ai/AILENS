import { useRef, useState } from 'react';
import { Animated, Image, StyleSheet, View } from 'react-native';
import type { WebtoonPanel } from '@ailens/api-client';
import { Text } from '../ui/Text';
import { READING_ACCENT } from '../theme';

// 웹 WebtoonCutGallery 와 같은 규격: 둥근 흰 카드(radius 18, 퍼지는 그림자) 안에 컷을 세로로 잇고, 컷 사이 간격 56, 컷마다 자기 비율로 높이를 정한다.
// text_caption 컷은 이미지 아래 흰 여백에 나레이션을 가운데 정렬 18px/700 으로 보여 주고, 금액·퍼센트 같은 숫자는 #5b8def 로 강조한다.
const NUM_RE = /(\d[\d,.]*\s?(?:조|억|만)?\s?(?:원|%|퍼센트|개사|개|곳|명|년|월|일|배|bp|포인트)?)/g;

function Highlighted({ text }: { text: string }) {
  return (
    <Text style={styles.caption}>
      {text.split(NUM_RE).map((t, i) =>
        i % 2 === 1 ? (
          <Text key={i} style={{ color: READING_ACCENT, fontWeight: '800' }}>
            {t}
          </Text>
        ) : (
          t
        ),
      )}
    </Text>
  );
}

export function WebtoonCuts({ panels }: { panels: WebtoonPanel[] }) {
  return (
    <View style={styles.card}>
      {panels.map((p, i) => (
        <Cut key={`${p.url}-${i}`} url={p.url} caption={p.text_caption ? p.caption : ''} alt={p.caption} />
      ))}
    </View>
  );
}

function Cut({ url, caption, alt }: { url: string; caption: string; alt: string }) {
  const [ratio, setRatio] = useState(1824 / 1752); // 웹의 로딩 전 자리 비율
  const fade = useRef(new Animated.Value(0)).current;
  return (
    <View>
      {/* 로드되면 살짝 떠오르며 나타난다(웹 figure 의 opacity·translateY 전환). */}
      <Animated.View style={{ opacity: fade, transform: [{ translateY: fade.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }] }}>
        <Image
          source={{ uri: url }}
          style={{ width: '100%', aspectRatio: ratio, backgroundColor: '#fff' }}
          resizeMode="cover"
          onLoad={(e) => {
            const { width, height } = e.nativeEvent.source;
            if (width && height) setRatio(width / height);
            Animated.timing(fade, { toValue: 1, duration: 500, useNativeDriver: true }).start();
          }}
          accessibilityLabel={alt || undefined}
        />
        {caption ? <Highlighted text={caption} /> : null}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 56,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#fff',
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 6,
  },
  caption: { paddingTop: 22, paddingHorizontal: 20, textAlign: 'center', color: '#111827', fontSize: 18, fontWeight: '700', lineHeight: 29, letterSpacing: -0.18 },
});
