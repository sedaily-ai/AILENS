"use client";

import { useEffect, useRef, useState } from "react";

// 발행일 범위 필터용 커스텀 캘린더(2026-08-07) — "시작일~끝일로 필터링하고
// 캘린더에서 선택 가능하게, 커스터마이징 디자인으로" 요청. 관리자 콘솔은
// 외부 의존성을 안 쓰는 정책(zero-new-dependency, admin/CLAUDE.md)이라
// 날짜 계산·팝오버·범위 하이라이트를 전부 직접 구현했다 — 사이트 나머지
// 화면(ui-card, --accent 토큰)과 같은 톤으로.
//
// 2026-08-09 — 세 번째 개정. 1차: 버튼 하나 + 두 달짜리 달력 팝오버
// (에어비앤비 스타일). 2차: "시작일/끝일 두 칸을 미리 보여주고, 값도
// 미리 표출하고, 왼쪽 칸에서 고르면 자동으로 오른쪽 칸으로 넘어가게" 요청 —
// 라벨(시작일/끝일) + 값을 세로로 쌓은 두 칸, 사이는 "~". 3차(최종, 참고
// 스크린샷 "Nova Backoffice" 대시보드 제시 — "이런거 상상하고 말씀드린거")로
// 더 간결한 한 줄 칸(달력 아이콘 + 값, 라벨은 빈 값일 때 placeholder로만)에
// "~" 대신 "→"로 연결하고, 자주 쓰는 구간을 바로 고르는 프리셋
// (오늘/7일/30일/이번 달/지난 달/전체)을 추가했다. 참고 화면의 바깥쪽
// ‹ › 기간 이동 화살표는 추이 비교가 핵심인 분석 대시보드용 기능이라
// (전/후 기간을 통째로 밀어보는 용도), 목록 필터일 뿐인 여기 스코프에서는
// 뺐다 — "전체" 프리셋이 사실상 기존의 ✕ 초기화 버튼 역할을 겸해서
// 별도 초기화 버튼도 없앴다.

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

function CalendarIcon() {
  return (
    <svg
      className="h-3.5 w-3.5 flex-shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="4.5" width="18" height="16" rx="3" />
      <path d="M3 9.5h18M8 2.5v4M16 2.5v4" />
    </svg>
  );
}

/** 시작일/끝일 칸 하나 — 달력 아이콘 + 값(비어있으면 placeholder) 한 줄,
 * 독립된 한 달짜리 달력 팝오버. 열림 상태는 부모(DateRangeCalendar)가
 * 들고 있다 — 시작일에서 고르면 끝일 칸을 대신 열어줘야(자동 진행) 해서
 * 형제 컴포넌트끼리 조율이 필요. */
function DateBox({
  placeholder,
  value,
  today,
  open,
  onOpen,
  onClose,
  onPick,
}: {
  placeholder: string;
  value: string | null;
  today: string;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onPick: (d: Date) => void;
}) {
  const [viewDate, setViewDate] = useState(() => (value ? parseYmd(value) : new Date()));
  const rootRef = useRef<HTMLDivElement>(null);

  // 열 때 현재 선택된 날짜가 있는 달을 보여준다 — effect로 open 변화를
  // 감시하는 대신, 여는 동작(버튼 클릭) 그 자리에서 바로 동기화한다
  // (react-hooks/set-state-in-effect 회피, 2026-08-09).
  const openWithSync = () => {
    setViewDate(value ? parseYmd(value) : new Date());
    onOpen();
  };

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open, onClose]);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const cells = buildMonthGrid(year, month);

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => (open ? onClose() : openWithSync())}
        className="flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1.5 transition-colors hover:bg-[var(--surface-sunken)]"
        style={{ background: open ? "var(--surface-sunken)" : undefined, color: "var(--text-faint)" }}
      >
        <CalendarIcon />
        <span
          className="text-[12.5px] font-medium tabular-nums"
          style={{ color: value ? "var(--text-primary)" : "var(--text-muted)" }}
        >
          {value ? displayLabel(value) : placeholder}
        </span>
      </button>

      {open && (
        <div
          className="absolute z-20 mt-1.5 rounded-xl border p-4"
          style={{ width: 240, background: "var(--surface-card)", borderColor: "var(--border-hairline)", boxShadow: "var(--shadow-md)" }}
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
                  onClick={() => onPick(d)}
                  className="h-7 cursor-pointer rounded-lg text-[12.5px] transition-colors"
                  style={{
                    background: selected ? "var(--accent)" : undefined,
                    color: selected ? "#fff" : s === today ? "var(--accent)" : "var(--text-secondary)",
                    fontWeight: selected || s === today ? 700 : 400,
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

function startOfMonth(base: Date, offset = 0): Date {
  return new Date(base.getFullYear(), base.getMonth() + offset, 1);
}

// 자주 쓰는 구간 바로 고르기 — "오늘"만 있으면 상시 계산해도 되지만, 이 중
// 아무거나 지금 선택값과 일치하는지 매 렌더 비교해서 활성 표시를 해준다
// (참고 화면에서도 프리셋이 눌린 상태로 강조돼 있었다).
const PRESETS: Array<{ label: string; range: (today: Date) => DateRange }> = [
  { label: "오늘", range: (t) => ({ from: ymd(t), to: ymd(t) }) },
  {
    label: "7일",
    range: (t) => {
      const from = new Date(t);
      from.setDate(t.getDate() - 6);
      return { from: ymd(from), to: ymd(t) };
    },
  },
  {
    label: "30일",
    range: (t) => {
      const from = new Date(t);
      from.setDate(t.getDate() - 29);
      return { from: ymd(from), to: ymd(t) };
    },
  },
  { label: "이번 달", range: (t) => ({ from: ymd(startOfMonth(t)), to: ymd(t) }) },
  {
    label: "지난 달",
    range: (t) => {
      const from = startOfMonth(t, -1);
      const to = new Date(startOfMonth(t).getTime() - 1);
      return { from: ymd(from), to: ymd(to) };
    },
  },
  { label: "전체", range: () => ({ from: null, to: null }) },
];

export function DateRangeCalendar({ value, onChange }: Props) {
  const [openField, setOpenField] = useState<null | "from" | "to">(null);
  const today = new Date();
  const todayStr = ymd(today);

  const pickFrom = (d: Date) => {
    const picked = ymd(d);
    // 새 시작일이 기존 끝일보다 늦어지면 끝일은 무효가 되니 비운다.
    const to = value.to && value.to < picked ? null : value.to;
    onChange({ from: picked, to });
    setOpenField("to"); // 자동 진행 — 시작일 고르면 바로 끝일 칸으로.
  };

  const pickTo = (d: Date) => {
    const picked = ymd(d);
    // 끝일을 시작일보다 이르게 고르면 자연스럽게 순서를 바꿔준다.
    if (value.from && picked < value.from) {
      onChange({ from: picked, to: value.from });
    } else {
      onChange({ from: value.from, to: picked });
    }
    setOpenField(null);
  };

  return (
    <div className="flex items-center gap-1">
      <DateBox
        placeholder="시작일"
        value={value.from}
        today={todayStr}
        open={openField === "from"}
        onOpen={() => setOpenField("from")}
        onClose={() => setOpenField((f) => (f === "from" ? null : f))}
        onPick={pickFrom}
      />
      <span className="text-[13px]" style={{ color: "var(--text-faint)" }}>
        →
      </span>
      <DateBox
        placeholder="끝일"
        value={value.to}
        today={todayStr}
        open={openField === "to"}
        onOpen={() => setOpenField("to")}
        onClose={() => setOpenField((f) => (f === "to" ? null : f))}
        onPick={pickTo}
      />

      <div className="ml-1.5 flex items-center gap-0.5 border-l pl-2" style={{ borderColor: "var(--border-hairline)" }}>
        {PRESETS.map((p) => {
          const r = p.range(today);
          const active = r.from === value.from && r.to === value.to;
          return (
            <button
              key={p.label}
              type="button"
              onClick={() => {
                onChange(r);
                setOpenField(null);
              }}
              className="cursor-pointer rounded-lg px-2 py-1 text-[12px] font-medium transition-colors hover:bg-[var(--surface-sunken)]"
              style={{
                color: active ? "var(--accent)" : "var(--text-muted)",
                background: active ? "var(--accent-soft)" : undefined,
              }}
            >
              {p.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
