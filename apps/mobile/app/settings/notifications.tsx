import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { colors } from '../../src/theme';

type Perm = 'checking' | 'granted' | 'denied' | 'undetermined';

// 알림 설정 — 기기 알림 권한 상태 확인·요청, 시스템 설정 열기, 기기 쪽 알림 경로 점검(테스트 알림).
// 실제 뉴스 알림 발송은 서버(services/push: 토큰 등록·발송 팬아웃)가 필요하다. 서버 연동 전이라 푸시 토큰은 이 화면에서 만들어 보기만 하고 어디에도 보내지 않는다.
export default function NotificationSettings() {
  const [perm, setPerm] = useState<Perm>('checking');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const p = await Notifications.getPermissionsAsync();
    setPerm(p.granted ? 'granted' : p.canAskAgain ? 'undetermined' : 'denied');
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const enable = async () => {
    setBusy(true);
    setMsg(null);
    try {
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('news', { name: '뉴스 알림', importance: Notifications.AndroidImportance.DEFAULT });
      }
      const p = await Notifications.requestPermissionsAsync();
      await refresh();
      if (!p.granted) setMsg('알림 권한이 허용되지 않았어요. 시스템 설정에서 바꿀 수 있어요.');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '알림을 켜지 못했어요.');
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    setMsg(null);
    try {
      await Notifications.scheduleNotificationAsync({
        content: { title: 'AI LENS', body: '테스트 알림이에요. 눌러서 오늘의 지면을 열어 보세요.', data: {} },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 3 },
      });
      setMsg('3초 뒤에 테스트 알림이 와요.');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '테스트 알림을 만들지 못했어요.');
    }
  };

  const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
  const probeToken = async () => {
    setMsg(null);
    try {
      if (!Device.isDevice) return setMsg('실제 기기에서만 푸시 토큰을 만들 수 있어요.');
      await Notifications.getExpoPushTokenAsync({ projectId });
      setMsg('푸시 토큰 발급 가능(기기·Firebase 설정 정상). 서버 연동 전이라 저장하지는 않아요.');
    } catch (e) {
      setMsg(`푸시 토큰을 만들지 못했어요: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.body}>
      <Stack.Screen options={{ headerShown: true, title: '알림 설정' }} />
      <View style={styles.card}>
        <Text style={styles.label}>기기 알림 권한</Text>
        {perm === 'checking' ? <ActivityIndicator color="#2563eb" style={{ alignSelf: 'flex-start', marginTop: 8 }} /> : (
          <Text style={[styles.status, perm === 'granted' && { color: '#16a34a' }]}>{perm === 'granted' ? '허용됨' : perm === 'denied' ? '차단됨' : '아직 선택하지 않았어요'}</Text>
        )}
        {perm === 'undetermined' ? (
          <Pressable style={[styles.btn, busy && { opacity: 0.6 }]} onPress={() => void enable()} disabled={busy} accessibilityRole="button"><Text style={styles.btnText}>알림 켜기</Text></Pressable>
        ) : null}
        {perm === 'denied' ? (
          <Pressable style={styles.btn} onPress={() => void Linking.openSettings()} accessibilityRole="button"><Text style={styles.btnText}>시스템 설정 열기</Text></Pressable>
        ) : null}
      </View>

      <Text style={styles.note}>주요 기사와 오늘의 지면을 알림으로 받아볼 수 있도록 준비 중이에요. 알림을 누르면 해당 기사로 바로 이동해요.</Text>

      {perm === 'granted' ? (
        <View style={styles.card}>
          <Text style={styles.label}>기기 점검</Text>
          <Pressable style={styles.ghost} onPress={() => void test()} accessibilityRole="button"><Text style={styles.ghostText}>테스트 알림 보내기</Text></Pressable>
          <Pressable style={styles.ghost} onPress={() => void probeToken()} accessibilityRole="button"><Text style={styles.ghostText}>푸시 토큰 점검</Text></Pressable>
        </View>
      ) : null}
      {msg ? <Text style={styles.msg}>{msg}</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  body: { padding: 20, gap: 14 },
  card: { padding: 16, borderRadius: 14, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0' },
  label: { fontSize: 13, fontWeight: '800', color: colors.textMuted },
  status: { marginTop: 6, fontSize: 18, fontWeight: '800', color: colors.text },
  btn: { marginTop: 14, height: 48, borderRadius: 10, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  ghost: { marginTop: 10, height: 46, borderRadius: 10, backgroundColor: '#fff', borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  ghostText: { fontSize: 14.5, fontWeight: '600', color: colors.text },
  note: { fontSize: 13.5, lineHeight: 21, color: colors.textMuted },
  msg: { fontSize: 13.5, lineHeight: 20, color: '#2563eb' },
});
