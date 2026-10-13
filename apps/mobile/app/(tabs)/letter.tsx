import { View, Text, StyleSheet } from 'react-native';

// 레터. 웹 /letter 대응. M1 뼈대.
export default function LetterScreen() {
  return (
    <View style={styles.root}>
      <Text style={styles.title}>레터</Text>
      <Text style={styles.note}>웹 /letter 에 대응. 구독·발행 연동 예정.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0b0b0c', alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { color: '#f5f5f5', fontSize: 20, fontWeight: '700' },
  note: { color: '#9aa0a6', fontSize: 13, marginTop: 8 },
});
