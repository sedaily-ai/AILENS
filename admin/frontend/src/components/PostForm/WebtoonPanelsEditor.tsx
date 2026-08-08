"use client";

import { useState } from "react";
import { uploadImage, ImageUploadError } from "@/lib/uploadImage";
import { useToast } from "@/components/Toast";
import type { CmsImage } from "@/lib/types";

// 웹툰 파일럿(2026-08-06) — 컷 이미지+캡션 나열. 새 필드 없이 기존
// body_inline.images(url+caption)를 컷 목록으로 그대로 쓴다(백엔드
// _shape_webtoon 과 1:1). 그림 자체는 GPT 등 외부 생성 후 여기서 업로드만.
export function WebtoonPanelsEditor({
  panels,
  onChange,
}: {
  panels: CmsImage[];
  onChange: (next: CmsImage[]) => void;
}) {
  const toast = useToast();
  const [uploadingIndex, setUploadingIndex] = useState<number | null>(null);
  // 컷 위로 이미지를 끌어다 놓으면 교체, 하단 추가 영역에 놓으면 새 컷으로
  // 추가된다(2026-08-07, "던지면 교체되게" 요청) — CoverImageField.tsx의
  // 드래그앤드롭 패턴과 동일. -1 은 "컷 추가" 드롭존.
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  // 컷 순서 재배열 — "↑ 위로/↓ 아래로" 버튼만으로는 컷이 많을 때(8~10컷)
  // 너무 느리다는 지적(2026-08-07)으로 드래그 정렬을 추가했다. 왼쪽 손잡이
  // (⠿)를 끌어 다른 컷 위에 놓으면 그 자리로 순서가 바뀐다 — 이미지
  // 영역(파일 드롭 = 교체)과 겹치지 않게 손잡이만 draggable로 뒀다. 버튼은
  // 키보드/스크린리더 접근성을 위해 그대로 남겨둔다(드래그는 대체 불가능).
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);

  const reorder = (from: number, to: number) => {
    if (from === to) return;
    const next = [...panels];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange(next);
  };

  const doUpload = async (file: File): Promise<string | null> => {
    try {
      return await uploadImage(file);
    } catch (err) {
      toast.show(err instanceof ImageUploadError ? err.message : "업로드 실패", "error");
      return null;
    }
  };

  const addPanel = async (file: File) => {
    setUploadingIndex(panels.length);
    const url = await doUpload(file);
    if (url) onChange([...panels, { url, caption: "" }]);
    setUploadingIndex(null);
  };

  const replacePanel = async (index: number, file: File) => {
    setUploadingIndex(index);
    const url = await doUpload(file);
    if (url) onChange(panels.map((p, i) => (i === index ? { ...p, url } : p)));
    setUploadingIndex(null);
  };

  const removePanel = (index: number) => {
    if (!window.confirm(`컷 ${index + 1}을(를) 삭제할까요?`)) return;
    onChange(panels.filter((_, i) => i !== index));
  };

  const move = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= panels.length) return;
    const next = [...panels];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  const setCaption = (index: number, caption: string) =>
    onChange(panels.map((p, i) => (i === index ? { ...p, caption } : p)));

  return (
    <div className="space-y-3">
      {panels.map((p, i) => (
        <div
          key={i}
          className={`ui-card rounded-xl p-3 flex gap-3 transition-shadow ${
            draggingIndex !== null && draggingIndex !== i ? "ring-1 ring-blue-200" : ""
          } ${draggingIndex === i ? "opacity-40" : ""}`}
          // 카드 전체가 재배열 드롭 타겟 — 손잡이(⠿)를 끌어 이 카드 위에
          // 놓으면 그 자리로 옮겨간다. 이미지 위 파일 드롭(교체)과는 별개 영역.
          onDragOver={(e) => {
            if (draggingIndex === null) return;
            e.preventDefault();
          }}
          onDrop={(e) => {
            if (draggingIndex === null) return;
            e.preventDefault();
            reorder(draggingIndex, i);
            setDraggingIndex(null);
          }}
        >
          <div
            draggable
            onDragStart={(e) => {
              setDraggingIndex(i);
              e.dataTransfer.effectAllowed = "move";
            }}
            onDragEnd={() => setDraggingIndex(null)}
            className="flex shrink-0 cursor-grab items-center self-stretch px-0.5 text-gray-300 hover:text-gray-500 active:cursor-grabbing"
            aria-label={`컷 ${i + 1} 끌어서 순서 바꾸기`}
            title="끌어서 순서 바꾸기"
          >
            ⠿
          </div>
          <div
            className={`shrink-0 text-center rounded-lg transition-colors ${
              dragOverIndex === i ? "ring-2 ring-blue-400 bg-blue-50/40" : ""
            }`}
            onDragOver={(e) => {
              if (draggingIndex !== null) return; // 컷 재배열 중 — 교체 드롭존이 아니라 카드 전체가 타겟
              e.preventDefault();
              setDragOverIndex(i);
            }}
            onDragLeave={() => setDragOverIndex((cur) => (cur === i ? null : cur))}
            onDrop={(e) => {
              if (draggingIndex !== null) return;
              e.preventDefault();
              setDragOverIndex(null);
              const file = e.dataTransfer.files?.[0];
              if (file) void replacePanel(i, file);
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- 외부(S3) 원본 URL */}
            <img src={p.url} alt="" className="h-28 w-28 rounded-lg object-cover bg-gray-100 pointer-events-none" />
            <label className="mt-1 block text-[11px] font-medium text-blue-700 cursor-pointer">
              {uploadingIndex === i ? "업로드 중..." : dragOverIndex === i ? "여기에 놓으세요" : "교체 (끌어놓기 가능)"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) void replacePanel(i, file);
                }}
              />
            </label>
          </div>
          <div className="flex-1 space-y-2 min-w-0">
            <textarea
              value={p.caption ?? ""}
              onChange={(e) => setCaption(i, e.target.value)}
              rows={3}
              placeholder={`컷 ${i + 1} 대사/캡션 (선택)`}
              className="ui-input w-full rounded-lg px-3 py-2 text-sm leading-relaxed"
            />
            <div className="flex items-center gap-3 text-xs text-gray-500">
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="hover:text-gray-900 disabled:opacity-30 cursor-pointer disabled:cursor-default">
                ↑ 위로
              </button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === panels.length - 1} className="hover:text-gray-900 disabled:opacity-30 cursor-pointer disabled:cursor-default">
                ↓ 아래로
              </button>
              <button type="button" onClick={() => removePanel(i)} className="ml-auto text-red-500 hover:text-red-700 cursor-pointer">
                삭제
              </button>
            </div>
          </div>
        </div>
      ))}

      <label
        className={`flex items-center justify-center rounded-xl border border-dashed py-6 text-sm cursor-pointer transition-colors ${
          dragOverIndex === -1
            ? "border-blue-400 bg-blue-50/40 text-blue-600"
            : "border-gray-300 text-gray-500 hover:bg-gray-50"
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOverIndex(-1);
        }}
        onDragLeave={() => setDragOverIndex((cur) => (cur === -1 ? null : cur))}
        onDrop={(e) => {
          e.preventDefault();
          setDragOverIndex(null);
          const file = e.dataTransfer.files?.[0];
          if (file) void addPanel(file);
        }}
      >
        {uploadingIndex === panels.length
          ? "업로드 중..."
          : dragOverIndex === -1
          ? "여기에 놓으세요"
          : "+ 컷 추가 (이미지 업로드 또는 끌어놓기)"}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void addPanel(file);
          }}
        />
      </label>
    </div>
  );
}
