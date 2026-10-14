import { forwardRef } from 'react';
import { StyleSheet, Text as RNText, TextInput as RNTextInput, type TextInputProps, type TextProps, type TextStyle } from 'react-native';

/**
 * 앱 전용 Text / TextInput — 웹과 같은 글꼴(Pretendard, 소제목·인용은 Noto Serif KR)을 쓴다.
 * 커스텀 글꼴은 안드로이드에서 fontWeight 가 먹지 않아 굵기마다 글꼴 파일(가족 이름)이 따로 필요하므로,
 * 스타일의 fontWeight 를 가족 이름으로 바꿔 준다(화면 코드는 웹처럼 fontWeight 만 쓰면 된다).
 * fontFamily 를 직접 지정한 곳(세리프 등)은 그대로 둔다. 글꼴 로딩은 app/_layout.tsx 의 useFonts.
 */
export const FONT = {
  sans: { 400: 'Pretendard-Regular', 500: 'Pretendard-Medium', 600: 'Pretendard-SemiBold', 700: 'Pretendard-Bold', 800: 'Pretendard-ExtraBold' },
  /** 웹 .lread-sub .ch-t / .fmt-lede 등 에디토리얼 제목용(굵은 한 벌만 싣는다). */
  serif: 'NotoSerifKR-Bold',
} as const;

function weightOf(w: TextStyle['fontWeight']): 400 | 500 | 600 | 700 | 800 {
  if (w === 'bold') return 700;
  const n = typeof w === 'number' ? w : Number(w ?? 400);
  if (!Number.isFinite(n)) return 400;
  if (n >= 800) return 800;
  if (n >= 700) return 700;
  if (n >= 600) return 600;
  if (n >= 500) return 500;
  return 400;
}

function withFont(style: TextProps['style']): TextProps['style'] {
  const flat = StyleSheet.flatten(style) ?? {};
  if (flat.fontFamily) return style;
  const italic = flat.fontStyle === 'italic';
  // fontWeight 는 가족에 이미 반영했으므로 제거한다(이중 적용 방지).
  return [style, { fontFamily: FONT.sans[weightOf(flat.fontWeight)], fontWeight: 'normal' as const, ...(italic ? {} : null) }];
}

export const Text = forwardRef<RNText, TextProps>(function Text({ style, ...rest }, ref) {
  return <RNText ref={ref} style={withFont(style)} {...rest} />;
});

export const TextInput = forwardRef<RNTextInput, TextInputProps>(function TextInput({ style, ...rest }, ref) {
  return <RNTextInput ref={ref} style={withFont(style)} {...rest} />;
});
