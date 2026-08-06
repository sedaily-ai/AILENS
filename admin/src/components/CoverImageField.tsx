"use client";

import { useRef, useState } from "react";
import { uploadImage, ImageUploadError } from "@/lib/uploadImage";
import { useToast } from "@/components/Toast";

const ACCEPT = "image/jpeg,image/png,image/webp,image/gif";

/** 글 목록·피드 카드에 쓰이는 썸네일. uploadImage.ts 와 같은 presigned-PUT
 * 패턴 — 저장은 상위 페이지의 save()가 다른 필드와 함께 한 번에 처리한다
 * (여기선 값만 들고 있는다). 없으면 프론트가 에디터 아바타로 폴백한다. */
export function CoverImageField({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (url: string | null) => void;
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
      toast.show("썸네일 업로드 완료 — 저장을 눌러야 반영됩니다", "success");
    } catch (err) {
      const msg = err instanceof ImageUploadError ? err.message : "업로드 실패";
      toast.show(msg, "error");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div
      className={`ui-card p-4 space-y-3 transition-colors ${dragActive ? "ring-2 ring-blue-400 bg-blue-50/40" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragActive(true);
      }}
      onDragLeave={() => setDragActive(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragActive(false);
        const file = e.dataTransfer.files?.[0];
        if (file) void handleFile(file);
      }}
    >
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">썸네일</h3>
          <p className="mt-0.5 text-xs text-gray-500">
            피드 카드에 노출됩니다. 이미지를 끌어놓거나 눌러서 올리세요 — 없으면
            담당 에디터 아바타가 대신 나갑니다.
          </p>
        </div>
        <button
          type="button"
          className="ui-btn rounded-lg px-3 py-1.5 text-sm font-medium shrink-0"
          onClick={pick}
          disabled={uploading}
        >
          {uploading ? "업로드 중..." : value ? "교체" : "업로드"}
        </button>
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
      </div>

      {value ? (
        <div className="flex items-center gap-3 rounded-lg bg-gray-50 px-3 py-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- 외부(S3) 원본 URL, next/image 최적화 대상 아님 */}
          <img src={value} alt="" className="h-16 w-16 rounded-lg object-cover" />
          <button
            type="button"
            className="text-xs font-medium text-gray-500 hover:text-red-600"
            onClick={() => onChange(null)}
          >
            제거
          </button>
        </div>
      ) : (
        <p className="pointer-events-none rounded-lg border border-dashed border-gray-200 py-4 text-center text-xs text-gray-400">
          {dragActive ? "여기에 놓으세요" : "아직 업로드된 이미지가 없습니다 — 여기로 끌어다 놓아도 됩니다."}
        </p>
      )}
    </div>
  );
}
