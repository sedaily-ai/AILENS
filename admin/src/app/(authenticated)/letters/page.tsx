"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { adminApi } from "@/lib/adminClient";
import { CardSkeleton, EmptyState, ErrorNote } from "@/components/Feedback";
import type { AiLetter } from "@/lib/types";

function todayKST(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + (now.getTimezoneOffset() + 540) * 60000);
  return `${kst.getFullYear()}-${String(kst.getMonth() + 1).padStart(2, "0")}-${String(
    kst.getDate()
  ).padStart(2, "0")}`;
}

export default function LettersPage() {
  const [date, setDate] = useState(todayKST());
  const [letters, setLetters] = useState<AiLetter[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // effect 본문에서 동기 setState 를 하지 않는다 (set-state-in-effect 규칙).
  useEffect(() => {
    let cancelled = false;
    adminApi
      .listLetters(date)
      .then((r) => {
        if (cancelled) return;
        setLetters(r.letters);
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) setError((err as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, [date]);

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <div>
          <h1 className="font-display text-[26px] font-bold text-[var(--text-primary)]">
            AI 레터
          </h1>
          <p className="mt-1 text-[13px] text-[var(--text-muted)]">
            파이프라인이 만든 레터를 고치거나 내립니다. 새로 쓰는 건 콘텐츠 메뉴에서.
          </p>
        </div>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="ui-input rounded-lg px-3 py-2 text-sm"
        />
      </div>

      {error && <ErrorNote message={error} />}
      {!letters && !error && <CardSkeleton count={4} />}

      {letters && letters.length === 0 && (
        <EmptyState
          title="이 날짜에 발행된 AI 레터가 없습니다"
          hint="파이프라인이 매일 새벽에 생성합니다. 날짜를 바꿔 확인해 보세요."
        />
      )}

      {letters && letters.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {letters.map((l, i) => (
            <Link
              key={l.id}
              style={{ ["--i" as string]: i }}
              href={`/letters/edit?id=${encodeURIComponent(l.id)}`}
              className="ui-card ui-card-interactive ui-enter rounded-xl p-4 cursor-pointer block"
            >
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-600">{l.editor_id}</span>
              </div>
              <p className="font-display mt-2.5 text-[15px] font-bold leading-snug text-[var(--text-primary)]">
                {l.headline}
              </p>
              {l.subtitle && (
                <p className="mt-1.5 text-[13px] leading-6 text-[var(--text-muted)] line-clamp-2">{l.subtitle}</p>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
