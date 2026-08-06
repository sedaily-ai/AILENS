"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { adminApi, AdminApiError } from "@/lib/adminClient";
import { FormSkeleton } from "@/components/Feedback";
import { useToast } from "@/components/Toast";
import type { PromptDetail } from "@/lib/types";

// useSearchParams 는 클라이언트 사이드 only — static export 시 Suspense boundary 필수.
export default function PromptEditPageWrapper() {
  return (
    <Suspense
      fallback={
        <div className="space-y-3">
          <h1 className="font-display text-[26px] font-bold text-[var(--text-primary)]">
            Prompt
          </h1>
          <FormSkeleton />
        </div>
      }
    >
      <PromptEditPage />
    </Suspense>
  );
}

function PromptEditPage() {
  const searchParams = useSearchParams();
  const idParam = searchParams.get("id") ?? "";
  const slash = idParam.indexOf("/");
  const category = slash === -1 ? "" : idParam.slice(0, slash);
  const name = slash === -1 ? "" : idParam.slice(slash + 1);

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
        setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [category, name]);

  if (!idParam) {
    return (
      <div className="space-y-3">
        <h1 className="font-display text-[26px] font-bold text-[var(--text-primary)]">
          Prompt
        </h1>
        <p className="text-sm text-red-600">id 쿼리 파라미터 없음</p>
        <Link
          href="/prompts"
          className="text-sm text-blue-700 hover:text-blue-900 hover:underline"
        >
          ← 목록으로
        </Link>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-3">
        <h1 className="font-display text-[26px] font-bold text-[var(--text-primary)]">
          Prompt: {idParam}
        </h1>
        <p className="text-sm text-red-600">{error}</p>
        <Link
          href="/prompts"
          className="text-sm text-blue-700 hover:text-blue-900 hover:underline"
        >
          ← 목록으로
        </Link>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="space-y-3">
        <h1 className="font-display text-[26px] font-bold text-[var(--text-primary)]">
          Prompt: {idParam}
        </h1>
        <FormSkeleton />
      </div>
    );
  }

  const dirty = draft !== detail.active_content;

  const save = async () => {
    if (saving || !dirty) return;
    if (!draft.trim()) {
      toast.show("내용이 비어있음 — 저장 거부", "error");
      return;
    }
    setSaving(true);
    try {
      const r = await adminApi.updatePrompt(category, name, draft);
      toast.show(`v${r.new_version} 저장 — 5분 안에 반영`, "success");
      // refresh detail to pick up new active_version + history
      const fresh = await adminApi.getPrompt(category, name);
      setDetail(fresh);
      setDraft(fresh.active_content);
    } catch (err) {
      const msg =
        err instanceof AdminApiError ? err.message : "저장 실패";
      toast.show(`저장 실패: ${msg}`, "error");
    } finally {
      setSaving(false);
    }
  };

  const reset = () => setDraft(detail.active_content);

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 break-all">
          Prompt:{" "}
          <span className="font-mono text-2xl text-blue-700">{detail.id}</span>
        </h1>
        <Link
          href="/prompts"
          className="text-sm text-blue-700 hover:text-blue-900 hover:underline"
        >
          ← 목록으로
        </Link>
      </div>

      <div className="text-sm text-gray-700">
        Active version:{" "}
        <span className="font-mono font-semibold text-gray-900">
          v{detail.active_version}
        </span>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-semibold text-gray-800">Content</label>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="ui-input w-full h-96 px-3 py-2 rounded-xl font-mono text-xs leading-relaxed text-gray-900"
          spellCheck={false}
        />
        <div className="flex gap-3 items-center text-xs text-gray-700">
          <span className="tabular-nums">{draft.length} chars</span>
          {dirty && (
            <span className="text-amber-700 font-semibold">● unsaved</span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={save}
          disabled={saving || !dirty}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm shadow-blue-500/20"
        >
          {saving ? "저장 중..." : `Save → v${detail.active_version + 1}`}
        </button>
        <button
          onClick={reset}
          disabled={!dirty || saving}
          className="px-4 py-2 ui-card rounded-lg text-sm font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-50 transition-all"
        >
          Reset
        </button>
        <button
          onClick={() => setShowDiff(!showDiff)}
          disabled={!dirty}
          className="px-4 py-2 ui-card rounded-lg text-sm font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-50 transition-all"
        >
          {showDiff ? "Hide" : "Show"} Diff
        </button>
      </div>

      {showDiff && dirty && (
        <SimpleDiff original={detail.active_content} modified={draft} />
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-gray-900">
          History{" "}
          <span className="text-gray-600 font-normal">
            ({detail.history.length})
          </span>
        </h2>
        <div className="ui-card rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="ui-thead">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-gray-800">
                  Version
                </th>
                <th className="text-left px-4 py-3 font-semibold text-gray-800">
                  Created
                </th>
                <th className="text-left px-4 py-3 font-semibold text-gray-800">
                  Actor
                </th>
                <th className="text-right px-4 py-3 font-semibold text-gray-800">
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {detail.history.map((h) => (
                <tr
                  key={h.version}
                  className="border-b ui-divider last:border-0 ui-row-hover transition-colors"
                >
                  <td className="px-4 py-2.5 font-mono text-xs text-gray-800">
                    v{h.version}
                    {h.version === detail.active_version && (
                      <span
                        className="ml-1 text-emerald-600"
                        aria-label="active"
                      >
                        ●
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-gray-700 tabular-nums">
                    {h.created_at
                      ? new Date(h.created_at).toLocaleString("ko-KR", {
                          timeZone: "Asia/Seoul",
                        })
                      : "-"}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-gray-800">
                    {h.actor}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      onClick={() => {
                        // load that version's content via getPrompt — but API doesn't
                        // expose individual versions in detail; the history rows are
                        // metadata-only. To restore, admin would need a v#N read API.
                        // For now: editor surfaces only the active version. Inform.
                        toast.show(
                          "v#N 읽기 API 미구현 — 백업 보관 후 직접 paste 필요",
                          "info"
                        );
                      }}
                      className="text-xs text-gray-700 hover:text-gray-900 underline-offset-2 hover:underline"
                    >
                      load
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function SimpleDiff({
  original,
  modified,
}: {
  original: string;
  modified: string;
}) {
  const origLines = original.split("\n");
  const modLines = modified.split("\n");
  const maxLen = Math.max(origLines.length, modLines.length);
  return (
    <div className="rounded-xl p-3 overflow-auto max-h-80 font-mono text-xs leading-relaxed bg-gray-900/95 text-gray-100 border border-gray-700/50 shadow-lg shadow-gray-900/20">
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
            {o !== undefined && (
              <div className="bg-red-950/60 text-red-200">- {o}</div>
            )}
            {m !== undefined && (
              <div className="bg-emerald-950/60 text-emerald-200">+ {m}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
