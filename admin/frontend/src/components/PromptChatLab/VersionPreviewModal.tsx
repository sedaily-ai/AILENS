"use client";

import { useEffect } from "react";

/* 프롬프트 버전 드롭다운에서 고른 과거 버전의 원문을 보여주는 모달
   (2026-09-21 PromptChatLab.tsx에서 신설). 2026-09-22 — 레터·팟캐스트·
   영상 탭(PromptTextLab.tsx)에도 같은 "발행 버전" 드롭다운·미리보기가
   필요해져 공용 파일로 뺐다 — 웹툰 쪽 동작은 그대로(내용 변경 없음). */
export function VersionPreviewModal({
  version,
  content,
  loading,
  onClose,
}: {
  version: number | null;
  content: string | null;
  loading: boolean;
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
      <div className="ui-card w-full max-w-[640px] overflow-hidden rounded-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3" style={{ borderColor: "var(--border-hairline)" }}>
          <span className="text-[12.5px] font-semibold text-gray-500">프롬프트 v{version} 내용</span>
          <button type="button" onClick={onClose} className="shrink-0 cursor-pointer text-gray-400 hover:text-gray-700" aria-label="닫기">
            ✕
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto p-4">
          {loading ? (
            <p className="text-[12px] text-[var(--text-faint)]">불러오는 중...</p>
          ) : (
            <pre className="whitespace-pre-wrap break-words font-mono text-[11.5px] leading-relaxed text-[var(--text-secondary)]">
              {content}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
