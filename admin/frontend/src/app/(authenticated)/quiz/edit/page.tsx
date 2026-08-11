"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { adminApi } from "@/lib/adminClient";
import { useToast } from "@/components/Toast";
import { ErrorNote } from "@/components/Feedback";
import { DatePickerField } from "@/components/DatePickerField";
import type { Quiz, QuizInput } from "@/lib/types";

// useSearchParams 는 클라이언트 사이드 only — static export 시 Suspense boundary 필수
// (posts/edit 와 동일 패턴).
export default function QuizEditPageWrapper() {
  return (
    <Suspense fallback={<div className="ui-spinner w-5 h-5 mt-4" />}>
      <QuizEditPage />
    </Suspense>
  );
}

function todayKST(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + (now.getTimezoneOffset() + 540) * 60000);
  return `${kst.getFullYear()}-${String(kst.getMonth() + 1).padStart(2, "0")}-${String(
    kst.getDate()
  ).padStart(2, "0")}`;
}

function QuizEditPage() {
  const router = useRouter();
  const params = useSearchParams();
  const id = params.get("id") ?? "";
  const isNew = !id;
  const toast = useToast();

  const [draft, setDraft] = useState<QuizInput>({
    term: "",
    explain: "",
    options: ["", "", ""],
    publish_date: todayKST(),
  });
  const [saved, setSaved] = useState<Quiz | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    adminApi
      .getQuiz(id)
      .then(({ quiz }) => {
        if (cancelled) return;
        setSaved(quiz);
        const opts = quiz.options ?? [];
        setDraft({
          term: quiz.term,
          explain: quiz.explain,
          options: [opts[0] ?? "", opts[1] ?? "", opts[2] ?? ""],
          publish_date: quiz.publish_date,
        });
      })
      .catch((err) => {
        if (!cancelled) setError((err as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const guard = (): string | null => {
    if (!(draft.term ?? "").trim()) return "용어를 입력하세요";
    if (!(draft.explain ?? "").trim()) return "설명을 입력하세요";
    return null;
  };

  const save = async () => {
    const bad = guard();
    if (bad) {
      toast.show(bad, "error");
      return;
    }
    setBusy(true);
    try {
      if (isNew) {
        const { quiz } = await adminApi.createQuiz(draft);
        toast.show("저장했습니다", "success");
        router.replace(`/quiz/edit?id=${encodeURIComponent(quiz.id)}`);
      } else {
        const { quiz } = await adminApi.updateQuiz(id, draft);
        setSaved(quiz);
        toast.show("저장했습니다", "success");
      }
    } catch (err) {
      toast.show((err as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  const act = async (fn: () => Promise<{ quiz: Quiz }>, msg: string) => {
    setBusy(true);
    try {
      const { quiz } = await fn();
      setSaved(quiz);
      toast.show(msg, "success");
    } catch (err) {
      toast.show((err as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(`"${draft.term || "이 퀴즈"}"를 삭제할까요? 되돌릴 수 없습니다.`)) return;
    setBusy(true);
    try {
      await adminApi.deleteQuiz(id);
      toast.show("삭제했습니다", "success");
      router.back();
    } catch (err) {
      toast.show((err as Error).message, "error");
      setBusy(false);
    }
  };

  if (error) {
    return (
      <div className="max-w-[560px] mx-auto px-6 py-8 space-y-3">
        <h1 className="font-display text-[26px] font-bold text-[var(--text-primary)]">퀴즈</h1>
        <ErrorNote message={error} />
        <button type="button" onClick={() => router.back()} className="text-sm text-blue-700 hover:underline cursor-pointer">
          ← 목록
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-[560px] mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <button type="button" onClick={() => router.back()} className="text-sm text-gray-600 hover:text-gray-900 cursor-pointer shrink-0">
            ← 목록
          </button>
          <span className="text-[15px] font-semibold text-gray-900">{isNew ? "새 퀴즈" : "퀴즈 수정"}</span>
          {saved && (
            <span className={`ui-badge ${saved.status === "published" ? "ui-badge-published" : "ui-badge-draft"}`}>
              {saved.status === "published" ? "발행됨" : "초안"}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            disabled={busy}
            onClick={save}
            className="ui-btn ui-btn-primary rounded-lg px-4 py-2 text-sm font-semibold"
          >
            저장
          </button>
          {saved?.status === "published" ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => act(() => adminApi.unpublishQuiz(saved.id), "내렸습니다")}
              className="ui-btn ui-btn-warn-soft rounded-lg px-4 py-2 text-sm font-semibold"
            >
              내리기
            </button>
          ) : (
            <button
              type="button"
              disabled={busy || !saved}
              title={saved ? undefined : "먼저 저장하세요"}
              onClick={() => saved && act(() => adminApi.publishQuiz(saved.id), "발행했습니다")}
              className={`ui-btn rounded-lg px-4 py-2 text-sm font-semibold ${saved ? "ui-btn-ok-soft" : "ui-btn-ghost"}`}
            >
              발행
            </button>
          )}
          {saved && (
            <button
              type="button"
              disabled={busy}
              onClick={remove}
              className="ui-btn ui-btn-ghost ui-btn-danger rounded-lg px-4 py-2 text-sm font-semibold"
            >
              삭제
            </button>
          )}
        </div>
      </div>

      <div className="ui-card rounded-xl p-6 space-y-5">
        <div>
          <label className="mb-1.5 block text-[12.5px] font-semibold" style={{ color: "var(--text-secondary)" }}>
            용어 (정답)
          </label>
          <input
            value={draft.term ?? ""}
            onChange={(e) => setDraft((d) => ({ ...d, term: e.target.value }))}
            placeholder="예: 레버리지·인버스 ETF"
            className="ui-input w-full rounded-lg px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-[12.5px] font-semibold" style={{ color: "var(--text-secondary)" }}>
            설명 (사용자에게 보여줄 질문/정의)
          </label>
          <textarea
            value={draft.explain ?? ""}
            onChange={(e) => setDraft((d) => ({ ...d, explain: e.target.value }))}
            placeholder="예: 지수 등락폭을 2~3배로 추종하거나(레버리지), 반대로 움직이도록(인버스) 설계된 ETF."
            rows={4}
            className="ui-input w-full resize-none rounded-lg px-3 py-2 text-sm leading-[1.6]"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-[12.5px] font-semibold" style={{ color: "var(--text-secondary)" }}>
            보기 (오답 3개 — 정답과 함께 무작위 순서로 노출)
          </label>
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <input
                key={i}
                value={draft.options?.[i] ?? ""}
                onChange={(e) =>
                  setDraft((d) => {
                    const next = [d.options?.[0] ?? "", d.options?.[1] ?? "", d.options?.[2] ?? ""];
                    next[i] = e.target.value;
                    return { ...d, options: next };
                  })
                }
                placeholder={`오답 ${i + 1}`}
                className="ui-input w-full rounded-lg px-3 py-2 text-sm"
              />
            ))}
          </div>
          <p className="mt-1.5 text-[11.5px]" style={{ color: "var(--text-faint)" }}>
            3개를 다 채워야 발행할 수 있습니다.
          </p>
        </div>

        <div>
          <label className="mb-1.5 block text-[12.5px] font-semibold" style={{ color: "var(--text-secondary)" }}>
            발행일 (이 날짜 홈 화면에 노출)
          </label>
          <DatePickerField
            value={draft.publish_date ?? ""}
            onChange={(v) => setDraft((d) => ({ ...d, publish_date: v }))}
          />
        </div>
      </div>
    </div>
  );
}
