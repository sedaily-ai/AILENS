'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react';

// "날짜별 보기" 기간 필터. 영문판(en.sedaily.com, msp-web-ensedaily "Browse by date")의 날짜 범위 달력을 React로 옮겼다.
// 첫 클릭=시작일, 둘째 클릭=끝일(앞선 날이면 순서를 자동으로 맞춤), 같은 날 두 번=하루. 시작일만 고르면 "시작일 ~ 오늘".
// 빠른 선택(오늘·최근 7일·최근 30일·이번 달)은 누르는 즉시 적용한다. 좁은 화면(768px 미만)에서는 아래에서 올라오는 시트로 바뀐다.
// 색은 영문판의 먹색 대신 서울경제 CI 파랑(#5b8def)으로 맞췄다.
export type DateRange = { from: string; to: string };

const WEEK = ['일', '월', '화', '수', '목', '금', '토'];
const pad = (n: number) => String(n).padStart(2, '0');
const keyOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (k: string) => new Date(`${k}T00:00:00`);
const dot = (k: string) => k.replaceAll('-', '.');

export function DateRangeFilter({ value, onChange, today }: { value: DateRange | null; onChange: (v: DateRange | null) => void; today: string }) {
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [hover, setHover] = useState('');
  const [view, setView] = useState(() => {
    const d = parse(today);
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const rootRef = useRef<HTMLDivElement>(null);

  const openPanel = () => {
    // 열 때마다 현재 적용된 기간으로 초안을 맞춘다.
    setStart(value?.from ?? '');
    setEnd(value?.to ?? '');
    setHover('');
    const base = parse(value?.from ?? today);
    setView(new Date(base.getFullYear(), base.getMonth(), 1));
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    // 시트 모양(좁은 화면)일 때는 뒤 화면 스크롤을 잠근다.
    const mobile = window.matchMedia('(max-width: 767px)').matches;
    const prevOverflow = document.body.style.overflow;
    if (mobile) document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  const lo = start && end ? (start <= end ? start : end) : start;
  const hi = start && end ? (start <= end ? end : start) : '';

  const pick = (k: string) => {
    if (k > today) return;
    if (!start || (start && end)) {
      setStart(k);
      setEnd('');
    } else {
      setEnd(k);
    }
    setHover('');
  };

  const apply = (from: string, to: string) => {
    onChange({ from, to });
    setOpen(false);
  };

  const preset = (kind: '0' | '7' | '30' | 'month') => {
    const t = parse(today);
    const s = new Date(t);
    if (kind === 'month') s.setDate(1);
    else s.setDate(t.getDate() - Number(kind));
    apply(keyOf(s), today);
  };

  const y = view.getFullYear();
  const m = view.getMonth();
  const lead = new Date(y, m, 1).getDay();
  const days = new Date(y, m + 1, 0).getDate();
  const weeks = Math.ceil((lead + days) / 7);
  const rangeEnd = hi || (lo && hover && hover >= lo && !end ? hover : '');
  const nextDisabled = new Date(y, m + 1, 1) > parse(today);

  const cells = useMemo(
    () => Array.from({ length: weeks * 7 }, (_, i) => new Date(y, m, 1 - lead + i)),
    [y, m, lead, weeks],
  );

  const label = value ? `${dot(value.from)} – ${value.to === today ? '오늘' : dot(value.to)}` : '날짜별 보기';

  return (
    <div ref={rootRef} className="dr-root">
      <style>{`
        .dr-root { position: relative; display: inline-flex; align-items: center; gap: 4px; }
        .dr-btn { display: inline-flex; align-items: center; gap: 7px; height: 36px; padding: 0 14px; border-radius: 999px; border: 1px solid #d9d9d9; background: #fff; color: #4b5563; font-size: 13.5px; font-weight: 500; cursor: pointer; transition: border-color .15s ease, color .15s ease, background .15s ease; }
        .dr-btn:hover { border-color: #9ca3af; color: #111827; }
        .dr-btn.is-active { border-color: #5b8def; color: #3d70de; background: #eef3fd; }
        .dr-clear { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border: none; border-radius: 50%; background: transparent; color: #9ca3af; cursor: pointer; }
        .dr-clear:hover { color: #111827; background: #f3f4f6; }
        .dr-back { display: none; }
        .dr-panel { position: absolute; right: 0; top: calc(100% + 8px); z-index: 30; width: 340px; padding: 20px; border-radius: 18px; background: #fff; border: 1px solid #e5e5e5; box-shadow: 0 12px 32px rgba(0,0,0,.14); animation: dr-in .16s ease-out; }
        @keyframes dr-in { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }
        .dr-presets { display: flex; flex-wrap: wrap; gap: 8px; margin: 14px 0 16px; }
        .dr-preset { height: 32px; padding: 0 13px; border: none; border-radius: 999px; background: #f3f4f8; color: #1f2937; font-size: 13px; font-weight: 500; cursor: pointer; transition: background .12s ease; }
        .dr-preset:hover { background: #e6e9f5; }
        .dr-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
        .dr-nav { display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; border: none; border-radius: 999px; background: transparent; color: #1c1c1c; cursor: pointer; }
        .dr-nav:hover:not(:disabled) { background: #f0efec; }
        .dr-nav:disabled { color: #c9c9c9; cursor: default; }
        .dr-grid { width: 100%; border-collapse: collapse; table-layout: fixed; user-select: none; }
        .dr-grid th { font-size: 12px; font-weight: 500; color: #6b6b6b; padding: 4px 0 6px; text-align: center; }
        .dr-grid td { padding: 1px 0; text-align: center; }
        .dr-day { position: relative; width: 100%; height: 36px; border: 0; background: transparent; font-size: 14px; color: #1c1c1c; cursor: pointer; border-radius: 999px; }
        .dr-day:hover:not([aria-disabled='true']):not(.is-edge) { background: #f0efec; }
        .dr-day[aria-disabled='true'] { color: #c4c4c4; cursor: default; }
        .dr-day.is-out { color: #a8a8a8; }
        .dr-day.is-today::after { content: ''; position: absolute; left: 50%; bottom: 4px; width: 4px; height: 4px; margin-left: -2px; border-radius: 50%; background: #1c1c1c; }
        .dr-day.in-range { background: #eef3fd; border-radius: 0; }
        .dr-day.is-edge { background: #5b8def; color: #fff; font-weight: 700; }
        .dr-day.is-edge.is-today::after { background: #fff; }
        .dr-day.is-start.has-range { border-radius: 999px 0 0 999px; }
        .dr-day.is-end.has-range { border-radius: 0 999px 999px 0; }
        .dr-day:focus-visible, .dr-nav:focus-visible, .dr-btn:focus-visible { outline: 2px solid #5b8def; outline-offset: 2px; }
        .dr-sum { margin-top: 10px; padding-top: 10px; border-top: 1px solid #ececec; font-size: 14px; font-weight: 600; color: #1c1c1c; }
        .dr-sum small { display: block; margin-top: 2px; font-size: 12px; font-weight: 400; color: #6b6b6b; }
        .dr-foot { display: flex; align-items: center; justify-content: space-between; margin-top: 18px; }
        .dr-reset { border: none; background: transparent; font-size: 13px; font-weight: 500; color: #6b7280; cursor: pointer; }
        .dr-reset:hover { color: #111827; }
        .dr-apply { height: 40px; padding: 0 24px; border: none; border-radius: 999px; background: #5b8def; color: #fff; font-size: 13px; font-weight: 700; cursor: pointer; transition: background .15s ease; }
        .dr-apply:hover:not(:disabled) { background: #3d70de; }
        .dr-apply:disabled { background: #d8d8d8; cursor: default; }
        @media (max-width: 767px) {
          .dr-back { display: block; position: fixed; inset: 0; z-index: 69; background: rgba(15, 18, 25, .4); }
          .dr-panel { position: fixed; left: 0; right: 0; top: auto; bottom: 0; width: auto; z-index: 70; max-height: min(88vh, calc(100dvh - 16px)); overflow-y: auto; overscroll-behavior: contain; border: 0; border-radius: 20px 20px 0 0; padding: 10px 20px calc(16px + env(safe-area-inset-bottom)); box-shadow: 0 -14px 40px rgba(16, 24, 40, .24); animation: none; }
          .dr-panel::before { content: ''; display: block; width: 40px; height: 4px; margin: 0 auto 14px; border-radius: 2px; background: #d5d8de; }
          .dr-preset { height: 44px; padding: 0 16px; font-size: 14px; }
          .dr-nav { width: 44px; height: 44px; }
          .dr-day { height: 44px; font-size: 15px; }
          .dr-apply { height: 48px; padding: 0 28px; font-size: 14px; }
        }
        @media (prefers-reduced-motion: reduce) { .dr-panel { animation: none; } }
      `}</style>
      <button type="button" className={`dr-btn${value ? ' is-active' : ''}`} aria-haspopup="dialog" aria-expanded={open} onClick={() => (open ? setOpen(false) : openPanel())}>
        <CalendarDays size={16} strokeWidth={2} aria-hidden />
        <span>{label}</span>
      </button>
      {value && (
        <button type="button" className="dr-clear" aria-label="날짜 필터 해제" title="해제" onClick={() => onChange(null)}>
          <X size={16} strokeWidth={2.2} />
        </button>
      )}
      {open && (
        <>
          <div className="dr-back" aria-hidden onClick={() => setOpen(false)} />
          <div className="dr-panel" role="dialog" aria-label="기간 선택">
            <p style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#111827' }}>날짜별 보기</p>
            <p style={{ margin: '3px 0 0', fontSize: 13, color: '#6b7280' }}>기간을 고르면 그때 발행된 글만 모아 보여 드려요(KST).</p>
            <div className="dr-presets">
              <button type="button" className="dr-preset" onClick={() => preset('0')}>오늘</button>
              <button type="button" className="dr-preset" onClick={() => preset('7')}>최근 7일</button>
              <button type="button" className="dr-preset" onClick={() => preset('30')}>최근 30일</button>
              <button type="button" className="dr-preset" onClick={() => preset('month')}>이번 달</button>
            </div>
            <div className="dr-head">
              <button type="button" className="dr-nav" aria-label="이전 달" onClick={() => setView(new Date(y, m - 1, 1))}>
                <ChevronLeft size={18} strokeWidth={2.2} />
              </button>
              <span style={{ fontSize: 15, fontWeight: 700, color: '#1c1c1c' }} aria-live="polite">
                {y}년 {m + 1}월
              </span>
              <button type="button" className="dr-nav" aria-label="다음 달" disabled={nextDisabled} onClick={() => setView(new Date(y, m + 1, 1))}>
                <ChevronRight size={18} strokeWidth={2.2} />
              </button>
            </div>
            <table className="dr-grid" role="grid">
              <thead>
                <tr>
                  {WEEK.map((w) => (
                    <th key={w} scope="col">
                      {w}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: weeks }, (_, r) => (
                  <tr key={r}>
                    {cells.slice(r * 7, r * 7 + 7).map((d) => {
                      const k = keyOf(d);
                      const out = d.getMonth() !== m;
                      const disabled = k > today;
                      const isStart = !!lo && k === lo;
                      const isEnd = !!hi && k === hi;
                      const inRange = !!lo && !!rangeEnd && rangeEnd !== lo && k > lo && k < rangeEnd;
                      const hasRange = !!lo && !!rangeEnd && rangeEnd !== lo && (k === lo || k === rangeEnd);
                      const cls = ['dr-day', out && 'is-out', k === today && 'is-today', (isStart || isEnd) && 'is-edge', isStart && 'is-start', isEnd && 'is-end', inRange && 'in-range', hasRange && 'has-range'].filter(Boolean).join(' ');
                      return (
                        <td key={k} role="gridcell">
                          <button type="button" className={cls} aria-disabled={disabled || undefined} aria-pressed={isStart || isEnd || undefined} aria-label={`${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`} onClick={() => pick(k)} onMouseEnter={() => setHover(k)}>
                            {d.getDate()}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="dr-sum" aria-live="polite">
              {lo ? (
                <>
                  {dot(lo)} – {hi ? dot(hi) : '오늘'}
                  {!hi && <small>끝나는 날을 고르거나, 같은 날을 다시 눌러 하루만 볼 수 있어요.</small>}
                </>
              ) : (
                '시작일을 선택하세요'
              )}
            </div>
            <div className="dr-foot">
              <button
                type="button"
                className="dr-reset"
                onClick={() => {
                  onChange(null);
                  setOpen(false);
                }}
              >
                초기화
              </button>
              <button type="button" className="dr-apply" disabled={!lo} onClick={() => lo && apply(lo, hi || today)}>
                적용
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
