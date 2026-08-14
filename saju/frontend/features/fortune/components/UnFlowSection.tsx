'use client';

import { useState } from 'react';
import { FlowGraph } from './FlowGraph';
import type { DaeunEntry, YeonunEntry, WolunEntry } from '../lib/engine';
import { useLang } from '@saju/shared/lib/LangContext';

type Scale = 'daeun' | 'yeonun' | 'wolun';

const INK = '#3A3128';
const INK_FAINT = '#B8AD98';
const SEAL = '#C1272D';

interface UnFlowSectionProps {
  daeuns: DaeunEntry[];
  yeonuns: YeonunEntry[];
  woluns: WolunEntry[];
  ilgan: string;
  yongsinOh?: string;
  currentAge: number;
  sajuYear: number;
  wolunActiveMonth: number;
  lang: 'ko' | 'en';
}

export function UnFlowSection({
  daeuns, yeonuns, woluns, ilgan, yongsinOh, currentAge, sajuYear, wolunActiveMonth, lang,
}: UnFlowSectionProps) {
  const { t } = useLang();
  const [scale, setScale] = useState<Scale>('daeun');

  const TABS: { key: Scale; label: string; sub: string }[] = [
    { key: 'daeun', label: t('대운', 'Major'), sub: t('10년', '10y') },
    { key: 'yeonun', label: t('세운', 'Annual'), sub: t('1년', '1y') },
    { key: 'wolun', label: t('월운', 'Monthly'), sub: t('1개월', '1mo') },
  ];

  const { cols, activeIdx, subtitle } = (() => {
    if (scale === 'yeonun') {
      return {
        cols: yeonuns.map(x => ({ ...x, label: `${x.year}` })),
        activeIdx: Math.max(0, yeonuns.findIndex(y => y.year === sajuYear)),
        subtitle: t('1년 단위로 바뀌는 그해의 흐름', 'Year-by-year flow'),
      };
    }
    if (scale === 'wolun') {
      return {
        cols: woluns.map(x => ({ ...x, label: lang === 'en' ? `M${String(x.month).padStart(2, '0')}` : `${String(x.month).padStart(2, '0')}월` })),
        activeIdx: Math.max(0, woluns.findIndex(w => w.month === wolunActiveMonth)),
        subtitle: t('한 달 단위의 세부 흐름', 'Month-by-month flow'),
      };
    }
    return {
      cols: daeuns.map(x => ({ ...x, label: lang === 'en' ? `${x.age}` : `${x.age}세` })),
      activeIdx: Math.max(0, daeuns.findIndex(d => currentAge >= d.age && currentAge < d.age + 10)),
      subtitle: t('10년 주기로 보는 큰 흐름', '10-year major life cycles'),
    };
  })();

  return (
    <div className="mb-4">
      {/* 필터 탭 */}
      <div className="flex gap-1 mb-2 px-1">
        {TABS.map(tab => {
          const isActive = tab.key === scale;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setScale(tab.key)}
              className="flex-1 rounded-[10px] py-2 text-center transition-colors"
              style={{
                background: isActive ? INK : 'transparent',
                border: `1px solid ${isActive ? INK : INK_FAINT}66`,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 700, color: isActive ? '#F7F1E3' : INK }}>{tab.label}</div>
              <div style={{ fontSize: 10, color: isActive ? SEAL : INK_FAINT, opacity: isActive ? 1 : 0.8 }}>{tab.sub}</div>
            </button>
          );
        })}
      </div>

      <div key={scale} style={{ animation: 'saju-flowFadeIn .28s ease' }}>
        <FlowGraph cols={cols} ilgan={ilgan} yongsinOh={yongsinOh} activeIdx={activeIdx} />
      </div>

      <div className="px-1 -mt-2 mb-1" style={{ fontSize: 11, color: INK_FAINT }}>{subtitle}</div>

      {scale === 'wolun' && yongsinOh && (
        <div className="px-1" style={{ fontSize: 11, color: INK_FAINT }}>
          {t('점은 흐름 점수 — 사주상 좋고 나쁨의 단정이 아니라 경향입니다', 'Dots reflect a flow score — a tendency, not a verdict')}
          {' '}({t('용신', 'Yongsin')}: <strong style={{ color: INK }}>{yongsinOh}</strong>)
        </div>
      )}
    </div>
  );
}
