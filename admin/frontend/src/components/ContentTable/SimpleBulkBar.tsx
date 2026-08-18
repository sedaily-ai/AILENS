/** 채널 하나로 고정된 목록(웹툰/영상)용 — 레터의 "분류 변경"·카테고리
 * 입력처럼 채널 전용 필드가 없어서 삭제/선택 해제만 있으면 충분하다. */
export function SimpleBulkBar({
  count,
  busy,
  onDelete,
  onClear,
}: {
  count: number;
  busy: boolean;
  onDelete: () => void;
  onClear: () => void;
}) {
  return (
    <div
      className="ui-toast flex max-w-full items-center gap-5 overflow-x-auto rounded-xl px-5 py-3.5"
      style={{ background: "var(--accent-soft)", boxShadow: "var(--shadow-md)" }}
    >
      <span className="shrink-0 text-sm font-semibold" style={{ color: "var(--accent)" }}>
        {count}건 선택됨
      </span>
      <span className="ml-auto h-5 w-px shrink-0 bg-black/10" />
      <button
        type="button"
        disabled={busy}
        onClick={onDelete}
        className="shrink-0 rounded-md px-3 py-1.5 text-sm font-semibold cursor-pointer text-red-600 bg-white hover:brightness-95 disabled:cursor-default disabled:opacity-50"
      >
        삭제
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={onClear}
        className="shrink-0 whitespace-nowrap text-sm font-medium cursor-pointer disabled:cursor-default disabled:opacity-50"
        style={{ color: "var(--text-secondary)" }}
      >
        선택 해제
      </button>
    </div>
  );
}
