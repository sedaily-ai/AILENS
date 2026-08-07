"use client";

import { useEffect, useRef, useState } from "react";

// 발행일 범위 필터용 커스텀 캘린더(2026-08-07) — "시작일~끝일로 필터링하고
// 캘린더에서 선택 가능하게, 커스터마이징 디자인으로" 요청. 관리자 콘솔은
// 외부 의존성을 안 쓰는 정책(zero-new-dependency, admin/CLAUDE.md)이라
// 날짜 계산·팝오버·범위 하이라이트를 전부 직접 구현했다 — 사이트 나머지
// 화면(ui-card, --accent 토큰)과 같은 톤으로.

export interface DateRange {
  from: string | null; // YYYY-MM-DD
  to: string | null;
}

interface Props {
  value: DateRange;
  onChange: (range: DateRange) => void;
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

// 그 달의 1일이 오는 요일만큼 앞을 비우고, 말일까지 날짜 배열을 만든다.
function buildMonthGrid(year: number, month: number): Array<Date | null> {
  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: Array<Date | null> = Array(first.getDay()).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  return cells;
}

export function DateRangeCalendar({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [viewDate, setViewDate] = useState(() => (value.from ? parseYmd(value.from) : new Date()));
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const cells = buildMonthGrid(year, month);
  const todayStr = ymd(new Date());

  const handlePick = (d: Date) => {
    const picked = ymd(d);
    // 아직 범위가 없거나 이미 완성된 범위면 새로 시작. 시작만 있으면 끝을 채운다
    // (끝이 시작보다 빠르면 순서를 뒤집어 준다 — 사용자가 거꾸로 눌러도 되게).
    if (!value.from || (value.from && value.to)) {
      onChange({ from: picked, to: null });
      return;
    }
    if (picked < value.from) {
      onChange({ from: picked, to: value.from });
    } else {
      onChange({ from: value.from, to: picked });
    }
    setOpen(false);
  };

  const inRange = (d: Date) => {
    if (!value.from) return false;
    const s = ymd(d);
    const end = value.to ?? value.from;
    return s >= value.from && s <= end;
  };
  const isEdge = (d: Date) => ymd(d) === value.from || ymd(d) === value.to;

  const label =
    value.from && value.to
      ? `${displayLabel(value.from)} ~ ${displayLabel(value.to)}`
      : value.from
        ? `${displayLabel(value.from)} ~`
        : "발행일 전체";

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-[13px] font-medium px-3 py-1.5 rounded-lg cursor-pointer transition-colors hover:bg-[var(--surface-sunken)]"
        style={{
          color: value.from ? "var(--accent)" : "var(--text-secondary)",
          background: value.from ? "var(--accent-soft)" : undefined,
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M8 3v4M16 3v4M3 10h18" />
        </svg>
        {label}
        {value.from && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              onChange({ from: null, to: null });
            }}
            className="ml-0.5 opacity-60 hover:opacity-100"
            aria-label="발행일 필터 지우기"
          >
            ✕
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute z-20 mt-2 rounded-2xl border p-4"
          style={{
            width: 288,
            background: "var(--surface-card)",
            borderColor: "var(--border-hairline)",
            boxShadow: "var(--shadow-md)",
          }}
        >
          <div className="flex items-center justify-between mb-3">
            <button
              type="button"
              onClick={() => setViewDate(new Date(year, month - 1, 1))}
              className="w-7 h-7 flex items-center justify-center rounded-lg cursor-pointer hover:bg-[var(--surface-sunken)]"
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
              className="w-7 h-7 flex items-center justify-center rounded-lg cursor-pointer hover:bg-[var(--surface-sunken)]"
              aria-label="다음 달"
            >
              ›
            </button>
          </div>

          <div className="grid grid-cols-7 mb-1">
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
              const edge = isEdge(d);
              const within = inRange(d);
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => handlePick(d)}
                  className="h-7 text-[12.5px] rounded-lg cursor-pointer transition-colors"
                  style={{
                    background: edge ? "var(--accent)" : within ? "var(--accent-soft)" : undefined,
                    color: edge ? "#fff" : s === todayStr ? "var(--accent)" : "var(--text-secondary)",
                    fontWeight: edge || s === todayStr ? 700 : 400,
                  }}
                >
                  {d.getDate()}
                </button>
              );
            })}
          </div>

          {value.from && (
            <button
              type="button"
              onClick={() => {
                onChange({ from: null, to: null });
                setOpen(false);
              }}
              className="mt-3 text-[12px] font-medium cursor-pointer hover:underline"
              style={{ color: "var(--text-muted)" }}
            >
              초기화
            </button>
          )}
        </div>
      )}
    </div>
  );
}
