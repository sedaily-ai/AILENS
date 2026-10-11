/** 스레드 버튼·태그 입력 — ChatThreadSidebar.tsx 에서 리팩토링 7단계에서 분리(내용 불변). */
import { useState, useRef, useEffect } from "react";
import { ChatThreadSummary } from "@/lib/types";

const CURATED_TAGS = ["⭐", "📌", "🔥", "💡", "🧪", "📰"];
const EMOJI_RE = /\p{Extended_Pictographic}/u;

export function ThreadButton({
  t,
  active,
  onSelect,
  selectionMode,
  selected,
  onToggleSelect,
  editing,
  editDraft,
  onEditDraftChange,
  onStartEdit,
  onConfirmEdit,
  onCancelEdit,
  onDeleteClick,
  renaming,
  onApplyTag,
}: {
  t: ChatThreadSummary;
  active: boolean;
  onSelect: (id: number) => void;
  selectionMode: boolean;
  selected: boolean;
  onToggleSelect: (id: number) => void;
  editing: boolean;
  editDraft: string;
  onEditDraftChange: (v: string) => void;
  onStartEdit: () => void;
  onConfirmEdit: () => void;
  onCancelEdit: () => void;
  onDeleteClick: () => void;
  renaming: boolean;
  /** null이면 태그 해제. */
  onApplyTag: (tag: string | null) => void;
}) {
  // 2026-09-27 — "..." 드롭다운 메뉴(레퍼런스 ConversationItem.jsx의
  // showMenu와 동일 패턴). 메뉴 열림 상태는 이 행 안에서만 의미가 있어
  // 부모로 안 끌어올리고 로컬로 둔다 — 바깥 클릭·Escape로 닫힌다.
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const onClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onEscape);
    };
  }, [menuOpen]);

  if (editing) {
    return (
      <div className="flex flex-col gap-1 rounded-lg px-1.5 py-1.5" style={{ background: "var(--surface-card)" }}>
        <input
          autoFocus
          type="text"
          value={editDraft}
          onChange={(e) => onEditDraftChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onConfirmEdit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              onCancelEdit();
            }
          }}
          className="ui-input w-full rounded px-2 py-1 text-[12px]"
        />
        <div className="flex justify-end gap-1">
          <button
            type="button"
            onClick={onCancelEdit}
            className="rounded px-1.5 py-0.5 text-[10.5px] text-[var(--text-faint)] hover:bg-[var(--surface-sunken)]"
          >
            취소
          </button>
          <button
            type="button"
            disabled={renaming}
            onClick={onConfirmEdit}
            className="rounded px-1.5 py-0.5 text-[10.5px] font-semibold text-[var(--accent)] hover:bg-[var(--accent-soft)] disabled:opacity-50"
          >
            {renaming ? "저장 중..." : "저장"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="group relative">
      <button
        type="button"
        onClick={() => (selectionMode ? onToggleSelect(t.id) : onSelect(t.id))}
        // 2026-09-20, 사용자 요청 — "마우스를 올려둘 때 전체적으로 호버
        // 기능이 필요": 이 버튼엔 hover 스타일이 아예 없어서(transition-colors
        // 클래스만 있고 실제 hover: 규칙이 없었음) 클릭 전엔 반응이 없는
        // 것처럼 보였다. 활성 항목(active)은 인라인 style의 배경이
        // hover:보다 우선하므로(인라인 스타일이 항상 이김) 그대로 강조색을
        // 유지하고, 비활성 항목만 사이드바 배경(--surface-sunken)보다
        // 밝은 --surface-card로 hover 배경을 준다 — 접기 버튼(위) hover와
        // 같은 톤.
        className={`flex w-full items-center gap-2 rounded-lg py-2 text-left transition-colors hover:bg-[var(--surface-card)] ${
          selectionMode ? "pl-2 pr-2.5" : "pl-2.5 pr-8"
        }`}
        style={
          active && !selectionMode
            ? { background: "var(--accent-soft, #eef2ff)", color: "var(--text-primary)" }
            : { color: "var(--text-secondary)" }
        }
        title={t.title || "제목 없음"}
      >
        {/* 2026-09-26 — 일괄 삭제용 선택 체크박스(레퍼런스 프로젝트
            ConversationItem.jsx의 빨간 원형 체크와 동일 톤 — 삭제 동작이라는
            게 색으로 읽히게). */}
        {selectionMode && (
          <span
            className="flex h-4 w-4 flex-none items-center justify-center rounded-full border transition-colors"
            style={
              selected
                ? { background: "var(--danger)", borderColor: "var(--danger)", color: "#fff" }
                : { borderColor: "var(--border-input)" }
            }
          >
            {selected && (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M20 6 9 17l-5-5" />
              </svg>
            )}
          </span>
        )}
        <span className="flex min-w-0 flex-1 items-center gap-1">
          {/* 2026-09-26 — 이모지 태그 스탬프(레퍼런스 ConversationItem.jsx
              동일 위치: 제목 왼쪽). */}
          {t.tag && <span className="flex-none text-[13px] leading-none">{t.tag}</span>}
          <span className="block min-w-0 flex-1 truncate text-[12px]" style={active && !selectionMode ? { fontWeight: 600 } : undefined}>
            {t.title || "제목 없음"}
          </span>
        </span>
      </button>
      {!selectionMode && (
        <div ref={menuRef} className="absolute right-1 top-1">
          {/* 2026-09-27 — "..." 트리거(레퍼런스 ConversationItem.jsx의
              MoreHorizontal 버튼과 동일 자리·동일 opacity 처리). */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((v) => !v);
            }}
            aria-label="더보기"
            title="더보기"
            className={`flex h-5.5 w-5.5 items-center justify-center rounded transition-opacity ${
              menuOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100"
            } text-[var(--text-faint)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-secondary)]`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <circle cx="5" cy="12" r="1.6" />
              <circle cx="12" cy="12" r="1.6" />
              <circle cx="19" cy="12" r="1.6" />
            </svg>
          </button>
          {menuOpen && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="ui-card-strong absolute right-0 top-full z-50 mt-1 w-44 rounded-lg py-1"
            >
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onStartEdit();
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11.5px] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
                </svg>
                이름 변경
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onDeleteClick();
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11.5px] text-[var(--danger)] hover:bg-[var(--danger-soft)]"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6h16Z" />
                </svg>
                삭제
              </button>
              {/* 2026-09-27 — 이모지 태그도 이 메뉴 안으로(사용자 요청:
                  "이모지 부분도.. 동일한 구조로"). 큐레이션 6종 원탭 +
                  직접 입력, 레퍼런스와 동일. */}
              <div className="my-1 border-t ui-divider" />
              <div className="px-2 pb-1.5">
                <div className="grid grid-cols-6 gap-0.5">
                  {CURATED_TAGS.map((em) => (
                    <button
                      key={em}
                      type="button"
                      onClick={() => {
                        onApplyTag(t.tag === em ? null : em);
                        setMenuOpen(false);
                      }}
                      className="flex h-7 items-center justify-center rounded-md text-[13px] transition-colors hover:bg-[var(--surface-sunken)]"
                      style={t.tag === em ? { background: "var(--accent-soft)", boxShadow: "inset 0 0 0 1px var(--accent)" } : undefined}
                    >
                      {em}
                    </button>
                  ))}
                </div>
                <TagCustomInput currentTag={t.tag} onApply={onApplyTag} onApplied={() => setMenuOpen(false)} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** 이모지 직접 입력 — 큐레이션 6종에 없는 이모지를 쓰고 싶을 때(레퍼런스
 *  ConversationItem.jsx의 customTag input과 동일 검증: 이모지만, 최대
 *  16자). 태그가 이미 있으면 "해제" 버튼도 같이 보여준다. onApplied —
 *  2026-09-27, "..." 메뉴로 통합되면서 적용/해제 직후 메뉴 자체를 닫기
 *  위해 추가(레퍼런스도 적용 즉시 showMenu를 닫는다). */
export function TagCustomInput({
  currentTag,
  onApply,
  onApplied,
}: {
  currentTag: string | null;
  onApply: (tag: string | null) => void;
  onApplied?: () => void;
}) {
  const [draft, setDraft] = useState("");
  const apply = () => {
    const v = draft.trim();
    if (v && v.length <= 16 && EMOJI_RE.test(v)) {
      onApply(v);
      setDraft("");
      onApplied?.();
    }
  };
  return (
    <div className="mt-1 flex items-center gap-1">
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            apply();
          }
        }}
        maxLength={16}
        placeholder="이모지 직접 입력"
        className="ui-input min-w-0 flex-1 rounded px-2 py-1 text-[11px]"
      />
      {currentTag && (
        <button
          type="button"
          onClick={() => {
            onApply(null);
            onApplied?.();
          }}
          className="flex-none rounded px-1.5 py-1 text-[10.5px] text-[var(--text-faint)] hover:text-[var(--text-secondary)]"
        >
          해제
        </button>
      )}
    </div>
  );
}
