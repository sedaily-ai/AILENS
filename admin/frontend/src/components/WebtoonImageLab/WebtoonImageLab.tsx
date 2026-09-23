"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminApiError, adminApi } from "@/lib/adminClient";
import type { WebtoonLabHistoryItem } from "@/lib/types";

/* 웹툰 3단계(이미지 생성) 히스토리 갤러리 — "이미지 프롬프트" 섹션 헤더의
   히스토리 아이콘이 연다.

   2026-09-05 신설, 2026-09-16 "발행" 기능 추가 → PromptChatLab 우측에
   WebtoonImageSettingsPanel(상시 노출 설정 바)이 새로 생기며 STYLE/
   CHARACTERS 편집·발행·참조 이미지 업로드가 전부 거기로 옮겨갔다(그
   패널의 모듈 docstring 참고 — "WebtoonImageLab.tsx의 STYLE/CHARACTERS+
   참조이미지+발행 로직을 그대로 가져왔다"). 컷 하나 테스트 생성은
   WebtoonCutGenerator(우측 8슬롯 패널)가 대신한다.

   2026-09-21 — 생성 폼·발행 버튼·참조 이미지 업로드는 전부 걷어냈다
   (WebtoonImageSettingsPanel/WebtoonCutGenerator에 이미 있어 중복이었다,
   확인 완료). 이 화면은 이제 이 admin 계정이 지금까지 생성한 전체
   히스토리만 보여주는 순수 갤러리다 — PanelTab 개념 자체도 없앴다. */

interface Props {
  open: boolean;
  onClose: () => void;
}

export function WebtoonImageLab({ open, onClose }: Props) {
  const [history, setHistory] = useState<WebtoonLabHistoryItem[] | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  // 2026-09-21 — 정렬 토글. 백엔드(handle_history)가 이미 항상 최신순으로
  // 내려주므로 서버 재호출 없이 클라이언트에서 뒤집기만 하면 된다.
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");
  // 2026-09-21 — 24개 제한을 없앤 뒤로 전부 스크롤 한 화면에 나오면 찾기
  // 힘들어서 숫자 페이지 버튼으로 나눠 보여준다. 전체 목록은 이미 한 번에
  // 받아와 있으므로(loadHistory) 서버 재요청 없이 클라이언트에서만 자른다.
  const [page, setPage] = useState(1);

  const loadHistory = useCallback(() => {
    setHistoryLoading(true);
    setHistoryError(null);
    adminApi
      .getWebtoonImageHistory()
      .then((r) => setHistory(r.items))
      .catch((err) =>
        setHistoryError(err instanceof AdminApiError ? err.message : "히스토리 조회 실패")
      )
      .finally(() => setHistoryLoading(false));
  }, []);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (history === null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 패널이 열릴 때 최초 1회 히스토리 fetch(정당한 케이스, admin/frontend/CLAUDE.md의 drivers/page.tsx와 같은 패턴)
      loadHistory();
    }
    return () => {
      document.body.style.overflow = prevOverflow;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 열릴 때 1회만: history를 deps에 넣으면 매 갱신마다 재실행된다
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const headerNode = (
    <div className="ui-divider flex items-start justify-between gap-4 border-b px-5 pb-3 pt-5">
      <div className="min-w-0">
        <h2
          id="webtoon-lab-title"
          className="font-display text-[19px] font-bold text-[var(--text-primary)]"
        >
          컷 생성 히스토리{history ? ` (${history.length})` : ""}
        </h2>
        <p className="mt-0.5 text-[13px] text-[var(--text-muted)]">
          이 admin 계정이 지금까지 생성한 전체 컷 — 전부 보여줍니다.
        </p>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="-mr-1.5 cursor-pointer rounded-lg p-1.5 text-[var(--text-faint)] transition-colors hover:bg-[var(--surface-sunken)]"
        aria-label="닫기"
      >
        <svg
          className="h-5 w-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/25 backdrop-blur-[2px] animate-[ui-fade-up_160ms_ease-out]"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="webtoon-lab-title"
        inert={!open}
        className={`fixed right-0 top-0 z-50 flex h-full w-full transform flex-col border-l border-[var(--border-hairline)] bg-[var(--surface-card)] shadow-2xl transition-transform duration-300 ease-out sm:max-w-[880px] ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {headerNode}
        <div className="flex-1 overflow-y-auto px-5 py-5">
          {history && history.length > 0 && (
            <div className="mb-3 flex items-center justify-end gap-1">
              <span className="mr-1 text-[11px] text-[var(--text-faint)]">정렬</span>
              <button
                type="button"
                onClick={() => {
                  setSortOrder("desc");
                  setPage(1);
                }}
                className={`rounded-lg px-2.5 py-1 text-[12px] font-semibold transition-colors ${
                  sortOrder === "desc"
                    ? "bg-[var(--accent)] text-white"
                    : "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
                }`}
              >
                최신순
              </button>
              <button
                type="button"
                onClick={() => {
                  setSortOrder("asc");
                  setPage(1);
                }}
                className={`rounded-lg px-2.5 py-1 text-[12px] font-semibold transition-colors ${
                  sortOrder === "asc"
                    ? "bg-[var(--accent)] text-white"
                    : "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
                }`}
              >
                오래된순
              </button>
            </div>
          )}
          <HistoryGallery
            items={history}
            sortOrder={sortOrder}
            page={page}
            onPageChange={setPage}
            loading={historyLoading}
            error={historyError}
            onRetry={() => {
              setPage(1);
              loadHistory();
            }}
          />
        </div>
      </aside>
    </>
  );
}

/** created_at(ISO)을 "9/21 14:03"처럼 짧게 — 히스토리를 스캔하며 날짜로
 *  훑어볼 때 연도까지 나오면 오히려 눈에 안 들어온다(어차피 전부 최근). */
function formatHistoryDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const mm = d.getMonth() + 1;
  const dd = d.getDate();
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${mm}/${dd} ${hh}:${min}`;
}

const PAGE_SIZE = 24; // 3열 기준 8행 — 예전 히스토리 상한(24)과 같은 수라 한 페이지 체감이 기존과 비슷하다

function HistoryGallery({
  items,
  sortOrder,
  page,
  onPageChange,
  loading,
  error,
  onRetry,
}: {
  items: WebtoonLabHistoryItem[] | null;
  sortOrder: "desc" | "asc";
  page: number;
  onPageChange: (page: number) => void;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  if (error) {
    return (
      <div className="space-y-2">
        <div className="rounded-xl px-4 py-3 text-[13px]" style={{ background: "var(--danger-soft)", color: "var(--danger)" }}>
          {error}
        </div>
        <button type="button" onClick={onRetry} className="ui-btn ui-btn-ghost rounded-lg px-3 py-1.5 text-sm">
          다시 시도
        </button>
      </div>
    );
  }
  if (loading && !items) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="ui-skeleton aspect-[3/2] rounded-xl" />
        ))}
      </div>
    );
  }
  if (!items || items.length === 0) {
    return (
      <p className="py-10 text-center text-[13px] text-[var(--text-faint)]">
        아직 완료된 생성이 없습니다
      </p>
    );
  }
  // 백엔드가 항상 최신순으로 내려주므로, "오래된순"만 뒤집는다(새 요청 없음).
  const sorted = sortOrder === "asc" ? [...items].reverse() : items;
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  // 정렬 전환·재조회로 목록이 줄어들어 지금 페이지가 범위 밖으로 밀릴 수 있다
  // (예: 마지막 페이지를 보다가 히스토리가 줄어든 경우) — 화면이 빈 채로
  // 멈추지 않도록 마지막 페이지로 잡아준다.
  const safePage = Math.min(page, totalPages);
  const pageItems = sorted.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {pageItems.map((item) => (
          <button
            key={item.job_id}
            type="button"
            onClick={() => item.image_url && window.open(item.image_url, "_blank", "noopener,noreferrer")}
            className="group text-left"
            title="새 탭에서 원본 이미지 보기"
          >
            {item.image_url && (
              // eslint-disable-next-line @next/next/no-img-element -- S3 원본 URL, next/image 최적화 대상 아님(실험 도구)
              <img
                src={item.image_url}
                alt={item.scene ?? "웹툰 실험 이미지"}
                className="aspect-[3/2] w-full rounded-xl border object-cover transition-transform group-hover:scale-[1.02]"
                style={{ borderColor: "var(--border-hairline)" }}
              />
            )}
            <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-[var(--text-muted)]">
              {item.scene ?? "-"}
            </p>
            {formatHistoryDate(item.created_at) && (
              <p className="mt-0.5 text-[10px] text-[var(--text-faint)]">{formatHistoryDate(item.created_at)}</p>
            )}
          </button>
        ))}
      </div>
      {totalPages > 1 && <Pagination page={safePage} totalPages={totalPages} onChange={onPageChange} />}
    </div>
  );
}

/** 페이지 번호가 많아지면 전부 나열하지 않고 현재 페이지 주변 + 처음/끝만
 *  보여주고 나머지는 "…"로 줄인다 — "1 … 4 5 6 … 12" 형태. */
function getPageList(current: number, total: number): (number | "…")[] {
  const delta = 1;
  const left = Math.max(2, current - delta);
  const right = Math.min(total - 1, current + delta);
  const list: (number | "…")[] = [1];
  if (left > 2) list.push("…");
  for (let i = left; i <= right; i++) list.push(i);
  if (right < total - 1) list.push("…");
  if (total > 1) list.push(total);
  return list;
}

function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}) {
  const pages = getPageList(page, totalPages);
  return (
    <div className="mt-4 flex items-center justify-center gap-1">
      <button
        type="button"
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
        className="ui-btn ui-btn-ghost rounded-lg px-2 py-1 text-[12px] font-semibold disabled:opacity-30"
        aria-label="이전 페이지"
      >
        ‹
      </button>
      {pages.map((p, i) =>
        p === "…" ? (
          <span key={`ellipsis-${i}`} className="px-1 text-[12px] text-[var(--text-faint)]">
            …
          </span>
        ) : (
          <button
            key={p}
            type="button"
            onClick={() => onChange(p)}
            aria-current={p === page ? "page" : undefined}
            className={`min-w-[28px] rounded-lg px-2 py-1 text-[12px] font-semibold transition-colors ${
              p === page
                ? "bg-[var(--accent)] text-white"
                : "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
            }`}
          >
            {p}
          </button>
        )
      )}
      <button
        type="button"
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages}
        className="ui-btn ui-btn-ghost rounded-lg px-2 py-1 text-[12px] font-semibold disabled:opacity-30"
        aria-label="다음 페이지"
      >
        ›
      </button>
    </div>
  );
}
