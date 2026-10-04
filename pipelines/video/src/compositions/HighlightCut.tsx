import React from 'react';
import { CutLayout } from '../components/CutLayout';
import { KineticText } from '../components/KineticText';
import { HighlightCutType } from '../lib/schema';

// 숫자 없는 핵심 문장 — 전면 타이포. 박스·테두리 없이 큰 글자가 화면을 채우고, 단어가 하나씩 올라온 뒤 강조어가 마지막에 앰버로 튀어나온다.
// (2026-10-03: 노란 테두리 박스가 "AI가 만든 티"가 난다는 지적으로 제거)
export const HighlightCut: React.FC<{ cut: HighlightCutType; brand: string }> = ({ cut, brand }) => (
  <CutLayout brand={brand} contentAlign="center">
    <KineticText value={cut.caption} size={132} />
  </CutLayout>
);
