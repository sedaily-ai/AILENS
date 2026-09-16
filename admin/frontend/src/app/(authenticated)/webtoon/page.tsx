"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { adminApi } from "@/lib/adminClient";
import { useReloadOnVisible } from "@/lib/useReloadOnVisible";
import { useToast } from "@/components/Toast";
import { ErrorNote } from "@/components/Feedback";
import { ContentTable, SimpleBulkBar } from "@/components/ContentTable";
import { PromptChatLab } from "@/components/PromptChatLab";
import { type DateRange } from "@/components/DateRangeCalendar";
import type { CmsPost } from "@/lib/types";

// 2026-08-09 — 웹툰이 레터 작성 화면(풀스크린 캔버스, /posts/edit) 안 탭에서
// 빠져나와 별도 메뉴가 됐다. 한때 글 관리 목록에 채널 필터로 합쳐봤지만
// "새 글 쓰기 누를 때 종류를 또 골라야 해서 불편하다"는 지적으로 같은 날
// 다시 뺐다 — 독립된 메뉴·독립된 "새 글 쓰기"를 유지하되, 표 자체는
// 글 관리와 같은 ContentTable을 쓴다("표는 공통된 컴포넌트 사용" 요청).
// 채널이 이미 webtoon 하나로 고정된 화면이라 ContentTable의 채널 열은 뺐다.
//
// 2026-09-14 — "프롬프트 편집/스토리보드 테스트/이미지 실험실" 3단계
// StepBar(아래 커밋 로그의 LAB_STEPS/StepBar)를 PromptChatLab 하나로
// 통합했다(사용자 요청: "클로드처럼 채팅을 할 수 있는 형태로"). 1차는
// 화면(UI)만 — PromptDrawer/WebtoonStoryboardLab/WebtoonImageLab의 실제
// 테스트·생성 로직은 다음 단계에서 이 채팅 화면 안으로 옮겨 붙인다(그
// 세 컴포넌트 파일 자체는 로직을 재사용할 수 있어 아직 안 지웠다 — 다른
// 화면에서 쓰는 PromptDrawer는 물론 그대로 유지).

// useSearchParams 는 클라이언트 사이드 only — static export 시 Suspense boundary 필수.
export default function WebtoonPageWrapper() {
  return (
    <Suspense fallback={<div className="ui-spinner w-5 h-5 mt-4" />}>
      <WebtoonPage />
    </Suspense>
  );
}

function WebtoonPage() {
  const toast = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [posts, setPosts] = useState<CmsPost[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 2026-09-11 — 필터 변경 재조회 중 posts가 이전 값 그대로라 화면이
  // 멈춘 것처럼 보였다는 지적(ContentTable의 loading prop 참조). effect
  // 본문에서 setLoading(true)를 동기 호출하면 set-state-in-effect 린트에
  // 걸린다("근본 수정 먼저" 정책) — 대신 "지금 필터 조합"을 키로 만들어
  // "마지막으로 성공/실패까지 완료한 필터 조합" 키와 비교한다. setState는
  // 전부 .then()/.catch() 콜백 안에서만(비동기 경계 안에서만) 부른다.
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
  // "프롬프트"·"이미지 실험"을 버튼 두 개, 그다음 탭 두 개로 나눠봤는데
  // 둘 다 "왜 나눠져 있냐"는 같은 피드백을 받았다(2026-09-04) — 결국 한
  // 화면에 이어붙였다. PromptDrawer/WebtoonImageLab 둘 다 embedded prop을
  // 받으면 자기 backdrop/aside/닫기 버튼 없이 헤더+본문만 내놓는다 — 이
  // 페이지가 그 둘을 하나의 aside 안에 순서대로 쌓는다(각 컴포넌트 자체는
  // 안 바꾼 것과 같음 — 다른 화면은 embedded 없이 계속 단독으로 씀).
  const [panelOpen, setPanelOpen] = useState(false);
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
    router.replace(qs ? `/webtoon?${qs}` : "/webtoon", { scroll: false });
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
      .listPosts({ channel: "webtoon", status: status || undefined, limit: 200 })
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
          웹툰{" "}
          {visibleCount !== null && (
            <span className="text-[var(--text-muted)] font-normal text-lg">({visibleCount})</span>
          )}
        </h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPanelOpen(true)}
            className="ui-btn ui-btn-ghost inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8" />
            </svg>
프롬프트 실험
          </button>
          <Link href="/webtoon/edit" className="ui-btn ui-btn-primary rounded-lg px-4 py-2 text-sm font-semibold">
            새 웹툰
          </Link>
        </div>
      </div>

      {error && <ErrorNote message={error} />}

      <ContentTable
        posts={posts}
        loading={loading}
        editHref={(p) => `/webtoon/edit?id=${encodeURIComponent(p.id)}`}
        newHref="/webtoon/edit"
        newLabel="새 웹툰"
        emptyTitle="아직 웹툰이 없습니다"
        emptyHint="컷 이미지를 만들어서 순서대로 업로드하면 됩니다."
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
        thumbnail={(p) => p.cover_image_url || p.body_inline.images?.[0]?.url || null}
      />

      {selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-10 z-30 flex justify-center px-4 lg:pl-[240px]">
          <SimpleBulkBar count={selected.size} busy={bulkBusy} onDelete={bulkDelete} onClear={() => setSelected(new Set())} />
        </div>
      )}

      {/* 2026-09-15, 사용자 요청: "프롬프트 실험 버튼 누르면 우측 사이드에서
          나오는게 아니고 전체화면으로 보여지도록" — 오른쪽에서 슬라이드
          들어오던 720~1080px 드로어를 뷰포트 전체를 덮는 화면으로 전환. */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="prompt-chat-lab-title"
        inert={!panelOpen}
        className={`fixed inset-0 z-50 flex h-full w-full flex-col bg-[var(--surface-card)] transition-opacity duration-200 ease-out ${
          panelOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        <PromptChatLab open={panelOpen} onClose={() => setPanelOpen(false)} embedded />
      </aside>
    </div>
  );
}
