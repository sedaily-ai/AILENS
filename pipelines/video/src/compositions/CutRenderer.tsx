import React from 'react';
import { Cut } from '../lib/schema';
import { OpeningCut } from './OpeningCut';
import { StatCut } from './StatCut';
import { DiagramCut } from './DiagramCut';
import { ChartCut } from './ChartCut';
import { HighlightCut } from './HighlightCut';
import { ClosingCut } from './ClosingCut';

export const CutRenderer: React.FC<{
  cut: Cut;
  brand: string;
  source: string;
  disclaimer?: string;
  asOfDate?: string;
}> = ({ cut, brand, source, disclaimer, asOfDate }) => {
  switch (cut.type) {
    case 'opening':
      return <OpeningCut cut={cut} brand={brand} asOfDate={asOfDate} />;
    case 'stat':
      return <StatCut cut={cut} brand={brand} />;
    case 'diagram':
      return <DiagramCut cut={cut} brand={brand} />;
    case 'chart':
      return <ChartCut cut={cut} brand={brand} />;
    case 'highlight':
      return <HighlightCut cut={cut} brand={brand} />;
    case 'closing':
      return <ClosingCut cut={cut} brand={brand} source={source} disclaimer={disclaimer} />;
    default: {
      const exhaustiveCheck: never = cut;
      throw new Error(`알 수 없는 컷 타입: ${JSON.stringify(exhaustiveCheck)}`);
    }
  }
};
