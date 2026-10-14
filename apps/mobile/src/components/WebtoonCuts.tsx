import { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import type { WebtoonPanel } from '@ailens/api-client';
import { colors } from '../theme';

/**
 * 웹툰 컷을 세로로 이어 보여 준다. 컷 높이는 이미지가 로드되면 원본 비율로 맞춘다.
 * caption 은 컷 이미지에 이미 박혀 있는 경우가 대부분이라, text_caption 컷만 아래에 글자로 보여 준다(웹과 같은 규칙).
 */
export function WebtoonCuts({ panels }: { panels: WebtoonPanel[] }) {
  return (
    <View>
      {panels.map((p, i) => (
        <Cut key={`${p.url}-${i}`} url={p.url} caption={p.text_caption ? p.caption : ''} />
      ))}
    </View>
  );
}

function Cut({ url, caption }: { url: string; caption: string }) {
  const [ratio, setRatio] = useState(1);
  return (
    <View>
      <Image
        source={{ uri: url }}
        style={{ width: '100%', aspectRatio: ratio, backgroundColor: colors.imagePlaceholder }}
        resizeMode="cover"
        onLoad={(e) => {
          const { width, height } = e.nativeEvent.source;
          if (width && height) setRatio(width / height);
        }}
        accessibilityLabel={caption || undefined}
      />
      {caption ? <Text style={styles.caption}>{caption}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  caption: { paddingHorizontal: 20, paddingVertical: 16, fontSize: 16, lineHeight: 26, color: '#1f2937', backgroundColor: '#fff' },
});
