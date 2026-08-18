import { useEffect, useRef, useState } from "react";

// 단일 선택 필터(상태) — 표 헤더 안 드롭다운(2026-08-09). 트리거 라벨은
// 선택값이 아니라 컬럼 제목("상태")으로 고정 — "전체"로 비어있을 때 다른
// 필터와 트리거 글자가 같아지는 걸 피한다. 필터가 걸려있을 때만 색으로
// 강조한다.
export function ColumnFilterHeader<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const isActive = value !== "";

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  return (
    <div className="relative inline-block" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex cursor-pointer items-center gap-1 outline-none"
      >
        <span style={{ color: isActive ? "var(--accent)" : "var(--text-muted)" }}>{label}</span>
        <svg
          width="9"
          height="9"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          style={{ color: isActive ? "var(--accent)" : "var(--text-faint)" }}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div
          className="absolute z-20 mt-1.5 min-w-[140px] rounded-xl border p-1"
          style={{ background: "var(--surface-card)", borderColor: "var(--border-hairline)", boxShadow: "var(--shadow-md)" }}
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
