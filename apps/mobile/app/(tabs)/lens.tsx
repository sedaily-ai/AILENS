import { View, Text, StyleSheet } from 'react-native';

// LENS 피드. M1 은 뼈대. 콘텐츠는 createApiClient(config) 주입 후 연동(M1 후반).
export default function LensScreen() {
  return (
    <View style={styles.root}>
      <Text style={styles.title}>LENS 피드</Text>
      <Text style={styles.note}>col/web 의 /lens 에 대응. API 연동 예정.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0b0b0c', alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { color: '#f5f5f5', fontSize: 20, fontWeight: '700' },
  note: { color: '#9aa0a6', fontSize: 13, marginTop: 8 },
});
