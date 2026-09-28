"use client";

import { useEffect, useState } from "react";
import { adminApi } from "@/lib/adminClient";

/* 2026-09-24, 사용자 요청 — "프로덕션 기본값(레터) 이거는 빼는게 좋지
   않을까요... 배지 형태로... 작업자가 다른 모델로 발행하면 바뀌고...
   지금은 하드코딩된거라 바뀌면 또 바꿔야 하잖아요": 드롭다운의
   "프로덕션 기본값(...)" 옵션을 없애고, 대신 헤더의 "실시간 연결됨" 옆에
   지금 실제로 쓰이는 모델 이름을 배지로 보여준다. 값은 프론트에 안
   박아두고 매번 백엔드(_CATEGORY_BEDROCK["model_label"])에서 받아온다 —
   프로덕션 모델이 바뀌면 그 한 줄만 고치면 되고 프론트 재배포가
   필요없다. PromptChatLab.tsx·PromptTextLab.tsx 공용. */
export function useCurrentModelLabel(category: string, enabled: boolean): string | null {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    adminApi
      .getCurrentModel(category)
      .then((r) => {
        if (!cancelled) setLabel(r.label);
      })
      .catch((err) => {
        console.error("현재 모델 조회 실패", err);
        if (!cancelled) setLabel(null);
      });
    return () => {
      cancelled = true;
    };
  }, [category, enabled]);

  return label;
}
