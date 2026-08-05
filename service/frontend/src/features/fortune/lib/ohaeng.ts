export type Ohaeng = '목' | '화' | '토' | '금' | '수';

export interface OhaengToken {
  bg: string;
  text: string;
  border: string;
  solid: string;
}

export const OHAENG_SETS: Record<'default', Record<Ohaeng, OhaengToken>> = {
  default: {
    목: { bg: '#E8F5E5', text: '#2D7A1F', border: '#BFE3B3', solid: '#2D7A1F' },
    화: { bg: '#FEE7E2', text: '#C33A1F', border: '#F8C4B8', solid: '#C33A1F' },
    토: { bg: '#FBF1D6', text: '#8A6A1F', border: '#EFDCA7', solid: '#A97C1F' },
    금: { bg: '#F2F4F7', text: '#4E5968', border: '#D7DBE1', solid: '#4E5968' },
    수: { bg: '#E8F2FF', text: '#3182F6', border: '#BFD8FD', solid: '#3182F6' },
  },
};

export const V3_TOKENS = {
  page: '#F2F4F7',
  accent: '#3182F6',
  ink: '#191F28',
  sub: '#6B7684',
  line: '#E5E8EB',
  panel: '#F9FAFB',
  subtle: '#8B95A1',
  hairline: '#F2F4F7',
};
