import { Pressable, StyleSheet, View } from 'react-native';
import { Link, useRouter, type Href } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { IllustIcon, type IllustKind } from '../../../ui/IllustIcon';
import { Text } from '../../../ui/Text';

/**
 * 홈 소개 영역 — 웹 LensPreviewSection 의 .lz-intro(질문 → 답 → /start 진입 링크)에, 앱 방식의 바로가기 아이콘 줄을 더한 것.
 * 웹은 칩을 누르면 형식 소개 모달이 열리지만, 앱은 일러스트 아이콘을 누르면 곧바로 그 형식을 볼 수 있는 화면으로 간다.
 */
const SHORTCUTS: { label: string; kind: IllustKind; href: Href }[] = [
  { label: '읽기', kind: 'read', href: '/letter' },
  { label: '웹툰', kind: 'webtoon', href: '/discover' },
  { label: '듣기', kind: 'listen', href: '/listen' },
  { label: '영상', kind: 'video', href: '/discover' },
  { label: '타임머신', kind: 'time', href: '/timeline' },
  { label: '게임', kind: 'game', href: '/games' },
];

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

      <View style={styles.shortcuts}>
        {SHORTCUTS.map((w) => (
          <Pressable
            key={w.label}
            onPress={() => router.push(w.href)}
            accessibilityRole="button"
            accessibilityLabel={`${w.label} 보기`}
            style={({ pressed }) => [styles.shortcut, pressed && styles.shortcutPressed]}
          >
            <IllustIcon kind={w.kind} size={52} />
            <Text style={styles.shortcutLabel} numberOfLines={1}>{w.label}</Text>
          </Pressable>
        ))}
      </View>
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
  shortcuts: { marginTop: 22, flexDirection: 'row' },
  shortcut: { flex: 1, alignItems: 'center', gap: 7 },
  shortcutPressed: { opacity: 0.7, transform: [{ scale: 0.95 }] },
  shortcutLabel: { fontSize: 12, fontWeight: '600', letterSpacing: -0.2, color: '#374151' },
});
