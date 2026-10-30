"use client";

import { forwardRef } from "react";
import type { PromptHistoryEntry } from "@/lib/types";
import { PromptVersionReference, type PromptVersionReferenceHandle } from "./PromptVersionReference";

/* PRISM "장면 변환 프롬프트"(2026-10-21) — 사용자 요청: "원문기사를 붙여넣으면 영문 대본이 나오고, 그 대본
   붙여넣으면 영상 만들어지고". 왼쪽 채팅은 "prism"(대본 작성) 프롬프트를 쓰고, 카드에 붙여넣은 대본을 렌더용
   JSON으로 나누는 건 서버(chat_ws.py::_prism_script_to_render_json)가 이 "prism-scene" 프롬프트의 적용
   버전으로 한다(시험 영상 카드가 버전을 고르면 그 버전으로).
   2026-10-30 — 사용자 지적: "적용 버튼이 너무 많아서 뭘 누르면 뭐가 되는지 헷갈려". 이 칸의 "장면 변환에 적용"
   버튼을 없애고, 실제 제작 설정 카드의 [운영에 적용] 하나가 ref(activateIfNeeded)로 이 칸까지 적용한다.
   버전 목록·적용 버전은 부모(PromptTextLab)가 들고 시험 카드·상단 표시와 함께 쓴다. */
export const PRISM_SCENE_CATEGORY = "prism-scene";
export const PRISM_SCENE_NAME = "published";

export const PrismScenePromptStep = forwardRef<
  PromptVersionReferenceHandle,
  {
    serverVersion: number | null;
    history: PromptHistoryEntry[];
    onServerVersionChange: (version: number) => void;
    onHistoryRefresh: () => void;
    onActiveInfoChange: (info: { version: number; label: string | null } | null) => void;
  }
>(function PrismScenePromptStep({ serverVersion, history, onServerVersionChange, onHistoryRefresh, onActiveInfoChange }, ref) {
  return (
    <div className="flex flex-col gap-2">
      <p className="px-3.5 pt-2 text-[11px] leading-relaxed text-[var(--text-faint)]">
        카드에 붙여넣은 영어 대본을 장면(컷·화면·디자인)으로 나눌 때 쓰는 프롬프트입니다. 고친 뒤 [+ 새 버전]으로 저장하고, 아래
        시험 영상 카드에서 그 버전을 골라 확인한 다음 위 [운영에 적용]을 누르세요.
      </p>
      <PromptVersionReference
        ref={ref}
        category={PRISM_SCENE_CATEGORY}
        name={PRISM_SCENE_NAME}
        serverVersion={serverVersion}
        promptHistory={history}
        testVersion={null}
        onTestVersionChange={() => {}}
        onServerVersionChange={onServerVersionChange}
        onPromptHistoryRefresh={onHistoryRefresh}
        onActiveInfoChange={onActiveInfoChange}
        bare
      />
    </div>
  );
});
