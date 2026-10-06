import React from 'react';
import { CutLayout } from '../components/CutLayout';
import { KineticText } from '../components/KineticText';
import { HighlightCutType } from '../lib/schema';

// 숫자 없는 핵심 문장 — 전면 타이포. 박스·테두리 없이 큰 글자가 화면을 채우고, 단어가 하나씩 올라온 뒤 강조어가 마지막에 앰버로 튀어나온다.
export const HighlightCut: React.FC<{ cut: HighlightCutType; brand: string }> = ({ cut, brand }) => (
  <CutLayout brand={brand} contentAlign="center">
    <KineticText value={cut.caption} size={132} />
  </CutLayout>
);
