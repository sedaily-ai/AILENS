import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../ui/Text';
import type { AsyncState } from '../lib/useAsync';

/** 로딩·오류(재시도)·성공을 한 곳에서 처리한다. */
export function AsyncView<T>({
  state,
  onRetry,
  children,
}: {
  state: AsyncState<T>;
  onRetry: () => void;
  children: (data: T) => ReactNode;
}) {
  if (state.status === 'loading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#2563eb" />
      </View>
    );
  }
  if (state.status === 'error') {
    return (
      <View style={styles.center}>
        <Text style={styles.msg}>불러오지 못했어요. {state.message}</Text>
        <Pressable style={styles.btn} onPress={onRetry} accessibilityRole="button">
          <Text style={styles.btnText}>다시 시도</Text>
        </Pressable>
      </View>
    );
  }
  return <>{children(state.data)}</>;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  msg: { color: '#6b7280', fontSize: 14, textAlign: 'center' },
  btn: { marginTop: 16, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 8, backgroundColor: '#f3f4f6' },
  btnText: { color: '#111827', fontSize: 14, fontWeight: '600' },
});
