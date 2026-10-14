import { StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native';
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
  onTerm?: (term: string, explain: string) => void;
  /** 문단을 길게 누르면(문장 저장 시트 열기 등). */
  onLongPress?: () => void;
}) {
  return (
    <Text style={style} onLongPress={onLongPress}>
      {inlineSegments(text, { numbers }).map((seg, i) => {
        const pieces = splitByTerms(seg.text, glossary).map((p, j) =>
          p.explain !== undefined ? (
            <Text key={j} style={styles.term} onPress={() => onTerm?.(p.text, p.explain ?? '')} accessibilityRole="button" accessibilityHint="용어 설명 보기">
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
  bold: { fontWeight: '800' },
  italic: { fontStyle: 'italic' },
  term: { backgroundColor: '#fef3c7', textDecorationLine: 'underline', textDecorationStyle: 'dotted' },
});
