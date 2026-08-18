import { CODE_LANGUAGES, DEFAULT_CODE_LANGUAGE, FORMATS, type PromptFormat } from "@/lib/prompt";

/* 형식 선택 — 세그먼트 컨트롤. 코드일 때만 언어 select 가 따라 나온다. */
export function FormatPicker({
  fieldId,
  format,
  language,
  onChange,
}: {
  fieldId: string;
  format: PromptFormat;
  language?: string;
  onChange: (next: { format: PromptFormat; language?: string }) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <div
        role="group"
        aria-label="입력 형식"
        className="inline-flex gap-0.5 rounded-lg p-0.5"
        style={{ background: "var(--surface-sunken)" }}
      >
        {FORMATS.map((f) => {
          const active = format === f.key;
          return (
            <button
              key={f.key}
              type="button"
              aria-pressed={active}
              onClick={() =>
                onChange({
                  format: f.key,
                  language:
                    f.key === "code" ? language ?? DEFAULT_CODE_LANGUAGE : language,
                })
              }
              className={`cursor-pointer rounded-[6px] px-2 py-0.5 text-[11px] transition-colors ${
                active ? "font-semibold" : "font-medium"
              }`}
              style={
                active
                  ? {
                      background: "var(--surface-card)",
                      color: "var(--text-primary)",
                      boxShadow: "var(--shadow-sm)",
                    }
                  : { color: "var(--text-muted)" }
              }
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {format === "code" && (
        <>
          <label htmlFor={`${fieldId}-lang`} className="sr-only">
            코드 언어
          </label>
          <select
            id={`${fieldId}-lang`}
            value={language ?? DEFAULT_CODE_LANGUAGE}
            onChange={(e) => onChange({ format: "code", language: e.target.value })}
            className="ui-input cursor-pointer rounded-lg px-1.5 py-0.5 text-[11px] font-medium"
          >
            {CODE_LANGUAGES.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </>
      )}
    </div>
  );
}
