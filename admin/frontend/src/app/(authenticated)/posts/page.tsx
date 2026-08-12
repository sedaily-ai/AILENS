"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { adminApi } from "@/lib/adminClient";
import { useReloadOnVisible } from "@/lib/useReloadOnVisible";
import { useToast } from "@/components/Toast";
import { ErrorNote } from "@/components/Feedback";
import { ContentTable } from "@/components/ContentTable";
import { PromptEditModal } from "@/components/PromptEditModal";
import { type DateRange } from "@/components/DateRangeCalendar";
import type { CmsPost } from "@/lib/types";

// 일괄 "분류 변경" 대상 — channels 자체(레터↔웹툰/영상)는 PostForm에서도
// 생성 후엔 못 바꾸게 막아뒀다(엉뚱한 채널로 이미 발행된 글이 옮겨가는 사고
// 방지) — 그래서 일괄 이동도 같은 channels:["letters"] 안에서 section만
// 바꾸는 오늘의 이슈/딥다이브/인사이트 세 곳으로만 한정한다. 워딩은
// PostMode.tsx의 분류 드롭다운과 동일(2026-08-12 갱신, 아래 참조).
const BULK_MOVE_TARGETS: Array<{ section: "" | "trend" | "column" | "glossary"; label: string }> = [
  { section: "", label: "오늘의 이슈" },
  { section: "trend", label: "딥다이브" },
  { section: "column", label: "인사이트" },
  { section: "glossary", label: "용어 해설" },
];

// channels 는 글 하나가 여러 개 가질 수 있는 배열이지만(letters/paper/feed 등
// 스펙상 허용), 실제 발행 흐름은 항상 단일 채널로 고정한다(PostForm 참조) —
// 필터도 그 전제로 단순하게 간다.
//
// 탭 라벨은 공개 사이트 섹션 워딩과 동일하게 맞춘다(2026-08-12 갱신 —
// 공개 사이트 나브가 레터/트렌드/칼럼 → 브리핑/딥다이브/인사이트로
// 바뀌면서, channel=letters 기본값(section 없음)에 대응하는 "오늘의 이슈"는
// 그대로 두고 트렌드/칼럼만 딥다이브/인사이트로 교체. PostMode.tsx
// 분류 드롭다운과 짝 — headerTabs.ts 주석에 전체 경위 있음).
//
// 웹툰/영상은 2026-08-09에 이 목록으로 잠깐 합쳤다가 같은 날 다시 뺐다 —
// 합쳐두니 "새 글 쓰기"를 누를 때마다 종류를 또 골라야 해서 오히려
// 불편하다는 지적("독립성을 주고 따로 빼라"). 각자 별도 사이드바 메뉴
// (/webtoon, /video)와 자기 목록·자기 "새 글 쓰기"를 갖는다 — 이 화면은
// 다시 레터 전용. (표 자체는 ContentTable로 세 화면이 공유한다.)
const CHANNEL_FILTERS: Array<{ key: string; label: string }> = [
  { key: "", label: "전체" },
  { key: "letters", label: "오늘의 이슈" },
  { key: "trend", label: "딥다이브" },
  { key: "column", label: "인사이트" },
  { key: "glossary", label: "용어 해설" },
];


// "레터"/"트렌드"/"칼럼" 셋 다 DB에서는 channels: ["letters"]로 저장되고
// body_inline.section 값("trend"/"column"/없음)으로만 갈린다(trend_card 채널
// 값 자체는 이제 안 쓰지만, 예전에 그 채널로 저장된 레코드가 남아있을 수
// 있어 폴백으로 계속 인식한다).
function matchesSingleChannelFilter(p: CmsPost, channel: string): boolean {
  const section = p.body_inline.section ?? (p.channels.includes("trend_card") ? "trend" : null);
  if (channel === "trend") return section === "trend";
  if (channel === "column") return section === "column";
  if (channel === "glossary") return section === "glossary";
  if (channel === "letters") return p.channels.includes("letters") && !section;
  return (p.channels as string[]).includes(channel);
}

// 2026-08-09 — "오늘의 이슈, 머니 트렌드 이렇게 동시에 체크해서 필터"
// 요청으로 채널 필터가 단일 선택 → 다중 선택(Set)이 됐다. 빈 Set = 전체
// (필터 없음), 그 외엔 선택된 채널 중 하나라도 맞으면 통과(합집합).
function matchesChannelFilter(p: CmsPost, channels: Set<string>): boolean {
  if (channels.size === 0) return true;
  return [...channels].some((c) => matchesSingleChannelFilter(p, c));
}

// 발행일 범위 필터 — from/to 둘 다 없으면 전체 통과, from만 있으면 그 이후
// 전체(끝을 아직 안 고른 중), 둘 다 있으면 [from, to] 포함 범위.
function inDateRange(publishDate: string | null | undefined, range: DateRange): boolean {
  if (!range.from) return true;
  const d = publishDate ?? "";
  if (d < range.from) return false;
  if (range.to && d > range.to) return false;
  return true;
}

// useSearchParams 는 클라이언트 사이드 only — static export 시 Suspense boundary 필수
// (posts/edit 와 동일 패턴).
export default function PostsPageWrapper() {
  return (
    <Suspense fallback={<div className="ui-spinner w-5 h-5 mt-4" />}>
      <PostsPage />
    </Suspense>
  );
}

function PostsPage() {
  const toast = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [posts, setPosts] = useState<CmsPost[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 필터·페이지 상태를 URL(?status=&channel=&from=&to=&page=)에 동기화 —
  // 글 하나를 열었다가 뒤로가기 했을 때 필터가 "전체"·1페이지로 리셋되던
  // 문제(2026-08-08 사용자 리포트). 초기값은 URL에서 읽고, 바뀔 때마다
  // router.replace로 URL도 같이 갱신해 뒤로가기가 그 상태로 돌아오게 한다.
  const [status, setStatusState] = useState(() => searchParams.get("status") ?? "");
  const [channel, setChannelState] = useState<Set<string>>(
    () => new Set((searchParams.get("channel") ?? "").split(",").filter(Boolean)),
  );
  // 발행일 단일값 → 범위(시작~끝)로 변경(2026-08-07, "시작일부터 끝일까지
  // 필터링" 요청). 백엔드 list_posts 는 정확히 일치하는 date= 하나만 지원해서
  // 범위 필터는 서버 파라미터로 못 넘긴다 — 항상 전체를 받아서 클라이언트에서
  // from~to 사이인지로 거른다(channel 필터와 같은 이유·같은 패턴).
  const [dateRange, setDateRangeState] = useState<DateRange>(() => ({
    from: searchParams.get("from") || null,
    to: searchParams.get("to") || null,
  }));
  const [page, setPageState] = useState(() => {
    const p = parseInt(searchParams.get("page") ?? "1", 10);
    return Number.isFinite(p) && p > 0 ? p : 1;
  });
  // 발행일 정렬 방향 — 목록은 기본적으로 최신순(desc, 서버가 원래 이 순서로
  // 준다). 헤더 클릭으로 뒤집을 수 있다.
  const [sortDir, setSortDirState] = useState<"asc" | "desc">(
    () => (searchParams.get("sort") === "asc" ? "asc" : "desc")
  );
  // 제목 검색 — 서버 재조회 없이 이미 받아온 목록을 렌더 시점에 한 번 더
  // 거른다(ContentTable 내부, channel/dateRange와 같은 패턴).
  const [search, setSearchState] = useState(() => searchParams.get("q") ?? "");

  const syncUrl = (next: { status: string; channel: Set<string>; dateRange: DateRange; sortDir: "asc" | "desc"; search: string; page: number }) => {
    const params = new URLSearchParams();
    if (next.status) params.set("status", next.status);
    if (next.channel.size > 0) params.set("channel", [...next.channel].join(","));
    if (next.dateRange.from) params.set("from", next.dateRange.from);
    if (next.dateRange.to) params.set("to", next.dateRange.to);
    if (next.sortDir === "asc") params.set("sort", "asc");
    if (next.search) params.set("q", next.search);
    if (next.page > 1) params.set("page", String(next.page));
    const qs = params.toString();
    router.replace(qs ? `/posts?${qs}` : "/posts", { scroll: false });
  };

  const setStatus = (next: string) => {
    setStatusState(next);
    syncUrl({ status: next, channel, dateRange, sortDir, search, page: 1 });
  };
  const setChannel = (next: Set<string>) => {
    setChannelState(next);
    syncUrl({ status, channel: next, dateRange, sortDir, search, page: 1 });
  };
  const setDateRange = (next: DateRange) => {
    setDateRangeState(next);
    syncUrl({ status, channel, dateRange: next, sortDir, search, page: 1 });
  };
  const toggleSortDir = () => {
    const next = sortDir === "desc" ? "asc" : "desc";
    setSortDirState(next);
    syncUrl({ status, channel, dateRange, sortDir: next, search, page: 1 });
  };
  const setSearch = (next: string) => {
    setSearchState(next);
    syncUrl({ status, channel, dateRange, sortDir, search: next, page: 1 });
  };
  const setPage = (updater: number | ((prev: number) => number)) => {
    setPageState((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      syncUrl({ status, channel, dateRange, sortDir, search, page: next });
      return next;
    });
  };
  // 일괄 선택/작업(2026-08-07, "체크 가능하게 해서 일괄 삭제·이동·카테고리
  // 변경" 요청). bulkReloadKey 를 올리면 아래 목록 fetch effect 가 다시 돈다 —
  // 일괄 작업 성공 후 최신 상태를 다시 받아오는 용도.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkReloadKey, setBulkReloadKey] = useState(0);
  const [promptOpen, setPromptOpen] = useState(false);
  const visibleReloadKey = useReloadOnVisible();

  // effect 본문에서 동기 setState 를 하지 않는다 (set-state-in-effect 규칙).
  // 필터를 바꿔도 이전 목록을 유지하다가 새 응답이 오면 교체 — 깜빡임도 없다.
  useEffect(() => {
    let cancelled = false;
    const params: { status?: string; limit?: number } = {
      limit: 200,
    };
    if (status) params.status = status;
    // 채널이 letters/trend/column 뿐이라(웹툰/영상은 아래서 항상 제외) 서버
    // channel 파라미터로는 애초에 못 갈린다 — 셋 다 channels: ["letters"]로
    // 저장되고 body_inline.section 으로만 구분되기 때문. 그래서 서버는
    // status만 넘기고, 채널은 항상 전체를 받아 matchesChannelFilter로
    // 클라이언트에서 걸러낸다(다중 선택도 여기서 처리, 위 함수 참조).
    adminApi
      .listPosts(params)
      .then((r) => {
        if (cancelled) return;
        // 웹툰/영상은 별도 화면(/webtoon, /video)에서 관리한다 — "전체" 필터를
        // 골라도 이 목록엔 안 섞이게 항상 제외한다.
        const filtered = r.posts.filter(
          (p) =>
            !p.channels.includes("webtoon") &&
            !p.channels.includes("video") &&
            matchesChannelFilter(p, channel) &&
            inDateRange(p.publish_date, dateRange),
        );
        setPosts(filtered);
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) setError((err as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, [status, channel, dateRange, visibleReloadKey, bulkReloadKey]);

  // 필터가 바뀌면 화면에 보이던 선택 대상 자체가 통째로 바뀌는 셈이라(다른
  // 글이 그 자리에 보임) 이전 선택을 그대로 들고 가면 헷갈린다 — 필터 변경
  // 시 선택 초기화. 페이지 이동(다음/이전)만으로는 초기화하지 않는다 —
  // 여러 페이지에 걸쳐 선택해서 한 번에 처리하는 것도 유효한 흐름이라서.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 필터 변경 시 선택 초기화(정당한 케이스)
    setSelected(new Set());
  }, [status, channel, dateRange, search]);

  // h1 배지 숫자 — ContentTable이 내부에서 search까지 적용한 최종 개수를
  // 갖고 있어서, 여기선 같은 필터를 가볍게 한 번 더 계산한다(표 쪽 로직을
  // 그대로 끌어올 만큼 크지 않다).
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

  const finishBulk = (okCount: number, failCount: number, verb: string) => {
    setBulkBusy(false);
    setSelected(new Set());
    setBulkReloadKey((k) => k + 1);
    if (failCount === 0) {
      toast.show(`${okCount}건 ${verb}했습니다`, "success");
    } else {
      toast.show(`${okCount}건 ${verb}, ${failCount}건 실패`, "error");
    }
  };

  const bulkDelete = async () => {
    if (selected.size === 0) return;
    if (!window.confirm(`선택한 ${selected.size}건을 삭제할까요? 되돌릴 수 없습니다.`)) return;
    setBulkBusy(true);
    const ids = [...selected];
    const results = await Promise.allSettled(ids.map((id) => adminApi.deletePost(id)));
    const failCount = results.filter((r) => r.status === "rejected").length;
    finishBulk(ids.length - failCount, failCount, "삭제");
  };

  // section 만 바꿔서 저장하면 body_inline 의 나머지 필드(본문·키워드·썸네일
  // 등)까지 통째로 날아간다 — 백엔드 update() 가 body_inline 을 부분 병합이
  // 아니라 통째로 교체하기 때문(admin/repo/posts_repo.py 참조). 그래서 반드시
  // 최신 글 전체를 먼저 받아 body_inline 을 펼친 다음 바뀌는 필드만 덮어써서
  // 통째로 다시 보내야 한다 — PostForm 저장 흐름(posts/edit/page.tsx)과 동일 패턴.
  const bulkMove = async (section: "" | "trend" | "column" | "glossary") => {
    if (selected.size === 0) return;
    setBulkBusy(true);
    const ids = [...selected];
    const results = await Promise.allSettled(
      ids.map(async (id) => {
        const { post } = await adminApi.getPost(id);
        return adminApi.updatePost(id, {
          body_inline: { ...post.body_inline, section: section || undefined },
        });
      }),
    );
    const failCount = results.filter((r) => r.status === "rejected").length;
    finishBulk(ids.length - failCount, failCount, "이동");
  };

  const bulkSetCategory = async (category: string) => {
    if (selected.size === 0) return;
    setBulkBusy(true);
    const ids = [...selected];
    const results = await Promise.allSettled(
      ids.map(async (id) => {
        const { post } = await adminApi.getPost(id);
        return adminApi.updatePost(id, { body_inline: { ...post.body_inline, category } });
      }),
    );
    const failCount = results.filter((r) => r.status === "rejected").length;
    finishBulk(ids.length - failCount, failCount, "카테고리 변경");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <h1 className="font-display text-[26px] font-bold text-[var(--text-primary)]">
          글 관리{" "}
          {visibleCount !== null && (
            <span className="text-[var(--text-muted)] font-normal text-lg">({visibleCount})</span>
          )}
        </h1>
        <div className="flex items-center gap-2">
          {/* 콘텐츠 유형별 프롬프트 관리 진입점(2026-08-09, "새 글 쓰기 옆에
              프롬프트 버튼, 누르면 화면 정중앙에 모달로" 요청) — 지금은
              프론트 배선만이다. category/name 조합(letters/main)이 DDB에
              아직 없으면 모달 안에 에러 메시지가 뜬다 — 실제 레터 생성엔
              AI 프롬프트가 없어서(전부 수동 작성 콘텐츠) 백엔드에 이
              카테고리를 만드는 건 별도 작업으로 미뤘다("나중에 다 유형별로
              둘 거라서요"). */}
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
          <Link
            href="/posts/edit"
            className="ui-btn ui-btn-primary rounded-lg px-4 py-2 text-sm font-semibold"
          >
            새 글 쓰기
          </Link>
        </div>
      </div>

      {error && <ErrorNote message={error} />}

      <ContentTable
        posts={posts}
        editHref={(p) => `/posts/edit?id=${encodeURIComponent(p.id)}`}
        newHref="/posts/edit"
        newLabel="새 글 쓰기"
        emptyTitle="아직 글이 없습니다"
        emptyHint="첫 글을 쓰면 사용자 화면에 바로 반영됩니다."
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
        channelColumn={{
          values: channel,
          onChange: setChannel,
          options: CHANNEL_FILTERS,
        }}
        thumbnail={(p) => p.cover_image_url || null}
      />

      {/* 선택 시 표 위에 끼어들면 표 위치가 왔다갔다해서(2026-08-09 지적),
          표 흐름 밖에 떠 있는 하단 고정 바로 뺐다 — 체크박스는 위→아래로
          누르니 방해 없이 바로 아래 나타났다 사라진다. */}
      {selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-10 z-30 flex justify-center px-4 lg:pl-[240px]">
          <BulkActionBar
            count={selected.size}
            busy={bulkBusy}
            onMove={bulkMove}
            onSetCategory={bulkSetCategory}
            onDelete={bulkDelete}
            onClear={() => setSelected(new Set())}
          />
        </div>
      )}

      {promptOpen && <PromptEditModal id="letters/main" onClose={() => setPromptOpen(false)} />}
    </div>
  );
}

function BulkActionBar({
  count,
  busy,
  onMove,
  onSetCategory,
  onDelete,
  onClear,
}: {
  count: number;
  busy: boolean;
  onMove: (section: "" | "trend" | "column" | "glossary") => void;
  onSetCategory: (category: string) => void;
  onDelete: () => void;
  onClear: () => void;
}) {
  const [category, setCategory] = useState("");

  return (
    <div
      className="ui-toast flex max-w-full items-center gap-5 overflow-x-auto rounded-xl px-5 py-3.5"
      style={{ background: "var(--accent-soft)", boxShadow: "var(--shadow-md)" }}
    >
      <span className="shrink-0 text-sm font-semibold" style={{ color: "var(--accent)" }}>
        {count}건 선택됨
      </span>

      <span className="h-5 w-px shrink-0 bg-black/10" />

      <div className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-sm" style={{ color: "var(--text-secondary)" }}>
        분류 변경
        {BULK_MOVE_TARGETS.map((t) => (
          <button
            key={t.label}
            type="button"
            disabled={busy}
            onClick={() => onMove(t.section)}
            className="shrink-0 rounded-md px-3 py-1.5 font-medium cursor-pointer bg-white hover:brightness-95 disabled:cursor-default disabled:opacity-50"
          >
            {t.label}
          </button>
        ))}
      </div>

      <span className="h-5 w-px shrink-0 bg-black/10" />

      <form
        className="flex shrink-0 items-center gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (category.trim()) onSetCategory(category.trim());
        }}
      >
        <input
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="카테고리 일괄 입력"
          disabled={busy}
          className="rounded-md px-3 py-1.5 text-sm bg-white outline-none w-36 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={busy || !category.trim()}
          className="shrink-0 rounded-md px-3 py-1.5 text-sm font-medium cursor-pointer bg-white hover:brightness-95 disabled:cursor-default disabled:opacity-50"
        >
          적용
        </button>
      </form>

      <span className="h-5 w-px shrink-0 bg-black/10" />

      <button
        type="button"
        disabled={busy}
        onClick={onDelete}
        className="shrink-0 rounded-md px-3 py-1.5 text-sm font-semibold cursor-pointer text-red-600 bg-white hover:brightness-95 disabled:cursor-default disabled:opacity-50"
      >
        삭제
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={onClear}
        className="shrink-0 whitespace-nowrap text-sm font-medium cursor-pointer disabled:cursor-default disabled:opacity-50"
        style={{ color: "var(--text-secondary)" }}
      >
        선택 해제
      </button>
    </div>
  );
}
