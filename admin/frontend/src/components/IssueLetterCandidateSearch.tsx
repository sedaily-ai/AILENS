"use client";

import { useState } from "react";
import { adminApi } from "@/lib/adminClient";
import { useToast } from "@/components/Toast";
import type { BigKindsArticle } from "@/lib/types";

// 출처 후보 기사 검색(2026-10-09, 빅카인즈). 서울경제 기사를 1990년부터 관련도순으로 찾는다(한 번에 최대 6년 — 더 오래된 기사는 기간을 옮겨 다시 검색).
// 고른 기사를 "후보로 담고 복사"하면 ① 서버가 보관(이 기사만 레터 출처가 될 수 있다) ② `- 제목 | 주소`가 클립보드에 복사된다.
// 복사한 목록을 레터 생성 템플릿 v2 의 {{후보 기사 목록}}에 붙여 넣는다. 기사 선정은 사람이, 연결은 서버가 저장 때 주소로 한다.
const PERIODS = [
  { key: "1", label: "최근 1년", days: 365 },
  { key: "3", label: "최근 3년", days: 1095 },
  { key: "6", label: "최근 6년", days: 2190 },
  { key: "custom", label: "기간 직접 입력", days: 0 },
] as const;

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function IssueLetterCandidateSearch() {
  const toast = useToast();
  const [q, setQ] = useState("");
  const [period, setPeriod] = useState<(typeof PERIODS)[number]["key"]>("3");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sort, setSort] = useState<"relevance" | "date">("relevance");
  const [items, setItems] = useState<BigKindsArticle[] | null>(null);
  const [sortApplied, setSortApplied] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const range = (): { from: string; to: string } | null => {
    if (period === "custom") {
      if (!from || !to) return null;
      return { from, to };
    }
    const days = PERIODS.find((p) => p.key === period)?.days ?? 1095;
    const end = new Date();
    return { from: ymd(new Date(end.getTime() - days * 86400000)), to: ymd(end) };
  };

  const search = async () => {
    const keyword = q.trim();
    const r = range();
    if (keyword.length < 1 || keyword.length > 40) return setError("검색어는 1~40자로 입력하세요");
    if (!r) return setError("기간의 시작일과 종료일을 모두 입력하세요");
    setBusy(true);
    setError(null);
    try {
      const res = await adminApi.searchBigKinds({ q: keyword, from: r.from, to: r.to, sort, size: 20 });
      setItems(res.articles);
      setSortApplied(res.sort_applied);
      setPicked(new Set());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const saveAndCopy = async () => {
    const chosen = (items ?? []).filter((a) => picked.has(a.news_id));
    if (chosen.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const r = await adminApi.saveIssueLetterArchives(chosen);
      const lines = r.archived.map((a) => `- ${a.title} | ${a.url}`);
      await navigator.clipboard.writeText(lines.join("\n"));
      toast.show(`${lines.length}건을 후보로 담고 복사했습니다. 템플릿의 후보 기사 목록에 붙여 넣으세요`, "success");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="ui-card rounded-xl p-5 space-y-3" aria-label="출처 후보 기사 검색">
      <div>
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">출처 후보 기사 검색 (빅카인즈)</h2>
        <p className="text-[12.5px] leading-[1.6] mt-0.5" style={{ color: "var(--text-muted)" }}>
          서울경제 기사를 1990년부터 관련도순으로 찾습니다. 한 번에 최대 6년까지 검색되고, 더 오래된 기사는 기간을 직접 입력해 다시 검색하세요. 쓸 기사를 고르면 후보로 담아 두고
          템플릿 v2 의 후보 기사 목록에 붙일 형식으로 복사합니다. 후보로 담은 기사만 레터 출처로 쓸 수 있습니다.
        </p>
      </div>
      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <div className="flex gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="예: 라네즈 필리핀" aria-label="검색어" maxLength={40} className="ui-input flex-1 rounded-lg px-3 py-2 text-sm" />
          <button type="submit" disabled={busy} className="ui-btn ui-btn-primary rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50">
            {busy ? "처리 중…" : "검색"}
          </button>
        </div>
        <div className="flex gap-2 flex-wrap items-center text-[13px]">
          <select value={period} onChange={(e) => setPeriod(e.target.value as typeof period)} aria-label="검색 기간" className="ui-input rounded-lg px-2 py-1.5">
            {PERIODS.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </select>
          {period === "custom" && (
            <>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="시작일" className="ui-input rounded-lg px-2 py-1.5" />
              <span>~</span>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="종료일" className="ui-input rounded-lg px-2 py-1.5" />
            </>
          )}
          <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label="정렬" className="ui-input rounded-lg px-2 py-1.5">
            <option value="relevance">관련도순</option>
            <option value="date">최신순</option>
          </select>
        </div>
      </form>
      {error && <p className="text-[13px]" style={{ color: "var(--danger)" }}>{error}</p>}
      {items !== null && sortApplied === "date" && sort === "relevance" && (
        <p className="text-[12px]" style={{ color: "var(--warn)" }}>빅카인즈가 관련도 정렬을 받지 않아 최신순으로 보여 줍니다.</p>
      )}
      {items !== null && items.length === 0 && <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>일치하는 서울경제 기사가 없습니다</p>}
      {items !== null && items.length > 0 && (
        <>
          <ul className="divide-y ui-divider border ui-divider rounded-lg overflow-hidden">
            {items.map((a) => (
              <li key={a.news_id} className="flex items-start gap-3 px-3 py-2.5 ui-row-hover">
                <input
                  type="checkbox"
                  checked={picked.has(a.news_id)}
                  disabled={!a.original_link}
                  onChange={() => toggle(a.news_id)}
                  aria-label={`${a.title} 선택`}
                  className="mt-1"
                />
                <div className="min-w-0 flex-1">
                  {a.original_link ? (
                    <a href={a.original_link} target="_blank" rel="noopener noreferrer" className="text-[13.5px] font-medium hover:underline">
                      {a.title}
                    </a>
                  ) : (
                    <span className="text-[13.5px] font-medium">{a.title}</span>
                  )}
                  <div className="text-[12px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                    {a.published_at ?? ""}
                    {a.byline ? ` · ${a.byline}` : ""}
                    {!a.original_link ? " · 원문 링크가 없어 출처로 쓸 수 없습니다" : ""}
                  </div>
                  {a.content && (
                    <p className="text-[12.5px] mt-1 leading-[1.55] line-clamp-2" style={{ color: "var(--text-muted)" }}>
                      {a.content}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-3">
            <button type="button" disabled={picked.size === 0 || busy} onClick={saveAndCopy} className="ui-btn ui-btn-primary rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50">
              선택한 {picked.size}건을 후보로 담고 복사
            </button>
            <button type="button" onClick={() => setPicked(new Set(items.filter((a) => a.original_link).map((a) => a.news_id)))} className="text-[13px] hover:underline" style={{ color: "var(--text-muted)" }}>
              전체 선택
            </button>
          </div>
        </>
      )}
    </section>
  );
}
