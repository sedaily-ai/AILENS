"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { adminApi } from "@/lib/adminClient";
import { formatKstDateTime } from "@/lib/formatDate";
import type { CmsChannel, CmsPost } from "@/lib/types";

/* 2026-09-27 신설 — 사용자 지적: "그렇게 변경된것도 화면에 나오도록 해야하는데
   어디에 두면 좋을까요? 프로덕션 카드에.. 히스토리 아이콘? 타임머신?" — 적용
   이력(누가·언제·몇 버전) 자체는 이미 ApplyReviewModal.tsx 안에 있었지만,
   "프로덕션에 적용" 버튼을 다시 눌러야만(=새로 적용하러 들어가야만) 볼 수
   있었다. "지금 프로덕션이 언제 바뀌었는지"를 아무 조작 없이 바로 확인할
   방법이 없었던 게 진짜 문제 — 프로덕션 카드의 버전 배지 옆에 항상 보이는
   히스토리 아이콘을 두고, 클릭하면 이 이력만 읽기 전용으로 보여준다.

   목록 렌더링(ActivationHistoryList)을 ApplyReviewModal과 공유한다 — 같은
   API·같은 마크업을 두 곳에서 베껴 쓰지 않기 위해서다(ApplyReviewModal도
   이 파일의 컴포넌트를 쓰도록 같이 고쳤다).

   2026-09-27(후속) — LatestPublishedContentLink(최근 발행 1건만 보여줌)를
   붙인 뒤 사용자 재질문: "특정 프로덕션 버전에서 어떤 게시글이 나갔는지
   목록을 볼 수 있다면.. 더 구체적으로 비교가 가능하지 않을려나요?" —
   "최신 1건"을 넘어 "이 버전이 활성화돼 있던 기간에 실제로 몇 건이,
   어떤 게 나갔는지" 트레이서빌리티를 요청한 것. 이 이력은 이미 "버전 +
   적용 시각"을 갖고 있으니, 각 행의 시각~다음 행의 시각(또는 지금) 구간을
   "그 버전이 살아있던 기간"으로 보고, 그 구간에 publish_date/published_at이
   찍힌 게시물만 걸러서 행마다 펼쳐 보여준다 — 별도 백엔드 없이 이미 있는
   두 API(적용 이력 + listPosts)를 시간으로 조인하는 것만으로 충분하다.
   서버에 "이후"필터가 없어서 최근 발행 글을 limit개(POSTS_LOOKBACK)
   만큼만 가져와 클라이언트에서 구간 매칭한다 — 그보다 오래된 버전은
   "더 오래된 기록은 없음"으로 처리(무한정 다 끌어오면 느려지고, 실제로
   그렇게 오래전 버전을 보고 싶어할 일은 드물다는 판단). */
const POSTS_LOOKBACK = 60;

interface HistoryEntry {
  version: number | null;
  actor: string | null;
  logged_at: string | null;
}

function postTimestamp(p: CmsPost): number {
  if (p.published_at) return new Date(p.published_at).getTime();
  return new Date(`${p.publish_date}T00:00:00+09:00`).getTime();
}

/** history[index] 버전이 "살아있던" 시간 구간 — 시작은 그 행의 적용
 *  시각, 끝은 바로 위(더 최근) 행의 적용 시각(없으면 지금까지). history는
 *  최신순이라 index-1이 더 최근이다. */
function activeWindow(history: HistoryEntry[], index: number): { start: number; end: number } | null {
  const h = history[index];
  if (!h.logged_at) return null;
  const start = new Date(h.logged_at).getTime();
  const prev = history[index - 1];
  const end = index > 0 && prev?.logged_at ? new Date(prev.logged_at).getTime() : Date.now();
  return { start, end };
}

export function ActivationHistoryList({
  category,
  name,
  channel,
  urlPath,
}: {
  category: string;
  name: string;
  /** 이 구간에 뭐가 발행됐는지 조인할 CMS 채널 — LatestPublishedContentLink와
   *  동일 원칙(팟캐스트는 channel="home_player"로 호출부가 대체). */
  channel: CmsChannel;
  urlPath: string;
}) {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [posts, setPosts] = useState<CmsPost[] | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    // category/name이 바뀌면(같은 컴포넌트가 다른 프롬프트로 재사용되는
    // 경우) 이전 목록을 보여준 채로 새로 불러오면 헷갈린다 — 마운트 시
    // 최초 로딩 표시와 같은 이유(admin/frontend/CLAUDE.md의 mount-flag
    // 예외 패턴).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setPosts(null);
    Promise.all([
      adminApi.getPromptActivationHistory(category, name),
      adminApi.listPosts({ status: "published", channel, limit: POSTS_LOOKBACK }),
    ])
      .then(([h, p]) => {
        setHistory(h.history);
        setPosts(p.posts);
      })
      .catch((err) => console.error("적용 이력/발행물 조회 실패", err))
      .finally(() => setLoading(false));
  }, [category, name, channel]);

  if (loading) {
    return <p className="text-[11px] text-[var(--text-faint)]">불러오는 중...</p>;
  }
  if (history.length === 0) {
    return <p className="text-[11px] text-[var(--text-faint)]">아직 적용 이력이 없습니다.</p>;
  }
  return (
    <ul className="ui-card divide-y divide-[var(--border-hairline)] rounded-lg">
      {history.map((h, i) => {
        const win = activeWindow(history, i);
        const matched = posts && win ? posts.filter((p) => { const t = postTimestamp(p); return t >= win.start && t < win.end; }) : null;
        const isOpen = expanded === i;
        return (
          <li key={i}>
            <button
              type="button"
              onClick={() => setExpanded(isOpen ? null : i)}
              className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left text-[11px] transition-colors hover:bg-[var(--surface-sunken)]"
            >
              <span className="flex items-center gap-1.5">
                <svg
                  width="9"
                  height="9"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="flex-none transition-transform"
                  style={{ transform: isOpen ? "rotate(90deg)" : "rotate(0deg)", color: "var(--text-faint)" }}
                  aria-hidden="true"
                >
                  <path d="m9 6 6 6-6 6" />
                </svg>
                <span className="font-semibold text-[var(--text-secondary)]">v{h.version ?? "?"}</span>
              </span>
              <span className="flex items-center gap-1.5">
                {matched && <span style={{ color: "var(--text-faint)" }}>게시물 {matched.length}건</span>}
                <span className="text-[var(--text-faint)]">{h.logged_at ? formatKstDateTime(h.logged_at) : "시각 없음"}</span>
              </span>
            </button>
            {isOpen && (
              <div className="border-t px-2.5 py-1.5" style={{ borderColor: "var(--border-hairline)", background: "var(--surface-sunken)" }}>
                {!posts ? (
                  <p className="text-[10.5px]" style={{ color: "var(--text-faint)" }}>불러오는 중...</p>
                ) : !win ? (
                  <p className="text-[10.5px]" style={{ color: "var(--text-faint)" }}>적용 시각 정보가 없어 기간을 알 수 없습니다.</p>
                ) : matched && matched.length === 0 ? (
                  <p className="text-[10.5px]" style={{ color: "var(--text-faint)" }}>
                    이 기간엔 발행된 게시물이 없거나, 조회 범위(최근 {POSTS_LOOKBACK}건)를 벗어난 더 오래된 기록입니다.
                  </p>
                ) : (
                  <ul className="space-y-1">
                    {matched!.map((p) => (
                      <li key={p.slug}>
                        <a
                          href={`https://ailens.sedaily.ai/${urlPath}/${p.slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block truncate text-[10.5px] font-medium text-[var(--accent)] hover:underline"
                          title={p.headline}
                        >
                          {p.publish_date} · {p.headline}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** 프로덕션 카드 헤더에 두는 작은 시계+회전화살표(history) 아이콘 버튼 —
 *  클릭하면 위 목록만 담은 가벼운 모달을 띄운다. "프로덕션에 적용" 흐름과
 *  무관하게 언제든 읽기 전용으로 열어볼 수 있다. */
export function ActivationHistoryButton({
  category,
  name,
  channel,
  urlPath,
  caveat,
}: {
  category: string;
  name: string;
  channel: CmsChannel;
  urlPath: string;
  /** LatestPublishedContentLink.tsx와 동일 캐비앗 — video/home_player는
   *  목록 매칭이 실제 페이지 존재와 어긋날 수 있다는 게 실측으로
   *  확인됐다(그 파일 독스트링 참고). */
  caveat?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          setOpen(true);
        }}
        title="적용 이력 — 프로덕션이 언제 바뀌었는지, 그 버전으로 뭐가 나갔는지"
        className="flex-none rounded p-1 text-[var(--text-faint)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-secondary)]"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 3v5h5" />
          <path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" />
          <path d="M12 7v5l4 2" />
        </svg>
      </button>
      {/* 2026-09-27, 사용자 지적 — "적용 이력.. 부분을 클릭해도.. 지금
          튀어나왔넹": 프로덕션 카드 래퍼가 position:sticky+z-index로 새
          스태킹 컨텍스트를 만들어서, 그 안에 중첩 렌더되는 이 모달의
          z-[80]이 바깥 형제(같은 z 값의 "테스트" 경계 띠)한테 덮였다
          (PromptVersionReference.tsx의 DraftFieldModal과 동일 원인 —
          그 파일 주석 참고). 포털로 document.body에 바로 붙인다. */}
      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4"
            role="presentation"
            onClick={() => setOpen(false)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-[var(--surface-card)] shadow-2xl"
            >
              <div className="flex flex-none items-center justify-between border-b ui-divider px-4 py-3">
                <h3 className="text-[13px] font-semibold text-[var(--text-primary)]">적용 이력</h3>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="ui-btn rounded-md px-2 py-1 text-[11px]"
                >
                  닫기
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3.5">
                {caveat && (
                  <p className="mb-2.5 text-[10.5px] leading-relaxed" style={{ color: "var(--warn)" }}>
                    ⚠ {caveat}
                  </p>
                )}
                <ActivationHistoryList category={category} name={name} channel={channel} urlPath={urlPath} />
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
