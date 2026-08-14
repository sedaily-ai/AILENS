export type Ohaeng = '목' | '화' | '토' | '금' | '수';

export interface OhaengToken {
  bg: string;
  text: string;
  border: string;
  solid: string;
}

export const OHAENG_SETS: Record<'default', Record<Ohaeng, OhaengToken>> = {
  default: {
    목: { bg: 'var(--oh-mok-bg)', text: 'var(--oh-mok-text)', border: 'var(--oh-mok-border)', solid: '#2D7A1F' },
    화: { bg: 'var(--oh-hwa-bg)', text: 'var(--oh-hwa-text)', border: 'var(--oh-hwa-border)', solid: '#C33A1F' },
    토: { bg: 'var(--oh-to-bg)', text: 'var(--oh-to-text)', border: 'var(--oh-to-border)', solid: '#A97C1F' },
    금: { bg: 'var(--oh-geum-bg)', text: 'var(--oh-geum-text)', border: 'var(--oh-geum-border)', solid: '#4E5968' },
    수: { bg: 'var(--oh-su-bg)', text: 'var(--oh-su-text)', border: 'var(--oh-su-border)', solid: '#3182F6' },
  },
};

/**
 * V3 디자인 토큰
 * - `ink`, `sub`, `line`, `panel`, `subtle`, `hairline` 은 CSS 변수로 정의되어
 *   globals.css 의 `.dark` 클래스에서 다크모드 값이 자동 오버라이드됩니다.
 * - `page`, `accent` 는 라이트·다크 모두 동일 (브랜드 색).
 */
export const V3_TOKENS = {
  page: '#F2F4F7',
  accent: '#3182F6',
  ink: 'var(--v3-ink)',
  sub: 'var(--v3-sub)',
  line: 'var(--v3-line)',
  panel: 'var(--v3-panel)',
  subtle: 'var(--v3-subtle)',
  hairline: 'var(--v3-hairline)',
};
