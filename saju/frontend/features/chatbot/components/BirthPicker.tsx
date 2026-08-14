'use client';

import { useMemo, useState } from 'react';
import { SAJU } from '@saju/shared/ui/sajuTokens';
import { REGION_OPTIONS, REGION_OPTIONS_EN } from '@saju/features/fortune/lib/engine';

type T = (ko: string, en: string) => string;

const selectClass = 'rounded-xl px-3 py-2.5 text-[14px] outline-none bg-white focus:border-[#34D399] focus:ring-1 focus:ring-[#D1FAE5]';
const selectStyle = { border: `1px solid ${SAJU.line}`, color: SAJU.ink } as const;
const confirmClass = 'rounded-2xl px-5 py-2.5 text-[14px] font-semibold text-white disabled:opacity-40 shrink-0 transition cursor-pointer hover:brightness-95 active:scale-95 disabled:cursor-not-allowed disabled:hover:brightness-100';
const confirmStyle = { background: '#059669' } as const;

/** 생년월일 드롭다운 선택 (년/월/일) — 일수는 월/연에 맞춰 자동 보정 */
export function DateSelect({ onConfirm, t }: { onConfirm: (y: number, m: number, d: number) => void; t: T }) {
  const [y, setY] = useState<number | ''>('');
  const [m, setM] = useState<number | ''>('');
  const [d, setD] = useState<number | ''>('');

  const currentYear = new Date().getFullYear();
  const years = useMemo(() => {
    const arr: number[] = [];
    for (let yr = currentYear; yr >= 1900; yr--) arr.push(yr);
    return arr;
  }, [currentYear]);

  const daysInMonth = y !== '' && m !== '' ? new Date(y, m, 0).getDate() : 31;
  const days = useMemo(() => Array.from({ length: daysInMonth }, (_, i) => i + 1), [daysInMonth]);

  // 월 변경 등으로 일이 범위를 넘으면 자동 보정
  const safeD = d !== '' && d > daysInMonth ? '' : d;
  const ready = y !== '' && m !== '' && safeD !== '';

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select className={selectClass} style={selectStyle} value={y} onChange={e => setY(Number(e.target.value))}>
        <option value="" disabled>{t('년', 'Year')}</option>
        {years.map(yr => <option key={yr} value={yr}>{yr}{t('년', '')}</option>)}
      </select>
      <select className={selectClass} style={selectStyle} value={m} onChange={e => setM(Number(e.target.value))}>
        <option value="" disabled>{t('월', 'Month')}</option>
        {Array.from({ length: 12 }, (_, i) => i + 1).map(mm => <option key={mm} value={mm}>{mm}{t('월', '')}</option>)}
      </select>
      <select className={selectClass} style={selectStyle} value={safeD} onChange={e => setD(Number(e.target.value))}>
        <option value="" disabled>{t('일', 'Day')}</option>
        {days.map(dd => <option key={dd} value={dd}>{dd}{t('일', '')}</option>)}
      </select>
      <button
        type="button"
        className={confirmClass}
        style={confirmStyle}
        disabled={!ready}
        onClick={() => ready && onConfirm(y as number, m as number, safeD as number)}
      >
        {t('확인', 'OK')}
      </button>
    </div>
  );
}

/** 태어난 지역 드롭다운 선택 — 엔진 전체 지역 목록(경기도 포함) 사용 */
export function RegionSelect({
  onConfirm, t, lang,
}: { onConfirm: (value: string, label: string) => void; t: T; lang: 'ko' | 'en' }) {
  const opts = lang === 'en' ? REGION_OPTIONS_EN : REGION_OPTIONS;
  // 첫 항목('보정 안함', value '')을 기본값으로. index 로 다뤄 동일 경도 중복도 구분.
  const [idx, setIdx] = useState(0);
  const labelFor = (o: { value: string; label: string }) =>
    o.value === '' ? t('잘 모르겠어요', 'Not sure') : o.label;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        className={selectClass}
        style={selectStyle}
        value={idx}
        onChange={e => setIdx(Number(e.target.value))}
      >
        {opts.map((o, i) => <option key={i} value={i}>{labelFor(o)}</option>)}
      </select>
      <button
        type="button"
        className={confirmClass}
        style={confirmStyle}
        onClick={() => { const o = opts[idx]; onConfirm(o.value, labelFor(o)); }}
      >
        {t('확인', 'OK')}
      </button>
    </div>
  );
}

/** 태어난 시각 드롭다운 선택 (시/분) */
export function TimeSelect({ onConfirm, t }: { onConfirm: (hour: number, min: number) => void; t: T }) {
  const [h, setH] = useState<number | ''>('');
  const [mi, setMi] = useState<number | ''>('');
  const ready = h !== '' && mi !== '';

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select className={selectClass} style={selectStyle} value={h} onChange={e => setH(Number(e.target.value))}>
        <option value="" disabled>{t('시', 'Hour')}</option>
        {Array.from({ length: 24 }, (_, i) => i).map(hh => (
          <option key={hh} value={hh}>{String(hh).padStart(2, '0')}{t('시', '')}</option>
        ))}
      </select>
      <select className={selectClass} style={selectStyle} value={mi} onChange={e => setMi(Number(e.target.value))}>
        <option value="" disabled>{t('분', 'Min')}</option>
        {Array.from({ length: 60 }, (_, i) => i).map(mm => (
          <option key={mm} value={mm}>{String(mm).padStart(2, '0')}{t('분', '')}</option>
        ))}
      </select>
      <button
        type="button"
        className={confirmClass}
        style={confirmStyle}
        disabled={!ready}
        onClick={() => ready && onConfirm(h as number, mi as number)}
      >
        {t('확인', 'OK')}
      </button>
    </div>
  );
}
