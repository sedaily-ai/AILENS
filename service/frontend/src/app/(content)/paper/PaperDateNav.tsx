'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { paperDateLabel, paperPath, parsePaperDate } from './paperShared';

// 지난 지면 날짜 이동(2026-10-04, 사용자 요청 — "어제 지면은 뭐였지?" 하며 들어온 사람이 원클릭으로 어제·그제로 가고, 원하는 날짜를 바로 고르고, 주·월 단위로 끊어 늘어지지 않게).
//  - 제목 바로 오른쪽 달력 아이콘: 월 단위 달력(팝업). 먼 날짜를 한 번에 고를 때.
// 지면이 있는 날만 링크이고 없는 날은 연회색. (제목 아래 한 주 띠는 2026-10-05 사용자 요청으로 삭제)
const WEEK = ['일', '월', '화', '수', '목', '금', '토'];
const ymd = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

export function PaperDateNav({ date, dates }: { date: string; dates: string[] }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const has = useMemo(() => new Set(dates), [dates]);
  const { weekday } = parsePaperDate(date);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div>
      <style>{`
        .pn-cal { display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; border-radius: 50%; border: none; background: #f1f5f9; color: #475569; flex-shrink: 0; cursor: pointer; transition: background .15s ease, color .15s ease; }
        .pn-cal:hover { background: #e2e8f0; }
        .pn-cal[aria-expanded='true'] { background: #5b8def; color: #fff; }
        .pn-cal:focus:not(:focus-visible), .pn-arrow:focus:not(:focus-visible) { outline: none; }
        .pn-pop { position: absolute; top: calc(100% + 10px); left: 0; z-index: 30; width: min(330px, calc(100vw - 32px)); padding: 16px 16px 14px; border-radius: 18px; background: #fff; border: 1px solid rgba(17,24,39,.07); box-shadow: 0 2px 4px rgba(17,24,39,.04), 0 18px 44px -8px rgba(17,24,39,.18); animation: pn-in .16s ease-out; }
        @keyframes pn-in { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }
        .pn-arrow { display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px; border-radius: 50%; border: none; background: transparent; color: #9ca3af; flex-shrink: 0; cursor: pointer; transition: background .15s ease, color .15s ease; }
        .pn-arrow:hover:not(:disabled) { background: #f1f5f9; color: #374151; }
        .pn-arrow:disabled { opacity: .3; cursor: default; }
        .pn-drop { display: inline-flex; align-items: center; gap: 3px; height: 32px; padding: 0 8px; border: none; border-radius: 10px; background: transparent; font-size: 14.5px; font-weight: 700; color: #111827; cursor: pointer; transition: background .12s ease; }
        .pn-drop:hover, .pn-drop[aria-expanded='true'] { background: #f1f5f9; }
        .pn-drop svg { color: #9ca3af; }
        .pn-drop:focus:not(:focus-visible), .pn-item:focus:not(:focus-visible) { outline: none; }
        .pn-menu { position: absolute; top: calc(100% + 4px); left: 50%; transform: translateX(-50%); z-index: 5; min-width: 96px; max-height: 204px; overflow-y: auto; padding: 6px 4px 6px 6px; border-radius: 14px; background: #fff; border: 1px solid rgba(17,24,39,.08); box-shadow: 0 10px 28px -6px rgba(17,24,39,.2); scrollbar-width: thin; scrollbar-color: #d5deee transparent; }
        .pn-menu::-webkit-scrollbar { width: 6px; }
        .pn-menu::-webkit-scrollbar-track { background: transparent; margin: 8px 0; }
        .pn-menu::-webkit-scrollbar-thumb { background: #d5deee; border-radius: 999px; border: 1px solid transparent; background-clip: padding-box; }
        .pn-menu::-webkit-scrollbar-thumb:hover { background: #aebfe0; background-clip: padding-box; }
        .pn-item { display: block; width: 100%; height: 36px; padding: 0 12px; border: none; border-radius: 9px; background: transparent; text-align: left; font-size: 14px; font-weight: 600; color: #374151; cursor: pointer; white-space: nowrap; }
        .pn-item:hover:not(:disabled) { background: #f1f5f9; }
        .pn-item.is-cur { background: #5b8def; color: #fff; }
        .pn-item:disabled { color: #d1d5db; cursor: default; }
        .pn-grid { display: grid; grid-template-columns: repeat(7, 1fr); row-gap: 2px; text-align: center; }
        .pn-gwk { font-size: 12px; font-weight: 500; color: #9ca3af; padding: 2px 0 6px; }
        .pn-gday { display: flex; align-items: center; justify-content: center; width: 36px; height: 36px; margin: 0 auto; border-radius: 50%; font-size: 14px; font-weight: 600; color: #374151; text-decoration: none; transition: background .12s ease; }
        a.pn-gday:hover { background: #f1f5f9; }
        .pn-gday.is-off { font-weight: 400; color: #d1d5db; }
        .pn-gday.is-cur { background: #5b8def; color: #fff; }
        @media (prefers-reduced-motion: reduce) { .pn-pop { animation: none; } }
      `}</style>
      <div ref={rootRef} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 12 }}>
        <h1 style={{ margin: 0, fontFamily: "'Noto Serif KR', serif", fontSize: 'clamp(26px, 5.4vw, 34px)', fontWeight: 700, letterSpacing: '-0.025em', color: '#1f2937' }}>
          {paperDateLabel(date)} ({weekday}) 지면
        </h1>
        <button type="button" className="pn-cal" aria-label="달력으로 날짜 선택" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((v) => !v)}>
          <CalendarDays size={18} strokeWidth={2.1} />
        </button>
        {open && (
          <div className="pn-pop" role="dialog" aria-label="지면 날짜 선택">
            <MonthGrid date={date} dates={dates} has={has} onPick={() => setOpen(false)} />
          </div>
        )}
      </div>
      <div style={{ marginBottom: 20 }} />
    </div>
  );
}

function MonthGrid({ date, dates, has, onPick }: { date: string; dates: string[]; has: Set<string>; onPick: () => void }) {
  const [year, setYear] = useState(Number(date.slice(0, 4)));
  const [month, setMonth] = useState(Number(date.slice(5, 7)));
  // 연·월 제목을 눌러 드롭다운(목록)으로 바로 고른다(2026-10-04, 사용자 요청). 목록은 날짜 격자 자리를 잠깐 대신한다.
  const [list, setList] = useState<'year' | 'month' | null>(null);
  const key = (s: string) => Number(s.slice(0, 4)) * 12 + Number(s.slice(5, 7));
  const minKey = key(dates[dates.length - 1]);
  const maxKey = key(dates[0]);
  const cur = year * 12 + month;
  const years = Array.from({ length: Math.floor((maxKey - 1) / 12) - Math.floor((minKey - 1) / 12) + 1 }, (_, i) => Math.floor((maxKey - 1) / 12) - i);
  const shift = (delta: number) => {
    const k = cur + delta - 1;
    setYear(Math.floor(k / 12));
    setMonth((k % 12) + 1);
  };
  const lead = new Date(Date.UTC(year, month - 1, 1, 12)).getUTCDay();
  const count = new Date(Date.UTC(year, month, 0, 12)).getUTCDate();
  const cells: (number | null)[] = [...Array(lead).fill(null), ...Array.from({ length: count }, (_, i) => i + 1)];

  const pickYear = (y: number) => {
    // 고른 해에 지면이 있는 달로 맞춘다(범위 밖 달이면 가장 가까운 달).
    const k = Math.min(Math.max(y * 12 + month, minKey), maxKey);
    setYear(Math.floor((k - 1) / 12));
    setMonth(((k - 1) % 12) + 1);
    setList(null);
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <button type="button" className="pn-arrow" aria-label="이전 달" disabled={cur <= minKey} onClick={() => shift(-1)}>
          <ChevronLeft size={17} strokeWidth={2.2} />
        </button>
        <span style={{ display: 'inline-flex', gap: 2 }}>
          <DropMenu
            label={`${year}년`}
            options={years.map((y) => ({ value: y, text: `${y}년`, disabled: false }))}
            selected={year}
            open={list === 'year'}
            onToggle={() => setList(list === 'year' ? null : 'year')}
            onSelect={(y) => pickYear(y)}
          />
          <DropMenu
            label={`${month}월`}
            options={Array.from({ length: 12 }, (_, i) => i + 1).map((m) => ({ value: m, text: `${m}월`, disabled: year * 12 + m < minKey || year * 12 + m > maxKey }))}
            selected={month}
            open={list === 'month'}
            onToggle={() => setList(list === 'month' ? null : 'month')}
            onSelect={(m) => {
              setMonth(m);
              setList(null);
            }}
          />
        </span>
        <button type="button" className="pn-arrow" aria-label="다음 달" disabled={cur >= maxKey} onClick={() => shift(1)}>
          <ChevronRight size={17} strokeWidth={2.2} />
        </button>
      </div>
      <div className="pn-grid">
          {WEEK.map((w) => (
            <span key={w} className="pn-gwk">
              {w}
            </span>
          ))}
          {cells.map((d, i) => {
            if (d == null) return <span key={`b${i}`} />;
            const v = ymd(year, month, d);
            if (!has.has(v)) {
              return (
                <span key={v} className="pn-gday is-off">
                  {d}
                </span>
              );
            }
            return (
              <Link key={v} href={paperPath(v)} prefetch={false} className={`pn-gday${v === date ? ' is-cur' : ''}`} aria-current={v === date ? 'date' : undefined} onClick={onPick}>
                {d}
              </Link>
            );
          })}
      </div>
    </div>
  );
}

// 연·월 드롭다운(2026-10-04, 사용자 요청 — "연도가 십 단위가 되면 찾기 어려우니 스크롤로 찾아가게"): 버튼 아래로 세로 목록이 열리고, 길면 안에서 스크롤한다. 열릴 때 지금 값이 보이는 자리로 간다.
function DropMenu({ label, options, selected, open, onToggle, onSelect }: { label: string; options: { value: number; text: string; disabled: boolean }[]; selected: number; open: boolean; onToggle: () => void; onSelect: (v: number) => void }) {
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const menu = menuRef.current;
    const cur = menu?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (menu && cur) menu.scrollTop = cur.offsetTop - menu.clientHeight / 2 + cur.offsetHeight / 2;
  }, [open]);
  return (
    <span style={{ position: 'relative', display: 'inline-block' }}>
      <button type="button" className="pn-drop" aria-expanded={open} aria-haspopup="listbox" onClick={onToggle}>
        {label} <ChevronDown size={14} strokeWidth={2.4} aria-hidden />
      </button>
      {open && (
        <div ref={menuRef} className="pn-menu" role="listbox">
          {options.map((o) => (
            <button key={o.value} type="button" role="option" aria-selected={o.value === selected} disabled={o.disabled} className={`pn-item${o.value === selected ? ' is-cur' : ''}`} onClick={() => onSelect(o.value)}>
              {o.text}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}
