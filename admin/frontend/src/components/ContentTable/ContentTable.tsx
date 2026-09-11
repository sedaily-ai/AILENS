"use client";

import Link from "next/link";
import { EmptyState } from "@/components/Feedback";
import { DateRangeCalendar, type DateRange } from "@/components/DateRangeCalendar";
import type { CmsPost } from "@/lib/types";
import { STATUS_FILTERS, STATUS_LABEL, STATUS_STYLE, formatPublishCell, sortKey } from "./shared";
import { Pagination, usePageSize } from "./Pagination";
import { ColumnFilterHeader } from "./ColumnFilterHeader";
import { ColumnFilterHeaderMulti } from "./ColumnFilterHeaderMulti";
import { ViewToggle, useViewMode } from "./ViewToggle";

// 글 관리·웹툰·영상 세 목록 화면이 표 하나를 따로따로 구현하고 있었다 —
// 2026-08-09, "표는 공통된 컴포넌트 사용해주세요" 요청으로 여기 하나로
// 뽑았다. 날짜 범위+검색 줄, 표(체크박스/채널열(선택)/제목/상태/발행일),
// 빈 상태, 페이지네이션까지 이 컴포넌트가 갖고 렌더만 맡는다 — 필터·정렬·
// 선택 상태 자체는 호출부가 들고 있다(URL 동기화 방식이 화면마다 조금씩
// 달라서, 상태 소유권까지 여기로 옮기면 오히려 화면마다 다른 요구를
// 억지로 끼워 맞춰야 했다). 채널 열은 선택적이다 — 글 관리처럼 여러 채널이
// 섞인 목록에서만 필요하고, 웹툰·영상처럼 화면 자체가 이미 한 채널로
// 고정된 목록에서는 열 하나가 통째로 불필요해서 뺀다.
//
// 2026-08-19 — Pagination/ColumnFilterHeader/ColumnFilterHeaderMulti/ViewToggle
// 를 각자 파일로, 상태 라벨·발행일 포맷 같은 순수 유틸은 shared.ts로 분리
// (PostForm/ 폴더와 같은 컨벤션). 로직·마크업은 그대로, 구조만 정리했다.

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
                    <td className="max-w-xl px-4 py-3">
                      <Link
                        href={editHref(p)}
                        // 2026-09-11 — 파이프라인 버그로 headline에 본문 전체(2000자+)가
                        // 들어간 글이 실제로 발행된 적이 있다(레터 제목 파싱 버그, 이제
                        // 파이프라인 쪽은 고쳤다). 원인 버그와 별개로 이 표는 본디
                        // 제목이 아무리 길어도 안 잘리는 구조였다 — line-clamp이
                        // 없으면 이런 이상치 하나가 표 전체를 깨진 것처럼 보이게
                        // 만든다(카드 보기는 이미 line-clamp-2를 쓰고 있었는데 이
                        // 표 보기만 빠져 있었다). 정상 제목엔 영향 없다.
                        className="line-clamp-2 font-medium text-[var(--text-primary)] hover:underline underline-offset-2"
                        title={p.headline}
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
