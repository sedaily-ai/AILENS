import { useEffect, useRef, useState } from "react";

// 다중 선택 필터(채널) — 2026-08-09, "체크박스가 있어야 오늘의 이슈·머니
// 트렌드를 동시에 체크해서 필터할 수 있잖아요" 요청으로 단일 선택
// ColumnFilterHeader와 별도로 뽑았다. 빈 Set = "전체"(필터 없음), 아무거나
// 하나라도 체크하면 그 채널들의 합집합만 보여준다. 체크박스가 라디오보다
// 줄 높이가 필요해서 팝오버 폭도 같이 키웠다("드롭다운 사이즈를 더
// 키워야" 요청).
export function ColumnFilterHeaderMulti({
  label,
  values,
  options,
  onChange,
}: {
  label: string;
  values: Set<string>;
  options: Array<{ value: string; label: string }>;
  onChange: (next: Set<string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const isActive = values.size > 0;

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const toggle = (v: string) => {
    const next = new Set(values);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    onChange(next);
  };

  return (
    <div className="relative inline-block" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex cursor-pointer items-center gap-1 outline-none"
      >
        <span style={{ color: isActive ? "var(--accent)" : "var(--text-muted)" }}>
          {label}
          {isActive && ` (${values.size})`}
        </span>
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
          className="absolute z-20 mt-1.5 min-w-[200px] rounded-xl border p-1.5"
          style={{ background: "var(--surface-card)", borderColor: "var(--border-hairline)", boxShadow: "var(--shadow-md)" }}
        >
          {options.map((o) => (
            <label
              key={o.value}
              className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-[12.5px] font-medium transition-colors hover:bg-[var(--surface-sunken)]"
              style={{ color: values.has(o.value) ? "var(--accent)" : "var(--text-secondary)" }}
            >
              <input
                type="checkbox"
                checked={values.has(o.value)}
                onChange={() => toggle(o.value)}
                className="cursor-pointer"
              />
              {o.label}
            </label>
          ))}
          {isActive && (
            <>
              <div className="my-1 border-t" style={{ borderColor: "var(--border-hairline)" }} />
              <button
                type="button"
                onClick={() => onChange(new Set())}
                className="block w-full cursor-pointer rounded-lg px-2.5 py-1.5 text-left text-[12.5px] font-medium transition-colors hover:bg-[var(--surface-sunken)]"
                style={{ color: "var(--text-muted)" }}
              >
                전체 해제
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
