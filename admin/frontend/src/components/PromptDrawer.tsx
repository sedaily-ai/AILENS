"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AdminApiError, adminApi } from "@/lib/adminClient";
import { useToast } from "@/components/Toast";
import {
  ATTACHMENT_ACCEPT,
  CODE_LANGUAGES,
  DEFAULT_CODE_LANGUAGE,
  DEFAULT_SCOPE_ID,
  FORMATS,
  MAX_ATTACHMENT_BYTES,
  MAX_PDF_BYTES,
  PROMPT_PAYLOAD_LIMIT_BYTES,
  SCOPE_KIND_LABEL,
  SECTION_DEFS,
  attachmentNote,
  buildPromptText,
  emptyPreset,
  formatBytes,
  payloadBytes,
  presetCharCount,
  presetFromDetail,
  presetHasContent,
  promptIdFor,
  readAttachment,
  samePresetContent,
  scopeGroups,
  scopeLabel,
  sectionCharCount,
  shortFormatLabel,
  type PromptAttachment,
  type PromptFormat,
  type PromptPreset,
  type PromptSection,
  type PromptSectionKey,
} from "@/lib/prompt";
import type { PromptHistoryEntry } from "@/lib/types";

/* 콘텐츠 목록 화면(글 관리·영상·웹툰)의 "프롬프트" 버튼이 여는 우측 슬라이드 패널.
   2026-08-09 의 정중앙 모달(PromptEditModal)을 대체한다.

   구조: 상태 탭(초안·발행) → 각 상태가 백엔드 프롬프트 id 하나(<channel>/<scope>).
         상태별로 설명·구조·지침 3섹션, 섹션마다
           · 형식(Markdown · 텍스트 · 코드+언어)을 골라 직접 입력하거나
           · 텍스트 기반 파일·PDF 를 첨부한다(본문을 읽어 보관 → 프롬프트에 들어간다).

   저장은 기존 백엔드를 그대로 쓴다 — POST /admin/prompts/{category}/{name} 이
   새 버전(v#N)을 쌓고, 산문은 content, 구조는 sections 로 나눠 보낸다. 이력·
   버전 표시는 모달에 있던 걸 유지했다. 데이터 규칙은 전부 @/lib/prompt. */

const ICON = {
  clip: "M21.44 11.05 12.25 20.24a5 5 0 0 1-7.07-7.07l9.19-9.19a3.5 3.5 0 0 1 4.95 4.95l-8.49 8.49a2 2 0 0 1-2.83-2.83l7.78-7.78",
  close: "M18 6 6 18M6 6l12 12",
  copy: "M9 9V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-4M3 11a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z",
} as const;

const Icon = ({ d, className }: { d: string; className?: string }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d={d} />
  </svg>
);

const FileIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
    <path d="M14 2v6h6" />
  </svg>
);

/* 상태 탭. 점 표시: 노랑=저장 안 된 변경, 회색=저장된 내용 있음.
   렌더 밖에 둔다(Sidebar 규칙과 같은 이유 — 안에 정의하면 매 렌더마다 새
   컴포넌트 타입이 생겨 하위 트리가 리마운트된다). */
function ScopeTabs({
  activeId,
  dirtyIds,
  filledIds,
  onSelect,
}: {
  activeId: string;
  dirtyIds: string[];
  filledIds: string[];
  onSelect: (id: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      {scopeGroups().map((group) => (
        <div key={group.kind} className="flex items-center gap-1.5">
          <span className="w-7 flex-shrink-0 text-[10px] font-semibold tracking-wide text-[var(--text-faint)]">
            {SCOPE_KIND_LABEL[group.kind]}
          </span>
          <div className="flex flex-wrap gap-1">
            {group.scopes.map((scope) => {
              const active = scope.id === activeId;
              const isDirty = dirtyIds.includes(scope.id);
              const isFilled = filledIds.includes(scope.id);
              return (
                <button
                  key={scope.id}
                  type="button"
                  onClick={() => onSelect(scope.id)}
                  aria-pressed={active}
                  title={scope.hint}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] cursor-pointer transition-colors ${
                    active
                      ? "font-semibold"
                      : "font-medium hover:bg-[var(--surface-sunken)]"
                  }`}
                  style={{
                    background: active ? "var(--accent-soft)" : undefined,
                    color: active ? "var(--accent)" : "var(--text-secondary)",
                  }}
                >
                  {scope.label}
                  {(isDirty || isFilled) && (
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{
                        background: isDirty ? "var(--warn)" : "var(--text-faint)",
                      }}
                      title={isDirty ? "저장 안 된 변경" : "저장된 프롬프트 있음"}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/* 형식 선택 — 세그먼트 컨트롤. 코드일 때만 언어 select 가 따라 나온다. */
function FormatPicker({
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

/* 항목 하나 = 라벨 + 형식 선택 + 파일 첨부 + textarea + 첨부 목록. */
function PromptField({
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

/** 스코프 하나의 서버 상태. */
interface ScopeState {
  saved: PromptPreset; // 서버에 있는 것
  draft: PromptPreset; // 편집 중인 것
  version: number; // 0 = 아직 서버에 없음
  history: PromptHistoryEntry[];
  loading: boolean;
  error: string | null;
}

const emptyScopeState = (): ScopeState => ({
  saved: emptyPreset(),
  draft: emptyPreset(),
  version: 0,
  history: [],
  loading: true,
  error: null,
});

interface Props {
  /** 콘텐츠 채널 — 프롬프트 id 의 category 가 된다 (letters · video · webtoon). */
  channel: string;
  open: boolean;
  onClose: () => void;
}

export function PromptDrawer({ channel, open, onClose }: Props) {
  const toast = useToast();
  const [scopeId, setScopeId] = useState<string>(DEFAULT_SCOPE_ID);
  const [states, setStates] = useState<Record<string, ScopeState>>({});
  const [saving, setSaving] = useState(false);
  const firstFieldRef = useRef<HTMLTextAreaElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  const state = states[scopeId];
  const preset = state?.draft ?? emptyPreset();

  const load = useCallback(
    async (scope: string, { silent = false } = {}) => {
      const promptId = promptIdFor(channel, scope);
      const slash = promptId.indexOf("/");
      const category = promptId.slice(0, slash);
      const name = promptId.slice(slash + 1);

      if (!silent) {
        setStates((s) => ({ ...s, [scope]: s[scope] ?? emptyScopeState() }));
      }
      try {
        const detail = await adminApi.getPrompt(category, name);
        const loaded = presetFromDetail(detail);
        setStates((s) => ({
          ...s,
          [scope]: {
            saved: loaded,
            // 편집 중인 내용은 지키지 않는다 — 저장 직후 재조회 경로라 draft==saved 가 맞다.
            draft: structuredClone(loaded),
            version: detail.active_version,
            history: detail.history ?? [],
            loading: false,
            error: null,
          },
        }));
      } catch (err) {
        // 404 는 "아직 안 만든 프롬프트"다 — 에러가 아니라 빈 폼으로 시작한다.
        // 저장하면 백엔드가 v#1 로 만들어 준다(handle_update upsert).
        const notFound = err instanceof AdminApiError && err.status === 404;
        setStates((s) => ({
          ...s,
          [scope]: {
            saved: emptyPreset(),
            draft: emptyPreset(),
            version: 0,
            history: [],
            loading: false,
            error: notFound
              ? null
              : err instanceof AdminApiError
                ? err.message
                : "불러오기 실패",
          },
        }));
      }
    },
    [channel]
  );

  // 열릴 때 모든 스코프를 한 번에 받아 둔다 — 탭을 눌렀을 때 기다리지 않게,
  // 그리고 어느 상태에 프롬프트가 있는지 점으로 바로 보여주려면 필요하다.
  useEffect(() => {
    if (!open) return;
    for (const scope of scopeGroups().flatMap((g) => g.scopes)) {
      void load(scope.id);
    }
  }, [open, load]);

  // 배경 스크롤 잠금 + 첫 입력칸 포커스 — open 이 바뀔 때만.
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    firstFieldRef.current?.focus();
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  // 스코프를 바꾸면 내용이 통째로 갈리므로 스크롤을 위로 되돌린다.
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
  }, [scopeId]);

  const dirtyIds = Object.keys(states).filter(
    (id) => !states[id].loading && !samePresetContent(states[id].saved, states[id].draft)
  );
  const filledIds = Object.keys(states).filter(
    (id) => !states[id].loading && presetHasContent(states[id].saved)
  );
  const dirty = state ? dirtyIds.includes(scopeId) : false;
  const filled = presetHasContent(preset);
  const bytes = payloadBytes(preset);
  const overBudget = bytes > PROMPT_PAYLOAD_LIMIT_BYTES;

  const handleClose = () => {
    if (dirtyIds.length > 0) {
      const labels = dirtyIds.map(scopeLabel).join(" · ");
      if (!window.confirm(`저장하지 않은 변경이 있습니다 (${labels}). 닫을까요?`)) {
        return;
      }
    }
    onClose();
  };
  const closeRef = useRef(handleClose);
  closeRef.current = handleClose;

  // ESC 로 닫기.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const patchSection = (key: PromptSectionKey, next: PromptSection) =>
    setStates((s) => {
      const cur = s[scopeId];
      if (!cur) return s;
      return { ...s, [scopeId]: { ...cur, draft: { ...cur.draft, [key]: next } } };
    });

  const handleSave = async () => {
    if (!state || saving) return;
    if (!filled) {
      toast.show("설명·구조·지침 중 하나는 입력해 주세요", "error");
      return;
    }
    if (overBudget) {
      toast.show(
        `내용이 너무 큽니다 (${formatBytes(bytes)} / 최대 ${formatBytes(
          PROMPT_PAYLOAD_LIMIT_BYTES
        )}) — 첨부를 줄여 주세요`,
        "error"
      );
      return;
    }

    const promptId = promptIdFor(channel, scopeId);
    const slash = promptId.indexOf("/");
    const category = promptId.slice(0, slash);
    const name = promptId.slice(slash + 1);

    setSaving(true);
    try {
      const r = await adminApi.updatePrompt(
        category,
        name,
        buildPromptText(state.draft),
        state.draft
      );
      toast.show(
        r.created
          ? `${scopeLabel(scopeId)} 프롬프트를 만들었습니다 (v1)`
          : `${scopeLabel(scopeId)} v${r.new_version} 저장 — 5분 안에 반영`,
        "success"
      );
      await load(scopeId, { silent: true });
    } catch (err) {
      toast.show(
        `저장 실패: ${err instanceof AdminApiError ? err.message : "알 수 없는 오류"}`,
        "error"
      );
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (!state) return;
    setStates((s) => ({
      ...s,
      [scopeId]: { ...s[scopeId], draft: structuredClone(s[scopeId].saved) },
    }));
  };

  const handleCopy = async () => {
    const text = buildPromptText(preset);
    if (!text) {
      toast.show(`${scopeLabel(scopeId)}에 복사할 내용이 없습니다`, "error");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      toast.show(`${scopeLabel(scopeId)} 프롬프트를 복사했습니다`, "success");
    } catch {
      toast.show("복사에 실패했습니다 (브라우저 권한 확인)", "error");
    }
  };

  const chars = presetCharCount(preset);

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/25 backdrop-blur-[2px] animate-[ui-fade-up_160ms_ease-out]"
          onClick={handleClose}
          aria-hidden="true"
        />
      )}

      {/* 항상 마운트하고 translate 로 밀어낸다(Sidebar 와 동일 패턴) — 그래야
          열고 닫을 때 부드럽게 슬라이드된다. 닫힌 동안은 inert 로 막아 화면
          밖 패널에 Tab 이 걸리지 않게 한다. */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="prompt-drawer-title"
        inert={!open}
        className={`fixed right-0 top-0 z-50 flex h-full w-full transform flex-col border-l border-[var(--border-hairline)] bg-[var(--surface-card)] shadow-2xl transition-transform duration-300 ease-out sm:max-w-[600px] ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="ui-divider space-y-3 border-b px-5 pb-3 pt-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2
                id="prompt-drawer-title"
                className="font-display text-[19px] font-bold text-[var(--text-primary)]"
              >
                프롬프트
              </h2>
              <p className="mt-0.5 text-[13px] text-[var(--text-muted)]">
                <span className="font-mono">{promptIdFor(channel, scopeId)}</span>
                {state && !state.loading && (
                  <>
                    {" · "}
                    {state.version > 0 ? (
                      <span className="font-mono font-semibold">v{state.version}</span>
                    ) : (
                      "새 프롬프트"
                    )}
                  </>
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={handleClose}
              className="-mr-1.5 cursor-pointer rounded-lg p-1.5 text-[var(--text-faint)] transition-colors hover:bg-[var(--surface-sunken)]"
              aria-label="닫기"
            >
              <Icon d={ICON.close} className="h-5 w-5" />
            </button>
          </div>

          <ScopeTabs
            activeId={scopeId}
            dirtyIds={dirtyIds}
            filledIds={filledIds}
            onSelect={setScopeId}
          />
        </div>

        <div ref={bodyRef} className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
          {(!state || state.loading) && <div className="ui-skeleton h-64 rounded-xl" />}

          {state?.error && (
            <p className="text-sm" style={{ color: "var(--danger)" }}>
              {state.error}
            </p>
          )}

          {state && !state.loading && !state.error && (
            <>
              {state.version === 0 && (
                <p
                  className="rounded-lg px-3 py-2 text-[12px]"
                  style={{ background: "var(--warn-soft)", color: "var(--warn)" }}
                >
                  아직 만들어지지 않은 프롬프트입니다. 저장하면 v1 로 새로 생깁니다.
                </p>
              )}

              {SECTION_DEFS.map((def, i) => (
                // key 에 스코프를 섞는다 — 탭을 바꾸면 첨부 미리보기 같은 필드
                // 내부 상태가 이전 스코프 값을 물고 있으면 안 된다.
                <PromptField
                  key={`${scopeId}-${def.key}`}
                  fieldId={`pm-${def.key}`}
                  label={def.label}
                  hint={def.hint}
                  rows={def.rows}
                  placeholder={def.placeholder}
                  section={preset[def.key]}
                  onChange={(next) => patchSection(def.key, next)}
                  onError={(message) => toast.show(message, "error")}
                  textareaRef={i === 0 ? firstFieldRef : undefined}
                />
              ))}

              <div className="space-y-1 text-[11px] leading-relaxed text-[var(--text-muted)]">
                <p>
                  텍스트 파일 (md · txt · json · yaml · csv · 코드 파일, 최대{" "}
                  {formatBytes(MAX_ATTACHMENT_BYTES)}) 과 PDF (최대{" "}
                  {formatBytes(MAX_PDF_BYTES)}) 를 첨부할 수 있습니다.
                </p>
                <p>
                  PDF 는 <strong className="font-semibold">텍스트만 뽑아서</strong>{" "}
                  저장합니다 — 스캔한 이미지 PDF 는 글자가 없어 첨부되지 않고(OCR
                  필요), 표·다단 편집은 읽는 순서가 흐트러질 수 있습니다. docx·xlsx
                  는 아직 지원하지 않습니다.
                </p>
              </div>

              {state.history.length > 0 && (
                <section className="space-y-2">
                  <h3
                    className="text-sm font-semibold"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    히스토리{" "}
                    <span className="font-normal" style={{ color: "var(--text-muted)" }}>
                      ({state.history.length})
                    </span>
                  </h3>
                  <div
                    className="rounded-xl border"
                    style={{ borderColor: "var(--border-hairline)" }}
                  >
                    <table className="w-full text-sm">
                      <thead className="ui-thead">
                        <tr>
                          <th className="px-3 py-2 text-left">버전</th>
                          <th className="px-3 py-2 text-left">저장 시각</th>
                          <th className="px-3 py-2 text-left">작성자</th>
                        </tr>
                      </thead>
                      <tbody>
                        {state.history.map((h) => (
                          <tr key={h.version} className="ui-divider border-t">
                            <td className="px-3 py-2 font-mono text-xs">
                              v{h.version}
                              {h.version === state.version && (
                                <span
                                  className="ml-1"
                                  style={{ color: "var(--ok)" }}
                                  aria-label="active"
                                >
                                  ●
                                </span>
                              )}
                            </td>
                            <td
                              className="px-3 py-2 text-xs tabular-nums"
                              style={{ color: "var(--text-muted)" }}
                            >
                              {h.created_at
                                ? new Date(h.created_at).toLocaleString("ko-KR", {
                                    timeZone: "Asia/Seoul",
                                  })
                                : "-"}
                            </td>
                            <td
                              className="px-3 py-2 font-mono text-xs"
                              style={{ color: "var(--text-muted)" }}
                            >
                              {h.actor}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
            </>
          )}
        </div>

        <div className="ui-divider space-y-3 border-t px-5 py-4">
          <p className="text-xs text-[var(--text-muted)]">
            <span className="font-semibold text-[var(--text-secondary)]">
              {scopeLabel(scopeId)}
            </span>
            {chars > 0 && ` · ${chars.toLocaleString("ko-KR")}자`}
            {chars > 0 && (
              <span style={{ color: overBudget ? "var(--danger)" : undefined }}>
                {" · "}
                {formatBytes(bytes)} / {formatBytes(PROMPT_PAYLOAD_LIMIT_BYTES)}
              </span>
            )}
            {dirty && (
              <span className="font-semibold" style={{ color: "var(--warn)" }}>
                {" · ● 저장 안 됨"}
              </span>
            )}
          </p>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void handleCopy()}
                disabled={!filled}
                className="ui-btn rounded-lg px-3 py-2 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
                title={`${scopeLabel(scopeId)}의 설명·구조·지침과 첨부 내용을 하나의 프롬프트로 합쳐 복사`}
              >
                <Icon d={ICON.copy} className="h-3.5 w-3.5" />
                복사
              </button>
              <button
                type="button"
                onClick={handleReset}
                disabled={!dirty || saving}
                className="ui-btn ui-btn-ghost rounded-lg px-3 py-2 text-sm font-medium"
              >
                되돌리기
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleClose}
                className="ui-btn rounded-lg px-4 py-2 text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
              >
                닫기
              </button>
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={!dirty || saving || overBudget}
                className="ui-btn ui-btn-primary rounded-lg px-4 py-2 text-sm font-semibold"
              >
                {saving
                  ? "저장 중..."
                  : state && state.version > 0
                    ? `저장 → v${state.version + 1}`
                    : "저장 → v1"}
              </button>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
