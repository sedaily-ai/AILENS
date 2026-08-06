import { adminApi } from "@/lib/adminClient";

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export class ImageUploadError extends Error {}

/** presigned PUT — Lambda 를 거치지 않고 브라우저가 S3 로 직접 올린다
 * (API Gateway 페이로드 한계 6MB 회피). ImageUploader.tsx 와 PostForm.tsx
 * 인라인 드래그·붙여넣기 업로드가 공유한다. */
export async function uploadImage(file: File): Promise<string> {
  if (file.size > MAX_IMAGE_BYTES) {
    throw new ImageUploadError(
      `파일이 너무 큽니다 (${(file.size / 1024 / 1024).toFixed(1)}MB, 최대 10MB)`
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
  if (!res.ok) throw new ImageUploadError(`S3 업로드 실패 (${res.status})`);
  return public_url;
}
