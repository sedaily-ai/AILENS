"use client";

import { useEffect, useRef, useState } from "react";

// 네이티브 <select>는 스타일을 못 입힌다 — DateRangeCalendar.tsx와 같은
// 팝오버/accent 톤으로 통일해달라는 요청(2026-08-07 "공통되게 해주시죠")에
// 맞춘 범용 드롭다운. 외부 의존성 없이 직접 구현(zero-new-dependency).

interface Option<T extends string> {
  value: T;
  label: string;
}

interface Props<T extends string> {
  value: T;
  options: Option<T>[];
  onChange: (v: T) => void;
  placeholder?: string;
}

export function CustomSelect<T extends string>({ value, options, onChange, placeholder }: Props<T>) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const current = options.find((o) => o.value === value);

  return (
    <div className="relative inline-block" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex cursor-pointer items-center gap-1 outline-none"
      >
        <span
          className="text-[12.5px] font-medium"
          style={{ color: current ? "var(--text-primary)" : "var(--text-muted)" }}
        >
          {current?.label ?? placeholder ?? "선택"}
        </span>
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          className="text-gray-400"
          aria-hidden="true"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div
          className="absolute z-20 mt-1.5 min-w-[140px] rounded-xl border p-1"
          style={{
            background: "var(--surface-card)",
            borderColor: "var(--border-hairline)",
            boxShadow: "var(--shadow-md)",
          }}
        >
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
              className="block w-full cursor-pointer rounded-lg px-2.5 py-1.5 text-left text-[12.5px] font-medium transition-colors hover:bg-[var(--surface-sunken)]"
              style={{
                color: o.value === value ? "var(--accent)" : "var(--text-secondary)",
                background: o.value === value ? "var(--accent-soft)" : undefined,
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
