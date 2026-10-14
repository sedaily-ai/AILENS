import type { LetterAxis } from '@ailens/api-client';

// 3축 표식 색(글자색은 배경 대비 4.5:1 이상 — WCAG AA). 웹 AXIS_META 와 같은 값.
export const AXIS_META: Record<LetterAxis, { label: string; tone: string; soft: string }> = {
  news: { label: '소식', tone: '#1f56c0', soft: '#eaf1fd' },
  substance: { label: '실체', tone: '#0b6b60', soft: '#e5f5f2' },
  other: { label: '다른 시각', tone: '#8f4f0a', soft: '#fdf1e2' },
};
const ORDER: LetterAxis[] = ['news', 'substance', 'other'];
export const orderedAxes = (axes: readonly string[]): LetterAxis[] => ORDER.filter((a) => axes.includes(a));
