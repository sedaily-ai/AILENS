"use client";

import { useRef, useState } from "react";
import { adminApi } from "@/lib/adminClient";
import type { BubbleLayout, WebtoonStoryboardDialogueLine } from "@/lib/types";

/* 말풍선 편집(2026-10-02) — 컷 이미지 위에서 말풍선을 끌어 옮기고, 꼬리 끝을 화자 쪽으로 맞춘다.
   그림은 글자 없는 원본(bgUrl)을 서버가 보관하고 있어서, 위치·대사·tone을 바꿀 때마다
   /admin/webtoon-lab/recompose가 그 위에 다시 합성만 한다(이미지 생성 모델 호출 없음 → 비용 없음).
   화면에 보이는 그림은 서버가 실제로 그린 결과이고, 파란 점선 상자(말풍선)와 점(꼬리 끝)은 끌기용 손잡이다. */

const TONES = ["보통", "격앙", "속삭임", "생각"] as const;

type Drag = { index: number; kind: "bubble" | "tail"; dx: number; dy: number; x: number; y: number };

export function BubbleEditorModal({
  cutNumber,
  imageUrl,
  bgUrl,
  layout,
  baseCut,
  dialogue,
  onClose,
  onApply,
}: {
  cutNumber: number;
  imageUrl: string;
  bgUrl: string;
  layout: BubbleLayout[];
  /** 말풍선 외에 합성에 필요한 나머지(제목·캡션·내레이션 등) */
  baseCut: Record<string, unknown>;
  dialogue: WebtoonStoryboardDialogueLine[];
  onClose: () => void;
  onApply: (imageUrl: string, layout: BubbleLayout[], dialogue: WebtoonStoryboardDialogueLine[]) => void;
}) {
  const [lines, setLines] = useState<WebtoonStoryboardDialogueLine[]>(dialogue);
  const [shownUrl, setShownUrl] = useState(imageUrl);
  const [boxes, setBoxes] = useState<BubbleLayout[]>(layout);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [changed, setChanged] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  // 마지막으로 합성에 반영된 대사 — 글자를 고친 뒤 칸을 벗어날 때(blur) 실제로 바뀐 경우에만 다시 합성한다
  const composedRef = useRef<WebtoonStoryboardDialogueLine[]>(dialogue);

  const recompose = async (next: WebtoonStoryboardDialogueLine[]) => {
    setBusy(true);
    setError(null);
    try {
      const res = await adminApi.recomposeWebtoonCut(bgUrl, { ...baseCut, cut: cutNumber, dialogue: next });
      composedRef.current = next;
      setLines(next);
      setShownUrl(res.image_url);
      setBoxes(res.layout);
      setChanged(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "다시 합성하지 못했어요");
    } finally {
      setBusy(false);
    }
  };

  const startDrag = (e: React.PointerEvent, index: number, kind: "bubble" | "tail") => {
    const stage = stageRef.current;
    if (!stage || busy) return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const rect = stage.getBoundingClientRect();
    const b = boxes[index];
    // 잡은 지점과 기준점의 어긋남을 기억해 두면 끌 때 손잡이가 튀지 않는다
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    const baseX = kind === "bubble" ? b.x : b.tip_x;
    const baseY = kind === "bubble" ? b.y : b.tip_y;
    setDrag({ index, kind, dx: baseX - px, dy: baseY - py, x: baseX, y: baseY });
  };

  const moveDrag = (e: React.PointerEvent) => {
    const stage = stageRef.current;
    if (!drag || !stage) return;
    const rect = stage.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width + drag.dx));
    const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height + drag.dy));
    setDrag({ ...drag, x, y });
  };

  const endDrag = () => {
    if (!drag) return;
    const d = drag;
    setDrag(null);
    const round = (v: number) => Math.round(v * 1000) / 1000;
    const next = lines.map((l, i) => {
      if (i !== d.index) return l;
      return d.kind === "bubble"
        ? { ...l, pos: { x: round(d.x), y: round(d.y) } }
        : { ...l, tail: { x: round(d.x), y: round(d.y) } };
    });
    void recompose(next);
  };

  const patchLine = (i: number, patch: Partial<WebtoonStoryboardDialogueLine>) =>
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  const resetAuto = () =>
    void recompose(
      lines.map((l) => {
        const rest = { ...l };
        delete rest.pos;
        delete rest.tail;
        return rest;
      })
    );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="ui-card-strong flex max-h-[92vh] w-full max-w-[1080px] flex-col overflow-hidden rounded-xl">
        <div className="flex items-center justify-between border-b border-[var(--border-hairline)] px-4 py-3">
          <div className="text-[13px] font-semibold text-[var(--text-primary)]">컷 {cutNumber} 말풍선 편집</div>
          <button type="button" onClick={onClose} className="text-[var(--text-faint)] hover:text-[var(--text-secondary)]" aria-label="닫기">
            ✕
          </button>
        </div>

        <div className="grid min-h-0 flex-1 gap-4 overflow-auto p-4 md:grid-cols-[minmax(0,1fr)_300px]">
          <div>
            <div
              ref={stageRef}
              className="relative w-full select-none overflow-hidden rounded-lg bg-[var(--surface-sunken)]"
              style={{ touchAction: "none" }}
              onPointerMove={moveDrag}
              onPointerUp={endDrag}
              onPointerCancel={() => setDrag(null)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- 외부(S3) 동적 URL */}
              <img src={shownUrl} alt={`컷 ${cutNumber}`} className="block w-full" draggable={false} />
              {boxes.map((b, i) => {
                const bx = drag?.index === i && drag.kind === "bubble" ? drag.x : b.x;
                const by = drag?.index === i && drag.kind === "bubble" ? drag.y : b.y;
                const tx = drag?.index === i && drag.kind === "tail" ? drag.x : b.tip_x;
                const ty = drag?.index === i && drag.kind === "tail" ? drag.y : b.tip_y;
                return (
                  <div key={i}>
                    <div
                      onPointerDown={(e) => startDrag(e, i, "bubble")}
                      className="absolute cursor-grab rounded-md border-2 border-dashed border-[#3b6fe0] bg-[#3b6fe0]/10 active:cursor-grabbing"
                      style={{ left: `${(bx - b.w / 2) * 100}%`, top: `${by * 100}%`, width: `${b.w * 100}%`, height: `${b.h * 100}%` }}
                      title="끌어서 말풍선 위치 옮기기"
                    >
                      <span className="absolute -top-2 left-1 rounded bg-[#3b6fe0] px-1 text-[10px] font-semibold leading-4 text-white">{i + 1}</span>
                    </div>
                    <div
                      onPointerDown={(e) => startDrag(e, i, "tail")}
                      className="absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 cursor-crosshair rounded-full border-2 border-white bg-[#e0503b] shadow"
                      style={{ left: `${tx * 100}%`, top: `${ty * 100}%` }}
                      title="끌어서 꼬리 끝(말하는 사람 쪽) 맞추기"
                    />
                  </div>
                );
              })}
              {busy && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/50">
                  <div className="ui-spinner h-5 w-5" />
                </div>
              )}
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-[var(--text-muted)]">
              파란 상자를 끌면 말풍선이, 빨간 점을 끌면 꼬리 끝이 움직이고 놓는 순간 다시 합성됩니다. 이미지를 새로 만들지 않아서 비용이 들지 않습니다.
            </p>
          </div>

          <div className="space-y-3">
            {lines.map((l, i) => (
              <div key={i} className="ui-card space-y-1.5 p-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-[var(--text-primary)]">
                    말풍선 {i + 1}
                    {l.speaker ? <span className="ml-1 font-normal text-[var(--text-faint)]">({l.speaker})</span> : null}
                  </span>
                  <select
                    value={l.tone && (TONES as readonly string[]).includes(l.tone) ? l.tone : "보통"}
                    onChange={(e) => {
                      const next = lines.map((x, idx) => (idx === i ? { ...x, tone: e.target.value } : x));
                      void recompose(next);
                    }}
                    disabled={busy}
                    className="ui-input rounded-md px-1.5 py-0.5 text-[11px]"
                  >
                    {TONES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                <textarea
                  value={l.line}
                  rows={2}
                  onChange={(e) => patchLine(i, { line: e.target.value })}
                  onBlur={() => {
                    if (lines[i].line !== composedRef.current[i]?.line) void recompose(lines);
                  }}
                  className="ui-input w-full resize-none rounded-md px-2 py-1 text-[12px] leading-relaxed"
                />
              </div>
            ))}
            {error && <div className="text-[11px] text-[var(--danger)]">{error}</div>}
            <div className="flex items-center gap-2 pt-1">
              <button type="button" onClick={resetAuto} disabled={busy} className="ui-btn ui-btn-ghost rounded-lg px-2.5 py-1 text-[11px] font-semibold disabled:opacity-40">
                자동 배치로 되돌리기
              </button>
              <button
                type="button"
                onClick={() => {
                  onApply(shownUrl, boxes, lines);
                  onClose();
                }}
                disabled={busy || !changed}
                className="ui-btn ui-btn-primary ml-auto rounded-lg px-3 py-1 text-[11px] font-semibold disabled:opacity-40"
              >
                이 컷에 적용
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
