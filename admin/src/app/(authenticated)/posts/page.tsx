"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { adminApi } from "@/lib/adminClient";
import { EmptyState, ErrorNote } from "@/components/Feedback";
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

// channels 하나로는 "경제 이슈"/"인기 칼럼" 태그가 안 보여서 옆에 같이 표시한다
// — trend_card 채널 글뿐 아니라, letters 채널에 태그만 붙인 글도 해당.
function channelLabel(p: CmsPost): string {
  if (!p.channels.length) return "-";
  const base = p.channels.join(", ");
  if (p.body_inline.section) {
    return `${base} · ${SECTION_LABEL[p.body_inline.section] ?? p.body_inline.section}`;
  }
  return base;
}

const PAGE_SIZE = 15;

export default function PostsPage() {
  const [posts, setPosts] = useState<CmsPost[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [channel, setChannel] = useState("");
  const [date, setDate] = useState("");
  const [page, setPage] = useState(1);

  // effect 본문에서 동기 setState 를 하지 않는다 (set-state-in-effect 규칙).
  // 필터를 바꿔도 이전 목록을 유지하다가 새 응답이 오면 교체 — 깜빡임도 없다.
  useEffect(() => {
    let cancelled = false;
    const params: { status?: string; channel?: string; date?: string; limit?: number } = {
      limit: 200,
    };
    if (status) params.status = status;
    if (date) params.date = date;
    // "트렌드·칼럼" 필터는 trend_card 채널뿐 아니라, letters 채널에 태그만 붙인
    // 글(PostForm mode="post" 의 /letters 태그 selector)도 잡아야 한다 —
    // channel 서버 필터로는 안 갈리니 여기선 안 넘기고 클라이언트에서 거른다.
    if (channel && channel !== "trend_card") params.channel = channel;
    adminApi
      .listPosts(params)
      .then((r) => {
        if (cancelled) return;
        const filtered =
          channel === "trend_card"
            ? r.posts.filter(
                (p) => p.channels.includes("trend_card") || Boolean(p.body_inline.section),
              )
            : r.posts;
        setPosts(filtered);
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) setError((err as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, [status, channel, date]);

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

        <label className="flex items-center gap-1.5 text-[13px] text-gray-400">
          발행일
          <input
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setPage(1);
            }}
            className="border-0 bg-transparent font-medium text-gray-700 outline-none cursor-pointer"
          />
          {date && (
            <button
              type="button"
              onClick={() => {
                setDate("");
                setPage(1);
              }}
              className="text-gray-400 hover:text-gray-700 cursor-pointer"
              aria-label="발행일 필터 지우기"
            >
              ✕
            </button>
          )}
        </label>
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
