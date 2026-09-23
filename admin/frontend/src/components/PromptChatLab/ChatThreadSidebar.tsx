"use client";

import { useEffect, useState } from "react";
import type { ChatThreadSummary } from "@/lib/types";

/* 프롬프트 실험 챗랩 좌측 사이드바 — 저장된 대화 스레드 목록(2026-09-15,
   사용자 요청: "대화들.. 저장 가능한 세션들.. 좌측 사이드바에 놔두면
   좋겠다.. 각 대화마다 어떤 대화를 했고 출력물이 나왔는지 체크해야
   해서"). 목록/현재 스레드 상태와 실제 불러오기·생성 로직은
   PromptChatLab.tsx가 갖고 있고, 이 컴포넌트는 순수 렌더만 담당한다.

   2026-09-16 — 접기/펼치기 추가(사용자 요청: "좌측 사이드바는 접혔다 펼
   수 있도록"). 접힌 상태(collapsed)는 챗 영역이 그만큼 넓어지도록 얇은
   40px 스트립 + 펼치기 화살표 버튼만 남긴다 — 대화 목록 자체가 사라지는
   게 아니라 collapsed일 때만 렌더를 건너뛴다(PromptChatLab.tsx가
   sidebarCollapsed state를 들고 있고 여기 props로만 내려준다).

   2026-09-21 — 목록을 스크롤 없이 최근 VISIBLE_COUNT개만 보여주고, 그
   이상은 "전체 대화" 버튼으로 별도 모달에서 본다(사용자 요청: "쓰레드들을
   쭉 리스트로 다 보여주지말고 스크롤 벗어나면 채팅 버튼을 만들어서 전체
   채팅을 볼 수 있도록 — 이미지도 있어서 전체 데이터 다 불러오면
   느려지니 스크롤 자체 안하도록"). 목록 자체(title/시각)는 가볍지만,
   무거운 건 스레드를 "여는" 순간(메시지+이미지)이라 이 캡은 사이드바가
   계속 길게 늘어나며 스크롤을 만드는 것 자체를 막는 UX 목적이다. */

const VISIBLE_COUNT = 8;

function ThreadButton({
  t,
  active,
  onSelect,
}: {
  t: ChatThreadSummary;
  active: boolean;
  onSelect: (id: number) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(t.id)}
      // 2026-09-20, 사용자 요청 — "마우스를 올려둘 때 전체적으로 호버
      // 기능이 필요": 이 버튼엔 hover 스타일이 아예 없어서(transition-colors
      // 클래스만 있고 실제 hover: 규칙이 없었음) 클릭 전엔 반응이 없는
      // 것처럼 보였다. 활성 항목(active)은 인라인 style의 배경이
      // hover:보다 우선하므로(인라인 스타일이 항상 이김) 그대로 강조색을
      // 유지하고, 비활성 항목만 사이드바 배경(--surface-sunken)보다
      // 밝은 --surface-card로 hover 배경을 준다 — 접기 버튼(위) hover와
      // 같은 톤.
      className="block w-full truncate rounded-lg px-2.5 py-2 text-left text-[12px] transition-colors hover:bg-[var(--surface-card)]"
      style={
        active
          ? { background: "var(--accent-soft, #eef2ff)", color: "var(--text-primary)", fontWeight: 600 }
          : { color: "var(--text-secondary)" }
      }
      title={t.title || "제목 없음"}
    >
      {t.title || "제목 없음"}
    </button>
  );
}

function AllThreadsModal({
  threads,
  activeId,
  onSelect,
  onClose,
}: {
  threads: ChatThreadSummary[];
  activeId: number | null;
  onSelect: (id: number) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-4 py-10 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="ui-card w-full max-w-[360px] overflow-hidden rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between gap-3 border-b px-4 py-3"
          style={{ borderColor: "var(--border-hairline)" }}
        >
          <span className="text-[12.5px] font-semibold text-gray-500">전체 대화 ({threads.length})</span>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 cursor-pointer text-gray-400 hover:text-gray-700"
            aria-label="닫기"
          >
            ✕
          </button>
        </div>
        <div className="max-h-[70vh] space-y-1 overflow-y-auto p-2">
          {threads.map((t) => (
            <ThreadButton
              key={t.id}
              t={t}
              active={t.id === activeId}
              onSelect={(id) => {
                onSelect(id);
                onClose();
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export function ChatThreadSidebar({
  threads,
  activeId,
  onSelect,
  onNew,
  collapsed,
  onToggleCollapsed,
}: {
  threads: ChatThreadSummary[];
  activeId: number | null;
  onSelect: (id: number) => void;
  onNew: () => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  const [showAll, setShowAll] = useState(false);

  if (collapsed) {
    return (
      <aside className="flex w-11 flex-none flex-col items-center border-r ui-divider bg-[var(--surface-sunken)] py-3">
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label="대화 목록 펼치기"
          title="대화 목록 펼치기"
          className="rounded-lg p-2 text-[var(--text-faint)] transition-colors hover:bg-[var(--surface-card)] hover:text-[var(--text-secondary)]"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </aside>
    );
  }

  return (
    <aside className="flex w-[220px] flex-none flex-col border-r ui-divider bg-[var(--surface-sunken)]">
      <div className="ui-divider flex items-center gap-1.5 border-b p-3">
        <button
          type="button"
          onClick={onNew}
          className="ui-btn ui-btn-primary flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-semibold"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
          새 대화
        </button>
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label="대화 목록 접기"
          title="대화 목록 접기"
          className="flex-none rounded-lg p-2 text-[var(--text-faint)] transition-colors hover:bg-[var(--surface-card)] hover:text-[var(--text-secondary)]"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </button>
      </div>
      <div className="min-h-0 flex-1 space-y-1 overflow-hidden p-2">
        {threads.length === 0 && (
          <p className="px-2 py-3 text-[11px] leading-relaxed text-[var(--text-faint)]">
            아직 저장된 대화가 없습니다 — 메시지를 보내면 자동으로 저장됩니다.
          </p>
        )}
        {threads.slice(0, VISIBLE_COUNT).map((t) => (
          <ThreadButton key={t.id} t={t} active={t.id === activeId} onSelect={onSelect} />
        ))}
        {threads.length > VISIBLE_COUNT && (
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="mt-1 block w-full rounded-lg px-2.5 py-2 text-center text-[12px] font-medium text-[var(--text-faint)] transition-colors hover:bg-[var(--surface-card)] hover:text-[var(--text-secondary)]"
          >
            전체 대화 보기 ({threads.length})
          </button>
        )}
      </div>
      {showAll && (
        <AllThreadsModal
          threads={threads}
          activeId={activeId}
          onSelect={onSelect}
          onClose={() => setShowAll(false)}
        />
      )}
    </aside>
  );
}
