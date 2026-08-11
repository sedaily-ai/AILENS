"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { adminApi } from "@/lib/adminClient";
import { useReloadOnVisible } from "@/lib/useReloadOnVisible";
import { ErrorNote } from "@/components/Feedback";
import type { Quiz } from "@/lib/types";

// 2026-08-09 — 홈 화면 "오늘의 단어 퀴즈"를 CMS에서 직접 써서 낼 수 있게 하는
// 화면. Quiz는 CmsPost가 아니라 별도 타입(term/explain/publish_date만 있는
// 훨씬 가벼운 콘텐츠)이라 ContentTable(글 관리·웹툰·영상이 공유하는 CmsPost
// 전용 표)은 재사용하지 않고 단순한 표를 새로 짰다("위젯 구조 그대로 안
// 가져와도 된다, 단순한 형태로" 요청).
export default function QuizPage() {
  const [items, setItems] = useState<Quiz[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const visibleReloadKey = useReloadOnVisible();

  useEffect(() => {
    let cancelled = false;
    adminApi
      .listQuiz({ limit: 200 })
      .then((r) => {
        if (cancelled) return;
        setItems(r.quiz);
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) setError((err as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, [visibleReloadKey, reloadKey]);

  const togglePublish = async (q: Quiz) => {
    setBusyId(q.id);
    try {
      if (q.status === "published") await adminApi.unpublishQuiz(q.id);
      else await adminApi.publishQuiz(q.id);
      setReloadKey((k) => k + 1);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (q: Quiz) => {
    if (!window.confirm(`"${q.term}" 퀴즈를 삭제할까요? 되돌릴 수 없습니다.`)) return;
    setBusyId(q.id);
    try {
      await adminApi.deleteQuiz(q.id);
      setReloadKey((k) => k + 1);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <h1 className="font-display text-[26px] font-bold text-[var(--text-primary)]">
          퀴즈{" "}
          {items !== null && (
            <span className="text-[var(--text-muted)] font-normal text-lg">({items.length})</span>
          )}
        </h1>
        <Link href="/quiz/edit" className="ui-btn ui-btn-primary rounded-lg px-4 py-2 text-sm font-semibold">
          새 퀴즈
        </Link>
      </div>

      <p className="text-[13px] leading-[1.6]" style={{ color: "var(--text-muted)" }}>
        홈 화면 &quot;오늘의 단어 퀴즈&quot;에 쓰일 문제입니다. 발행일에 맞는 문제가
        발행 상태로 있으면 그 문제가 나가고, 없으면 레터 키워드 기반 자동생성으로
        대체됩니다.
      </p>

      {error && <ErrorNote message={error} />}

      {items === null && !error && (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="ui-skeleton h-14 rounded-xl" />
          ))}
        </div>
      )}

      {items !== null && items.length === 0 && (
        <div className="ui-card rounded-xl px-6 py-10 text-center">
          <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>
            아직 퀴즈가 없습니다
          </p>
          <Link href="/quiz/edit" className="ui-btn ui-btn-primary rounded-lg px-4 py-2 text-sm font-semibold">
            새 퀴즈
          </Link>
        </div>
      )}

      {items !== null && items.length > 0 && (
        <div className="ui-card overflow-hidden rounded-xl">
          <table className="w-full text-sm">
            <thead className="ui-thead">
              <tr>
                <th className="text-left px-4 py-2.5">용어</th>
                <th className="text-left px-4 py-2.5">설명</th>
                <th className="text-left px-4 py-2.5">상태</th>
                <th className="text-left px-4 py-2.5">발행일</th>
                <th className="text-right px-4 py-2.5">액션</th>
              </tr>
            </thead>
            <tbody>
              {items.map((q) => (
                <tr key={q.id} className="border-b ui-divider last:border-0 ui-row-hover">
                  <td className="px-4 py-3">
                    <Link
                      href={`/quiz/edit?id=${encodeURIComponent(q.id)}`}
                      className="font-medium text-[var(--text-primary)] hover:underline underline-offset-2"
                    >
                      {q.term}
                    </Link>
                  </td>
                  <td className="px-4 py-3 max-w-[360px] truncate text-[13px]" style={{ color: "var(--text-muted)" }}>
                    {q.explain}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`ui-badge ${q.status === "published" ? "ui-badge-published" : "ui-badge-draft"}`}>
                      {q.status === "published" ? "발행됨" : "초안"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[13px] tabular-nums" style={{ color: "var(--text-muted)" }}>
                    {q.publish_date || "-"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-3 text-[13px]">
                      <button
                        type="button"
                        disabled={busyId === q.id}
                        onClick={() => togglePublish(q)}
                        className="cursor-pointer font-medium hover:underline disabled:opacity-50"
                        style={{ color: q.status === "published" ? "var(--warn)" : "var(--ok)" }}
                      >
                        {q.status === "published" ? "내리기" : "발행"}
                      </button>
                      <button
                        type="button"
                        disabled={busyId === q.id}
                        onClick={() => remove(q)}
                        className="cursor-pointer font-medium hover:underline disabled:opacity-50"
                        style={{ color: "var(--danger)" }}
                      >
                        삭제
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
