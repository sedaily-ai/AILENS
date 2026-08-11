"use client";

import { useEffect, useState } from "react";
import { adminApi, AdminApiError } from "@/lib/adminClient";
import { useToast } from "@/components/Toast";
import type { PromptDetail } from "@/lib/types";

// 2026-08-09 — 콘텐츠 목록 화면(글 관리/웹툰/영상)의 "프롬프트" 버튼에서
// 여는 모달. /prompts/edit/page.tsx와 기능은 동일(불러오기·저장(새 버전)·
// diff·히스토리)하지만 페이지 이동 없이 화면 정중앙에 뜨는 걸 요청받아
// 모달로 뽑았다 — /prompts 목록 화면 자체의 행 클릭은 건드리지 않았다
// (그건 이번 요청 범위 밖).
interface Props {
  id: string; // "category/name"
  onClose: () => void;
}

export function PromptEditModal({ id, onClose }: Props) {
  const slash = id.indexOf("/");
  const category = slash === -1 ? "" : id.slice(0, slash);
  const name = slash === -1 ? "" : id.slice(slash + 1);

  const [detail, setDetail] = useState<PromptDetail | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showDiff, setShowDiff] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (!category || !name) return;
    let cancelled = false;
    adminApi
      .getPrompt(category, name)
      .then((d) => {
        if (cancelled) return;
        setDetail(d);
        setDraft(d.active_content);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof AdminApiError ? err.message : "불러오기 실패");
      });
    return () => {
      cancelled = true;
    };
  }, [category, name]);

  // ESC로 닫기 — 모달의 기본 기대 동작.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const dirty = detail ? draft !== detail.active_content : false;

  const save = async () => {
    if (!detail || saving || !dirty) return;
    if (!draft.trim()) {
      toast.show("내용이 비어있음 — 저장 거부", "error");
      return;
    }
    setSaving(true);
    try {
      const r = await adminApi.updatePrompt(category, name, draft);
      toast.show(`v${r.new_version} 저장 — 5분 안에 반영`, "success");
      const fresh = await adminApi.getPrompt(category, name);
      setDetail(fresh);
      setDraft(fresh.active_content);
    } catch (err) {
      toast.show(`저장 실패: ${err instanceof AdminApiError ? err.message : "알 수 없는 오류"}`, "error");
    } finally {
      setSaving(false);
    }
  };

  const reset = () => detail && setDraft(detail.active_content);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 backdrop-blur-[2px] p-4"
      onClick={onClose}
    >
      <div
        className="ui-card flex w-full max-w-[720px] max-h-[88vh] flex-col overflow-hidden rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b px-6 py-4" style={{ borderColor: "var(--border-hairline)" }}>
          <div className="min-w-0">
            <h2 className="font-display text-lg font-bold text-[var(--text-primary)] break-all">
              프롬프트: <span className="font-mono">{id}</span>
            </h2>
            {detail && (
              <p className="mt-0.5 text-[12.5px]" style={{ color: "var(--text-muted)" }}>
                현재 버전 <span className="font-mono font-semibold">v{detail.active_version}</span>
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 cursor-pointer text-gray-400 hover:text-gray-700"
            aria-label="닫기"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {error && (
            <p className="text-sm" style={{ color: "var(--danger)" }}>
              {error}
            </p>
          )}

          {!error && !detail && <div className="ui-skeleton h-64 rounded-xl" />}

          {detail && (
            <>
              <div className="space-y-2">
                <label className="text-sm font-semibold" style={{ color: "var(--text-secondary)" }}>
                  내용
                </label>
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  className="ui-input w-full h-72 px-3 py-2 rounded-xl font-mono text-xs leading-relaxed"
                  spellCheck={false}
                />
                <div className="flex items-center gap-3 text-xs" style={{ color: "var(--text-muted)" }}>
                  <span className="tabular-nums">{draft.length}자</span>
                  {dirty && (
                    <span className="font-semibold" style={{ color: "var(--warn)" }}>
                      ● 저장 안 됨
                    </span>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={save}
                  disabled={saving || !dirty}
                  className="ui-btn ui-btn-primary rounded-lg px-4 py-2 text-sm font-semibold"
                >
                  {saving ? "저장 중..." : `저장 → v${detail.active_version + 1}`}
                </button>
                <button
                  type="button"
                  onClick={reset}
                  disabled={!dirty || saving}
                  className="ui-btn ui-btn-ghost rounded-lg px-4 py-2 text-sm font-semibold"
                >
                  되돌리기
                </button>
                <button
                  type="button"
                  onClick={() => setShowDiff((v) => !v)}
                  disabled={!dirty}
                  className="ui-btn ui-btn-ghost rounded-lg px-4 py-2 text-sm font-semibold"
                >
                  {showDiff ? "차이 숨기기" : "차이 보기"}
                </button>
              </div>

              {showDiff && dirty && <SimpleDiff original={detail.active_content} modified={draft} />}

              <section className="space-y-2">
                <h3 className="text-sm font-semibold" style={{ color: "var(--text-secondary)" }}>
                  히스토리 <span className="font-normal" style={{ color: "var(--text-muted)" }}>({detail.history.length})</span>
                </h3>
                <div className="rounded-xl border" style={{ borderColor: "var(--border-hairline)" }}>
                  <table className="w-full text-sm">
                    <thead className="ui-thead">
                      <tr>
                        <th className="text-left px-3 py-2 font-semibold" style={{ color: "var(--text-secondary)" }}>버전</th>
                        <th className="text-left px-3 py-2 font-semibold" style={{ color: "var(--text-secondary)" }}>저장 시각</th>
                        <th className="text-left px-3 py-2 font-semibold" style={{ color: "var(--text-secondary)" }}>작성자</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.history.map((h) => (
                        <tr key={h.version} className="border-t ui-divider">
                          <td className="px-3 py-2 font-mono text-xs">
                            v{h.version}
                            {h.version === detail.active_version && (
                              <span className="ml-1" style={{ color: "var(--ok)" }} aria-label="active">●</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>
                            {h.created_at ? new Date(h.created_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) : "-"}
                          </td>
                          <td className="px-3 py-2 font-mono text-xs" style={{ color: "var(--text-muted)" }}>{h.actor}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function SimpleDiff({ original, modified }: { original: string; modified: string }) {
  const origLines = original.split("\n");
  const modLines = modified.split("\n");
  const maxLen = Math.max(origLines.length, modLines.length);
  return (
    <div className="rounded-xl p-3 overflow-auto max-h-64 font-mono text-xs leading-relaxed bg-gray-900/95 text-gray-100 border border-gray-700/50">
      {Array.from({ length: maxLen }).map((_, i) => {
        const o = origLines[i];
        const m = modLines[i];
        if (o === m) {
          return (
            <div key={i} className="text-gray-400">
              {"  "}
              {o ?? ""}
            </div>
          );
        }
        return (
          <div key={i}>
            {o !== undefined && <div className="bg-red-950/60 text-red-200">- {o}</div>}
            {m !== undefined && <div className="bg-emerald-950/60 text-emerald-200">+ {m}</div>}
          </div>
        );
      })}
    </div>
  );
}
