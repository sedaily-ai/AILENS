import { LABEL } from "./shared";

// 핵심 정리 / 키워드 — 한 줄에 한 항목. "+ 추가" 없이 줄바꿈만으로 늘고 준다.
export function LineList({
  label,
  hint,
  items,
  onChange,
  rows = 4,
  placeholder,
}: {
  label: string;
  hint?: string;
  items: string[];
  onChange: (next: string[]) => void;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <div>
      <label className={LABEL}>
        {label}
        {hint && <span className="ml-2 font-normal text-gray-500">{hint}</span>}
      </label>
      <textarea
        value={items.join("\n")}
        onChange={(e) => onChange(e.target.value.split("\n"))}
        rows={rows}
        placeholder={placeholder}
        className="ui-input w-full rounded-lg px-3 py-2.5 text-sm leading-relaxed"
      />
    </div>
  );
}
