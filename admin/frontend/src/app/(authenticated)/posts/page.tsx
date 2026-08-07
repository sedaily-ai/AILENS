"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { adminApi } from "@/lib/adminClient";
import { useToast } from "@/components/Toast";
import { EmptyState, ErrorNote } from "@/components/Feedback";
import { DateRangeCalendar, type DateRange } from "@/components/DateRangeCalendar";
import type { CmsPost, CmsStatus } from "@/lib/types";

// 일괄 "분류 변경" 대상 — channels 자체(레터↔웹툰/영상)는 PostForm에서도
// 생성 후엔 못 바꾸게 막아뒀다(엉뚱한 채널로 이미 발행된 글이 옮겨가는 사고
// 방지) — 그래서 일괄 이동도 같은 channels:["letters"] 안에서 section만
// 바꾸는 레터/경제 이슈/인기 칼럼 세 곳으로만 한정한다.
const BULK_MOVE_TARGETS: Array<{ section: "" | "trend" | "column"; label: string }> = [
  { section: "", label: "레터" },
  { section: "trend", label: "경제 이슈" },
  { section: "column", label: "인기 칼럼" },
];

const STATUS_LABEL: Record<CmsStatus, string> = {
  draft: "초안",
  published: "발행",
  archived: "보관",
};

const STATUS_STYLE: Record<CmsStatus, string> = {
  draft: "ui-badge-draft",
  published: "ui-badge-published",
  archived: "ui-badge-archived",
};

const FILTERS: Array<{ key: string; label: string }> = [
  { key: "", label: "전체" },
  { key: "draft", label: "초안" },
  { key: "published", label: "발행" },
];

// channels 는 글 하나가 여러 개 가질 수 있는 배열이지만(letters/paper/feed 등
// 스펙상 허용), 실제 발행 흐름은 항상 단일 채널로 고정한다(PostForm 참조) —
// 필터도 그 전제로 단순하게 간다.
//
// 탭 라벨은 사용자 화면 섹션(FollowingFeed="이슈 톡톡", TrendingEconomySection=
// "요즘 화제의 경제 이슈", ColumnPreviewSection="이번 주 인기 칼럼",
// WebtoonPreviewSection="이슈를 웹툰으로", VideoPreviewSection="영상으로 보는
// 이슈")과 짝이 맞는 짧은 이름으로(2026-08-07, 전체 제목은 탭 알약엔 너무
// 길다는 지적으로 축약). "레터"만 예외로 이름을 그대로 뒀다 — "이슈 톡톡"은
// 이제 admin이 실제 이름(editor_id)으로 태깅한 레터만 가리키는 더 좁은
// 개념이라(FollowingFeed.tsx 참조), channels:["letters"] 전체를 "이슈 톡톡"
// 이라 부르면 오히려 헷갈린다. "트렌드·칼럼"은 하나였던 탭을 실제 공개
// 화면처럼 두 섹션으로 분리했다.
const CHANNEL_FILTERS: Array<{ key: string; label: string }> = [
  { key: "", label: "전체" },
  { key: "letters", label: "레터" },
  { key: "trend", label: "경제 이슈" },
  { key: "column", label: "인기 칼럼" },
  { key: "webtoon", label: "웹툰" },
  { key: "video", label: "영상" },
];

const SECTION_LABEL: Record<string, string> = {
  trend: "경제 이슈",
  column: "인기 칼럼",
};

// CHANNEL_FILTERS 필터 알약과 같은 한글 라벨 — 목록 표에는 raw 값("letters"
// 등 영문)이 그대로 나와서 필터 라벨(레터/웹툰/영상)과 안 맞아 보인다는
// 지적(2026-08-07)으로 통일. trend_card 채널 자체는 안 쓰지만(letters +
// section 태그로 통합) 혹시 남아있는 레코드 대비 매핑은 유지.
const CHANNEL_LABEL: Record<string, string> = {
  letters: "레터",
  trend_card: "트렌드·칼럼",
  webtoon: "웹툰",
  video: "영상",
  paper: "지면",
  feed: "피드",
};

// section 태그가 붙은 letters 글은 실질적으로 "트렌드·칼럼" 취급이라(채널
// 필터 알약도 이 기준으로 갈린다) 구체적인 종류(경제 이슈/인기 칼럼)만
// 보여준다 — "트렌드·칼럼 · 인기 칼럼"처럼 "칼럼"이 겹치는 겹말이 됐던
// 문제(2026-08-07 지적)로 정리.
function channelLabel(p: CmsPost): string {
  if (!p.channels.length) return "-";
  if (p.body_inline.section) {
    return SECTION_LABEL[p.body_inline.section] ?? p.body_inline.section;
  }
  return p.channels.map((c) => CHANNEL_LABEL[c] ?? c).join(", ");
}

// "레터"/"트렌드"/"칼럼" 셋 다 DB에서는 channels: ["letters"]로 저장되고
// body_inline.section 값("trend"/"column"/없음)으로만 갈린다(trend_card 채널
// 값 자체는 이제 안 쓰지만, 예전에 그 채널로 저장된 레코드가 남아있을 수
// 있어 폴백으로 계속 인식한다). 그래서 채널 필터를 서버 파라미터로 그냥
// 넘기면 "레터"를 눌러도 트렌드·칼럼 글까지 같이 나온다 — 이 함수로 클라이언트에서
// 최종적으로 한 번 더 걸러야 필터 알약 이름과 실제 결과가 일치한다
// (2026-08-07, "채널 눌렀는데 왜 필터링이 안되지" 버그 리포트).
function matchesChannelFilter(p: CmsPost, channel: string): boolean {
  if (!channel) return true;
  const section = p.body_inline.section ?? (p.channels.includes("trend_card") ? "trend" : null);
  if (channel === "trend") return section === "trend";
  if (channel === "column") return section === "column";
  if (channel === "letters") return p.channels.includes("letters") && !section;
  return (p.channels as string[]).includes(channel);
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

const PAGE_SIZE = 15;

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
  const [channel, setChannelState] = useState(() => searchParams.get("channel") ?? "");
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

  const syncUrl = (next: { status: string; channel: string; dateRange: DateRange; page: number }) => {
    const params = new URLSearchParams();
    if (next.status) params.set("status", next.status);
    if (next.channel) params.set("channel", next.channel);
    if (next.dateRange.from) params.set("from", next.dateRange.from);
    if (next.dateRange.to) params.set("to", next.dateRange.to);
    if (next.page > 1) params.set("page", String(next.page));
    const qs = params.toString();
    router.replace(qs ? `/posts?${qs}` : "/posts", { scroll: false });
  };

  const setStatus = (next: string) => {
    setStatusState(next);
    syncUrl({ status: next, channel, dateRange, page: 1 });
  };
  const setChannel = (next: string) => {
    setChannelState(next);
    syncUrl({ status, channel: next, dateRange, page: 1 });
  };
  const setDateRange = (next: DateRange) => {
    setDateRangeState(next);
    syncUrl({ status, channel, dateRange: next, page: 1 });
  };
  const setPage = (updater: number | ((prev: number) => number)) => {
    setPageState((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      syncUrl({ status, channel, dateRange, page: next });
      return next;
    });
  };
  // 일괄 선택/작업(2026-08-07, "체크 가능하게 해서 일괄 삭제·이동·카테고리
  // 변경" 요청). reloadKey 를 올리면 아래 목록 fetch effect 가 다시 돈다 —
  // 일괄 작업 성공 후 최신 상태를 다시 받아오는 용도.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // effect 본문에서 동기 setState 를 하지 않는다 (set-state-in-effect 규칙).
  // 필터를 바꿔도 이전 목록을 유지하다가 새 응답이 오면 교체 — 깜빡임도 없다.
  useEffect(() => {
    let cancelled = false;
    const params: { status?: string; channel?: string; limit?: number } = {
      limit: 200,
    };
    if (status) params.status = status;
    // "레터"/"트렌드"/"칼럼"은 서버 channel 파라미터로는 못 갈린다 — 셋 다
    // channels: ["letters"]라 서버가 letters로만 걸러주면 태그 유무 상관없이
    // 섞여 나온다. 그래서 서버 필터는 webtoon/video처럼 애매하지 않은 채널만
    // 쓰고, letters/trend/column은 일단 다 받아서 matchesChannelFilter로
    // 클라이언트에서 최종 확정한다.
    if (channel && channel !== "trend" && channel !== "column" && channel !== "letters") params.channel = channel;
    adminApi
      .listPosts(params)
      .then((r) => {
        if (cancelled) return;
        const filtered = r.posts.filter(
          (p) => matchesChannelFilter(p, channel) && inDateRange(p.publish_date, dateRange),
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
  }, [status, channel, dateRange, reloadKey]);

  // 필터가 바뀌면 화면에 보이던 선택 대상 자체가 통째로 바뀌는 셈이라(다른
  // 글이 그 자리에 보임) 이전 선택을 그대로 들고 가면 헷갈린다 — 필터 변경
  // 시 선택 초기화. 페이지 이동(다음/이전)만으로는 초기화하지 않는다 —
  // 여러 페이지에 걸쳐 선택해서 한 번에 처리하는 것도 유효한 흐름이라서.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 필터 변경 시 선택 초기화(정당한 케이스)
    setSelected(new Set());
  }, [status, channel, dateRange]);

  // 필터가 바뀌면 이전 필터 기준 페이지 번호가 새 목록 범위를 벗어날 수 있다
  // (예: 3페이지 보다가 필터링해서 1페이지 분량만 남는 경우) — state 를 별도로
  // 리셋하는 effect 대신 렌더 시점에 유효 범위로 클램프해서 보여준다.
  const pageCount = posts ? Math.max(1, Math.ceil(posts.length / PAGE_SIZE)) : 1;
  const effectivePage = Math.min(page, pageCount);
  const pageItems = posts ? posts.slice((effectivePage - 1) * PAGE_SIZE, effectivePage * PAGE_SIZE) : [];

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const pageAllSelected = pageItems.length > 0 && pageItems.every((p) => selected.has(p.id));
  const togglePageAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (pageAllSelected) {
        for (const p of pageItems) next.delete(p.id);
      } else {
        for (const p of pageItems) next.add(p.id);
      }
      return next;
    });
  };

  const finishBulk = (okCount: number, failCount: number, verb: string) => {
    setBulkBusy(false);
    setSelected(new Set());
    setReloadKey((k) => k + 1);
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
  const bulkMove = async (section: "" | "trend" | "column") => {
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
          콘텐츠{" "}
          {posts && (
            <span className="text-[var(--text-muted)] font-normal text-lg">
              ({posts.length})
            </span>
          )}
        </h1>
        <Link
          href="/posts/edit"
          className="ui-btn ui-btn-primary rounded-lg px-4 py-2 text-sm font-semibold"
        >
          새 글 쓰기
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <div className="flex gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => {
                setStatus(f.key);
                setPage(1);
              }}
              className={`text-[13px] font-medium px-3 py-1.5 rounded-lg cursor-pointer transition-colors ${
                status === f.key ? "font-semibold" : "hover:bg-[var(--surface-sunken)]"
              }`}
              style={{
                background: status === f.key ? "var(--accent-soft)" : undefined,
                color:
                  status === f.key ? "var(--accent)" : "var(--text-secondary)",
              }}
            >
              {f.label}
            </button>
          ))}
        </div>

        <span className="h-4 w-px bg-gray-200" />

        <div className="flex gap-1">
          {CHANNEL_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => {
                setChannel(f.key);
                setPage(1);
              }}
              className={`text-[13px] font-medium px-3 py-1.5 rounded-lg cursor-pointer transition-colors ${
                channel === f.key ? "font-semibold" : "hover:bg-[var(--surface-sunken)]"
              }`}
              style={{
                background: channel === f.key ? "var(--accent-soft)" : undefined,
                color:
                  channel === f.key ? "var(--accent)" : "var(--text-secondary)",
              }}
            >
              {f.label}
            </button>
          ))}
        </div>

        <span className="h-4 w-px bg-gray-200" />

        <DateRangeCalendar
          value={dateRange}
          onChange={(r) => {
            setDateRange(r);
            setPage(1);
          }}
        />
      </div>

      {selected.size > 0 && (
        <BulkActionBar
          count={selected.size}
          busy={bulkBusy}
          onMove={bulkMove}
          onSetCategory={bulkSetCategory}
          onDelete={bulkDelete}
          onClear={() => setSelected(new Set())}
        />
      )}

      {error && <ErrorNote message={error} />}

      {posts && posts.length === 0 && (
        <EmptyState
          title="아직 글이 없습니다"
          hint="첫 글을 쓰면 사용자 화면에 바로 반영됩니다."
          action={
            <Link
              href="/posts/edit"
              className="ui-btn ui-btn-primary rounded-lg px-4 py-2 text-sm font-semibold"
            >
              새 글 쓰기
            </Link>
          }
        />
      )}

      {posts && posts.length > 0 && (
        <div className="ui-card rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="ui-thead">
              <tr>
                <th className="w-10 px-4 py-2.5">
                  <input
                    type="checkbox"
                    checked={pageAllSelected}
                    onChange={togglePageAll}
                    aria-label="이 페이지 전체 선택"
                    className="cursor-pointer"
                  />
                </th>
                <th className="text-left px-4 py-2.5">
                  제목
                </th>
                <th className="text-left px-4 py-2.5">
                  상태
                </th>
                <th className="text-left px-4 py-2.5">
                  채널
                </th>
                <th className="text-left px-4 py-2.5">
                  발행일
                </th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((p, i) => (
                <tr
                  key={p.id}
                  className="border-b ui-divider last:border-0 ui-row-hover ui-enter"
                  style={{ ["--i" as string]: i }}
                >
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selected.has(p.id)}
                      onChange={() => toggleOne(p.id)}
                      aria-label={`${p.headline} 선택`}
                      className="cursor-pointer"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/posts/edit?id=${encodeURIComponent(p.id)}`}
                      className="font-medium text-[var(--accent)] hover:text-[var(--accent-hover)] hover:underline underline-offset-2"
                    >
                      {p.headline}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`ui-badge ${STATUS_STYLE[p.status]}`}>
                      {STATUS_LABEL[p.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[13px] text-[var(--text-muted)]">
                    {channelLabel(p)}
                  </td>
                  <td className="px-4 py-3 text-[13px] text-[var(--text-muted)] tabular-nums">
                    {p.publish_date}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {pageCount > 1 && (
            <div className="flex items-center justify-between border-t ui-divider px-4 py-3">
              <span className="text-[13px] text-[var(--text-muted)]">
                {effectivePage} / {pageCount} 페이지 · 총 {posts.length}건
              </span>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={effectivePage <= 1}
                  className="text-[13px] font-medium px-3 py-1.5 rounded-lg cursor-pointer disabled:cursor-default disabled:opacity-40 hover:bg-[var(--surface-sunken)] text-[var(--text-secondary)]"
                >
                  이전
                </button>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                  disabled={effectivePage >= pageCount}
                  className="text-[13px] font-medium px-3 py-1.5 rounded-lg cursor-pointer disabled:cursor-default disabled:opacity-40 hover:bg-[var(--surface-sunken)] text-[var(--text-secondary)]"
                >
                  다음
                </button>
              </div>
            </div>
          )}
        </div>
      )}
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
  onMove: (section: "" | "trend" | "column") => void;
  onSetCategory: (category: string) => void;
  onDelete: () => void;
  onClear: () => void;
}) {
  const [category, setCategory] = useState("");

  return (
    <div
      className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl px-4 py-3"
      style={{ background: "var(--accent-soft)" }}
    >
      <span className="text-[13px] font-semibold" style={{ color: "var(--accent)" }}>
        {count}건 선택됨
      </span>

      <span className="h-4 w-px bg-black/10" />

      <div className="flex items-center gap-1.5 text-[13px]" style={{ color: "var(--text-secondary)" }}>
        분류 변경
        {BULK_MOVE_TARGETS.map((t) => (
          <button
            key={t.label}
            type="button"
            disabled={busy}
            onClick={() => onMove(t.section)}
            className="rounded-md px-2.5 py-1 font-medium cursor-pointer bg-white hover:brightness-95 disabled:cursor-default disabled:opacity-50"
          >
            {t.label}
          </button>
        ))}
      </div>

      <span className="h-4 w-px bg-black/10" />

      <form
        className="flex items-center gap-1.5"
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
          className="rounded-md px-2.5 py-1 text-[13px] bg-white outline-none w-32 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={busy || !category.trim()}
          className="rounded-md px-2.5 py-1 text-[13px] font-medium cursor-pointer bg-white hover:brightness-95 disabled:cursor-default disabled:opacity-50"
        >
          적용
        </button>
      </form>

      <span className="ml-auto h-4 w-px bg-black/10" />

      <button
        type="button"
        disabled={busy}
        onClick={onDelete}
        className="rounded-md px-2.5 py-1 text-[13px] font-semibold cursor-pointer text-red-600 bg-white hover:brightness-95 disabled:cursor-default disabled:opacity-50"
      >
        삭제
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={onClear}
        className="text-[13px] font-medium cursor-pointer disabled:cursor-default disabled:opacity-50"
        style={{ color: "var(--text-secondary)" }}
      >
        선택 해제
      </button>
    </div>
  );
}
