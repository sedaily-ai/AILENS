import { useEffect, useState } from "react";

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
export function useViewMode(): [ViewMode, (v: ViewMode) => void] {
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

export function ViewToggle({ view, onChange }: { view: ViewMode; onChange: (v: ViewMode) => void }) {
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
