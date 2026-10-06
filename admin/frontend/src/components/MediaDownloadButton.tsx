"use client";

import { useState } from "react";
import { adminApi } from "@/lib/adminClient";
import { useToast } from "@/components/Toast";

// CMS 미디어 버킷에 올라간 mp3/mp4를 SNS 업로드용으로 바로 저장하는 버튼(2026-10-06).
// presigned GET에 attachment 헤더가 실려 있어 CORS·<a download> 없이 저장이 강제된다
// (admin/backend/routes/media.py::handle_download_url). YouTube 등 외부 링크는 받을 수 없어 숨긴다.
const CMS_MEDIA_HOST = /^https:\/\/[a-z0-9-]+\.s3\.us-east-1\.amazonaws\.com\//;

export function MediaDownloadButton({ url, filename, className = "" }: { url: string; filename?: string; className?: string }) {
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const clean = url.trim();
  if (!CMS_MEDIA_HOST.test(clean)) return null;

  const name = filename?.trim() || decodeURIComponent(clean.split("?")[0].split("/").pop() || "download");

  async function handleClick() {
    setBusy(true);
    try {
      const { download_url } = await adminApi.getMediaDownloadUrl(clean, name);
      const a = document.createElement("a");
      a.href = download_url;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      toast.show("다운로드 링크를 만들지 못했습니다. 잠시 후 다시 시도해 주세요.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      className={`ui-btn rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-50 ${className}`}
    >
      {busy ? "준비 중..." : "다운로드"}
    </button>
  );
}
