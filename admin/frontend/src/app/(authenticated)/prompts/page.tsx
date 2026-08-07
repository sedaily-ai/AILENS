"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { adminApi } from "@/lib/adminClient";
import { ErrorNote, TableSkeleton } from "@/components/Feedback";
import type { PromptListItem } from "@/lib/types";

export default function PromptsPage() {
  const [prompts, setPrompts] = useState<PromptListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminApi
      .listPrompts()
      .then((r) => setPrompts(r.prompts))
      .catch((err) => setError(err.message));
  }, []);

  if (error) {
    return (
      <div className="space-y-3">
        <h1 className="font-display text-[26px] font-bold text-[var(--text-primary)]">
          Prompts
        </h1>
        <ErrorNote message={error} />
      </div>
    );
  }

  if (!prompts) {
    return (
      <div className="space-y-3">
        <h1 className="font-display text-[26px] font-bold text-[var(--text-primary)]">
          Prompts
        </h1>
        <TableSkeleton rows={6} cols={3} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <h1 className="font-display text-[26px] font-bold text-[var(--text-primary)]">
          Prompts{" "}
          <span className="text-[var(--text-muted)] font-normal text-lg">
            ({prompts.length})
          </span>
        </h1>
        <p className="text-xs text-gray-700">
          5-min TTL — 변경 후 production 반영
        </p>
      </div>

      <div className="ui-card rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="ui-thead">
            <tr>
              <th className="text-left px-4 py-2.5">
                ID
              </th>
              <th className="text-right px-4 py-2.5">
                Active Version
              </th>
              <th className="text-left px-4 py-2.5">
                Last Updated
              </th>
            </tr>
          </thead>
          <tbody>
            {prompts.map((p) => (
              <tr
                key={p.id}
                className="border-b ui-divider last:border-0 ui-row-hover transition-colors"
              >
                <td className="px-4 py-3 font-mono text-sm">
                  <Link
                    href={`/prompts/edit?id=${encodeURIComponent(p.id)}`}
                    className="font-medium text-[var(--accent)] hover:text-[var(--accent-hover)] hover:underline underline-offset-2"
                  >
                    {p.id}
                  </Link>
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-gray-800 font-medium">
                  v{p.active_version}
                </td>
                <td className="px-4 py-3 text-xs text-gray-700 tabular-nums">
                  {p.updated_at
                    ? new Date(p.updated_at).toLocaleString("ko-KR", {
                        timeZone: "Asia/Seoul",
                      })
                    : "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
