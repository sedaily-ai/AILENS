"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// 네이티브 <select>는 스타일을 못 입힌다 — DateRangeCalendar.tsx와 같은
// 팝오버/accent 톤으로 통일해달라는 요청(2026-08-07 "공통되게 해주시죠")에
// 맞춘 범용 드롭다운. 외부 의존성 없이 직접 구현(zero-new-dependency,
// react-dom의 createPortal은 React 자체에 내장돼 있어 새 패키지가 아니다).

interface Option<T extends string> {
  value: T;
  label: string;
  /** 2026-09-20, 웹툰 모델 선택 — "사용 중"/"운영 중"/"사업상 미사용"처럼
   *  옵션 옆에 작은 상태 태그를 붙이고 싶을 때. 없으면 안 그린다(기존
   *  호출부는 그대로 동작). */
  badge?: string;
  /** true면 선택은 그대로 가능하되(비교용으로 여전히 골라볼 수 있어야
   *  하므로 클릭 자체는 안 막는다) 글자색을 흐리게 렌더해 "정책상 지금은
   *  안 쓰기로 한 옵션"임을 표시한다. */
  muted?: boolean;
  /** 2026-09-26 신설 — onDeleteOption이 있어도 이 옵션엔 휴지통 아이콘을
   *  안 그린다(예: 지금 활성/프로덕션인 버전처럼 애초에 삭제가 금지된
   *  옵션 — PromptVersionReference.tsx 참고). */
  nonDeletable?: boolean;
  /** 2026-09-26 신설, 사용자 지적 — "UIUX 전문 디자이너라면 디테일을
   *  잘 잡았다고 보시나요? .. 버전 부분은 라벨로 감쌀까요? 그러면
   *  날짜부분이랑 경계가 지지 않을까": "v17 · 2026-09-26 16:59"처럼 한
   *  줄에 다 욱여넣으면 버전 번호·날짜가 구분 없이 이어 읽힌다. 있으면
   *  label(버전 번호, 굵게) 아래 둘째 줄(옅은 색·작은 글씨)로 따로
   *  그린다 — 시각적으로 "이건 부가 정보"라는 게 분명해진다. */
  sublabel?: string;
  /** 2026-09-26 신설, 사용자 지적 — "프로덕션쪽은 항상 상위에 있도록
   *  하고?": 이 옵션에 옅은 배경 톤 + 목록 나머지와 구분되는 아래쪽
   *  테두리를 줘서 "이건 특별한 하나, 나머지는 이력 목록"이라는 걸
   *  시각적으로도 못박는다(정렬 순서 자체는 호출부가 이미 맨 앞에
   *  둬야 한다 — 이 prop은 순서를 바꾸지 않는다, 스타일만). */
  pinned?: boolean;
  /** 2026-09-26 신설, 사용자 요청 — "드롭다운 부분에... edit 할 수 있는
   *  아이콘을 넣고 누르면 버전이름 수정할 수 있도록": onRenameOption이
   *  있어도 이 값이 undefined인 옵션엔 연필 아이콘을 안 그린다(예:
   *  VersionSwitcher.tsx의 "최신" 같은, 실제 버전 번호가 아닌 pseudo
   *  옵션). 편집칸의 시작값으로 쓰는 "지금 이름"(빈 문자열=이름 없음) —
   *  label처럼 "v18 · 2313"으로 합쳐진 표시용 문자열이 아니라 순수 이름만. */
  editableName?: string;
  /** 2026-09-26(후속), 사용자 지적 — "edit 아이콘 누르면 v17이 플레이스홀더
   *  에서 사라지나요? 저는 그대로 유지되면 좋겠어서": 편집 모드로 바뀌면
   *  label 전체("v17 · 2313")가 입력칸으로 통째로 바뀌어서 "지금 어느
   *  버전을 고치는 중인지"가 안 보였다 — 편집 중엔 이름만 입력칸이 되고,
   *  이 고정 프리픽스("v17")는 그대로 남아있는다. 없으면 label을 그대로
   *  쓴다(이 prop 없이 onRenameOption만 쓰던 기존 호출부 없음 — 지금은
   *  전부 같이 준다). */
  numberLabel?: string;
}

interface Props<T extends string> {
  value: T;
  options: Option<T>[];
  onChange: (v: T) => void;
  placeholder?: string;
  /** 2026-09-20, 좌측 채팅창 입력창 위 모델 드롭다운 요청 — 트리거가 화면
   *  하단(채팅 입력창)에 가까우면 기본(아래로 펼침) 팝업이 뷰포트 밖으로
   *  잘린다. true면 팝업이 트리거 위쪽으로 펼쳐진다. */
  openUp?: boolean;
  /** 2026-09-25, 사용자 지적 — "드롭다운이 우측으로 펼쳐져서 화면 밖으로
   *  나감. 좌측 아래로 펼쳐지도록 해야합니다": 기본은 트리거의 왼쪽 끝에
   *  맞춰 오른쪽으로 펼쳐진다(min-w-[140px]가 오른쪽으로 자람) — 트리거가
   *  좁은 우측 사이드바 안에서 이미 오른쪽 끝에 붙어 있으면(예:
   *  VersionSwitcher.tsx) 뷰포트 밖으로 잘린다. true면 트리거의 오른쪽
   *  끝에 맞춰 왼쪽으로 펼친다. */
  alignRight?: boolean;
  /** 2026-09-25, 사용자 지적 — "버전 많아지면 길게 늘어나니까 스크롤 할
   *  수 있도록... 폭을 좀 넓게": 옵션이 많은 드롭다운(버전 히스토리처럼
   *  10개 넘게 쌓이는 경우)용. true면 메뉴가 max-height로 잘리고 세로
   *  스크롤되며, 최소 폭도 넓혀서 "v15 · 2026-09-20 10:48" 같은 긴
   *  라벨이 안 잘리게 한다. */
  scrollable?: boolean;
  /** 2026-09-26, 사용자 지적 — 제목 옆(titleExtra)처럼 일반 텍스트 사이에
   *  놓이면 테두리 없는 트리거가 그냥 글자처럼 보여 "이게 드롭다운이다"가
   *  한눈에 안 들어온다("선택 이라고 나와있는데.. 박스? 색상이라도 좀
   *  다르게 해서 구분되게"). true면 트리거에 테두리+배경(칩 모양)을
   *  입혀 눌러볼 수 있는 컨트롤임을 분명히 한다. 다른 자리(예: 채팅
   *  입력창 위 모델 드롭다운)는 이미 자기 라벨과 함께 자연스러워
   *  기본값 false로 기존 모양을 유지한다. */
  boxed?: boolean;
  /** 2026-09-26, 사용자 요청 — "드롭다운에.. 휴지통 아이콘이 있어야 할
   *  것 같은데요": 있으면 각 옵션(nonDeletable이 아닌 것) 오른쪽에 작은
   *  휴지통 아이콘을 그린다. 누르면 onChange(선택)나 드롭다운 닫기 없이
   *  이 콜백만 호출한다 — "고르지 않고 그 자리에서 지우기"라 선택 동작과
   *  분리했다(호출부가 확인 대화상자를 띄우는 등 비동기 처리를 하는
   *  동안 드롭다운이 열린 채로 남는다). */
  onDeleteOption?: (value: T) => void;
  /** 2026-09-26 신설, 사용자 요청 — "드롭다운 부분에... edit 할 수 있는
   *  아이콘을 넣고 누르면 버전이름 수정할 수 있도록": editableName이 있는
   *  옵션마다 연필 아이콘을 그린다. 누르면(onDeleteOption과 같은 원칙 —
   *  선택/드롭다운 닫기와 분리) 그 행이 인라인 입력칸으로 바뀌고, 확인을
   *  누르면 이 콜백만 호출한다(카드를 그 버전으로 "불러오기" 하지 않고,
   *  그 버전의 이름표만 그 자리에서 즉시 바꾼다 — 지금 카드에 저장 안 된
   *  다른 수정이 있어도 안 건드리기 위해). */
  onRenameOption?: (value: T, newName: string) => void;
}

/* 2026-09-26 — 메뉴를 트리거의 자식(position: absolute)으로 그리다가
   "드롭다운이 잘리네요, 밖으로 나갈 수 있도록 해야 합니다" 지적을 받았다.
   원인: 이 드롭다운을 쓰는 자리(PromptVersionReference.tsx의 "생성
   프롬프트" 토글 헤더 등)가 overflow-y-auto인 스크롤 컨테이너 안에
   있는데, CSS는 overflow-y만 auto로 줘도 overflow-x도 자동으로 auto가
   된다(스펙 규정) — 그래서 absolute 메뉴가 그 컨테이너 경계를 넘어가는
   순간 시각적으로 잘렸다. z-index를 아무리 올려도 overflow clipping은
   못 이긴다 — 유일한 해법은 메뉴를 그 스크롤 컨테이너의 DOM 바깥으로
   빼내는 것(포털) + position: fixed로 뷰포트 기준 좌표를 직접 계산해
   붙이는 것. 외부 라이브러리(Radix/Floating UI) 없이 getBoundingClientRect
   + createPortal(React 내장)만으로 구현 — "zero-new-dependency" 유지.

   click-outside 판정을 트리거(rootRef) 하나만으로 하면 안 된다 — 메뉴가
   이제 document.body 밑의 별개 DOM 서브트리라, 메뉴 안 옵션을 클릭해도
   rootRef 기준으로는 "바깥 클릭"으로 오판해서 mousedown 시점에 먼저
   닫혀버리고(그 다음 click이 도착할 옵션 버튼이 이미 언마운트됨) 선택이
   아예 안 먹는 버그가 생긴다 — menuRef도 같이 검사해야 한다. */
export function CustomSelect<T extends string>({
  value,
  options,
  onChange,
  placeholder,
  openUp = false,
  alignRight = false,
  scrollable = false,
  boxed = false,
  onDeleteOption,
  onRenameOption,
}: Props<T>) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  // 2026-09-26 신설 — 드롭다운 안에서 바로 이름을 고치는 인라인 편집
  // 상태. 어느 옵션이 편집 중인지(editingValue)와 그 임시 입력값만 여기서
  // 들고 있는다 — 확정 전까지는 부모에게 아무것도 안 알린다.
  const [editingValue, setEditingValue] = useState<T | null>(null);
  const [editDraft, setEditDraft] = useState("");

  const updatePosition = () => {
    const el = rootRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    // position: fixed 기준 — 뷰포트 좌표 그대로 쓴다(스크롤 오프셋을
    // 더할 필요 없음). openUp이면 메뉴 "아래쪽"을 트리거 위(rect.top)에,
    // 아니면 메뉴 "위쪽"을 트리거 아래(rect.bottom)에 붙인다. alignRight면
    // 메뉴 오른쪽 끝을 트리거 오른쪽 끝(rect.right)에 맞춘다 — 실제 left는
    // 메뉴 자신의 너비를 알아야 계산되므로, 렌더 후 menuRef로 보정한다.
    setPos({ top: openUp ? rect.top : rect.bottom, left: alignRight ? rect.right : rect.left });
  };

  useEffect(() => {
    if (!open) return;
    updatePosition();
    const onReposition = () => updatePosition();
    // capture:true — 안쪽 스크롤 컨테이너(캡처 단계에서만 도달)의 scroll도 잡는다.
    window.addEventListener("scroll", onReposition, true);
    window.addEventListener("resize", onReposition);
    const onClickOutside = (e: MouseEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setOpen(false);
      setEditingValue(null);
      setEditDraft("");
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => {
      window.removeEventListener("scroll", onReposition, true);
      window.removeEventListener("resize", onReposition);
      document.removeEventListener("mousedown", onClickOutside);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- updatePosition은 openUp/alignRight를 닫힌 클로저로 참조하지만 그 두 prop이 열려있는 도중 바뀌는 경우가 없어 안전
  }, [open]);

  const current = options.find((o) => o.value === value);

  return (
    <div className="relative inline-block" ref={rootRef}>
      <button
        type="button"
        onClick={(e) => {
          // 2026-09-26 — 이 드롭다운을 CollapsibleSection의 badge(즉
          // <summary> 안)에 놓는 호출부가 생겨서(PromptVersionReference.tsx,
          // "생성 프롬프트" 토글 헤더의 "불러오기" 드롭다운) preventDefault를
          // 추가했다 — 안 하면 클릭이 네이티브 <details> 토글까지 같이
          // 트리거해서 드롭다운을 열자마자 섹션이 접히거나 펼쳐진다. 다른
          // 위치(폼·일반 버튼)에서는 이 호출이 아무 부작용이 없다.
          e.preventDefault();
          setOpen((v) => !v);
          setEditingValue(null);
          setEditDraft("");
        }}
        className={`flex cursor-pointer items-center gap-1.5 outline-none ${
          boxed ? "ui-input rounded-lg px-2 py-1" : ""
        }`}
      >
        <span
          className="text-[12.5px] font-medium"
          style={{ color: current?.muted ? "var(--text-faint)" : current ? "var(--text-primary)" : "var(--text-muted)" }}
        >
          {current?.label ?? placeholder ?? "선택"}
        </span>
        {current?.badge && <OptionBadge text={current.badge} muted={current.muted} />}
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          className="text-gray-400"
          aria-hidden="true"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open &&
        pos !== null &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menuRef}
            className={`fixed z-50 rounded-xl border p-1 ${scrollable ? "min-w-[220px] max-h-[288px] overflow-y-auto" : "min-w-[140px]"}`}
            style={{
              background: "var(--surface-card)",
              borderColor: "var(--border-hairline)",
              boxShadow: "var(--shadow-md)",
              top: openUp ? undefined : pos.top + 6,
              bottom: openUp ? window.innerHeight - pos.top + 6 : undefined,
              left: alignRight ? undefined : pos.left,
              right: alignRight ? window.innerWidth - pos.left : undefined,
            }}
          >
            {options.map((o, i) => {
              const selected = o.value === value;
              // 2026-09-26 — pinned 옵션 바로 다음(pinned 아닌 첫 항목)
              // 앞에 구분선을 넣는다 — "프로덕션 하나 + 이력 목록"이라는
              // 두 그룹으로 갈린다는 걸 선 하나로 분명히 한다.
              const showDividerBefore = i > 0 && options[i - 1].pinned && !o.pinned;
              const isEditing = editingValue === o.value;
              return (
                <div key={o.value}>
                  {showDividerBefore && <div className="my-1 border-t" style={{ borderColor: "var(--border-hairline)" }} />}
                  {/* 2026-09-26, 사용자 요청 — "드롭다운 부분에... edit
                      할 수 있는 아이콘을 넣고 누르면 버전이름 수정할 수
                      있도록": 편집 중인 행은 선택/삭제 버튼 대신 입력칸 +
                      확인/취소로 통째로 바뀐다.
                      2026-09-26(후속) — 처음엔 "v17"을 고정 프리픽스(수정
                      불가)로 남기고 이름 칸만 비웠는데, 사용자 지적: "v17
                      이것도 수정을 하게 하는거고요... 백스페이스 누르면
                      v1이 될거고... 근데 지금은 edit 누르면 기존에 있던
                      v17 날라가고 공백으로 남는다는게 불편": 고정 프리픽스를
                      버리고, 이름이 아직 없는 옵션은 입력칸을 "v17"(번호
                      그대로)로 채워서 시작한다 — 아무것도 안 사라진 채로
                      바로 백스페이스해서 지우거나 고칠 수 있다(이름이 이미
                      있으면 그 이름으로 시작, 지금과 동일). */}
                  {isEditing ? (
                    <div
                      className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5"
                      style={{ background: "var(--surface-sunken)" }}
                    >
                      <input
                        autoFocus
                        type="text"
                        value={editDraft}
                        onChange={(e) => setEditDraft(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            onRenameOption?.(o.value, editDraft.trim());
                            setEditingValue(null);
                          } else if (e.key === "Escape") {
                            e.preventDefault();
                            setEditingValue(null);
                          }
                        }}
                        placeholder="이름 없음"
                        className="ui-input min-w-0 flex-1 rounded-md px-1.5 py-1 text-[11.5px]"
                      />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onRenameOption?.(o.value, editDraft.trim());
                          setEditingValue(null);
                        }}
                        aria-label="이름 저장"
                        title="이름 저장"
                        className="flex flex-none items-center justify-center rounded-md p-1 text-[var(--accent)] hover:bg-[var(--accent-soft)]"
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M20 6 9 17l-5-5" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setEditingValue(null);
                        }}
                        aria-label="취소"
                        title="취소"
                        className="flex flex-none items-center justify-center rounded-md p-1 text-[var(--text-faint)] hover:bg-[var(--surface-card)]"
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M18 6 6 18M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ) : (
                  <div
                    className="flex w-full items-center gap-0.5 rounded-lg transition-colors hover:bg-[var(--surface-sunken)]"
                    style={{ background: selected && !o.muted ? "var(--accent-soft)" : o.pinned ? "var(--surface-sunken)" : undefined }}
                  >
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        onChange(o.value);
                        setOpen(false);
                      }}
                      className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 px-2.5 py-1.5 text-left"
                    >
                      {/* 2026-09-26, 사용자 지적 — "현재 선택된 것도 색상
                          다르게 하고 할까?": accent 텍스트색만으론 옅어서,
                          체크 아이콘을 추가로 얹어 "이게 지금 선택된
                          것"임을 한 번 더 못박는다(흔한 드롭다운 관용구). */}
                      {selected ? (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="flex-none" aria-hidden="true">
                          <path d="M20 6 9 17l-5-5" />
                        </svg>
                      ) : (
                        <span className="w-3 flex-none" aria-hidden="true" />
                      )}
                      <span className="min-w-0 flex-1">
                        <span
                          className="flex flex-wrap items-center gap-1.5 text-[12.5px] font-semibold"
                          style={{ color: o.muted ? "var(--text-faint)" : selected ? "var(--accent)" : "var(--text-primary)" }}
                        >
                          <span className="truncate">{o.label}</span>
                          {o.badge && <OptionBadge text={o.badge} muted={o.muted} />}
                        </span>
                        {o.sublabel && (
                          <span className="block truncate text-[10.5px] font-normal text-[var(--text-faint)]">{o.sublabel}</span>
                        )}
                      </span>
                    </button>
                    {onRenameOption && o.editableName !== undefined && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setEditingValue(o.value);
                          // 이름이 이미 있으면 그 이름으로, 없으면 번호
                          // 표시("v17")로 시작 — 빈 칸으로 시작하지 않는다.
                          setEditDraft(o.editableName || o.numberLabel || "");
                        }}
                        aria-label={`${o.label} 이름 수정`}
                        title="이름 수정"
                        className="flex flex-none items-center justify-center self-stretch rounded-md px-1.5 text-[var(--text-faint)] transition-colors hover:bg-[var(--accent-soft)] hover:text-[var(--accent)]"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
                        </svg>
                      </button>
                    )}
                    {onDeleteOption && !o.nonDeletable && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onDeleteOption(o.value);
                        }}
                        aria-label={`${o.label} 삭제`}
                        title="삭제"
                        className="flex flex-none items-center justify-center self-stretch rounded-md px-1.5 text-[var(--text-faint)] transition-colors hover:bg-[var(--danger-soft)] hover:text-[var(--danger)]"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6h16Z" />
                        </svg>
                      </button>
                    )}
                  </div>
                  )}
                </div>
              );
            })}
          </div>,
          document.body
        )}
    </div>
  );
}

/** 옵션 옆 작은 상태 태그 — muted면 회색(정책상 미사용), 아니면 accent
 *  톤(현재 사용/운영 중처럼 눈에 띄어야 하는 상태). */
function OptionBadge({ text, muted }: { text: string; muted?: boolean }) {
  return (
    <span
      className="shrink-0 rounded-full px-1.5 py-[1px] text-[10px] font-medium"
      style={{
        color: muted ? "var(--text-faint)" : "var(--accent)",
        background: muted ? "var(--surface-sunken)" : "var(--accent-soft)",
      }}
    >
      {text}
    </span>
  );
}
