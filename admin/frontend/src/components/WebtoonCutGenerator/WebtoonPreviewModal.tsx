"use client";

import { useState } from "react";

/* 웹툰 미리보기(2026-10-02) — 생성한 컷을 실제 서비스 화면(ailens.sedaily.ai)의 웹툰 탭처럼 보여 준다.
   컷을 틈 없이 세로로 이어 붙이고(둥근 모서리·그림자, 실제 갤러리와 같은 모양), 컷마다 자기 비율로 높이를 정한다.
   폭은 PC(920px)와 모바일(390px)을 바꿔 가며 볼 수 있다. */

const WIDTHS = [
  { id: "pc", label: "PC", px: 920 },
  { id: "mobile", label: "모바일", px: 390 },
] as const;

export function WebtoonPreviewModal({
  title,
  images,
  onClose,
}: {
  title: string;
  /** 컷 번호 순으로 정렬된 이미지 URL */
  images: { index: number; url: string }[];
  onClose: () => void;
}) {
  const [widthId, setWidthId] = useState<(typeof WIDTHS)[number]["id"]>("pc");
  const width = WIDTHS.find((w) => w.id === widthId)!.px;

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/50 p-3"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="ui-card-strong flex w-full max-w-[1040px] flex-col overflow-hidden rounded-xl">
        <div className="flex items-center gap-3 border-b border-[var(--border-hairline)] px-4 py-3">
          <div className="text-[13px] font-semibold text-[var(--text-primary)]">{title} · 실제 화면 미리보기</div>
          <div className="ml-auto flex items-center gap-1">
            {WIDTHS.map((w) => (
              <button
                key={w.id}
                type="button"
                onClick={() => setWidthId(w.id)}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold ${
                  widthId === w.id ? "bg-[var(--accent-soft)] text-[var(--accent)]" : "text-[var(--text-faint)] hover:text-[var(--text-secondary)]"
                }`}
              >
                {w.label} {w.px}px
              </button>
            ))}
          </div>
          <button type="button" onClick={onClose} className="text-[var(--text-faint)] hover:text-[var(--text-secondary)]" aria-label="닫기">
            ✕
          </button>
        </div>

        {/* 서비스 화면 배경(#fafafa)과 같은 바탕 위에 컷을 이어 붙인다 */}
        <div className="flex-1 overflow-y-auto" style={{ background: "#fafafa" }}>
          <div className="mx-auto py-6" style={{ width: Math.min(width, 1000), maxWidth: "100%" }}>
            {images.length === 0 ? (
              <p className="py-20 text-center text-[12px] text-[var(--text-faint)]">아직 생성된 컷이 없습니다.</p>
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 0,
                  borderRadius: 18,
                  overflow: "hidden",
                  background: "#fff",
                  boxShadow: "0 1px 2px rgba(0,0,0,.04), 0 8px 24px rgba(0,0,0,.06)",
                }}
              >
                {images.map((im) => (
                  <figure key={im.index} style={{ margin: 0 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- 외부(S3) 동적 URL */}
                    <img src={im.url} alt={`컷 ${im.index}`} style={{ display: "block", width: "100%", height: "auto" }} />
                  </figure>
                ))}
              </div>
            )}
            <p className="mt-4 text-center text-[11px] text-[var(--text-faint)]">
              서비스 화면은 컷을 이렇게 틈 없이 이어서 보여 줍니다 · 컷 {images.length}장
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
