"use client";

import { useState } from "react";
import { adminApi } from "@/lib/adminClient";
import { useToast } from "@/components/Toast";
import type { IssueLetterCandidate } from "@/lib/types";

// 출처 후보 기사 검색(2026-10-09). 서울경제 기사 DB 에서 제목·본문에 키워드가 들어간 최신 기사를 보여 준다(단순 키워드 일치, AI·유사도 검색 아님).
// 편집자가 쓸 기사를 골라 "후보 목록 복사"를 누르고, 레터 생성 템플릿 v2 의 {{후보 기사 목록}} 자리에 붙여 넣는다.
// 기사 선정은 사람이, 레터와의 연결(기사 번호)은 서버가 저장할 때 주소로 찾아서 한다.
export function IssueLetterCandidateSearch() {
  const toast = useToast();
  const [q, setQ] = useState("");
  const [items, setItems] = useState<IssueLetterCandidate[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = async () => {
    const keyword = q.trim();
    if (keyword.length < 2) {
      setError("검색어는 2자 이상 입력하세요");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await adminApi.searchIssueLetterCandidates(keyword, 20);
      setItems(r.articles);
      setPicked(new Set());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const toggle = (no: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(no)) next.delete(no);
      else next.add(no);
      return next;
    });

  const copy = async () => {
    const lines = (items ?? []).filter((a) => picked.has(a.article_no)).map((a) => `- ${a.title} | ${a.url}`);
    if (lines.length === 0) return;
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      toast.show(`${lines.length}건을 복사했습니다. 템플릿의 후보 기사 목록에 붙여 넣으세요`, "success");
    } catch {
      setError("복사하지 못했습니다. 브라우저 권한을 확인해 주세요");
    }
  };

  return (
    <section className="ui-card rounded-xl p-5 space-y-3" aria-label="출처 후보 기사 검색">
      <div>
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">출처 후보 기사 검색</h2>
        <p className="text-[12.5px] leading-[1.6] mt-0.5" style={{ color: "var(--text-muted)" }}>
          서울경제 기사 DB 에서 제목·본문에 단어가 들어간 최신 기사를 찾습니다. 쓸 기사를 고르고 복사해 템플릿 v2 의 후보 기사 목록에 붙여 넣으세요.
        </p>
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="예: 부캉이" aria-label="검색어" className="ui-input flex-1 rounded-lg px-3 py-2 text-sm" />
        <button type="submit" disabled={busy} className="ui-btn ui-btn-primary rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50">
          {busy ? "검색 중…" : "검색"}
        </button>
      </form>
      {error && <p className="text-[13px]" style={{ color: "var(--danger)" }}>{error}</p>}
      {items !== null && items.length === 0 && <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>일치하는 기사가 없습니다</p>}
      {items !== null && items.length > 0 && (
        <>
          <ul className="divide-y ui-divider border ui-divider rounded-lg overflow-hidden">
            {items.map((a) => (
              <li key={a.article_no} className="flex items-start gap-3 px-3 py-2.5 ui-row-hover">
                <input type="checkbox" checked={picked.has(a.article_no)} onChange={() => toggle(a.article_no)} aria-label={`${a.title} 선택`} className="mt-1" />
                <div className="min-w-0 flex-1">
                  <a href={a.url} target="_blank" rel="noopener noreferrer" className="text-[13.5px] font-medium hover:underline">
                    {a.title}
                  </a>
                  <div className="text-[12px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                    {a.published_at ? a.published_at.slice(0, 10) : ""} · {a.url}
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-3">
            <button type="button" disabled={picked.size === 0} onClick={copy} className="ui-btn ui-btn-ghost rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50">
              선택한 {picked.size}건을 후보 목록으로 복사
            </button>
            <button type="button" onClick={() => setPicked(new Set(items.map((a) => a.article_no)))} className="text-[13px] hover:underline" style={{ color: "var(--text-muted)" }}>
              전체 선택
            </button>
          </div>
        </>
      )}
    </section>
  );
}
