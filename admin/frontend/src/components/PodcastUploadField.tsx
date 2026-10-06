"use client";

import { useRef, useState } from "react";
import { uploadAudio, AudioUploadError } from "@/lib/uploadAudio";
import { useToast } from "@/components/Toast";
import { MediaDownloadButton } from "@/components/MediaDownloadButton";

const ACCEPT = "audio/mpeg,audio/mp4,audio/wav,audio/x-wav";

/** article_id 기반 자동 생성이 안 되는 레터를 위한 수동 팟캐스트 업로드.
 * uploadImage.ts 와 같은 presigned-PUT 패턴, 저장은 상위 페이지의 save()가
 * 다른 필드와 함께 한 번에 처리한다(여기선 값만 들고 있는다). */
export function PodcastUploadField({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (url: string | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const toast = useToast();

  const pick = () => inputRef.current?.click();

  const handleFile = async (file: File) => {
    setUploading(true);
    try {
      const url = await uploadAudio(file);
      onChange(url);
      toast.show("팟캐스트 업로드 완료 — 저장을 눌러야 반영됩니다", "success");
    } catch (err) {
      const msg = err instanceof AudioUploadError ? err.message : "업로드 실패";
      toast.show(msg, "error");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="ui-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">팟캐스트 오디오</h3>
          <p className="mt-0.5 text-xs text-gray-500">
            article_id가 없어 자동 생성이 안 되는 레터도, mp3 파일을 직접 올리면 바로 재생됩니다.
          </p>
        </div>
        <button
          type="button"
          className="ui-btn rounded-lg px-3 py-1.5 text-sm font-medium"
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
          <audio controls preload="none" src={value} className="h-9 flex-1" />
          <MediaDownloadButton url={value} />
          <button
            type="button"
            className="text-xs font-medium text-gray-500 hover:text-red-600"
            onClick={() => onChange(null)}
          >
            제거
          </button>
        </div>
      ) : (
        <p className="text-xs text-gray-400">아직 업로드된 파일이 없습니다.</p>
      )}
    </div>
  );
}
