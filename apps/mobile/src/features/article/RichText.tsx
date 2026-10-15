import { StyleSheet, type StyleProp, type TextStyle } from 'react-native';
import { Text } from '../../ui/Text';
import { inlineSegments, splitByTerms, type GlossaryTerm } from '@ailens/domain';

/**
 * 레터 한 문단의 인라인 서식 렌더러 — 굵게·기울임·따옴표·금액 강조는 도메인 inlineSegments 가 해석하고(웹과 같은 규칙),
 * 용어집의 말은 탭하면 설명이 열리도록 밑줄을 긋는다(웹 TermTooltip 대응).
 */
export function RichText({
  text,
  glossary,
  numbers,
  style,
  onTerm,
  onLongPress,
}: {
  text: string;
  glossary?: readonly GlossaryTerm[];
  numbers?: boolean;
  style?: StyleProp<TextStyle>;
  onTerm?: (term: string, explain: string, at: { x: number; y: number }) => void;
  /** 문단을 길게 누르면(문장 저장 시트 열기 등). */
  onLongPress?: () => void;
}) {
  return (
    <Text style={style} onLongPress={onLongPress}>
      {inlineSegments(text, { numbers }).map((seg, i) => {
        const pieces = splitByTerms(seg.text, glossary).map((p, j) =>
          p.explain !== undefined ? (
            <Text key={j} style={styles.term} onPress={(e) => onTerm?.(p.text, p.explain ?? '', { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY })} accessibilityRole="button" accessibilityHint="용어 설명 보기">
              {p.text}
            </Text>
          ) : (
            p.text
          ),
        );
        const st = seg.kind === 'bold' || seg.kind === 'number' ? styles.bold : seg.kind === 'italic' ? styles.italic : undefined;
        return (
          <Text key={i} style={st}>
            {pieces}
          </Text>
        );
      })}
    </Text>
  );
}

const styles = StyleSheet.create({
  // 웹 .lread strong: 굵기 600, 색 #111.
  bold: { fontWeight: '600', color: '#111111' },
  italic: { fontStyle: 'italic' },
  // 웹은 형광펜을 글자 아래 55%에만 긋는다(#ffe066). 글자 일부만 칠하는 스타일이 RN 에 없어, 같은 색을 옅게 깔아 마커 느낌만 낸다.
  term: { backgroundColor: 'rgba(255,224,102,0.62)' },
});
