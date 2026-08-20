"use client";

import { useState } from "react";
import { PromptDrawer } from "@/components/PromptDrawer";

// 2026-08-19 — 4포맷 파이프라인(레터/웹툰/영상/팟캐스트) 중 팟캐스트 전용
// 관리 화면. 다른 세 채널과 달리 아직 생성 파이프라인(ElevenLabs TTS 등)이
// 붙어있지 않아 콘텐츠 목록·"새로 쓰기"가 없다 — 프롬프트를 미리 다듬어
// 두는 용도로 프롬프트 편집만 연다. 파이프라인이 붙으면 webtoon/page.tsx와
// 같은 패턴(ContentTable + "새로 쓰기")으로 확장할 것.
export default function PodcastPage() {
  const [promptOpen, setPromptOpen] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <h1 className="font-display text-[26px] font-bold text-[var(--text-primary)]">
          팟캐스트
        </h1>
        <button
          type="button"
          onClick={() => setPromptOpen(true)}
          className="ui-btn ui-btn-ghost inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8" />
          </svg>
          프롬프트
        </button>
      </div>

      <div className="ui-card rounded-xl p-6 text-sm text-[var(--text-muted)]">
        아직 팟캐스트 생성 파이프라인이 연결되지 않았습니다. 프롬프트만 미리
        다듬어 둘 수 있습니다 — 생성이 붙으면 이 화면에 콘텐츠 목록이
        추가됩니다.
      </div>

      <PromptDrawer channel="podcast" open={promptOpen} onClose={() => setPromptOpen(false)} />
    </div>
  );
}
