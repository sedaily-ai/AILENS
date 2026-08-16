"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { EmptyState } from "@/components/Feedback";
import { DateRangeCalendar, type DateRange } from "@/components/DateRangeCalendar";
import type { CmsPost, CmsStatus } from "@/lib/types";

// 글 관리·웹툰·영상 세 목록 화면이 표 하나를 따로따로 구현하고 있었다 —
// 2026-08-09, "표는 공통된 컴포넌트 사용해주세요" 요청으로 여기 하나로
// 뽑았다. 날짜 범위+검색 줄, 표(체크박스/채널열(선택)/제목/상태/발행일),
// 빈 상태, 페이지네이션까지 이 컴포넌트가 갖고 렌더만 맡는다 — 필터·정렬·
// 선택 상태 자체는 호출부가 들고 있다(URL 동기화 방식이 화면마다 조금씩
// 달라서, 상태 소유권까지 여기로 옮기면 오히려 화면마다 다른 요구를
// 억지로 끼워 맞춰야 했다). 채널 열은 선택적이다 — 글 관리처럼 여러 채널이
// 섞인 목록에서만 필요하고, 웹툰·영상처럼 화면 자체가 이미 한 채널로
// 고정된 목록에서는 열 하나가 통째로 불필요해서 뺀다.

export const STATUS_LABEL: Record<CmsStatus, string> = {
  draft: "초안",
  published: "발행",
  archived: "보관",
};

const STATUS_STYLE: Record<CmsStatus, string> = {
  draft: "ui-badge-draft",
  published: "ui-badge-published",
  archived: "ui-badge-archived",
};

export const STATUS_FILTERS: Array<{ key: string; label: string }> = [
  { key: "", label: "전체" },
  { key: "draft", label: "초안" },
  { key: "published", label: "발행" },
];

// 발행일 칸 — 실제 발행 시각(published_at, UTC ISO)이 있으면 분까지(요청에
// 따라 초까지) 보여주고, 아직 발행 전(초안 등이라 published_at이 없는)
// 글은 편집자가 지정한 발행"일"(publish_date, 날짜만)만 보여준다 —
// "발행일만 나오지 말고 시간·분까지" 요청(2026-08-09)이지만 실제로 발행된
// 적 없는 글에 시각을 지어낼 순 없다. sv-SE 로케일이 "YYYY-MM-DD HH:mm:ss"
// 를 그대로 내놓아서 별도 조립 없이 쓴다.
function formatPublishCell(p: CmsPost): string {
  if (!p.published_at) return p.publish_date;
  const d = new Date(p.published_at);
  if (Number.isNaN(d.getTime())) return p.publish_date;
  return d.toLocaleString("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

// 정렬 키도 같은 이유로 published_at 우선 — 같은 발행"일"에 여러 건이
// 몰려도 실제 발행된 순서대로 정렬된다. published_at이 없는 글(날짜만
// 있는 문자열)은 자연스럽게 그 날짜의 "가장 이른 시각"처럼 취급된다(문자열
// 비교상 짧은 쪽이 접두사라 더 작게 정렬).
function sortKey(p: CmsPost): string {
  return p.published_at || p.publish_date;
}

const PAGE_SIZE_OPTIONS = [15, 30, 50] as const;
const PAGE_SIZE_STORAGE_KEY = "ailens-admin-page-size";

function usePageSize(): [number, (n: number) => void] {
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
function Pagination({
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

// 단일 선택 필터(상태) — 표 헤더 안 드롭다운(2026-08-09). 트리거 라벨은
// 선택값이 아니라 컬럼 제목("상태")으로 고정 — "전체"로 비어있을 때 다른
// 필터와 트리거 글자가 같아지는 걸 피한다. 필터가 걸려있을 때만 색으로
// 강조한다.
export function ColumnFilterHeader<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const isActive = value !== "";

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  return (
    <div className="relative inline-block" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex cursor-pointer items-center gap-1 outline-none"
      >
        <span style={{ color: isActive ? "var(--accent)" : "var(--text-muted)" }}>{label}</span>
        <svg
          width="9"
          height="9"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          style={{ color: isActive ? "var(--accent)" : "var(--text-faint)" }}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div
          className="absolute z-20 mt-1.5 min-w-[140px] rounded-xl border p-1"
          style={{ background: "var(--surface-card)", borderColor: "var(--border-hairline)", boxShadow: "var(--shadow-md)" }}
        >
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
              className="block w-full cursor-pointer rounded-lg px-2.5 py-1.5 text-left text-[12.5px] font-medium transition-colors hover:bg-[var(--surface-sunken)]"
              style={{
                color: o.value === value ? "var(--accent)" : "var(--text-secondary)",
                background: o.value === value ? "var(--accent-soft)" : undefined,
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// 다중 선택 필터(채널) — 2026-08-09, "체크박스가 있어야 오늘의 이슈·머니
// 트렌드를 동시에 체크해서 필터할 수 있잖아요" 요청으로 단일 선택
// ColumnFilterHeader와 별도로 뽑았다. 빈 Set = "전체"(필터 없음), 아무거나
// 하나라도 체크하면 그 채널들의 합집합만 보여준다. 체크박스가 라디오보다
// 줄 높이가 필요해서 팝오버 폭도 같이 키웠다("드롭다운 사이즈를 더
// 키워야" 요청).
function ColumnFilterHeaderMulti({
  label,
  values,
  options,
  onChange,
}: {
  label: string;
  values: Set<string>;
  options: Array<{ value: string; label: string }>;
  onChange: (next: Set<string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const isActive = values.size > 0;

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const toggle = (v: string) => {
    const next = new Set(values);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    onChange(next);
  };

  return (
    <div className="relative inline-block" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex cursor-pointer items-center gap-1 outline-none"
      >
        <span style={{ color: isActive ? "var(--accent)" : "var(--text-muted)" }}>
          {label}
          {isActive && ` (${values.size})`}
        </span>
        <svg
          width="9"
          height="9"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          style={{ color: isActive ? "var(--accent)" : "var(--text-faint)" }}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div
          className="absolute z-20 mt-1.5 min-w-[200px] rounded-xl border p-1.5"
          style={{ background: "var(--surface-card)", borderColor: "var(--border-hairline)", boxShadow: "var(--shadow-md)" }}
        >
          {options.map((o) => (
            <label
              key={o.value}
              className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-[12.5px] font-medium transition-colors hover:bg-[var(--surface-sunken)]"
              style={{ color: values.has(o.value) ? "var(--accent)" : "var(--text-secondary)" }}
            >
              <input
                type="checkbox"
                checked={values.has(o.value)}
                onChange={() => toggle(o.value)}
                className="cursor-pointer"
              />
              {o.label}
            </label>
          ))}
          {isActive && (
            <>
              <div className="my-1 border-t" style={{ borderColor: "var(--border-hairline)" }} />
              <button
                type="button"
                onClick={() => onChange(new Set())}
                className="block w-full cursor-pointer rounded-lg px-2.5 py-1.5 text-left text-[12.5px] font-medium transition-colors hover:bg-[var(--surface-sunken)]"
                style={{ color: "var(--text-muted)" }}
              >
                전체 해제
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export interface ContentTableChannelColumn {
  /** 빈 Set = 전체(필터 없음). */
  values: Set<string>;
  onChange: (next: Set<string>) => void;
  options: Array<{ key: string; label: string }>;
}

export interface ContentTableProps {
  posts: CmsPost[] | null;
  editHref: (p: CmsPost) => string;
  newHref: string;
  newLabel: string;
  emptyTitle: string;
  emptyHint: string;
  status: string;
  onStatusChange: (v: string) => void;
  search: string;
  onSearchChange: (v: string) => void;
  dateRange: DateRange;
  onDateRangeChange: (r: DateRange) => void;
  sortDir: "asc" | "desc";
  onToggleSort: () => void;
  page: number;
  onPageChange: (updater: number | ((p: number) => number)) => void;
  selected: Set<string>;
  onToggleOne: (id: string) => void;
  onTogglePageAll: (pageIds: string[]) => void;
  /** 여러 채널이 섞인 목록(글 관리)에서만 넘긴다 — 웹툰/영상처럼 화면
   * 자체가 한 채널로 고정된 목록은 생략하면 그 열이 통째로 빠진다. */
  channelColumn?: ContentTableChannelColumn;
  /** 카드 보기에서 쓸 썸네일 — 글마다 대표 이미지가 어디서 오는지가
   * 콘텐츠 종류별로 다르다(레터는 cover_image_url, 웹툰은 없으면 첫 컷,
   * 영상은 없으면 유튜브 썸네일) — 그래서 호출부가 계산해 넘긴다. */
  thumbnail: (p: CmsPost) => string | null;
}

type ViewMode = "table" | "card";
const VIEW_STORAGE_KEY = "ailens-admin-content-view";

// Finder처럼 표/카드 보기를 고를 수 있게(2026-08-09, "모두 뷰 형식들을
// 선택 가능하게" 요청) — 글 관리도 레터 대표 이미지가 있어서 예외 없이
// 세 화면 다 토글이 있다. localStorage로 딱 하나의 값만 저장해 세 화면이
// 같은 선택을 공유한다("글 관리쪽도 동일합니다") — 화면마다 따로 기억하면
// 오히려 "아까 카드로 봤는데 여긴 왜 표지" 하는 혼란이 생긴다. 초기
// useState는 항상 "table"로 시작하고 마운트 후 effect에서 저장된 값을
// 읽어온다 — 정적 내보내기라도 최초 렌더는 localStorage 없이 만들어지므로,
// 여기서 바로 읽으면 하이드레이션 결과가 달라질 수 있어 피한다.
function useViewMode(): [ViewMode, (v: ViewMode) => void] {
  const [view, setView] = useState<ViewMode>("table");
  useEffect(() => {
    const saved = window.localStorage.getItem(VIEW_STORAGE_KEY);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 후 localStorage 읽기(하이드레이션 불일치 회피, 정당한 케이스)
    if (saved === "table" || saved === "card") setView(saved);
  }, []);
  const set = (v: ViewMode) => {
    setView(v);
    window.localStorage.setItem(VIEW_STORAGE_KEY, v);
  };
  return [view, set];
}

function ViewToggle({ view, onChange }: { view: ViewMode; onChange: (v: ViewMode) => void }) {
  const btn = (v: ViewMode, active: boolean, label: string, icon: React.ReactNode) => (
    <button
      type="button"
      onClick={() => onChange(v)}
      className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md transition-colors"
      style={{
        background: active ? "var(--surface-card)" : undefined,
        color: active ? "var(--accent)" : "var(--text-faint)",
        boxShadow: active ? "var(--shadow-sm)" : undefined,
      }}
      title={label}
      aria-label={label}
      aria-pressed={active}
    >
      {icon}
    </button>
  );
  return (
    <div className="flex items-center gap-0.5 rounded-lg p-0.5" style={{ background: "var(--surface-sunken)" }}>
      {btn(
        "table",
        view === "table",
        "표로 보기",
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M3 10h18M9 10v10" />
        </svg>,
      )}
      {btn(
        "card",
        view === "card",
        "카드로 보기",
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="3" width="8" height="8" rx="1.5" />
          <rect x="13" y="3" width="8" height="8" rx="1.5" />
          <rect x="3" y="13" width="8" height="8" rx="1.5" />
          <rect x="13" y="13" width="8" height="8" rx="1.5" />
        </svg>,
      )}
    </div>
  );
}

export function ContentTable({
  posts,
  editHref,
  newHref,
  newLabel,
  emptyTitle,
  emptyHint,
  status,
  onStatusChange,
  search,
  onSearchChange,
  dateRange,
  onDateRangeChange,
  sortDir,
  onToggleSort,
  page,
  onPageChange,
  selected,
  onToggleOne,
  onTogglePageAll,
  channelColumn,
  thumbnail,
}: ContentTableProps) {
  const [view, setView] = useViewMode();
  const [pageSize, setPageSize] = usePageSize();
  // 검색·정렬·페이지네이션은 재조회 없이 렌더 시점에만 적용 — 호출부가
  // 넘겨준 posts(이미 채널/상태/날짜로 걸러진 상태)를 한 번 더 다듬는다.
  const searchedPosts = posts
    ? search.trim()
      ? posts.filter((p) => p.headline.toLowerCase().includes(search.trim().toLowerCase()))
      : posts
    : null;
  const pageCount = searchedPosts ? Math.max(1, Math.ceil(searchedPosts.length / pageSize)) : 1;
  const effectivePage = Math.min(page, pageCount);
  const sortedPosts = searchedPosts
    ? [...searchedPosts].sort((a, b) =>
        sortDir === "asc" ? sortKey(a).localeCompare(sortKey(b)) : sortKey(b).localeCompare(sortKey(a)),
      )
    : null;
  const pageItems = sortedPosts ? sortedPosts.slice((effectivePage - 1) * pageSize, effectivePage * pageSize) : [];
  const pageAllSelected = pageItems.length > 0 && pageItems.every((p) => selected.has(p.id));
  // 채널 필터를 표 헤더에서 툴바로 옮기면서(아래 참조) 표 자체는 채널
  // 유무와 무관하게 항상 같은 열 개수(체크박스/제목/상태/발행일시)다.
  const colSpan = 4;

  const pager = sortedPosts && (
    <Pagination
      page={effectivePage}
      pageCount={pageCount}
      total={sortedPosts.length}
      onPageChange={onPageChange}
      pageSize={pageSize}
      onPageSizeChange={setPageSize}
    />
  );

  return (
    <>
      {/* 발행일은 값이 연속적이라(카테고리 아님) 상태처럼 컬럼 헤더 드롭다운
          대신 정렬 토글로 뺐다 — 날짜 "범위" 필터는 이 줄에 따로. 채널
          필터도 표 헤더 안에 있었는데 "표에 두지 말고 밖으로 빼는 게
          깔끔하다"는 지적(2026-08-09)으로 여기 날짜 필터 옆(전체 프리셋
          오른쪽)으로 옮겼다 — 같은 "필터" 성격끼리 왼쪽에 모으고, 검색·보기
          전환처럼 "찾기/보는 방식"은 오른쪽에 둔다. 제목 검색은 같은 줄 우측에. */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-1">
          <DateRangeCalendar
            value={dateRange}
            onChange={(r) => {
              onDateRangeChange(r);
              onPageChange(1);
            }}
          />
          {channelColumn && (
            <div className="ml-1.5 flex items-center gap-0.5 border-l pl-2" style={{ borderColor: "var(--border-hairline)" }}>
              <ColumnFilterHeaderMulti
                label="채널"
                values={channelColumn.values}
                onChange={(next) => {
                  channelColumn.onChange(next);
                  onPageChange(1);
                }}
                options={channelColumn.options.filter((f) => f.key !== "").map((f) => ({ value: f.key, label: f.label }))}
              />
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
        <div className="relative">
          <svg
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            style={{ color: "var(--text-faint)" }}
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="제목 검색"
            className="w-52 rounded-lg border py-1.5 pl-8 pr-7 text-[13px] outline-none transition-colors focus:border-[var(--accent)]"
            style={{ borderColor: "var(--border-input)", background: "var(--surface-card)", color: "var(--text-primary)" }}
          />
          {search && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              className="absolute right-2 top-1/2 flex h-4 w-4 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-[10px] hover:bg-[var(--surface-sunken)]"
              style={{ color: "var(--text-faint)" }}
              aria-label="검색어 지우기"
            >
              ✕
            </button>
          )}
        </div>
        <ViewToggle view={view} onChange={setView} />
        </div>
      </div>

      {view === "table" ? (
      <>
      {/* 표 헤더(상태/채널 필터 포함)는 결과가 0건이어도 항상 보인다 —
          필터를 되돌릴 컨트롤까지 같이 사라지지 않게. 빈 상태는 tbody 안
          한 행(colSpan)으로만 표시된다. 카드 테두리·그림자 없이 페이지
          배경과 이어지는 Linear·Notion 식 표. */}
      {posts && (
        <div>
          <table className="w-full text-sm">
            <thead className="ui-thead">
              <tr>
                <th className="w-10 px-4 py-2.5">
                  <input
                    type="checkbox"
                    checked={pageAllSelected}
                    onChange={() => onTogglePageAll(pageItems.map((p) => p.id))}
                    aria-label="이 페이지 전체 선택"
                    className="cursor-pointer"
                  />
                </th>
                <th className="text-left px-4 py-2.5">제목</th>
                <th className="text-left px-4 py-2.5">
                  <ColumnFilterHeader
                    label="상태"
                    value={status}
                    onChange={(v) => {
                      onStatusChange(v);
                      onPageChange(1);
                    }}
                    options={STATUS_FILTERS.map((f) => ({ value: f.key, label: f.label }))}
                  />
                </th>
                <th className="text-left px-4 py-2.5">
                  <button
                    type="button"
                    onClick={onToggleSort}
                    className="inline-flex cursor-pointer items-center gap-1 outline-none"
                    title={sortDir === "desc" ? "오름차순으로" : "내림차순으로"}
                  >
                    발행일시
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      style={{
                        color: "var(--accent)",
                        transform: sortDir === "asc" ? "rotate(180deg)" : undefined,
                        transition: "transform 150ms ease",
                      }}
                    >
                      <path d="M12 5v14M6 13l6 6 6-6" />
                    </svg>
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedPosts!.length === 0 ? (
                <tr>
                  <td colSpan={colSpan} className="px-4 py-16">
                    {search.trim() ? (
                      <EmptyState
                        title="검색 결과가 없습니다"
                        hint={`"${search.trim()}"이(가) 제목에 포함된 글이 없습니다.`}
                        action={
                          <button
                            type="button"
                            onClick={() => onSearchChange("")}
                            className="ui-btn rounded-lg px-4 py-2 text-sm font-semibold"
                          >
                            검색어 지우기
                          </button>
                        }
                      />
                    ) : (
                      <EmptyState
                        title={emptyTitle}
                        hint={emptyHint}
                        action={
                          <Link href={newHref} className="ui-btn ui-btn-primary rounded-lg px-4 py-2 text-sm font-semibold">
                            {newLabel}
                          </Link>
                        }
                      />
                    )}
                  </td>
                </tr>
              ) : (
                pageItems.map((p, i) => (
                  <tr
                    key={p.id}
                    className="border-b ui-divider last:border-0 ui-row-hover ui-enter"
                    style={{ ["--i" as string]: i }}
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selected.has(p.id)}
                        onChange={() => onToggleOne(p.id)}
                        aria-label={`${p.headline} 선택`}
                        className="cursor-pointer"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={editHref(p)}
                        className="font-medium text-[var(--text-primary)] hover:underline underline-offset-2"
                      >
                        {p.headline}
                      </Link>
                      {p.media_embed_url && (
                        <span
                          className="ml-2 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700"
                          title={p.media_embed_url}
                        >
                          ♪ 링크됨
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`ui-badge ${STATUS_STYLE[p.status]}`}>{STATUS_LABEL[p.status]}</span>
                    </td>
                    <td className="px-4 py-3 text-[13px] text-[var(--text-muted)] tabular-nums">
                      {formatPublishCell(p)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {pager && <div className="border-t ui-divider">{pager}</div>}
        </div>
      )}
      </>
      ) : (
        posts && (
          <div className="space-y-4">
            {sortedPosts!.length === 0 ? (
              search.trim() ? (
                <EmptyState
                  title="검색 결과가 없습니다"
                  hint={`"${search.trim()}"이(가) 제목에 포함된 글이 없습니다.`}
                  action={
                    <button
                      type="button"
                      onClick={() => onSearchChange("")}
                      className="ui-btn rounded-lg px-4 py-2 text-sm font-semibold"
                    >
                      검색어 지우기
                    </button>
                  }
                />
              ) : (
                <EmptyState
                  title={emptyTitle}
                  hint={emptyHint}
                  action={
                    <Link href={newHref} className="ui-btn ui-btn-primary rounded-lg px-4 py-2 text-sm font-semibold">
                      {newLabel}
                    </Link>
                  }
                />
              )
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {pageItems.map((p, i) => {
                  const thumb = thumbnail(p);
                  return (
                    <div key={p.id} className="ui-card ui-card-interactive ui-enter rounded-xl overflow-hidden" style={{ ["--i" as string]: i }}>
                      <div className="relative aspect-[16/10] bg-gray-100">
                        {/* eslint-disable-next-line @next/next/no-img-element -- 외부(S3/YouTube) 원본 URL */}
                        {thumb && <img src={thumb} alt="" className="h-full w-full object-cover" />}
                        <label
                          className="absolute left-2 top-2 flex h-5 w-5 cursor-pointer items-center justify-center rounded-md bg-white/90 shadow-sm"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            checked={selected.has(p.id)}
                            onChange={() => onToggleOne(p.id)}
                            aria-label={`${p.headline} 선택`}
                            className="cursor-pointer"
                          />
                        </label>
                      </div>
                      <Link href={editHref(p)} className="block p-3.5">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className={`ui-badge ${STATUS_STYLE[p.status]}`}>{STATUS_LABEL[p.status]}</span>
                          <span className="text-[12px] text-[var(--text-faint)] tabular-nums">{formatPublishCell(p)}</span>
                        </div>
                        <p className="font-display text-[14px] font-bold leading-snug text-[var(--text-primary)] line-clamp-2">
                          {p.headline}
                          {p.media_embed_url && (
                            <span
                              className="ml-1.5 rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 align-middle"
                              title={p.media_embed_url}
                            >
                              ♪
                            </span>
                          )}
                        </p>
                      </Link>
                    </div>
                  );
                })}
              </div>
            )}

            {pager}
          </div>
        )
      )}
    </>
  );
}

/** 채널 하나로 고정된 목록(웹툰/영상)용 — 레터의 "분류 변경"·카테고리
 * 입력처럼 채널 전용 필드가 없어서 삭제/선택 해제만 있으면 충분하다. */
export function SimpleBulkBar({
  count,
  busy,
  onDelete,
  onClear,
}: {
  count: number;
  busy: boolean;
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
      <span className="ml-auto h-5 w-px shrink-0 bg-black/10" />
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
