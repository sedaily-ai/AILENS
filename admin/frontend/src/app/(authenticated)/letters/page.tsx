"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { adminApi } from "@/lib/adminClient";
import { useReloadOnVisible } from "@/lib/useReloadOnVisible";
import { CardSkeleton, EmptyState, ErrorNote } from "@/components/Feedback";
import type { AiLetter } from "@/lib/types";

function todayKST(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + (now.getTimezoneOffset() + 540) * 60000);
  return `${kst.getFullYear()}-${String(kst.getMonth() + 1).padStart(2, "0")}-${String(
    kst.getDate()
  ).padStart(2, "0")}`;
}

// useSearchParams 는 클라이언트 사이드 only — static export 시 Suspense boundary 필수
// (posts/edit, letters/edit 와 동일 패턴).
export default function LettersPageWrapper() {
  return (
    <Suspense fallback={<div className="ui-spinner w-5 h-5 mt-4" />}>
      <LettersPage />
    </Suspense>
  );
}

function LettersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // 날짜 선택을 URL(?date=)에 동기화 — 글 하나를 열었다가 뒤로가기 했을 때
  // 고른 날짜가 오늘로 리셋되던 문제(2026-08-08 사용자 리포트: "뒤로가기 하면
  // 처음 화면으로 돌아간다"). state 는 그대로 두되 초기값을 URL에서 읽고,
  // 바뀔 때마다 URL도 같이 갱신해 뒤로가기가 그 날짜로 돌아오게 한다.
  const [date, setDateState] = useState(() => searchParams.get("date") || todayKST());
  const [letters, setLetters] = useState<AiLetter[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 글 수정/삭제 → "← 목록"(router.back()) 흐름에서 이 페이지가 라우터
  // 캐시에 남아 재마운트가 안 되면 목록이 stale해지는 문제(posts/page.tsx
  // 와 동일 원인·동일 수정, 2026-08-08 리포트) — reloadKey를 올려 강제 재조회.
  const reloadKey = useReloadOnVisible();

  const setDate = (next: string) => {
    setDateState(next);
    router.replace(`/letters?date=${next}`, { scroll: false });
  };

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
  }, [date, reloadKey]);

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
              <p className="font-display text-[15px] font-bold leading-snug text-[var(--text-primary)]">
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
