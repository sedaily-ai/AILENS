"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { adminApi } from "@/lib/adminClient";
import { EmptyState, ErrorNote } from "@/components/Feedback";
import { DateRangeCalendar, type DateRange } from "@/components/DateRangeCalendar";
import type { CmsPost, CmsStatus } from "@/lib/types";

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
const CHANNEL_FILTERS: Array<{ key: string; label: string }> = [
  { key: "", label: "전체" },
  { key: "letters", label: "레터" },
  { key: "trend_card", label: "트렌드·칼럼" },
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

// "레터"/"트렌드·칼럼" 둘 다 DB에서는 channels: ["letters"]로 저장되고
// body_inline.section 유무로만 갈린다(trend_card 채널 값 자체는 이제 안 씀).
// 그래서 채널 필터를 서버 파라미터로 그냥 넘기면 "레터"를 눌러도 트렌드·칼럼
// 글까지 같이 나온다 — 이 함수로 클라이언트에서 최종적으로 한 번 더 걸러야
// 필터 알약 이름과 실제 결과가 일치한다(2026-08-07, "채널 눌렀는데 왜
// 필터링이 안되지" 버그 리포트).
function matchesChannelFilter(p: CmsPost, channel: string): boolean {
  if (!channel) return true;
  const isTrendOrColumn = Boolean(p.body_inline.section);
  if (channel === "trend_card") {
    return p.channels.includes("trend_card") || isTrendOrColumn;
  }
  if (channel === "letters") {
    return p.channels.includes("letters") && !isTrendOrColumn;
  }
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

export default function PostsPage() {
  const [posts, setPosts] = useState<CmsPost[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [channel, setChannel] = useState("");
  // 발행일 단일값 → 범위(시작~끝)로 변경(2026-08-07, "시작일부터 끝일까지
  // 필터링" 요청). 백엔드 list_posts 는 정확히 일치하는 date= 하나만 지원해서
  // 범위 필터는 서버 파라미터로 못 넘긴다 — 항상 전체를 받아서 클라이언트에서
  // from~to 사이인지로 거른다(channel 필터와 같은 이유·같은 패턴).
  const [dateRange, setDateRange] = useState<DateRange>({ from: null, to: null });
  const [page, setPage] = useState(1);

  // effect 본문에서 동기 setState 를 하지 않는다 (set-state-in-effect 규칙).
  // 필터를 바꿔도 이전 목록을 유지하다가 새 응답이 오면 교체 — 깜빡임도 없다.
  useEffect(() => {
    let cancelled = false;
    const params: { status?: string; channel?: string; limit?: number } = {
      limit: 200,
    };
    if (status) params.status = status;
    // "레터"/"트렌드·칼럼"은 서버 channel 파라미터로는 못 갈린다 — 둘 다
    // channels: ["letters"]라 서버가 letters로만 걸러주면 태그 유무 상관없이
    // 섞여 나온다. 그래서 서버 필터는 webtoon/video처럼 애매하지 않은 채널만
    // 쓰고, letters/trend_card는 일단 다 받아서 matchesChannelFilter로
    // 클라이언트에서 최종 확정한다.
    if (channel && channel !== "trend_card" && channel !== "letters") params.channel = channel;
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
  }, [status, channel, dateRange]);

  // 필터가 바뀌면 이전 필터 기준 페이지 번호가 새 목록 범위를 벗어날 수 있다
  // (예: 3페이지 보다가 필터링해서 1페이지 분량만 남는 경우) — state 를 별도로
  // 리셋하는 effect 대신 렌더 시점에 유효 범위로 클램프해서 보여준다.
  const pageCount = posts ? Math.max(1, Math.ceil(posts.length / PAGE_SIZE)) : 1;
  const effectivePage = Math.min(page, pageCount);
  const pageItems = posts ? posts.slice((effectivePage - 1) * PAGE_SIZE, effectivePage * PAGE_SIZE) : [];

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
                    <Link
                      href={`/posts/edit?id=${encodeURIComponent(p.id)}`}
                      className="font-medium text-[var(--accent)] hover:text-[var(--accent-hover)] hover:underline underline-offset-2"
                    >
                      {p.headline}
                    </Link>
                    {p.editor_id && (
                      <span className="ml-2 text-xs text-gray-500">
                        {p.editor_id}
                      </span>
                    )}
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
