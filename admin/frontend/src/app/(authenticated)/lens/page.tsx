"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { adminApi } from "@/lib/adminClient";
import { useReloadOnVisible } from "@/lib/useReloadOnVisible";
import { useToast } from "@/components/Toast";
import { ErrorNote } from "@/components/Feedback";
import { ContentTable, SimpleBulkBar } from "@/components/ContentTable";
import { PromptDrawer } from "@/components/PromptDrawer";
import { type DateRange } from "@/components/DateRangeCalendar";
import type { CmsPost } from "@/lib/types";

// 2026-08-12 — "오늘의 이슈, 4가지 시선" 목록. webtoon/page.tsx와 완전히 같은
// 패턴(독립 메뉴, 독립 "새로 쓰기", 표는 공통 ContentTable). 프롬프트 편집
// 버튼은 원래 "AI 반자동화가 없다"는 이유로 뺐었는데(관리자가 직접 쓰는
// 채널), 2026-08-19 사용자 요청으로 webtoon/video와 동일하게 추가.
//
// 2026-08-20 — "프롬프트가 4가지 시선 쪽에 있어야 하는데, 탭별로 구분되면
// 좋겠다"는 지적으로 channel="lens"(빈 채널, 아무도 안 씀) 대신 channels
// 배열을 준다. LensMode.tsx가 실제로 "AI로 생성" 버튼에서 읽는 프롬프트는
// letters/webtoon/podcast/video 4개이지 lens가 아니었다 — 그 4개를 그대로
// 탭으로 노출해야 편집 화면(4개 포맷 탭)과 프롬프트 화면이 일치한다.
const LENS_PROMPT_CHANNELS = [
  { id: "letters", label: "레터" },
  { id: "webtoon", label: "웹툰" },
  { id: "podcast", label: "팟캐스트" },
  { id: "video", label: "영상" },
];

export default function LensPageWrapper() {
  return (
    <Suspense fallback={<div className="ui-spinner w-5 h-5 mt-4" />}>
      <LensPage />
    </Suspense>
  );
}

function LensPage() {
  const toast = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [posts, setPosts] = useState<CmsPost[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatusState] = useState(() => searchParams.get("status") ?? "");
  const [dateRange, setDateRangeState] = useState<DateRange>(() => ({
    from: searchParams.get("from") || null,
    to: searchParams.get("to") || null,
  }));
  const [sortDir, setSortDirState] = useState<"asc" | "desc">(
    () => (searchParams.get("sort") === "asc" ? "asc" : "desc")
  );
  const [search, setSearchState] = useState(() => searchParams.get("q") ?? "");
  const [page, setPageState] = useState(() => {
    const p = parseInt(searchParams.get("page") ?? "1", 10);
    return Number.isFinite(p) && p > 0 ? p : 1;
  });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkReloadKey, setBulkReloadKey] = useState(0);
  const [promptOpen, setPromptOpen] = useState(false);
  const visibleReloadKey = useReloadOnVisible();

  const syncUrl = (next: { status: string; dateRange: DateRange; sortDir: "asc" | "desc"; search: string; page: number }) => {
    const params = new URLSearchParams();
    if (next.status) params.set("status", next.status);
    if (next.dateRange.from) params.set("from", next.dateRange.from);
    if (next.dateRange.to) params.set("to", next.dateRange.to);
    if (next.sortDir === "asc") params.set("sort", "asc");
    if (next.search) params.set("q", next.search);
    if (next.page > 1) params.set("page", String(next.page));
    const qs = params.toString();
    router.replace(qs ? `/lens?${qs}` : "/lens", { scroll: false });
  };

  const setStatus = (next: string) => {
    setStatusState(next);
    syncUrl({ status: next, dateRange, sortDir, search, page: 1 });
  };
  const setDateRange = (next: DateRange) => {
    setDateRangeState(next);
    syncUrl({ status, dateRange: next, sortDir, search, page: 1 });
  };
  const toggleSortDir = () => {
    const next = sortDir === "desc" ? "asc" : "desc";
    setSortDirState(next);
    syncUrl({ status, dateRange, sortDir: next, search, page: 1 });
  };
  const setSearch = (next: string) => {
    setSearchState(next);
    syncUrl({ status, dateRange, sortDir, search: next, page: 1 });
  };
  const setPage = (updater: number | ((prev: number) => number)) => {
    setPageState((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      syncUrl({ status, dateRange, sortDir, search, page: next });
      return next;
    });
  };

  useEffect(() => {
    let cancelled = false;
    adminApi
      .listPosts({ channel: "lens", status: status || undefined, limit: 200 })
      .then((r) => {
        if (cancelled) return;
        const d = dateRange;
        const filtered = r.posts.filter((p) => {
          if (!d.from) return true;
          const pd = p.publish_date ?? "";
          if (pd < d.from) return false;
          if (d.to && pd > d.to) return false;
          return true;
        });
        setPosts(filtered);
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) setError((err as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, [status, dateRange, visibleReloadKey, bulkReloadKey]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 필터 변경 시 선택 초기화(정당한 케이스)
    setSelected(new Set());
  }, [status, dateRange, search]);

  const visibleCount = posts
    ? search.trim()
      ? posts.filter((p) => p.headline.toLowerCase().includes(search.trim().toLowerCase())).length
      : posts.length
    : null;

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const togglePageAll = (pageIds: string[]) => {
    setSelected((prev) => {
      const allSelected = pageIds.length > 0 && pageIds.every((id) => prev.has(id));
      const next = new Set(prev);
      if (allSelected) {
        for (const id of pageIds) next.delete(id);
      } else {
        for (const id of pageIds) next.add(id);
      }
      return next;
    });
  };

  const bulkDelete = async () => {
    if (selected.size === 0) return;
    if (!window.confirm(`선택한 ${selected.size}건을 삭제할까요? 되돌릴 수 없습니다.`)) return;
    setBulkBusy(true);
    const ids = [...selected];
    const results = await Promise.allSettled(ids.map((id) => adminApi.deletePost(id)));
    const failCount = results.filter((r) => r.status === "rejected").length;
    setBulkBusy(false);
    setSelected(new Set());
    setBulkReloadKey((k) => k + 1);
    if (failCount === 0) toast.show(`${ids.length}건 삭제했습니다`, "success");
    else toast.show(`${ids.length - failCount}건 삭제, ${failCount}건 실패`, "error");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <h1 className="font-display text-[26px] font-bold text-[var(--text-primary)]">
          4가지 시선{" "}
          {visibleCount !== null && (
            <span className="text-[var(--text-muted)] font-normal text-lg">({visibleCount})</span>
          )}
        </h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPromptOpen(true)}
            className="ui-btn ui-btn-ghost inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8" />
            </svg>
            프롬프트
          </button>
          <Link href="/lens/edit" className="ui-btn ui-btn-primary rounded-lg px-4 py-2 text-sm font-semibold">
            새로 쓰기
          </Link>
        </div>
      </div>

      {error && <ErrorNote message={error} />}

      <ContentTable
        posts={posts}
        editHref={(p) => `/lens/edit?id=${encodeURIComponent(p.id)}`}
        newHref="/lens/edit"
        newLabel="새로 쓰기"
        emptyTitle="아직 작성한 시선이 없습니다"
        emptyHint="오늘의 이슈 하나를 골라 4가지 시선으로 풀어보세요."
        status={status}
        onStatusChange={setStatus}
        search={search}
        onSearchChange={setSearch}
        dateRange={dateRange}
        onDateRangeChange={setDateRange}
        sortDir={sortDir}
        onToggleSort={toggleSortDir}
        page={page}
        onPageChange={setPage}
        selected={selected}
        onToggleOne={toggleOne}
        onTogglePageAll={togglePageAll}
        thumbnail={(p) => p.cover_image_url || null}
      />

      {selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-10 z-30 flex justify-center px-4 lg:pl-[240px]">
          <SimpleBulkBar count={selected.size} busy={bulkBusy} onDelete={bulkDelete} onClear={() => setSelected(new Set())} />
        </div>
      )}

      <PromptDrawer channels={LENS_PROMPT_CHANNELS} open={promptOpen} onClose={() => setPromptOpen(false)} />
    </div>
  );
}
