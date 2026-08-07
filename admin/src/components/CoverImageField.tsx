"use client";

import { useRef, useState } from "react";
import { uploadImage, ImageUploadError } from "@/lib/uploadImage";
import { useToast } from "@/components/Toast";

const ACCEPT = "image/jpeg,image/png,image/webp,image/gif";

/** 글 목록·피드 카드에 쓰이는 썸네일. uploadImage.ts 와 같은 presigned-PUT
 * 패턴 — 저장은 상위 페이지의 save()가 다른 필드와 함께 한 번에 처리한다
 * (여기선 값만 들고 있는다). 비었을 때 실제로 뭐가 대신 나가는지는 쓰는
 * 곳마다 다르다(mode="post" 는 AI LENS 기본 로고, mode="video" 는 유튜브
 * 원본 썸네일) — 그래서 안내 문구를 fallbackHint prop 으로 호출부가 정확히
 * 넘기게 했다.
 *
 * 2026-08-07 리디자인 — "썸네일" 라벨·설명문·업로드 버튼이 나란한 유틸리티
 * 폼 카드였던 걸, 미디엄의 대표 이미지처럼 이미지 자체가 넓은 배너로 보이는
 * 형태로 바꿨다. 비어있을 때는 옅은 점선 안에 "+"만 있는 최소 프롬프트,
 * 채워지면 이미지가 통째로 배너가 되고 교체/제거는 위에 올렸을 때만 뜨는
 * 오버레이 버튼으로("AI 티나는 이모지 없이 깔끔하고 모던하게" 요청). */
export function CoverImageField({
  value,
  onChange,
  fallbackHint,
}: {
  value: string | null;
  onChange: (url: string | null) => void;
  fallbackHint: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const toast = useToast();

  const pick = () => inputRef.current?.click();

  const handleFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.show("이미지 파일만 올릴 수 있습니다", "error");
      return;
    }
    setUploading(true);
    try {
      const url = await uploadImage(file);
      onChange(url);
      toast.show("대표 이미지를 올렸어요 — 저장을 눌러야 반영됩니다", "success");
    } catch (err) {
      const msg = err instanceof ImageUploadError ? err.message : "업로드 실패";
      toast.show(msg, "error");
    } finally {
      setUploading(false);
    }
  };

  const fileInput = (
    <input
      ref={inputRef}
      type="file"
      accept={ACCEPT}
      className="hidden"
      onChange={(e) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (file) void handleFile(file);
      }}
    />
  );

  const dragHandlers = {
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(true);
    },
    onDragLeave: () => setDragActive(false),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      const file = e.dataTransfer.files?.[0];
      if (file) void handleFile(file);
    },
  };

  if (value) {
    return (
      <div
        className="group relative overflow-hidden rounded-2xl bg-gray-100"
        style={{ aspectRatio: "21 / 8" }}
        {...dragHandlers}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- 외부(S3) 원본 URL, next/image 최적화 대상 아님 */}
        <img src={value} alt="" className="h-full w-full object-cover" />
        {dragActive && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <span className="text-[13px] font-semibold text-white">여기에 놓으세요</span>
          </div>
        )}
        {/* 하단 바는 항상 보인다 — 전에는 hover해야만 "교체" 버튼이 떴는데,
            이미지를 바꿀 수 있다는 것 자체를 못 알아채는 문제가 있었다
            (2026-08-07 "교체할 수 있다는 뭔가 있어야 하지 않을까" 지적).
            hover 시엔 좀 더 진하게, 평소엔 옅게 — 항상 뜨는 대신 존재감은 낮췄다. */}
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-end gap-1.5 bg-gradient-to-t from-black/60 via-black/10 to-transparent px-3 pb-2.5 pt-8 opacity-70 transition-opacity group-hover:opacity-100">
          <button
            type="button"
            onClick={pick}
            disabled={uploading}
            className="rounded-lg bg-white/95 px-3 py-1.5 text-[13px] font-semibold text-gray-800 hover:bg-white"
          >
            {uploading ? "업로드 중..." : "교체"}
          </button>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="rounded-lg bg-white/95 px-3 py-1.5 text-[13px] font-semibold text-gray-800 hover:bg-white"
          >
            제거
          </button>
        </div>
        {fileInput}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={pick}
      disabled={uploading}
      className={`flex w-full flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed py-8 transition-colors ${
        dragActive ? "border-blue-400 bg-blue-50/40" : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
      }`}
      {...dragHandlers}
    >
      <span
        className={`flex h-8 w-8 items-center justify-center rounded-full text-lg leading-none ${
          dragActive ? "bg-blue-100 text-blue-600" : "bg-gray-100 text-gray-400"
        }`}
        aria-hidden="true"
      >
        +
      </span>
      <span className="text-[13px] font-medium text-gray-500">
        {uploading ? "업로드 중..." : dragActive ? "여기에 놓으세요" : "대표 이미지 추가"}
      </span>
      <span className="text-[12px] text-gray-400">없으면 {fallbackHint}</span>
      {fileInput}
    </button>
  );
}
