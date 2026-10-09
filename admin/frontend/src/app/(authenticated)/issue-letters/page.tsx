"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { adminApi } from "@/lib/adminClient";
import { useReloadOnVisible } from "@/lib/useReloadOnVisible";
import { ErrorNote } from "@/components/Feedback";
import { IssueLetterStatusBadge } from "@/components/IssueLetterStatus";
import type { IssueLetterStatus, IssueLetterSummary } from "@/lib/types";

// 2026-10-09 — 레터 탭(하나의 이슈를 소식·실체·다른 시각으로 엮은 묶음 레터) 관리 목록.
// 레터는 템플릿 v2 가 만든 저장용 JSON 을 붙여넣어 만든다(/issue-letters/edit). 규칙 검사는 서버가 한다.
const FILTERS: { key: IssueLetterStatus | "all"; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "draft", label: "초안" },
  { key: "in_review", label: "검수 중" },
  { key: "published", label: "발행됨" },
  { key: "archived", label: "내림" },
];

export default function IssueLettersPage() {
  const [items, setItems] = useState<IssueLetterSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<IssueLetterStatus | "all">("all");
  const reloadKey = useReloadOnVisible();

  useEffect(() => {
    let cancelled = false;
    adminApi
      .listIssueLetters({ status: filter === "all" ? undefined : filter, limit: 200 })
      .then((r) => {
        if (cancelled) return;
        setItems(r.letters);
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) setError((err as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, [filter, reloadKey]);

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <h1 className="font-display text-[26px] font-bold text-[var(--text-primary)]">
          이슈 레터{" "}
          {items !== null && <span className="text-[var(--text-muted)] font-normal text-lg">({items.length})</span>}
        </h1>
        <Link href="/issue-letters/edit" className="ui-btn ui-btn-primary rounded-lg px-4 py-2 text-sm font-semibold">
          새 레터
        </Link>
      </div>

      <p className="text-[13px] leading-[1.6]" style={{ color: "var(--text-muted)" }}>
        사이트 &quot;레터&quot; 탭에 나가는 묶음 레터입니다. 레터 생성 프롬프트 템플릿 v2 가 만든 저장용 JSON 을 붙여넣어 초안으로 저장하고, 발행 전 점검을 통과하면 검수 요청 → 발행합니다.
        출처는 빅카인즈 검색으로 후보에 담은 서울경제 기사만 쓸 수 있습니다.
      </p>

      <div className="flex gap-2 flex-wrap" role="group" aria-label="상태 필터">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            aria-pressed={filter === f.key}
            onClick={() => setFilter(f.key)}
            className={`ui-btn rounded-full px-3.5 py-1.5 text-[13px] font-medium ${filter === f.key ? "ui-btn-primary" : "ui-btn-ghost"}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && <ErrorNote message={error} />}

      {items === null && !error && (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="ui-skeleton h-14 rounded-xl" />
          ))}
        </div>
      )}

      {items !== null && items.length === 0 && (
        <div className="ui-card rounded-xl px-6 py-10 text-center">
          <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>
            {filter === "all" ? "아직 레터가 없습니다" : "이 상태의 레터가 없습니다"}
          </p>
          <Link href="/issue-letters/edit" className="ui-btn ui-btn-primary rounded-lg px-4 py-2 text-sm font-semibold">
            새 레터
          </Link>
        </div>
      )}

      {items !== null && items.length > 0 && (
        <div className="ui-card overflow-hidden rounded-xl">
          <table className="w-full text-sm">
            <thead className="ui-thead">
              <tr>
                <th className="text-left px-4 py-2.5">제목</th>
                <th className="text-left px-4 py-2.5">상태</th>
                <th className="text-left px-4 py-2.5">호수</th>
                <th className="text-left px-4 py-2.5">수정</th>
              </tr>
            </thead>
            <tbody>
              {items.map((l) => (
                <tr key={l.id} className="border-b ui-divider last:border-0 ui-row-hover">
                  <td className="px-4 py-3">
                    <Link
                      href={`/issue-letters/edit?id=${l.id}`}
                      className="font-medium text-[var(--text-primary)] hover:underline underline-offset-2"
                    >
                      {l.title}
                    </Link>
                    <div className="text-[12px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                      {l.slug}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <IssueLetterStatusBadge status={l.status} />
                  </td>
                  <td className="px-4 py-3 text-[13px] tabular-nums" style={{ color: "var(--text-muted)" }}>
                    {l.issue_no ? `제 ${l.issue_no}호` : "-"}
                  </td>
                  <td className="px-4 py-3 text-[13px] tabular-nums" style={{ color: "var(--text-muted)" }}>
                    {l.updated_at.slice(0, 16).replace("T", " ")}
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
