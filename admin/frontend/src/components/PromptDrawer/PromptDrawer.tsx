"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AdminApiError, adminApi } from "@/lib/adminClient";
import { useToast } from "@/components/Toast";
import {
  DEFAULT_SCOPE_ID,
  MAX_ATTACHMENT_BYTES,
  MAX_PDF_BYTES,
  PROMPT_PAYLOAD_LIMIT_BYTES,
  SECTION_DEFS,
  buildPromptText,
  emptyPreset,
  formatBytes,
  payloadBytes,
  presetCharCount,
  presetFromDetail,
  presetHasContent,
  promptIdFor,
  samePresetContent,
  scopeGroups,
  scopeLabel,
  type PromptPreset,
  type PromptSection,
  type PromptSectionKey,
} from "@/lib/prompt";
import type { PromptHistoryEntry } from "@/lib/types";
import { Icon, ICON } from "./Icons";
import { ScopeTabs } from "./ScopeTabs";
import { PromptField } from "./PromptField";

/* 콘텐츠 목록 화면(글 관리·영상·웹툰)의 "프롬프트" 버튼이 여는 우측 슬라이드 패널.
   2026-08-09 의 정중앙 모달(PromptEditModal)을 대체한다.

   구조: 상태 탭(초안·발행) → 각 상태가 백엔드 프롬프트 id 하나(<channel>/<scope>).
         상태별로 설명·구조·지침 3섹션, 섹션마다
           · 형식(Markdown · 텍스트 · 코드+언어)을 골라 직접 입력하거나
           · 텍스트 기반 파일·PDF 를 첨부한다(본문을 읽어 보관 → 프롬프트에 들어간다).

   저장은 기존 백엔드를 그대로 쓴다 — POST /admin/prompts/{category}/{name} 이
   새 버전(v#N)을 쌓고, 산문은 content, 구조는 sections 로 나눠 보낸다. 이력·
   버전 표시는 모달에 있던 걸 유지했다. 데이터 규칙은 전부 @/lib/prompt.

   2026-08-19 — Icon/FileIcon(Icons.tsx), ScopeTabs, FormatPicker, PromptField 를
   각자 파일로 분리(PostForm/ 폴더와 같은 컨벤션). 로직·마크업은 그대로, 구조만
   나눴다 — service/frontend 의 ArchiveTab.tsx 분리와 동일한 이유(916줄 한 파일에
   컴포넌트 5개가 섞여 있었다). */

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
