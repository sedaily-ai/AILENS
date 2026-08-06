"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { adminApi } from "@/lib/adminClient";
import { EmptyState, ErrorNote, TableSkeleton } from "@/components/Feedback";
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

export default function PostsPage() {
  const [posts, setPosts] = useState<CmsPost[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");

  // effect 본문에서 동기 setState 를 하지 않는다 (set-state-in-effect 규칙).
  // 필터를 바꿔도 이전 목록을 유지하다가 새 응답이 오면 교체 — 깜빡임도 없다.
  useEffect(() => {
    let cancelled = false;
    adminApi
      .listPosts(status ? { status } : undefined)
      .then((r) => {
        if (cancelled) return;
        setPosts(r.posts);
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) setError((err as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, [status]);

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

      <div className="flex gap-1">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setStatus(f.key)}
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

      {error && <ErrorNote message={error} />}
      {!posts && !error && <TableSkeleton rows={5} cols={4} />}

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
              {posts.map((p, i) => (
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
                    {p.channels.length ? p.channels.join(", ") : "-"}
                  </td>
                  <td className="px-4 py-3 text-[13px] text-[var(--text-muted)] tabular-nums">
                    {p.publish_date}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
