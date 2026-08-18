import { useEffect, useState } from "react";

const PAGE_SIZE_OPTIONS = [15, 30, 50] as const;
const PAGE_SIZE_STORAGE_KEY = "ailens-admin-page-size";

export function usePageSize(): [number, (n: number) => void] {
  const [pageSize, setPageSize] = useState<number>(15);
  useEffect(() => {
    const saved = Number(window.localStorage.getItem(PAGE_SIZE_STORAGE_KEY));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 후 localStorage 읽기(하이드레이션 불일치 회피, 정당한 케이스)
    if (PAGE_SIZE_OPTIONS.includes(saved as (typeof PAGE_SIZE_OPTIONS)[number])) setPageSize(saved);
  }, []);
  const set = (n: number) => {
    setPageSize(n);
    window.localStorage.setItem(PAGE_SIZE_STORAGE_KEY, String(n));
  };
  return [pageSize, set];
}

// 페이지 번호를 전부 나열하면 페이지가 많을 때 줄이 넘친다 — 현재 페이지
// 주변(±1)과 처음·끝만 보여주고 나머지는 "…"로 접는다(구글 검색 결과
// 페이지네이션과 같은 방식).
function pageWindow(current: number, total: number): Array<number | "gap"> {
  const delta = 1;
  const left = Math.max(2, current - delta);
  const right = Math.min(total - 1, current + delta);
  const range: Array<number | "gap"> = [1];
  if (left > 2) range.push("gap");
  for (let i = left; i <= right; i++) range.push(i);
  if (right < total - 1) range.push("gap");
  if (total > 1) range.push(total);
  return range;
}

// 페이지 이동(처음/이전/번호/다음/끝) + 한 번에 보기 개수(15/30/50개씩) —
// 표·카드 두 보기 모드가 같이 쓴다(2026-08-09, "맨끝·맨앞 가기 깔끔하게,
// n개씩 보기도" 요청. "1,2,3,4 보이는 게 편하지 않냐"는 질문에도 동의해서
// 번호 페이지네이션으로 바꿨다 — 클라이언트에서 이미 다 들고 있는 배열을
// 자르는 것뿐이라 페이지를 몇 번을 오가도 재조회 없이 즉시 바뀐다).
export function Pagination({
  page,
  pageCount,
  total,
  onPageChange,
  pageSize,
  onPageSizeChange,
}: {
  page: number;
  pageCount: number;
  total: number;
  onPageChange: (updater: number | ((p: number) => number)) => void;
  pageSize: number;
  onPageSizeChange: (n: number) => void;
}) {
  const navBtn = "flex h-7 min-w-7 items-center justify-center rounded-md px-1.5 text-[13px] font-medium cursor-pointer disabled:cursor-default disabled:opacity-30 hover:bg-[var(--surface-sunken)] text-[var(--text-secondary)]";
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-1 py-2">
      <div className="flex items-center gap-2 text-[13px]" style={{ color: "var(--text-muted)" }}>
        <span>총 {total}건</span>
        <select
          value={pageSize}
          onChange={(e) => {
            onPageSizeChange(Number(e.target.value));
            onPageChange(1);
          }}
          className="cursor-pointer rounded-md border bg-transparent px-1.5 py-1 text-[12.5px] outline-none"
          style={{ borderColor: "var(--border-input)", color: "var(--text-secondary)" }}
          aria-label="한 번에 보기 개수"
        >
          {PAGE_SIZE_OPTIONS.map((n) => (
            <option key={n} value={n}>
              {n}개씩
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-0.5">
        <button type="button" onClick={() => onPageChange(1)} disabled={page <= 1} className={navBtn} title="처음">
          «
        </button>
        <button type="button" onClick={() => onPageChange((p) => Math.max(1, p - 1))} disabled={page <= 1} className={navBtn} title="이전">
          ‹
        </button>
        {pageWindow(page, pageCount).map((it, idx) =>
          it === "gap" ? (
            <span key={`gap-${idx}`} className="px-1 text-[13px]" style={{ color: "var(--text-faint)" }}>
              …
            </span>
          ) : (
            <button
              key={it}
              type="button"
              onClick={() => onPageChange(it)}
              className={navBtn}
              style={
                it === page
                  ? { background: "var(--accent-soft)", color: "var(--accent)", fontWeight: 700 }
                  : undefined
              }
            >
              {it}
            </button>
          ),
        )}
        <button type="button" onClick={() => onPageChange((p) => Math.min(pageCount, p + 1))} disabled={page >= pageCount} className={navBtn} title="다음">
          ›
        </button>
        <button type="button" onClick={() => onPageChange(pageCount)} disabled={page >= pageCount} className={navBtn} title="맨끝">
          »
        </button>
      </div>
    </div>
  );
}
