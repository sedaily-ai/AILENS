"use client";

import { useState } from "react";
import { createPortal } from "react-dom";

/* PRISM [운영에 적용] 확인 창(2026-10-30) — 사용자 지적: "적용 버튼이 너무 많아서 뭘 누르면 뭐가 되는지 헷갈려".
   실제 제작 설정 카드의 두 프롬프트(대본 작성·장면 변환)를 한 창에서 고른다. 지금 편집 칸에 불러온 버전이 운영 중인
   버전과 다를 때만 체크 가능 — 같으면 "변경 없음"으로 보여 준다. 확인을 누르면 체크한 항목만 활성화한다. */
export interface PrismApplyItem {
  key: string;
  label: string;
  liveVersion: number | null;
  /** 편집 칸에 불러온(=적용하려는) 버전. null이면 아직 불러오지 않음. */
  nextVersion: number | null;
  nextLabel: string | null;
  apply: () => Promise<void>;
}

export function PrismApplyModal({ items, onCancel, onDone }: { items: PrismApplyItem[]; onCancel: () => void; onDone: () => void }) {
  const changed = (it: PrismApplyItem) => it.nextVersion !== null && it.nextVersion !== it.liveVersion;
  const [checked, setChecked] = useState<Record<string, boolean>>(() => Object.fromEntries(items.map((it) => [it.key, changed(it)])));
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selected = items.filter((it) => changed(it) && checked[it.key]);

  const handleConfirm = async () => {
    if (applying || selected.length === 0) return;
    setApplying(true);
    setError(null);
    try {
      for (const it of selected) await it.apply();
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "적용 실패");
    } finally {
      setApplying(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4" role="presentation" onClick={applying ? undefined : onCancel}>
      <div onClick={(e) => e.stopPropagation()} className="flex w-full max-w-md flex-col overflow-hidden rounded-2xl bg-[var(--surface-card)] shadow-2xl">
        <div className="flex-none border-b ui-divider px-5 py-4">
          <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">운영에 적용할 변경</h3>
          <p className="mt-1 text-[11.5px] text-[var(--text-faint)]">편집 칸에 불러온 버전과 지금 운영 중인 버전을 비교했습니다.</p>
        </div>
        <div className="space-y-1 px-5 py-4">
          {items.map((it) => {
            const can = changed(it);
            return (
              <label key={it.key} className={`flex items-center gap-2.5 border-b ui-divider py-2 text-[13px] ${can ? "cursor-pointer" : "opacity-50"}`}>
                <input
                  type="checkbox"
                  disabled={!can || applying}
                  checked={can && !!checked[it.key]}
                  onChange={(e) => setChecked((prev) => ({ ...prev, [it.key]: e.target.checked }))}
                />
                <span className="w-32 flex-none font-semibold text-[var(--text-primary)]">{it.label}</span>
                <span className="text-[var(--text-secondary)]">
                  {can ? (
                    <>
                      {it.liveVersion !== null ? `v${it.liveVersion}` : "없음"} → <b className="text-[var(--accent)]">v{it.nextVersion}</b>
                      {it.nextLabel ? ` · ${it.nextLabel}` : ""}
                    </>
                  ) : it.liveVersion !== null ? (
                    `v${it.liveVersion} (변경 없음)`
                  ) : (
                    "변경 없음"
                  )}
                </span>
              </label>
            );
          })}
          <p className="mt-3 rounded-lg px-3 py-2.5 text-[12px] leading-relaxed" style={{ background: "var(--warn-soft)", color: "var(--text-primary)" }}>
            적용하면 다음 <b>[PRISM 제작]</b>부터 <b>12개 그룹 전체</b>에 반영됩니다. 시험 영상으로 먼저 확인했는지 봐 주세요.
          </p>
          {error && <p className="text-[11px] font-medium text-[var(--danger)]">{error}</p>}
        </div>
        <div className="flex flex-none items-center justify-end gap-2 border-t ui-divider px-5 py-3.5">
          <button type="button" onClick={onCancel} disabled={applying} className="ui-btn rounded-lg px-3.5 py-1.5 text-[12px] font-semibold disabled:opacity-50">
            취소
          </button>
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={applying || selected.length === 0}
            className="ui-btn ui-btn-primary rounded-lg px-3.5 py-1.5 text-[12px] font-semibold disabled:opacity-50"
          >
            {applying ? "적용 중..." : "적용"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
