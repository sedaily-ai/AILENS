"use client";

import { useEffect, useRef, useState } from "react";

// 네이티브 <input type="date">는 OS 기본 위젯이라 스타일을 못 입힌다 —
// DateRangeCalendar.tsx(발행일 범위 필터)와 같은 팝오버·accent 톤으로
// 통일해달라는 요청(2026-08-07 "공통되게 해주시죠")에 맞춘 단일 날짜 버전.
// 달력 그리드/팝오버 로직은 DateRangeCalendar.tsx와 의도적으로 같은 모양
// (외부 의존성 없이 직접 구현, zero-new-dependency).

interface Props {
  value: string; // YYYY-MM-DD
  onChange: (v: string) => void;
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseYmd(s: string): Date {
  const [y, m, d] = s.split("-").map((n) => parseInt(n, 10));
  return new Date(y, m - 1, d);
}

function displayLabel(s: string): string {
  const [y, m, d] = s.split("-");
  return `${y}.${m}.${d}`;
}

function buildMonthGrid(year: number, month: number): Array<Date | null> {
  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: Array<Date | null> = Array(first.getDay()).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  return cells;
}

export function DatePickerField({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [viewDate, setViewDate] = useState(() => (value ? parseYmd(value) : new Date()));
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  // 팝오버를 열 때마다 현재 선택된 날짜가 있는 달을 보여준다 — "열림"이라는
  // 상호작용 이벤트에 반응하는 것이라 prop 변화 렌더 중 동기 조정 패턴으로
  // 옮기기 어색해서(값 자체가 아니라 "open으로 전환되는 순간"이 트리거)
  // effect로 유지, CLAUDE.md의 AuthGuard.tsx 예외와 같은 근거로 명시
  // (2026-08-23 set-state-in-effect 린트 정리).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (open && value) setViewDate(parseYmd(value));
  }, [open, value]);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const cells = buildMonthGrid(year, month);
  const todayStr = ymd(new Date());
  const label = value ? displayLabel(value) : "날짜 선택";

  return (
    <div className="relative inline-block" ref={rootRef}>
      {/* 분류(CustomSelect) 옆엔 ▾가 있어 "누를 수 있다"가 바로 읽히는데
          여긴 텍스트뿐이라 고정값처럼 보인다는 지적(2026-08-09) — 같은
          쉐브론을 붙여서 두 컨트롤이 같은 신호를 쓰게 맞췄다. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex cursor-pointer items-center gap-1 text-[12.5px] font-medium outline-none"
        style={{ color: value ? "var(--text-primary)" : "var(--text-muted)" }}
      >
        {label}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-gray-400">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div
          className="absolute z-20 mt-2 rounded-xl border p-4"
          style={{
            width: 240,
            background: "var(--surface-card)",
            borderColor: "var(--border-hairline)",
            boxShadow: "var(--shadow-md)",
          }}
        >
          <div className="mb-3 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setViewDate(new Date(year, month - 1, 1))}
              className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg hover:bg-[var(--surface-sunken)]"
              aria-label="이전 달"
            >
              ‹
            </button>
            <span className="text-[13.5px] font-semibold" style={{ color: "var(--text-primary)" }}>
              {year}년 {month + 1}월
            </span>
            <button
              type="button"
              onClick={() => setViewDate(new Date(year, month + 1, 1))}
              className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg hover:bg-[var(--surface-sunken)]"
              aria-label="다음 달"
            >
              ›
            </button>
          </div>

          <div className="mb-1 grid grid-cols-7">
            {WEEKDAYS.map((w) => (
              <div key={w} className="text-center text-[11px] font-medium" style={{ color: "var(--text-faint)" }}>
                {w}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-y-1">
            {cells.map((d, i) => {
              if (!d) return <div key={i} />;
              const s = ymd(d);
              const selected = s === value;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    onChange(s);
                    setOpen(false);
                  }}
                  className="h-7 cursor-pointer rounded-lg text-[12.5px] transition-colors"
                  style={{
                    background: selected ? "var(--accent)" : undefined,
                    color: selected ? "#fff" : s === todayStr ? "var(--accent)" : "var(--text-secondary)",
                    fontWeight: selected || s === todayStr ? 700 : 400,
                  }}
                >
                  {d.getDate()}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
