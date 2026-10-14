import { useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { colors } from '../theme';

const SITE = 'https://ailens.sedaily.ai';

/**
 * 웹 페이지를 앱 안에서 보여 준다(약관·개인정보·소개·문의·게임처럼 웹이 정본인 화면).
 * 같은 사이트(ailens.sedaily.ai) 안 이동만 앱 안에서 처리하고, 다른 도메인 링크는 시스템 브라우저로 연다. 로드 실패 시 재시도.
 */
export function WebPage({ path, javaScript = true }: { path: string; javaScript?: boolean }) {
  const ref = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const uri = `${SITE}${path}`;

  return (
    <View style={styles.root}>
      <WebView
        ref={ref}
        source={{ uri }}
        style={styles.web}
        javaScriptEnabled={javaScript}
        domStorageEnabled
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        onLoadStart={() => {
          setLoading(true);
          setFailed(false);
        }}
        onLoadEnd={() => setLoading(false)}
        onError={() => setFailed(true)}
        onHttpError={(e) => e.nativeEvent.statusCode >= 500 && setFailed(true)}
        onShouldStartLoadWithRequest={(req) => {
          if (req.url.startsWith(SITE) || req.url.startsWith('about:') || req.url.startsWith('data:')) return true;
          // 다른 도메인(외부 링크)은 앱 밖에서 연다.
          if (/^https?:/.test(req.url)) void Linking.openURL(req.url);
          return false;
        }}
      />
      {loading && !failed ? (
        <View style={styles.overlay} pointerEvents="none">
          <ActivityIndicator color="#2563eb" />
        </View>
      ) : null}
      {failed ? (
        <View style={styles.overlay}>
          <Text style={styles.msg}>페이지를 불러오지 못했어요.</Text>
          <Pressable style={styles.btn} onPress={() => { setFailed(false); ref.current?.reload(); }} accessibilityRole="button">
            <Text style={styles.btnText}>다시 시도</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  web: { flex: 1, backgroundColor: colors.bg },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg, gap: 10 },
  msg: { fontSize: 14, color: colors.textMuted },
  btn: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 8, backgroundColor: '#f3f4f6' },
  btnText: { fontSize: 14, fontWeight: '600', color: colors.text },
});
