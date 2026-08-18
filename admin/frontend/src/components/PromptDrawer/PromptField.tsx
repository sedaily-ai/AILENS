import { useRef, useState } from "react";
import {
  ATTACHMENT_ACCEPT,
  attachmentNote,
  formatBytes,
  readAttachment,
  sectionCharCount,
  shortFormatLabel,
  type PromptAttachment,
  type PromptSection,
} from "@/lib/prompt";
import { FormatPicker } from "./FormatPicker";
import { FileIcon, Icon, ICON } from "./Icons";

/* 항목 하나 = 라벨 + 형식 선택 + 파일 첨부 + textarea + 첨부 목록. */
export function PromptField({
  fieldId,
  label,
  hint,
  rows,
  placeholder,
  section,
  onChange,
  onError,
  textareaRef,
}: {
  fieldId: string;
  label: string;
  hint: string;
  rows: number;
  placeholder: string;
  section: PromptSection;
  onChange: (next: PromptSection) => void;
  onError: (message: string) => void;
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [readingName, setReadingName] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const addFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const added: PromptAttachment[] = [];
    const failed: string[] = [];
    for (const file of Array.from(files)) {
      // PDF 는 파싱이 눈에 보일 만큼 걸린다 — 어느 파일을 읽는 중인지 띄운다.
      setReadingName(file.name);
      try {
        added.push(await readAttachment(file));
      } catch (err) {
        failed.push(`${file.name} — ${(err as Error).message}`);
      }
    }
    setReadingName(null);

    if (added.length > 0) {
      // 같은 이름은 새로 읽은 쪽으로 교체한다(수정한 파일 다시 첨부하는 흐름).
      const names = new Set(added.map((a) => a.name));
      onChange({
        ...section,
        attachments: [
          ...section.attachments.filter((a) => !names.has(a.name)),
          ...added,
        ],
      });
    }
    if (failed.length > 0) onError(failed.join(" / "));
  };

  const removeAttachment = (name: string) => {
    if (preview === name) setPreview(null);
    onChange({
      ...section,
      attachments: section.attachments.filter((a) => a.name !== name),
    });
  };

  const chars = sectionCharCount(section);

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <label htmlFor={fieldId} className="text-xs font-semibold text-gray-700">
          {label}
          <span className="ml-2 font-normal text-gray-500">{hint}</span>
        </label>
        {chars > 0 && (
          <span className="text-[11px] tabular-nums text-[var(--text-faint)]">
            {chars.toLocaleString("ko-KR")}자
          </span>
        )}
      </div>

      <div className="mb-1.5 flex items-center justify-between gap-2">
        <FormatPicker
          fieldId={fieldId}
          format={section.format}
          language={section.language}
          onChange={(next) => onChange({ ...section, ...next })}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={readingName !== null}
          className="ui-btn inline-flex flex-shrink-0 items-center gap-1 text-xs font-medium text-[var(--accent)] hover:text-[var(--accent-hover)]"
        >
          {readingName !== null ? (
            <span className="ui-spinner h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <Icon d={ICON.clip} className="h-3.5 w-3.5" />
          )}
          파일 첨부
        </button>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept={ATTACHMENT_ACCEPT}
          className="hidden"
          onChange={(e) => {
            void addFiles(e.target.files);
            e.target.value = ""; // 같은 파일 재선택도 동작하게
          }}
        />
      </div>

      {/* textarea 위로 파일을 끌어다 놓아도 첨부된다. */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void addFiles(e.dataTransfer.files);
        }}
        className={`rounded-lg transition-shadow ${
          dragging ? "ring-2 ring-[var(--accent)] ring-offset-1" : ""
        }`}
      >
        <textarea
          id={fieldId}
          ref={textareaRef}
          value={section.text}
          onChange={(e) => onChange({ ...section, text: e.target.value })}
          rows={rows}
          placeholder={dragging ? "여기에 놓으면 첨부됩니다" : placeholder}
          spellCheck={section.format === "code" ? false : undefined}
          className={`ui-input w-full rounded-lg px-3 py-2 leading-relaxed ${
            section.format === "code" ? "font-mono text-[13px]" : "text-sm"
          }`}
        />
      </div>

      {readingName !== null && (
        <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
          <span className="ui-spinner h-3 w-3" aria-hidden="true" />
          <span className="truncate">{readingName} 읽는 중…</span>
        </p>
      )}

      {section.attachments.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {section.attachments.map((a) => {
            const isOpen = preview === a.name;
            const note = attachmentNote(a);
            return (
              <li key={a.name} className="ui-card overflow-hidden rounded-lg">
                <div className="flex items-center gap-2 px-2.5 py-1.5">
                  <FileIcon className="h-4 w-4 flex-shrink-0 text-[var(--text-faint)]" />
                  <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--text-secondary)]">
                    {a.name}
                    {note && (
                      <span
                        className="ml-1.5 text-[11px]"
                        style={{
                          color: a.truncated ? "var(--warn)" : "var(--text-muted)",
                        }}
                      >
                        {note}
                      </span>
                    )}
                  </span>
                  <span
                    className="flex-shrink-0 rounded px-1.5 text-[10px] font-semibold tracking-wide"
                    style={{
                      background: "var(--surface-sunken)",
                      color: "var(--text-muted)",
                    }}
                  >
                    {shortFormatLabel(a)}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPreview(isOpen ? null : a.name)}
                    aria-expanded={isOpen}
                    className="flex-shrink-0 cursor-pointer text-[11px] font-medium text-[var(--accent)] hover:text-[var(--accent-hover)]"
                  >
                    {isOpen ? "접기" : "미리보기"}
                  </button>
                  <span className="flex-shrink-0 text-[11px] tabular-nums text-[var(--text-muted)]">
                    {formatBytes(a.size)}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeAttachment(a.name)}
                    className="flex-shrink-0 cursor-pointer px-1 text-xs text-gray-500 hover:text-red-600"
                    aria-label={`${a.name} 첨부 제거`}
                  >
                    ×
                  </button>
                </div>
                {isOpen && (
                  // 큰 파일을 전부 DOM 에 붓지 않는다 — 앞부분만 보여준다.
                  <pre
                    className="ui-divider max-h-40 overflow-auto whitespace-pre-wrap break-words border-t px-2.5 py-2 font-mono text-[11px] leading-relaxed"
                    style={{
                      background: "var(--surface-sunken)",
                      color: "var(--text-secondary)",
                    }}
                  >
                    {a.content.slice(0, 4000)}
                    {a.content.length > 4000 ? "\n…" : ""}
                  </pre>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
