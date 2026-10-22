"use client";

import { useState } from "react";
import { adminApi } from "@/lib/adminClient";

/* 영상 내려받기(2026-10-21) — 사용자 요청: "영상 cms페이지에서 다운로드라도
   가능하게". video_url(S3 공개 URL)은 CMS와 출처가 달라 <a download>가 무시되고
   새 탭 재생이 되므로, 누를 때마다 GET /admin/video-lab/{job_id}를 다시 불러
   Content-Disposition: attachment가 붙은 서명 URL(download_url, 10분)을 받아 연다
   (routes/video_lab.py 참고). 카드에 저장해 둔 URL은 만료되므로 재사용하지 않는다. */

function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

export function VideoDownloadButton({ jobId, filePrefix }: { jobId: string; filePrefix: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const download = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await adminApi.pollVideoLab(jobId, `${filePrefix}_${stamp()}.mp4`);
      if (r.status !== "done" || !r.download_url) throw new Error("내려받기 주소를 받지 못했습니다");
      window.location.href = r.download_url;
    } catch (err) {
      console.error("영상 내려받기 실패", err);
      setError("내려받기에 실패했습니다. 잠시 뒤 다시 눌러 주세요.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center justify-end gap-2">
      {error && <p className="text-[11px] text-[var(--danger)]">{error}</p>}
      <button
        type="button"
        onClick={download}
        disabled={busy}
        className="text-[11px] font-semibold text-[var(--accent)] hover:underline disabled:opacity-50"
      >
        {busy ? "준비 중…" : "영상 내려받기 (mp4)"}
      </button>
    </div>
  );
}
