"use client";

import { useEffect, useMemo, useState } from "react";
import { adminApi, AdminApiError } from "@/lib/adminClient";
import { CardSkeleton, EmptyState, ErrorNote } from "@/components/Feedback";
import { useToast } from "@/components/Toast";
import type {
  SelectionArticle,
  SelectionRunsDayResponse,
  SelectionVerdict,
} from "@/lib/types";

/* v1.35(2026-09-28, docs/architecture/db-changelog/postgres/) — 처음엔
   3건짜리 하드코딩 목업이었는데, 사용자가 "하드코딩 하는게 아니고 db
   랑 연결하면 되는거 아닌가요? 매일 쌓아야하는데.."로 지적해 실제
   저장으로 전환했다. 날짜 탭도 하드코딩 대신 getSelectionDates()로
   실제 회차가 있었던 날짜만 불러온다. 기록 주체는
   pipelines/mustknow_auto/run.py — select_general_articles() 직후 매
   회차 lens_cms_client.log_selection_run()을 호출한다(하루에 캡
   도달까지 여러 번 돌아, 하루 화면은 그 날의 모든 회차를 합쳐 보여준다). */

const VERDICT_META: Record<
  SelectionVerdict,
  {
    label: string;
    badgeClass: string;
    btnClass: string;
    activeStyle?: React.CSSProperties;
  }
> = {
  ok: { label: "적절", badgeClass: "ui-badge-published", btnClass: "ui-btn-ok-soft" },
  unclear: { label: "애매", badgeClass: "ui-badge-draft", btnClass: "ui-btn-warn-soft" },
  bad: {
    label: "부적절",
    badgeClass: "ui-badge-archived",
    btnClass: "",
    activeStyle: { background: "var(--danger-soft)", color: "var(--danger)" },
  },
};

export default function SelectionLabPage() {
  const [dates, setDates] = useState<string[] | null>(null);
  const [activeDate, setActiveDate] = useState<string | null>(null);
  const [day, setDay] = useState<SelectionRunsDayResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const toast = useToast();

  useEffect(() => {
    // 날짜 목록 최초 로드 — setDates/setActiveDate는 .then() 콜백 안(비동기)
    // 이라 set-state-in-effect 린트 대상이 아니다(동기 호출만 걸림).
    adminApi
      .getSelectionDates()
      .then((res) => {
        setDates(res.dates);
        if (res.dates.length > 0) setActiveDate(res.dates[0]);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "load failed"));
  }, []);

  useEffect(() => {
    if (!activeDate) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDay(null);
    adminApi
      .getSelectionDay(activeDate)
      .then(setDay)
      .catch((err) => setError(err instanceof Error ? err.message : "load failed"));
  }, [activeDate]);

  const summary = useMemo(() => {
    if (!day || day.runs.length === 0) return null;
    const candidatesTotal = day.runs.reduce((sum, r) => sum + (r.candidates_total ?? 0), 0);
    const excludedCount = day.runs.reduce((sum, r) => sum + (r.excluded_count ?? 0), 0);
    const excludedReasons = day.runs.flatMap((r) => r.excluded_reasons);
    const latestContext = [...day.runs].reverse().find((r) => r.today_context)?.today_context;
    return { candidatesTotal, excludedCount, excludedReasons, latestContext };
  }, [day]);

  const setVerdict = async (article: SelectionArticle, v: SelectionVerdict) => {
    const next = article.verdict === v ? null : v;
    try {
      const { article: updated } = await adminApi.scoreSelectionArticle(
        article.id,
        next,
        notes[article.id] ?? article.note
      );
      setDay((prev) =>
        prev
          ? { ...prev, articles: prev.articles.map((a) => (a.id === updated.id ? updated : a)) }
          : prev
      );
    } catch (err) {
      const msg = err instanceof AdminApiError ? err.message : "채점 저장 실패";
      toast.show(msg, "error");
    }
  };

  const saveNote = async (article: SelectionArticle) => {
    const note = notes[article.id];
    if (note === undefined || note === article.note) return;
    try {
      const { article: updated } = await adminApi.scoreSelectionArticle(
        article.id,
        article.verdict,
        note
      );
      setDay((prev) =>
        prev
          ? { ...prev, articles: prev.articles.map((a) => (a.id === updated.id ? updated : a)) }
          : prev
      );
    } catch (err) {
      const msg = err instanceof AdminApiError ? err.message : "메모 저장 실패";
      toast.show(msg, "error");
    }
  };

  if (error && dates === null) {
    return (
      <div className="space-y-3">
        <h1 className="font-display text-[26px] font-bold text-[var(--text-primary)]">
          선정 실험실
        </h1>
        <ErrorNote message={error} />
      </div>
    );
  }

  if (dates === null) {
    return (
      <div className="space-y-3">
        <h1 className="font-display text-[26px] font-bold text-[var(--text-primary)]">
          선정 실험실
        </h1>
        <CardSkeleton count={4} />
      </div>
    );
  }

  const scoredCount = day?.articles.filter((a) => a.verdict).length ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-[26px] font-bold text-[var(--text-primary)]">
          선정 실험실
        </h1>
        <p className="text-sm text-[var(--text-muted)] mt-1">
          mustknow_auto &quot;일반&quot; 카테고리 선정 결과를 날짜별로 돌아보고
          채점합니다. 채점은 바로 저장됩니다.
        </p>
      </div>

      {dates.length === 0 ? (
        <EmptyState
          title="아직 기록된 선정 회차가 없습니다"
          hint="pipelines/mustknow_auto/run.py가 다음 회차를 돌면 여기 자동으로 쌓입니다."
        />
      ) : (
        <>
          <div className="flex gap-1.5 flex-wrap">
            {dates.map((d) => {
              const active = d === activeDate;
              return (
                <button
                  key={d}
                  onClick={() => setActiveDate(d)}
                  className={`ui-btn px-3.5 py-1.5 rounded-lg text-[13px] ${
                    active ? "ui-btn-primary" : "ui-btn-ghost"
                  }`}
                >
                  {d}
                </button>
              );
            })}
          </div>

          {!day ? (
            <CardSkeleton count={3} />
          ) : day.runs.length === 0 ? (
            <EmptyState title="이 날짜엔 기록된 회차가 없습니다" />
          ) : (
            <>
              <div className="ui-card rounded-2xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <h2 className="text-[13px] font-semibold text-[var(--text-secondary)]">
                    오늘의 흐름 파악
                  </h2>
                  <span className="text-[11px] text-[var(--text-faint)] tabular-nums">
                    회차 {day.runs.length} · 후보 {summary?.candidatesTotal ?? 0} · 배제{" "}
                    {summary?.excludedCount ?? 0} · 선정 {day.articles.length}
                  </span>
                </div>
                <p className="text-sm text-[var(--text-primary)] leading-relaxed">
                  {summary?.latestContext || "기록된 흐름 요약이 없습니다."}
                </p>
                {summary && summary.excludedReasons.length > 0 && (
                  <div className="pt-2 border-t border-[var(--border-hairline)] space-y-1">
                    <p className="text-[11px] font-semibold text-[var(--text-faint)] uppercase tracking-[0.04em]">
                      배제 사유
                    </p>
                    <ul className="text-[13px] text-[var(--text-muted)] space-y-0.5 list-disc pl-4">
                      {summary.excludedReasons.map((reason, i) => (
                        <li key={i}>{reason}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-[17px] font-bold text-[var(--text-primary)]">
                    선정 기사{" "}
                    <span className="text-gray-600 font-normal">({day.articles.length})</span>
                  </h2>
                  <span className="text-[12px] text-[var(--text-muted)] tabular-nums">
                    채점 {scoredCount}/{day.articles.length}
                  </span>
                </div>

                <div className="ui-card rounded-2xl divide-y divide-[var(--border-hairline)] overflow-hidden">
                  {day.articles.map((article) => {
                    const verdict = article.verdict;
                    return (
                      <div key={article.id} className="ui-row-hover px-4 py-2.5">
                        <div className="flex items-center gap-3">
                          <span className="ui-badge ui-badge-draft shrink-0">
                            {article.category || "미분류"}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-[13px] font-medium text-[var(--text-primary)] truncate">
                              {article.title}
                            </p>
                            <p className="text-[11px] text-[var(--text-faint)] truncate">
                              {article.reason}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {(["ok", "unclear", "bad"] as const).map((v) => (
                              <button
                                key={v}
                                onClick={() => setVerdict(article, v)}
                                title={VERDICT_META[v].label}
                                className={`ui-btn px-2.5 py-1 rounded-md text-[11px] font-medium ${
                                  verdict === v ? VERDICT_META[v].btnClass : "ui-btn-ghost"
                                }`}
                                style={verdict === v ? VERDICT_META[v].activeStyle : undefined}
                              >
                                {VERDICT_META[v].label}
                              </button>
                            ))}
                          </div>
                        </div>

                        {verdict && (
                          <input
                            type="text"
                            placeholder="메모 (선택)"
                            value={notes[article.id] ?? article.note ?? ""}
                            onChange={(e) =>
                              setNotes((prev) => ({ ...prev, [article.id]: e.target.value }))
                            }
                            onBlur={() => saveNote(article)}
                            className="ui-input w-full rounded-md px-2.5 py-1 text-[12px] mt-2"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
