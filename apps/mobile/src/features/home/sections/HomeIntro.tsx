import { Fragment } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Link, useRouter, type Href } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '../../../ui/Text';

/**
 * 홈 소개 영역 — 웹 LensPreviewSection 의 .lz-intro 를 앱 폭(좁은 화면 규격: .lz-way 가 칸을 균등 분할)으로 옮긴 것.
 * 질문(큰 세리프, 핵심어 앰버 밑줄) → 답(작은 고딕) → /start 진입 링크 → "읽기 → 웹툰 → 듣기 → 영상" 칩.
 * 웹은 칩을 누르면 형식 소개 모달이 열리지만, 앱은 곧바로 그 형식을 볼 수 있는 화면으로 보낸다.
 */
const WAYS: { label: string; icon: React.ComponentProps<typeof Ionicons>['name']; href: Href }[] = [
  { label: '읽기', icon: 'book-outline', href: '/letter' },
  { label: '웹툰', icon: 'image-outline', href: '/discover' },
  { label: '듣기', icon: 'headset-outline', href: '/listen' },
  { label: '영상', icon: 'videocam-outline', href: '/discover' },
];

const WAY_COLOR = '#2f5fc4';

export function HomeIntro() {
  const router = useRouter();
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

      <View style={styles.flow} accessibilityRole="menu">
        {WAYS.map((w, i) => (
          <Fragment key={w.label}>
            {i > 0 ? <Arrow /> : null}
            <Pressable
              onPress={() => router.push(w.href)}
              accessibilityRole="button"
              accessibilityLabel={`${w.label} 보기`}
              style={({ pressed }) => [styles.way, pressed && styles.wayPressed]}
            >
              <Ionicons name={w.icon} size={16} color={WAY_COLOR} />
              <Text style={styles.wayText}>{w.label}</Text>
            </Pressable>
          </Fragment>
        ))}
      </View>
      <Text style={styles.hint}>눌러서 바로 보기</Text>
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

/** 칩 사이 손그림 화살표(웹 .lz-way-arrow 와 같은 경로). */
function Arrow() {
  return (
    <Svg width={12} height={12} viewBox="0 0 20 12">
      <Path
        d="M1.5 6.4 C5 5.2, 9 7, 17 6 M13 2.2 L17.4 6 L13.2 9.8"
        fill="none"
        stroke="#8fb0ee"
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
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
  flow: { marginTop: 18, flexDirection: 'row', alignItems: 'center', gap: 2 },
  way: {
    flex: 1,
    minWidth: 0,
    height: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 6,
    borderWidth: 1,
    borderColor: '#dbe6fb',
    borderRadius: 999,
    backgroundColor: '#fff',
    // 웹 .lz-way 의 은은한 그림자(안드로이드 elevation 으로 근사).
    elevation: 1,
  },
  wayPressed: { backgroundColor: '#ebf1fe', transform: [{ scale: 0.97 }] },
  wayText: { fontSize: 13.5, fontWeight: '700', letterSpacing: -0.15, color: WAY_COLOR },
  hint: { marginTop: 8, marginLeft: 2, fontSize: 12.5, fontWeight: '600', color: '#9ca3af' },
});
