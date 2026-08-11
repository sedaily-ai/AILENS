/* 로딩·빈 상태·에러 공용 표시. 화면마다 "로드 중..." 을 다르게 쓰면
   품질이 들쭉날쭉해져서 한 곳에 모았다. */

/** 표 형태 로딩 — 실제 표와 같은 골격이라 데이터가 들어와도 레이아웃이 안 튄다. */
export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="ui-card rounded-xl overflow-hidden" aria-busy="true" aria-live="polite">
      <div className="ui-thead flex gap-4 px-4 py-3">
        {Array.from({ length: cols }).map((_, i) => (
          <div
            key={i}
            className="ui-skeleton h-3"
            style={{ width: i === 0 ? "38%" : "16%" }}
          />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div
          key={r}
          className="flex gap-4 px-4 py-3.5 border-b ui-divider last:border-0 ui-enter"
          style={{ ["--i" as string]: r }}
        >
          {Array.from({ length: cols }).map((_, c) => (
            <div
              key={c}
              className="ui-skeleton h-3.5"
              style={{ width: c === 0 ? "38%" : "16%" }}
            />
          ))}
        </div>
      ))}
      <span className="sr-only">불러오는 중</span>
    </div>
  );
}

/** 카드 그리드 로딩 */
export function CardSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2" aria-busy="true" aria-live="polite">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="ui-card rounded-xl p-4 ui-enter"
          style={{ ["--i" as string]: i }}
        >
          <div className="ui-skeleton h-4 w-12 rounded-full" />
          <div className="ui-skeleton h-4 w-4/5 mt-3" />
          <div className="ui-skeleton h-3 w-3/5 mt-2.5" />
        </div>
      ))}
      <span className="sr-only">불러오는 중</span>
    </div>
  );
}

/** 폼·상세 로딩 */
export function FormSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <div className="ui-card rounded-xl p-5 space-y-4 ui-enter">
        <div className="ui-skeleton h-3 w-16" />
        <div className="ui-skeleton h-9 w-full" />
        <div className="ui-skeleton h-3 w-16" />
        <div className="ui-skeleton h-9 w-full" />
      </div>
      <div className="ui-card rounded-xl p-5 space-y-3 ui-enter" style={{ ["--i" as string]: 1 }}>
        <div className="ui-skeleton h-3 w-20" />
        <div className="ui-skeleton h-20 w-full" />
        <div className="ui-skeleton h-20 w-full" />
      </div>
      <span className="sr-only">불러오는 중</span>
    </div>
  );
}

/** 빈 상태 — 아이콘 + 한 줄 설명 + (선택) 다음 행동. */
export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="ui-card rounded-xl px-6 py-16 text-center ui-enter">
      <div
        className="mx-auto w-11 h-11 rounded-xl flex items-center justify-center"
        style={{ background: "var(--surface-sunken)" }}
      >
        <svg
          className="w-5 h-5"
          style={{ color: "var(--text-faint)" }}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
          <path d="M14 2v6h6" />
        </svg>
      </div>
      <p
        className="mt-3.5 text-sm font-semibold"
        style={{ color: "var(--text-secondary)" }}
      >
        {title}
      </p>
      {hint && (
        <p className="mt-1 text-[13px]" style={{ color: "var(--text-muted)" }}>
          {hint}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/** 에러 — 조용하지만 눈에 띄게. */
export function ErrorNote({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="rounded-xl px-4 py-3 text-[13px] flex items-start gap-2.5 ui-enter"
      style={{
        background: "var(--danger-soft)",
        color: "var(--danger)",
        border: "1px solid #f3cccc",
      }}
    >
      <svg
        className="w-4 h-4 mt-px flex-shrink-0"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v5M12 16.5v.01" />
      </svg>
      <span>{message}</span>
    </div>
  );
}
