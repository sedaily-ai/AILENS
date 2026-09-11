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
import { WebtoonStoryboardLab } from "@/components/WebtoonStoryboardLab";
import { WebtoonImageLab } from "@/components/WebtoonImageLab";
import { type DateRange } from "@/components/DateRangeCalendar";
import type { CmsPost } from "@/lib/types";

// 2026-08-09 — 웹툰이 레터 작성 화면(풀스크린 캔버스, /posts/edit) 안 탭에서
// 빠져나와 별도 메뉴가 됐다. 한때 글 관리 목록에 채널 필터로 합쳐봤지만
// "새 글 쓰기 누를 때 종류를 또 골라야 해서 불편하다"는 지적으로 같은 날
// 다시 뺐다 — 독립된 메뉴·독립된 "새 글 쓰기"를 유지하되, 표 자체는
// 글 관리와 같은 ContentTable을 쓴다("표는 공통된 컴포넌트 사용" 요청).
// 채널이 이미 webtoon 하나로 고정된 화면이라 ContentTable의 채널 열은 뺐다.

type LabId = "prompt" | "storyboard" | "image";

const LAB_STEPS: Array<{ id: LabId; step: number; title: string }> = [
  { id: "prompt", step: 1, title: "프롬프트 편집" },
  { id: "storyboard", step: 2, title: "스토리보드 테스트" },
  { id: "image", step: 3, title: "이미지 실험실" },
];

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
  // 2026-09-11 — 셋을 그냥 이어붙이니 "복잡하다"는 피드백. 다시 탭/버튼으로
  // 쪼개면 위와 같은 불만이 재발하니(2026-09-04), 자리는 하나로 유지하되
  // 한 번에 하나만 보이도록 바꿨다 — 셋 다 항상 이 패널 안에 있다는 건
  // 그대로 유지하면서, 지금 안 보는 도구의 폼이 화면을 채우지 않는다.
  // 처음엔 아코디언(각 단계 제목을 누르면 그 아래로 펼쳐짐)으로 했는데,
  // "단계 전환이 상단에 고정된 이어지는 흐름처럼 보였으면 좋겠다"는
  // 요청으로 StepBar(아래) 방식으로 바꿨다 — 3단계 전부 패널 맨 위에
  // sticky로 고정된 연결된 스텝바로 보여주고, 그 아래에 선택된 단계의
  // 내용만 나온다. 안 보이는 단계도 언마운트하지 않는다(hidden 속성) —
  // 스토리보드/이미지 생성 폴링이 다른 단계를 보는 동안에도 끊기지
  // 않고 계속돼야 한다.
  const [openLab, setOpenLab] = useState<LabId>("prompt");
  // 2026-09-11 — "각 단계를 효율적으로 넘어갈 수 있도록" 요청 — 1단계
  // (프롬프트 편집의 테스트 실행)와 2단계(스토리보드 테스트)가 똑같은
  // 기사 원문을 각자 따로 입력받고 있어서, 매번 두 번 붙여넣어야 했다.
  // 여기서 하나로 들어올려 PromptDrawer·WebtoonStoryboardLab 둘 다에
  // 제어 컴포넌트로 넘긴다(각 컴포넌트의 testArticle/article prop 참조) —
  // 한쪽에 붙여넣으면 다른 쪽에도 그대로 보인다.
  const [sharedArticle, setSharedArticle] = useState("");
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
            프롬프트 · 이미지 실험
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

      {panelOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/25 backdrop-blur-[2px] animate-[ui-fade-up_160ms_ease-out]"
          onClick={() => setPanelOpen(false)}
          aria-hidden="true"
        />
      )}
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="webtoon-panel-title"
        inert={!panelOpen}
        className={`fixed right-0 top-0 z-50 flex h-full w-full transform flex-col overflow-y-auto border-l border-[var(--border-hairline)] bg-[var(--surface-card)] shadow-2xl transition-transform duration-300 ease-out sm:max-w-[880px] ${
          panelOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* 2026-09-11 — 제목·닫기·스텝바를 한 sticky 블록으로 묶어 패널
            맨 위에 고정한다 — 아래 도구 내용이 아무리 길어도(특히 프롬프트
            텍스트 칸) 스크롤해서 다른 단계로 못 넘어가는 일이 없게. 배경을
            불투명하게 칠해야 한다 — 안 칠하면 스크롤되는 본문이 뒤에서
            비친다. */}
        <div className="sticky top-0 z-10 bg-[var(--surface-card)]">
          <div className="ui-divider space-y-1 border-b px-5 pb-3 pt-5">
            <div className="flex items-start justify-between gap-4">
              <h2
                id="webtoon-panel-title"
                className="font-display text-[19px] font-bold text-[var(--text-primary)]"
              >
                프롬프트 · 이미지 실험
              </h2>
              <button
                type="button"
                onClick={() => setPanelOpen(false)}
                className="-mr-1.5 cursor-pointer rounded-lg p-1.5 text-[var(--text-faint)] transition-colors hover:bg-[var(--surface-sunken)]"
                aria-label="닫기"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <p className="text-[12.5px] text-[var(--text-muted)]">
              프롬프트를 손보고 → 기사로 스토리보드를 테스트하고 → 마음에 드는 그림체를 찾으면 발행하세요.
            </p>
          </div>
          <StepBar steps={LAB_STEPS} activeId={openLab} onSelect={setOpenLab} />
        </div>

        {/* 안 보이는 단계도 언마운트하지 않는다 — 스토리보드/이미지 생성
            폴링이 다른 단계를 보는 동안에도 끊기지 않고 계속돼야 한다. */}
        <div hidden={openLab !== "prompt"}>
          <PromptDrawer
            channel="webtoon"
            open={panelOpen}
            onClose={() => setPanelOpen(false)}
            embedded
            testArticle={sharedArticle}
            onTestArticleChange={setSharedArticle}
          />
        </div>
        <div hidden={openLab !== "storyboard"}>
          <WebtoonStoryboardLab
            open={panelOpen}
            onClose={() => setPanelOpen(false)}
            embedded
            article={sharedArticle}
            onArticleChange={setSharedArticle}
          />
        </div>
        <div hidden={openLab !== "image"}>
          <WebtoonImageLab open={panelOpen} onClose={() => setPanelOpen(false)} embedded />
        </div>
      </aside>
    </div>
  );
}

// 2026-09-11 — 상단 고정 스텝바. 3단계를 원 배지 + 이어지는 선으로 붙여
// "흐름"처럼 보이게 하고, 어디를 눌러도 그 자리에서 바로(스크롤 없이)
// 해당 단계로 전환된다. 아코디언(위 커밋 로그 참조)의 다음 버전 —
// 아코디언은 펼친 단계의 내용이 길면 스텝 자체가 스크롤 밖으로 밀려나는
// 문제가 있었는데, 이건 부모(webtoon/page.tsx)가 이 컴포넌트를 sticky
// 블록 안에 둬서 그 문제를 없앤다.
function StepBar({
  steps,
  activeId,
  onSelect,
}: {
  steps: Array<{ id: LabId; step: number; title: string }>;
  activeId: LabId;
  onSelect: (id: LabId) => void;
}) {
  return (
    <div className="ui-divider flex items-center overflow-x-auto border-b px-5 py-3">
      {steps.map((s, i) => (
        <div key={s.id} className={`flex items-center ${i < steps.length - 1 ? "flex-1" : ""}`}>
          <button
            type="button"
            onClick={() => onSelect(s.id)}
            aria-current={activeId === s.id ? "step" : undefined}
            className="flex flex-none cursor-pointer items-center gap-2 whitespace-nowrap rounded-lg px-2 py-1.5 transition-colors hover:bg-[var(--surface-sunken)]"
          >
            <span
              className="flex h-6 w-6 flex-none items-center justify-center rounded-full text-[12px] font-bold"
              style={
                activeId === s.id
                  ? { background: "var(--accent)", color: "white" }
                  : { background: "var(--surface-sunken)", color: "var(--text-muted)" }
              }
              aria-hidden="true"
            >
              {s.step}
            </span>
            <span
              className="text-[13px] font-semibold"
              style={{ color: activeId === s.id ? "var(--text-primary)" : "var(--text-muted)" }}
            >
              {s.title}
            </span>
          </button>
          {i < steps.length - 1 && (
            <div
              className="mx-2 h-px min-w-6 flex-1"
              style={{ background: "var(--border-hairline)" }}
              aria-hidden="true"
            />
          )}
        </div>
      ))}
    </div>
  );
}
