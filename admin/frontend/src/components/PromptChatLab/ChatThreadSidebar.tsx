"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import type { ChatThreadSummary } from "@/lib/types";

/* 이모지 태그 — 2026-09-26 신설, 레퍼런스 프로젝트(1_ai_link/nova ainova-v2
   ConversationItem.jsx) 그대로 가져옴: 대화당 1개, 큐레이션 6종 원탭 +
   직접 입력(이모지만 허용, 텍스트 태그 난립 방지). 같은 이모지를 다시
   누르면 해제(토글). DB 컬럼(prompt_lab_threads.tag)은 사용자 승인 하에
   RDS 마스터로 직접 ALTER TABLE 추가(2026-09-26, service/lens-cms-api/
   chat_threads_repo.py::set_thread_tag 참고). */
const CURATED_TAGS = ["⭐", "📌", "🔥", "💡", "🧪", "📰"];
const EMOJI_RE = /\p{Extended_Pictographic}/u;

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

   목록을 어떻게 보여줄지는 2026-09-21→09-25 사이 여러 번 바뀌었다 —
   ①스크롤 없이 8개만+"전체 대화" 모달 → ②캡 없이 스크롤 → ③스크롤 없이
   overflow-hidden(경계에서 항목이 애매하게 잘리는 문제 발견) →
   ④실제 버튼 높이를 재서 정확히 들어가는 개수만 계산 → 결국
   "어렵게 하지 말고 스크롤을 두자, 전체 대화 보기는 삭제"로 최종 정착
   (2026-09-25, 사용자 결정). threads는 이미 한 번에 다 불러온 목록이라
   (title/시각만 담은 가벼운 요약, PromptChatLab.tsx가 이미 fetch 완료한
   상태로 내려줌) 스크롤 자체가 추가 백엔드 호출을 만들지 않는다 — 무거운
   건 스레드를 "여는" 순간(메시지+이미지)뿐이라 목록을 몇 개 보여주든
   비용은 같다.

   2026-09-26 — 이름 변경·삭제·일괄 삭제 추가(사용자 요청: "좌측 대화
   사이드바에도 이름 변경.. 대화 삭제.. 할 수 있도록.. 일괄삭제나 그런거
   가능하게"). 백엔드(PUT/DELETE /admin/chat-threads/{id})·API 클라이언트는
   이미 있었다(useChatLabThread.ts 참고) — UI만 없었다. 사용자가 레퍼런스로
   짚어준 1_ai_link/nova(ainova-v2) 프로젝트의 ConversationItem/Sidebar를
   먼저 읽고 구조를 파악했다: "선택 모드" 토글(휴지통 아이콘) → 체크박스로
   여러 개 고르기 → 하단 액션바로 일괄 삭제(Promise.allSettled, 실패해도
   나머지는 지워지게).

   2026-09-26(후속) — 사용자가 이모지 태그 기능도 명시적으로 요청("이모지로
   태그 다는것도 있지 않았나?")해서 추가했다. DB에 `tag` 컬럼이 없어서
   (`prompt_lab_threads`는 이 세션의 2026-09-15 1회성 마이그레이션 산출물이라
   정식 이관 프로젝트 문서화 범위 밖에 있었음) 사용자 승인 하에 RDS
   마스터로 직접 `ALTER TABLE ... ADD COLUMN tag TEXT` 실행 후 진행했다.
   필터 칩(사용 빈도순 최대 6개)도 레퍼런스와 동일 원칙으로 추가 —
   "대화가 어떤 출력물이었는지 체크"(사이드바 최초 신설 동기)를 태그로
   빠르게 다시 찾을 수 있게 한다.

   2026-09-27(후속×2) — 개별 행 메뉴를 "..." 드롭다운으로 다시 바꿨다.
   1차 구현은 연필/휴지통/이모지 아이콘 3개를 호버로 늘어놓는 방식(이
   파일이 속한 세션에서 확립된 PromptVersionReference.tsx 사이드바 패턴과
   맞추려던 것)이었는데, 사용자가 실제 nova 화면 스크린샷을 보여주며
   "이렇게 '...' 이렇게 있더라, 이런 디자인으로 해야할것같고요.. 이모지
   부분도 동일한 구조로"라고 명확히 요청 — 참고 삼던 레퍼런스 쪽 디자인을
   그대로 쓰기로 뒤집혔다. 이름변경·삭제·이모지 태그(큐레이션 6종+직접
   입력) 전부 이 메뉴 하나(ConversationItem.jsx의 showMenu와 동일 —
   클릭 시 열림, 바깥 클릭·Escape로 닫힘, 항목 클릭 시 즉시 닫힘) 안에
   있다. */

function ThreadButton({
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
function TagCustomInput({
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

export function ChatThreadSidebar({
  threads,
  activeId,
  onSelect,
  onNew,
  collapsed,
  onToggleCollapsed,
  onRename,
  onTag,
  onDelete,
  onBulkDelete,
}: {
  threads: ChatThreadSummary[];
  activeId: number | null;
  onSelect: (id: number) => void;
  onNew: () => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  /** 2026-09-26 신설 — useChatLabThread.ts::renameThread/setThreadTag/
   *  deleteThread/bulkDeleteThreads를 그대로 부모가 넘겨준다. */
  onRename: (id: number, title: string) => Promise<void>;
  onTag: (id: number, tag: string | null) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onBulkDelete: (ids: number[]) => Promise<{ deletedCount: number; failedCount: number }>;
}) {
  // 2026-09-25, 사용자 요청 — "사이드바들 전체적으로.. 양 옆으로 잡아끌어
  // 당길 수 있도록.. 쓰레드들도": PromptChatLab.tsx의 imagePanelWidth/
  // handleImagePanelResizeStart와 같은 패턴. 이 컴포넌트는
  // PromptChatLab.tsx/PromptTextLab.tsx 둘 다 공유해서 쓰므로 폭 상태를
  // 부모가 아니라 여기 자체에 둔다. 접힌 상태(collapsed)는 폭 조절이
  // 의미 없어 핸들을 안 그린다.
  const [width, setWidth] = useState(220);
  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = width;
    const onMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX; // 왼쪽 사이드바라 핸들이 오른쪽 가장자리 — 오른쪽으로 끌수록 넓어진다
      const next = Math.min(400, Math.max(160, startWidth + delta));
      setWidth(next);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // 2026-09-26 — 이름 변경(PromptVersionReference.tsx 사이드바와 동일한
  // "한 번에 하나만 편집" 패턴)과 선택 삭제 모드(레퍼런스 프로젝트
  // ConversationGroup/Sidebar.jsx 패턴 — selectionMode + selectedIds).
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  // 2026-09-27, 사용자 요청 — "여러 개 선택해서 삭제 부분... 노바처럼...
  // 검색 창 넣고, 그 오른쪽에 휴지통 아이콘 넣는걸로": 텍스트 링크 진입점
  // 대신 nova Sidebar.jsx와 동일 구성(검색 입력 + 오른쪽 삭제모드 토글)으로
  // 바꿨다 — 검색은 겸사겸사 생기는 부가 기능이 아니라 그 레퍼런스 UI
  // 자체가 검색창을 요구하는 구조라 같이 추가한다.
  const [searchQuery, setSearchQuery] = useState("");

  const startEdit = (t: ChatThreadSummary) => {
    setEditingId(t.id);
    setEditDraft(t.title || "");
  };
  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft("");
  };
  const confirmEdit = () => {
    if (editingId === null) return;
    const title = editDraft.trim();
    if (!title) return;
    setRenaming(true);
    onRename(editingId, title)
      .catch((err) => console.error("대화 이름 변경 실패", err))
      .finally(() => {
        setRenaming(false);
        setEditingId(null);
      });
  };

  // 2026-09-27 — 메뉴가 "..." 드롭다운으로 통합되며 열림/닫힘은 이제
  // ThreadButton이 로컬로 관리한다(메뉴 안 이모지 클릭 시 그쪽에서 직접
  // setMenuOpen(false)) — 여기는 실제 API 호출만 담당.
  const applyTag = (id: number, tag: string | null) => {
    onTag(id, tag).catch((err) => console.error("태그 변경 실패", err));
  };

  const handleDeleteOne = (t: ChatThreadSummary) => {
    if (!window.confirm(`"${t.title || "제목 없음"}" 대화를 삭제하시겠습니까? 되돌릴 수 없습니다.`)) return;
    onDelete(t.id).catch((err) => console.error("대화 삭제 실패", err));
  };

  const toggleSelected = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  };
  const handleBulkDelete = () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`선택한 ${selectedIds.size}개 대화를 삭제하시겠습니까? 메시지도 함께 삭제되며 되돌릴 수 없습니다.`)) return;
    setBulkDeleting(true);
    onBulkDelete([...selectedIds])
      .catch((err) => console.error("일괄 삭제 실패", err))
      .finally(() => {
        setBulkDeleting(false);
        exitSelectionMode();
      });
  };

  // 2026-09-26 — 필터 칩(레퍼런스 ConversationGroup/Sidebar.jsx의 tagChips
  // 그대로): 실제 사용 중인 이모지를 사용 횟수 내림차순, 최대 6개로 보여준다.
  // 태그가 하나도 없으면 줄 자체를 숨긴다.
  const tagChips = useMemo(() => {
    const counts = new Map<string, number>();
    threads.forEach((t) => {
      if (t.tag) counts.set(t.tag, (counts.get(t.tag) ?? 0) + 1);
    });
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([tag]) => tag);
  }, [threads]);
  // 필터 중이던 이모지가 전부 해제되면(마지막 그 태그 대화가 지워지는 등)
  // 필터도 자동 해제 — 빈 목록으로 잠기는 것 방지(레퍼런스와 동일 원칙).
  if (tagFilter && !tagChips.includes(tagFilter)) setTagFilter(null);
  const tagFiltered = tagFilter ? threads.filter((t) => t.tag === tagFilter) : threads;
  const query = searchQuery.trim().toLowerCase();
  const filteredThreads = query ? tagFiltered.filter((t) => (t.title || "").toLowerCase().includes(query)) : tagFiltered;

  if (collapsed) {
    return (
      <aside className="flex w-11 flex-none flex-col items-center border-r ui-divider bg-[var(--surface-sunken)] py-3">
        {/* 2026-09-27, 사용자 요청 — "사이드 부분 접히는것도 노바랑 동일한
            아이콘이랑 구조로": nova(Sidebar.jsx)의 PanelLeft/PanelLeftClose
            아이콘(사각 패널 프레임 + 세로 구분선, 펼칠 때만 화살표 없는
            "panel-left")을 그대로 재현 — lucide-react는 새 의존성이라
            (admin/frontend/CLAUDE.md "Zero-new-dependency policy") 인라인
            SVG로 그렸다. */}
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label="대화 목록 펼치기"
          title="대화 목록 펼치기"
          className="rounded-lg p-2 text-[var(--text-faint)] transition-colors hover:bg-[var(--surface-card)] hover:text-[var(--text-secondary)]"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M9 3v18" />
          </svg>
        </button>
      </aside>
    );
  }

  return (
    <>
    <aside className="flex flex-none flex-col border-r ui-divider bg-[var(--surface-sunken)]" style={{ width }}>
      <div className="ui-divider border-b p-3">
        {/* 2026-09-27 — 제목 줄 + 접기 아이콘을 "새 대화" 버튼과 분리된
            자기 줄로(nova Sidebar.jsx 상단 "AI NOVA" + PanelLeftClose와
            동일 구조). "새 대화"는 그 아래 자기 줄에서 전체 폭을 쓴다. */}
        <div className="mb-2 flex items-center justify-between">
          {/* 2026-09-27(후속), 사용자 지적 — "'대화' 말고 AI LENS 로고를
              넣는걸로"(후속 — "al 은 빼고"): nova가 이 자리에 "AI NOVA"
              워드마크를 쓰는 것과 같은 구조. 정사각 배지("AL")는 빼고
              이 앱 좌측 메인 내비(Sidebar.tsx)와 같은 폰트(font-display)의
              "AI LENS" 텍스트만 남겼다. */}
          <span className="font-display truncate text-[12px] font-bold text-[var(--text-primary)]">AI LENS</span>
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-label="대화 목록 접기"
            title="대화 목록 접기"
            className="flex-none rounded-lg p-1.5 text-[var(--text-faint)] transition-colors hover:bg-[var(--surface-card)] hover:text-[var(--text-secondary)]"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M9 3v18" />
              <path d="m16 15-3-3 3-3" />
            </svg>
          </button>
        </div>
        <button
          type="button"
          onClick={onNew}
          className="ui-btn ui-btn-primary flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-semibold"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
          새 대화
        </button>
        {/* 2026-09-27(후속×3), 사용자 요청 — "여러 개 선택해서 삭제
            부분... 노바처럼... 검색 창 넣고, 그 오른쪽에 휴지통 아이콘
            넣는걸로": 텍스트 링크 대신 nova Sidebar.jsx와 동일 구성
            (검색 입력 + 오른쪽 삭제모드 토글)으로 바꿨다 — 검색은 그
            레퍼런스 UI 자체가 요구하는 구조라 같이 생겼다(대화가 늘어날수록
            "어떤 출력물이었는지 체크"하러 찾는 용도로도 쓸모 있음). */}
        {threads.length > 0 && (
          <div className="mt-1.5 flex items-center gap-1.5">
            <div className="relative flex-1">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[var(--text-faint)]" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="m21 21-4.35-4.35" />
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="검색..."
                className="ui-input w-full rounded-lg py-1.5 pl-7 pr-7 text-[11.5px]"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  aria-label="검색어 지우기"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-[var(--text-faint)] hover:bg-[var(--surface-card)]"
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => (selectionMode ? exitSelectionMode() : setSelectionMode(true))}
              aria-pressed={selectionMode}
              title="대화 삭제 — 여러 개 선택"
              className="flex-none rounded-lg p-2 transition-colors"
              style={selectionMode ? { background: "var(--danger-soft)", color: "var(--danger)" } : { color: "var(--text-faint)" }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6h16Z" />
              </svg>
            </button>
          </div>
        )}
        {/* 선택 모드 툴바 — N개 선택·전체 선택·취소(레퍼런스와 동일 구성,
            "전체 선택"은 지금 검색·태그 필터로 걸러진 목록 기준). */}
        {selectionMode && (
          <div className="mt-1.5 flex items-center justify-between text-[10.5px] text-[var(--text-faint)]">
            <span>{selectedIds.size}개 선택</span>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setSelectedIds(new Set(filteredThreads.map((t) => t.id)))} className="hover:text-[var(--text-secondary)]">
                전체 선택
              </button>
              <button type="button" onClick={exitSelectionMode} className="hover:text-[var(--text-secondary)]">
                취소
              </button>
            </div>
          </div>
        )}
        {/* 2026-09-26 — 이모지 태그 필터 칩(레퍼런스와 동일 원칙: 실제 쓰는
            태그로만 동적 생성, 다시 누르면 해제). 선택 삭제 모드에서는
            숨긴다(레퍼런스와 동일 — 두 모드가 겹치면 혼란). */}
        {!selectionMode && tagChips.length > 0 && (
          <div className="mt-1.5 flex items-center gap-1 overflow-x-auto">
            {tagChips.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => setTagFilter(tagFilter === tag ? null : tag)}
                className="flex h-6 min-w-[28px] flex-none items-center justify-center rounded-full px-1.5 text-[13px] transition-colors"
                style={
                  tagFilter === tag
                    ? { background: "var(--accent-soft)", boxShadow: "inset 0 0 0 1px var(--accent)" }
                    : { background: "var(--surface-card)" }
                }
              >
                {tag}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
        {threads.length === 0 && (
          <p className="px-2 py-3 text-[11px] leading-relaxed text-[var(--text-faint)]">
            아직 저장된 대화가 없습니다 — 메시지를 보내면 자동으로 저장됩니다.
          </p>
        )}
        {threads.length > 0 && filteredThreads.length === 0 && (
          <p className="px-2 py-3 text-[11px] leading-relaxed text-[var(--text-faint)]">
            이 태그가 붙은 대화가 없습니다.
          </p>
        )}
        {filteredThreads.map((t) => (
          <ThreadButton
            key={t.id}
            t={t}
            active={t.id === activeId}
            onSelect={onSelect}
            selectionMode={selectionMode}
            selected={selectedIds.has(t.id)}
            onToggleSelect={toggleSelected}
            editing={editingId === t.id}
            editDraft={editDraft}
            onEditDraftChange={setEditDraft}
            onStartEdit={() => startEdit(t)}
            onConfirmEdit={confirmEdit}
            onCancelEdit={cancelEdit}
            onDeleteClick={() => handleDeleteOne(t)}
            renaming={renaming && editingId === t.id}
            onApplyTag={(tag) => applyTag(t.id, tag)}
          />
        ))}
      </div>
      {/* 일괄 삭제 액션바 — 선택 모드 + 1개 이상 선택 시(레퍼런스 프로젝트와 동일 조건). */}
      {selectionMode && selectedIds.size > 0 && (
        <div className="ui-divider border-t p-2">
          <button
            type="button"
            disabled={bulkDeleting}
            onClick={handleBulkDelete}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-semibold transition-colors disabled:opacity-50"
            style={{ background: "var(--danger-soft)", color: "var(--danger)" }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6h16Z" />
            </svg>
            {bulkDeleting ? "삭제 중..." : `${selectedIds.size}개 삭제`}
          </button>
        </div>
      )}
    </aside>
    <div
      role="separator"
      aria-orientation="vertical"
      onMouseDown={handleResizeStart}
      className="w-1.5 flex-none cursor-col-resize bg-transparent transition-colors hover:bg-[var(--accent-soft)] active:bg-[var(--accent-soft)]"
      title="드래그해서 폭 조절"
    />
    </>
  );
}
