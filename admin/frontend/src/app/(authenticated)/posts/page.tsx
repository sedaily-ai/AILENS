"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { adminApi } from "@/lib/adminClient";
import { useReloadOnVisible } from "@/lib/useReloadOnVisible";
import { useToast } from "@/components/Toast";
import { ErrorNote } from "@/components/Feedback";
import { ContentTable } from "@/components/ContentTable";
import { usePromptLab } from "@/components/PromptChatLab";
import { type DateRange } from "@/components/DateRangeCalendar";
import type { CmsPost } from "@/lib/types";
import { ECON_CATEGORIES, type EconCategory } from "@/lib/types";

// "분류"(형식: 이슈 톡톡/인사이트/용어해설) 축은 2026-08-19 완전 폐기 —
// "카테고리"(무슨 주제인가) 하나로 통합했다(PostMode.tsx 참조). 필터도
// 그에 맞춰 카테고리 기준으로 다시 짠다.
//
// 웹툰/영상은 2026-08-09에 이 목록으로 잠깐 합쳤다가 같은 날 다시 뺐다 —
// 합쳐두니 "새 글 쓰기"를 누를 때마다 종류를 또 골라야 해서 오히려
// 불편하다는 지적("독립성을 주고 따로 빼라"). 각자 별도 사이드바 메뉴
// (/webtoon, /video)와 자기 목록·자기 "새 글 쓰기"를 가졌었다.
//
// 2026-09-28, 사용자 요청으로 재통합 — "4개 유형을 탭별로 쪼개지 말고
// 글 관리 탭 하나에서 통합... 어차피 레터(4개 유형이 담긴) 형태로만
// 계속 발행하는 것이니까": 지금은 자동 파이프라인(mustknow_auto 등)이
// 항상 레터·웹툰·팟캐스트·영상 4종을 한 번에 묶어(lens 번들) 발행해서,
// 2026-08-09 당시 문제였던 "새 글 쓰기 누르면 종류부터 골라야 하는 불편"
// 자체가 더 이상 없다 — "새 글 쓰기"는 여전히 레터 작성 하나뿐이고,
// 나머지 포맷은 파이프라인이나 /lens/edit에서 채운다. 그래서 제외 필터를
// 뺀다 — 웹툰/영상 채널 글(대부분 is_lens_bundle=true)도 이 목록에 같이
// 보인다. 클릭 시 편집기 분기는 아래 editHref 참고. /webtoon, /video,
// /lens 사이드바 메뉴는 없앴지만 라우트 자체는 남겨뒀다(되돌리기 쉽게 —
// 이 저장소 기존 관례, "프롬프트" 탭 제거 때와 동일).
const CATEGORY_FILTERS: Array<{ key: string; label: string }> = [
  { key: "", label: "전체" },
  ...ECON_CATEGORIES.map((c) => ({ key: c, label: c })),
  { key: "__uncategorized", label: "미분류" },
];

// 2026-08-09 — "오늘의 이슈, 머니 트렌드 이렇게 동시에 체크해서 필터"
// 요청으로 필터가 단일 선택 → 다중 선택(Set)이 됐다. 빈 Set = 전체
// (필터 없음), 그 외엔 선택된 카테고리 중 하나라도 맞으면 통과(합집합).
function matchesCategoryFilter(p: CmsPost, categories: Set<string>): boolean {
  if (categories.size === 0) return true;
  const category = p.body_inline.category || null;
  return [...categories].some((c) => (c === "__uncategorized" ? !category : category === c));
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
  // 2026-09-11 — 필터 변경 재조회 중 posts가 이전 값 그대로라 화면이
  // 멈춘 것처럼 보였다는 지적(ContentTable의 loading prop 참조). 자세한
  // 이유는 webtoon/page.tsx의 같은 주석 참조(set-state-in-effect 회피).
  const [fetchedKey, setFetchedKey] = useState("");
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

  const syncUrl = (next: {
    status: string;
    channel: Set<string>;
    dateRange: DateRange;
    sortDir: "asc" | "desc";
    search: string;
    page: number;
  }) => {
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
  // 2026-09-24, 두 번째 개편 — PromptLab이 페이지별 로컬 state가 아니라
  // 레이아웃 레벨의 전역 Provider로 옮겨갔다(사용자 요청: "근본적으로...
  // 진짜 다 동시작업이 가능하도록... 대화 다른 곳에 머물러도 될 수
  // 있게"). panelOpen을 다른 필터처럼 URL에 계속 되써넣는 건 그만두고
  // (webtoon/page.tsx와 같은 이유), 새로고침 시 복원용으로 마운트 시
  // 1회만 `?panel=chat`을 읽어 열어준다.
  const { open: openPromptLab } = usePromptLab();
  const visibleReloadKey = useReloadOnVisible();

  useEffect(() => {
    if (searchParams.get("panel") === "chat") openPromptLab();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 마운트 시 1회만 URL을 읽어 복원(이후 탭 전환 등은 Provider가 직접 관리)
  }, []);

  // effect 본문에서 동기 setState 를 하지 않는다 (set-state-in-effect 규칙).
  // 필터를 바꿔도 이전 목록을 유지하다가 새 응답이 오면 교체 — 예전엔
  // 이걸로 "깜빡임 없음"만 노렸는데, 그러다 보니 재조회가 오래 걸릴 때
  // 화면이 멈춘 것처럼 보인다는 지적을 받았다(2026-09-11). fetchedKey를
  // "지금 필터 조합"(requestKey)과 비교해서 loading을 파생시키면 setState
  // 동기 호출 없이도(.then()/.catch() 콜백 안에서만 부름) 로딩 신호를
  // 만들 수 있다 — ContentTable의 loading prop 참조. channel은 Set이라
  // JSON.stringify가 내용을 못 담으므로(항상 "{}") 배열로 바꿔서 넣는다.
  const requestKey = JSON.stringify([status, [...channel].sort(), dateRange, visibleReloadKey, bulkReloadKey]);
  const loading = fetchedKey !== requestKey;

  useEffect(() => {
    let cancelled = false;
    const params: { status?: string; limit?: number } = {
      limit: 200,
    };
    if (status) params.status = status;
    // 카테고리는 서버 파라미터로 못 갈린다(body_inline.category 는 서버
    // list_posts 쿼리 대상이 아님) — status만 넘기고, 나머지는 항상 전체를
    // 받아 matchesCategoryFilter로 클라이언트에서 걸러낸다(다중 선택도
    // 여기서 처리, 위 함수 참조).
    adminApi
      .listPosts(params)
      .then((r) => {
        if (cancelled) return;
        const filtered = r.posts.filter(
          (p) => matchesCategoryFilter(p, channel) && inDateRange(p.publish_date, dateRange),
        );
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- requestKey는 아래 deps에서 파생돼 그 값들과 항상 동기화됨
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

  // category 만 바꿔서 저장하면 body_inline 의 나머지 필드(본문·키워드·썸네일
  // 등)까지 통째로 날아간다 — 백엔드 update() 가 body_inline 을 부분 병합이
  // 아니라 통째로 교체하기 때문(admin/repo/posts_repo.py 참조). 그래서 반드시
  // 최신 글 전체를 먼저 받아 body_inline 을 펼친 다음 바뀌는 필드만 덮어써서
  // 통째로 다시 보내야 한다 — PostForm 저장 흐름(posts/edit/page.tsx)과 동일 패턴.
  const bulkSetCategory = async (category: EconCategory) => {
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
          {/* 콘텐츠 유형별 프롬프트 관리 진입점(2026-08-09 정중앙 모달 →
              2026-08-14 우측 슬라이드 드로어로 교체). 드로어가 상태별로
              프롬프트를 따로 들고, 프롬프트 id 는 <channel>/<scope> 다
              (letters/draft · letters/published). 예전 letters/main 은
              DDB 에 없어서 열면 에러만 떴는데, 이제 백엔드 handle_update 가
              LATEST 부재 시 v#1 로 만들어 주므로(upsert) 화면에서 바로
              만들 수 있다. */}
          <button
            type="button"
            onClick={() => openPromptLab()}
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
        loading={loading}
        // 2026-09-28 — 목록을 통합하면서 lens 번들 글(is_lens_bundle)은
        // 레터 전용 편집기(/posts/edit)가 아니라 4탭(레터/웹툰/팟캐스트/
        // 영상) 편집기(/lens/edit)로 바로 들어가게 분기한다. 안 이러면
        // 웹툰/영상이 채워진 글을 레터 편집기로 열게 돼 그 내용이 안 보인다.
        editHref={(p) =>
          p.is_lens_bundle
            ? `/lens/edit?id=${encodeURIComponent(p.id)}`
            : `/posts/edit?id=${encodeURIComponent(p.id)}`
        }
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
          options: CATEGORY_FILTERS,
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
            onSetCategory={bulkSetCategory}
            onDelete={bulkDelete}
            onClear={() => setSelected(new Set())}
          />
        </div>
      )}

    </div>
  );
}

function BulkActionBar({
  count,
  busy,
  onSetCategory,
  onDelete,
  onClear,
}: {
  count: number;
  busy: boolean;
  onSetCategory: (category: EconCategory) => void;
  onDelete: () => void;
  onClear: () => void;
}) {
  return (
    <div
      className="ui-toast flex max-w-full items-center gap-5 overflow-x-auto rounded-xl px-5 py-3.5"
      style={{ background: "var(--accent-soft)", boxShadow: "var(--shadow-md)" }}
    >
      <span className="shrink-0 text-sm font-semibold" style={{ color: "var(--accent)" }}>
        {count}건 선택됨
      </span>

      <span className="h-5 w-px shrink-0 bg-black/10" />

      {/* 카테고리 일괄 입력(자유 텍스트) → 고정 6종 버튼으로 교체(2026-08-17) —
          자유 입력 탓에 "산업 인사이트"/"산업·글로벌"/"IT·플랫폼"처럼 겹치는데
          표기만 다른 값들이 쌓였던 걸 발견하고 근본 원인부터 막는다
          (ECON_CATEGORIES 확정 경위는 lib/types.ts 주석 참조). */}
      <div className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-sm" style={{ color: "var(--text-secondary)" }}>
        카테고리
        {ECON_CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            disabled={busy}
            onClick={() => onSetCategory(c)}
            className="shrink-0 rounded-md px-3 py-1.5 font-medium cursor-pointer bg-white hover:brightness-95 disabled:cursor-default disabled:opacity-50"
          >
            {c}
          </button>
        ))}
      </div>

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
