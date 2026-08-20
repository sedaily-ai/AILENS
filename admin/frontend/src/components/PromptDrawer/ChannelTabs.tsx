/* 포맷(채널) 탭 — "4가지 시선" 프롬프트 드로어처럼 채널이 여러 개인
   화면에서만 뜬다(2026-08-20, "프롬프트가 4가지 시선 쪽에 있어야 하는데,
   탭별로 구분되면 좋겠다" 요청). 글 관리·웹툰·영상·팟캐스트처럼 채널이
   하나뿐인 화면은 이 탭이 아예 안 뜬다(PromptDrawer가 channels prop 없을 때
   렌더 자체를 안 함) — LensMode.tsx 4개 포맷 탭과 같은 pill 스타일로
   맞췄다. 점 표시는 ScopeTabs와 같은 의미(노랑=저장 안 된 변경,
   회색=저장된 내용 있음)인데, 스코프별이 아니라 "이 채널의 두 스코프 중
   하나라도"로 집계한다 — 채널 탭 하나에 스코프 두 개가 안 보이므로. */
export function ChannelTabs({
  channels,
  activeId,
  dirtyChannelIds,
  filledChannelIds,
  onSelect,
}: {
  channels: Array<{ id: string; label: string }>;
  activeId: string;
  dirtyChannelIds: string[];
  filledChannelIds: string[];
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex gap-1 rounded-lg bg-[var(--surface-sunken)] p-1">
      {channels.map((c) => {
        const active = c.id === activeId;
        const isDirty = dirtyChannelIds.includes(c.id);
        const isFilled = filledChannelIds.includes(c.id);
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onSelect(c.id)}
            aria-pressed={active}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-[13px] cursor-pointer transition-colors ${
              active ? "bg-[var(--surface-card)] font-semibold shadow-sm" : "font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            {c.label}
            {(isDirty || isFilled) && (
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: isDirty ? "var(--warn)" : "var(--text-faint)" }}
                title={isDirty ? "저장 안 된 변경" : "저장된 프롬프트 있음"}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
