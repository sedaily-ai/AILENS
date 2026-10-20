import { Pressable, StyleSheet, View } from 'react-native';
import { Link } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { Text } from '../../../ui/Text';

/**
 * 홈 소개 영역 — 웹 LensPreviewSection 의 .lz-intro(질문 → 답 → /start 진입 링크)를 앱 폭에 옮긴 것.
 * 질문(큰 세리프, 핵심어 앰버 손밑줄) → 답(작은 고딕) → 하루 떠올리기 링크.
 */
export function HomeIntro() {
  return (
    <View>
      {/* 핵심어 "어려우시죠?" 만 한 덩어리(줄바꿈 없음)로 묶어 그 아래에 밑줄을 긋는다(웹 .lz-mark). */}
      <View style={styles.leadRow}>
        <Text style={styles.lead}>뉴스 챙겨보기 </Text>
        <View>
          <Text style={styles.lead}>어려우시죠?</Text>
          <MarkLine />
        </View>
      </View>
      <Text style={styles.sub}>당신의 일상에 맞춘 뉴스를 준비했어요.</Text>
      <Link href="/start" asChild>
        <Pressable accessibilityRole="link" style={styles.findWrap} hitSlop={6}>
          <Text style={styles.find}>내 일상이 뭔지 모르겠다면, 하루를 같이 떠올려볼까요 →</Text>
        </Pressable>
      </Link>

    </View>
  );
}

/** 핵심어 아래 손으로 그은 앰버 밑줄(웹 .lz-mark-line 과 같은 경로). 줄 폭은 "어려우시죠?" 에 맞춘다. */
function MarkLine() {
  return (
    <View style={styles.markLineBox} pointerEvents="none">
      <Svg width="100%" height="100%" viewBox="0 0 120 10" preserveAspectRatio="none">
        <Path d="M2 6 C22 2, 44 8, 64 5 S104 3, 118 6" fill="none" stroke="#FFB020" strokeWidth={4} strokeLinecap="round" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  lead: { fontFamily: 'NotoSerifKR-Bold', fontSize: 24, lineHeight: 34, letterSpacing: -0.6, color: '#1f2937' },
  leadRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start' },
  // 웹 .lz-mark-line: left -2px, bottom -5px, 폭 100%+4px, 높이 9px.
  markLineBox: { position: 'absolute', left: -2, right: -2, bottom: -3, height: 9 },
  sub: { marginTop: 8, fontSize: 15, lineHeight: 24, fontWeight: '600', color: '#4b5563' },
  findWrap: { alignSelf: 'flex-start', marginTop: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(61,112,222,0.3)', paddingBottom: 1 },
  find: { fontSize: 13.5, fontWeight: '500', color: '#3d70de' },
});
