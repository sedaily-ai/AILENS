import { SCOPE_KIND_LABEL, scopeGroups } from "@/lib/prompt";

/* 상태 탭. 점 표시: 노랑=저장 안 된 변경, 회색=저장된 내용 있음.
   렌더 밖에 둔다(Sidebar 규칙과 같은 이유 — 안에 정의하면 매 렌더마다 새
   컴포넌트 타입이 생겨 하위 트리가 리마운트된다). */
export function ScopeTabs({
  activeId,
  dirtyIds,
  filledIds,
  onSelect,
}: {
  activeId: string;
  dirtyIds: string[];
  filledIds: string[];
  onSelect: (id: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      {scopeGroups().map((group) => (
        <div key={group.kind} className="flex items-center gap-1.5">
          <span className="w-7 flex-shrink-0 text-[10px] font-semibold tracking-wide text-[var(--text-faint)]">
            {SCOPE_KIND_LABEL[group.kind]}
          </span>
          <div className="flex flex-wrap gap-1">
            {group.scopes.map((scope) => {
              const active = scope.id === activeId;
              const isDirty = dirtyIds.includes(scope.id);
              const isFilled = filledIds.includes(scope.id);
              return (
                <button
                  key={scope.id}
                  type="button"
                  onClick={() => onSelect(scope.id)}
                  aria-pressed={active}
                  title={scope.hint}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] cursor-pointer transition-colors ${
                    active
                      ? "font-semibold"
                      : "font-medium hover:bg-[var(--surface-sunken)]"
                  }`}
                  style={{
                    background: active ? "var(--accent-soft)" : undefined,
                    color: active ? "var(--accent)" : "var(--text-secondary)",
                  }}
                >
                  {scope.label}
                  {(isDirty || isFilled) && (
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{
                        background: isDirty ? "var(--warn)" : "var(--text-faint)",
                      }}
                      title={isDirty ? "저장 안 된 변경" : "저장된 프롬프트 있음"}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
