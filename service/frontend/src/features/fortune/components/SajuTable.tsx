'use client';

import { sipsung, unsung, CG_OH, JJG, OH_HJ, type Pillar } from '@/entities/saju';
import { OhaengBars, type OhaengKey } from './OhaengBars';

const EL = {
  목: { bg: '#dcfce7', tile: '#22c55e', text: '#15803d', soft: '#f0fdf4', label: '나무' },
  화: { bg: '#fee2e2', tile: '#ef4444', text: '#b91c1c', soft: '#fef2f2', label: '불' },
  토: { bg: '#fef3c7', tile: '#f59e0b', text: '#b45309', soft: '#fffbeb', label: '흙' },
  금: { bg: '#e5e7eb', tile: '#94a3b8', text: '#475569', soft: '#f8fafc', label: '쇠' },
  수: { bg: '#dbeafe', tile: '#3b82f6', text: '#1d4ed8', soft: '#eff6ff', label: '물' },
} as const;

type ElKey = keyof typeof EL;

interface Props {
  pillars: Pillar[];
  ilgan: string;
}

const PILLAR_LABELS = ['시주', '일주', '월주', '년주'];

interface TileProps {
  hanja: string;
  korean: string;
  oh: string;
  hl?: boolean;
}

function Tile({ hanja, korean, oh, hl = false }: TileProps) {
  const e = (EL as Record<string, (typeof EL)[ElKey]>)[oh];
  const bgSoft = e?.bg || '#f3f4f6';
  const textColor = e?.text || '#374151';
  const tileColor = e?.tile || '#9ca3af';
  const label = e?.label || '';
  const hj = oh && OH_HJ[oh] ? OH_HJ[oh] : '';
  return (
    <div
      className="relative rounded-xl flex flex-col items-center justify-center py-3 md:py-4 transition-all"
      style={{
        background: bgSoft,
        border: hl ? `1.5px solid ${tileColor}` : '1px solid transparent',
      }}
    >
      <span
        className="font-bold leading-none"
        style={{
          fontSize: 'clamp(22px, 5.5vw, 28px)',
          color: textColor,
          fontFamily: 'Noto Serif KR, serif',
        }}
      >
        {hanja || '—'}
      </span>
      <span
        className="mt-1 text-[10px] font-medium tracking-tight"
        style={{ color: textColor, opacity: 0.65 }}
      >
        {hj && label ? `${hj} · ${label}` : korean}
      </span>
    </div>
  );
}

export function SajuTable({ pillars, ilgan }: Props) {
  const ilganOh = (CG_OH[ilgan] as ElKey) || '금';
  const ilganE = EL[ilganOh];

  // 오행 카운트 (천간 4 + 지지 4 + 지장간 합)
  const ohCount: Record<ElKey, number> = { 목: 0, 화: 0, 토: 0, 금: 0, 수: 0 };
  pillars.forEach((p) => {
    if (p.co && p.co in ohCount) ohCount[p.co as ElKey] += 1;
    if (p.jo && p.jo in ohCount) ohCount[p.jo as ElKey] += 1;
    if (p.j && JJG[p.j]) {
      JJG[p.j].forEach((c) => {
        const o = CG_OH[c];
        if (o && o in ohCount) ohCount[o as ElKey] += 0.4;
      });
    }
  });

  return (
    <section className="mb-6">
      {/* 섹션 헤더 */}
      <div className="flex items-end justify-between mb-5 px-1">
        <h3
          className="text-[20px] md:text-[24px] font-black text-gray-900 tracking-tight"
          style={{ fontFamily: 'Noto Serif KR, serif' }}
        >
          사주명식
        </h3>
        <span className="text-[11px] text-gray-400">8글자가 풀어내는 당신</span>
      </div>

      {/* 나의 오행 메인 카드 */}
      <div
        className="bg-white rounded-[16px] p-5 md:p-6 mb-4 border border-gray-100"
        style={{ boxShadow: '0 1px 3px rgba(17,24,39,0.04), 0 4px 16px rgba(17,24,39,0.04)' }}
      >
        <div className="flex items-center gap-5">
          {/* 일간 원형 (나의 오행) */}
          <div className="relative flex-shrink-0">
            <div
              className="w-[72px] h-[72px] md:w-[84px] md:h-[84px] rounded-full flex items-center justify-center"
              style={{
                background: ilganE.bg,
                border: `1.5px solid ${ilganE.tile}`,
              }}
            >
              <span
                className="font-bold"
                style={{
                  fontSize: 'clamp(28px, 7vw, 34px)',
                  color: ilganE.text,
                  fontFamily: 'Noto Serif KR, serif',
                }}
              >
                {OH_HJ[ilganOh] || ilganOh}
              </span>
            </div>
            <p className="text-center text-[10px] text-gray-400 font-medium mt-2 tracking-wide">
              나의 오행
            </p>
          </div>

          {/* 오행 분포 바 (공통 컴포넌트) */}
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-bold text-gray-400 tracking-[0.12em] uppercase mb-2.5">오행 분포</p>
            <OhaengBars counts={ohCount as Record<OhaengKey, number>} />
          </div>
        </div>
      </div>

      {/* 사주 4 기둥 그리드 */}
      <div
        className="bg-white rounded-[16px] p-5 md:p-6 border border-gray-100"
        style={{ boxShadow: '0 1px 3px rgba(17,24,39,0.04), 0 4px 16px rgba(17,24,39,0.04)' }}
      >
        {/* 기둥 헤더 (시주/일주/월주/년주) */}
        <div className="grid grid-cols-4 gap-2 md:gap-3 mb-3">
          {PILLAR_LABELS.map((label, i) => (
            <div key={i} className="text-center">
              <span
                className={`inline-block text-[12px] md:text-[13px] font-bold ${
                  i === 1 ? 'text-gray-900' : 'text-gray-400'
                }`}
              >
                {label}
                {i === 1 && (
                  <span className="ml-1 text-[10px] font-medium text-gray-400">· 일원</span>
                )}
              </span>
            </div>
          ))}
        </div>

        {/* 천간 십성 */}
        <div className="grid grid-cols-4 gap-2 md:gap-3 mb-2">
          {pillars.map((p, i) => (
            <div key={i} className="text-center text-[11px] font-bold text-gray-500">
              {p.c && i !== 1 ? sipsung(ilgan, p.c) : i === 1 ? '일원' : ''}
            </div>
          ))}
        </div>

        {/* 천간 타일 */}
        <div className="grid grid-cols-4 gap-2 md:gap-3 mb-4">
          {pillars.map((p, i) => (
            <Tile key={i} hanja={p.ck || ''} korean={p.c || ''} oh={p.co || ''} hl={i === 1} />
          ))}
        </div>

        {/* 지지 타일 */}
        <div className="grid grid-cols-4 gap-2 md:gap-3 mb-2">
          {pillars.map((p, i) => (
            <Tile key={i} hanja={p.jk || ''} korean={p.j || ''} oh={p.jo || ''} />
          ))}
        </div>

        {/* 지지 십성 */}
        <div className="grid grid-cols-4 gap-2 md:gap-3 mb-3">
          {pillars.map((p, i) => {
            const g = p.j && JJG[p.j];
            return (
              <div key={i} className="text-center text-[11px] font-bold text-gray-500">
                {g ? sipsung(ilgan, g[g.length - 1]) : ''}
              </div>
            );
          })}
        </div>

        {/* 12운성 */}
        <div className="grid grid-cols-4 gap-2 md:gap-3 pt-3 border-t border-gray-100">
          <div className="col-span-4 text-center text-[10px] font-bold text-gray-400 tracking-[0.12em] uppercase mb-1">
            12운성
          </div>
          {pillars.map((p, i) => (
            <div key={i} className="text-center text-[12px] font-semibold text-gray-700">
              {unsung(ilgan, p.j)}
            </div>
          ))}
        </div>

        {/* 지장간 (작게, 옵션 펼침 가능) */}
        <details className="mt-4 pt-3 border-t border-gray-100">
          <summary className="text-[11px] font-bold text-gray-400 tracking-[0.12em] uppercase cursor-pointer select-none">
            지장간 펼치기
          </summary>
          <div className="grid grid-cols-4 gap-2 md:gap-3 mt-3">
            {pillars.map((p, i) => {
              const g = p.j && JJG[p.j];
              return (
                <div key={i} className="text-center">
                  {g ? (
                    <div className="flex justify-center gap-1.5">
                      {g.map((s, si) => {
                        const o = (CG_OH[s] as ElKey) || '금';
                        return (
                          <span
                            key={si}
                            className="text-[12px] font-bold px-1.5 py-0.5 rounded"
                            style={{ background: EL[o].soft, color: EL[o].text }}
                          >
                            {s}
                          </span>
                        );
                      })}
                    </div>
                  ) : (
                    <span className="text-gray-300">—</span>
                  )}
                </div>
              );
            })}
          </div>
        </details>
      </div>
    </section>
  );
}
