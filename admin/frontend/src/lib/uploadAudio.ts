import { adminApi } from "@/lib/adminClient";

export const MAX_AUDIO_BYTES = 60 * 1024 * 1024; // 128kbps 기준 약 1시간 분량

export class AudioUploadError extends Error {}

/** presigned PUT — uploadImage.ts 와 같은 패턴, 백엔드가 audio/* 도 허용하도록
 * media.py 의 _ALLOWED/_MAX_BYTES 를 확장해둠(2026-08-05, 팟캐스트 수동 업로드용). */
export async function uploadAudio(file: File): Promise<string> {
  if (file.size > MAX_AUDIO_BYTES) {
    throw new AudioUploadError(
      `파일이 너무 큽니다 (${(file.size / 1024 / 1024).toFixed(1)}MB, 최대 ${MAX_AUDIO_BYTES / 1024 / 1024}MB)`
    );
  }
  const { upload_url, public_url } = await adminApi.presignMedia(
    file.name,
    file.type,
    file.size
  );
  const res = await fetch(upload_url, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file,
  });
  if (!res.ok) throw new AudioUploadError(`S3 업로드 실패 (${res.status})`);
  return public_url;
}
