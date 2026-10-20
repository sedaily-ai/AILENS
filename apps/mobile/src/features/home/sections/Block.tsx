import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '../../../ui/Text';
import { colors, surface } from '../../../theme';

/**
 * 홈의 면 단위. 연한 회색 바탕 위에 흰 카드로 올려 섹션을 구분한다(토스·뱅크샐러드 같은 핀테크 앱의 방식).
 * 제목은 카드 안 맨 위에 두고, 카드 안 여백은 모두 20으로 맞춘다. title 이 없으면 본문만 카드로 감싼다.
 */
export function Block({ title, right, children, flush }: { title?: string; right?: ReactNode; children: ReactNode; flush?: boolean }) {
  return (
    <View style={[styles.card, flush && styles.flush]}>
      {title ? (
        <View style={styles.head}>
          <Text style={styles.title}>{title}</Text>
          {right}
        </View>
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { ...surface.card, borderWidth: 0, borderRadius: 24, padding: 20 },
  flush: { padding: 0, overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  title: { fontSize: 18, fontWeight: '800', letterSpacing: -0.4, color: colors.text },
});
