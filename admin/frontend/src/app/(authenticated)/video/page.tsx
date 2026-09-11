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

// 2026-08-09 — 영상이 레터 작성 화면(풀스크린 캔버스, /posts/edit) 안 탭에서
// 빠져나와 별도 메뉴가 됐다. 웹툰/page.tsx와 같은 이유·같은 구조 — 독립된
// 메뉴·독립된 "새 글 쓰기"를 유지하되, 표 자체는 글 관리와 같은
// ContentTable을 쓴다("표는 공통된 컴포넌트 사용" 요청). 채널이 이미 video
// 하나로 고정된 화면이라 ContentTable의 채널 열은 뺐다.

// VideoMode.tsx와 로직 동일(admin 내부에서도 페이지가 갈려 공유 안 함, 이
// 저장소가 이미 감수하는 패턴 — VideoMode.tsx 주석 참조).
function extractYouTubeId(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

// useSearchParams 는 클라이언트 사이드 only — static export 시 Suspense boundary 필수.
export default function VideoPageWrapper() {
  return (
    <Suspense fallback={<div className="ui-spinner w-5 h-5 mt-4" />}>
      <VideoPage />
    </Suspense>
  );
}

function VideoPage() {
  const toast = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [posts, setPosts] = useState<CmsPost[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 2026-09-11 — 필터 변경 재조회 중 posts가 이전 값 그대로라 화면이
  // 멈춘 것처럼 보였다는 지적(ContentTable의 loading prop 참조). 자세한
  // 이유는 webtoon/page.tsx의 같은 주석 참조(set-state-in-effect 회피).
  const [fetchedKey, setFetchedKey] = useState("");
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
    router.replace(qs ? `/video?${qs}` : "/video", { scroll: false });
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

  const requestKey = JSON.stringify([status, dateRange, visibleReloadKey, bulkReloadKey]);
  const loading = fetchedKey !== requestKey;

  useEffect(() => {
    let cancelled = false;
    adminApi
      .listPosts({ channel: "video", status: status || undefined, limit: 200 })
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
        setFetchedKey(requestKey);
      })
      .catch((err) => {
        if (cancelled) return;
        setError((err as Error).message);
        setFetchedKey(requestKey);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- requestKey는 [status, dateRange, ...]에서 파생돼 그 값들과 항상 동기화됨
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
          영상{" "}
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
          <Link href="/video/edit" className="ui-btn ui-btn-primary rounded-lg px-4 py-2 text-sm font-semibold">
            새 영상
          </Link>
        </div>
      </div>

      {error && <ErrorNote message={error} />}

      <ContentTable
        posts={posts}
        loading={loading}
        editHref={(p) => `/video/edit?id=${encodeURIComponent(p.id)}`}
        newHref="/video/edit"
        newLabel="새 영상"
        emptyTitle="아직 영상이 없습니다"
        emptyHint="유튜브 링크 하나만 있으면 됩니다."
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
        thumbnail={(p) => {
          const videoId = extractYouTubeId(p.body_inline.video_url ?? "");
          return p.cover_image_url || (videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : null);
        }}
      />

      {selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-10 z-30 flex justify-center px-4 lg:pl-[240px]">
          <SimpleBulkBar count={selected.size} busy={bulkBusy} onDelete={bulkDelete} onClear={() => setSelected(new Set())} />
        </div>
      )}

      <PromptDrawer channel="video" open={promptOpen} onClose={() => setPromptOpen(false)} />
    </div>
  );
}
