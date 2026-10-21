"use client";

import { useEffect, useRef, useState } from "react";
import { adminApi } from "@/lib/adminClient";
import type { PromptHistoryEntry } from "@/lib/types";
import { PromptVersionReference, type PromptVersionReferenceHandle } from "./PromptVersionReference";

/* PRISM "장면 변환 프롬프트"(2026-10-21) — 사용자 요청: "원문기사를 붙여넣으면 영문 대본이 나오고, 그 대본
   붙여넣으면 영상 만들어지고". 왼쪽 채팅은 "prism"(대본 작성) 프롬프트를 쓰고, 카드에 붙여넣은 대본을 렌더용
   JSON으로 나누는 건 서버(chat_ws.py::_prism_script_to_render_json)가 이 "prism-scene" 프롬프트의 적용
   버전으로 한다. 편집·버전 저장은 다른 탭과 같은 PromptVersionReference를 그대로 쓰고, 적용 버튼만 여기 둔다
   (채팅 프롬프트의 "프로덕션에 적용"과 섞이지 않게). */
const CATEGORY = "prism-scene";
const NAME = "published";

export function PrismScenePromptStep() {
  const promptRef = useRef<PromptVersionReferenceHandle>(null);
  const [serverVersion, setServerVersion] = useState<number | null>(null);
  const [history, setHistory] = useState<PromptHistoryEntry[]>([]);
  const [testVersion, setTestVersion] = useState<number | null>(null);
  const [activeInfo, setActiveInfo] = useState<{ version: number; label: string | null } | null>(null);
  const [applying, setApplying] = useState(false);

  const refreshHistory = () => {
    adminApi
      .getPromptHistory(CATEGORY, NAME)
      .then((r) => setHistory(r.history))
      .catch((err) => console.error("장면 변환 프롬프트 버전 목록 불러오기 실패", err));
  };

  const refreshServerVersion = () => {
    adminApi
      .listPrompts()
      .then((r) => {
        const listed = r.prompts.find((p) => p.id === `${CATEGORY}/${NAME}`);
        setServerVersion(listed ? listed.active_version : null);
      })
      .catch((err) => console.error("장면 변환 프롬프트 적용 버전 조회 실패", err));
  };

  useEffect(() => {
    refreshHistory();
    refreshServerVersion();
  }, []);

  const apply = async () => {
    if (applying) return;
    setApplying(true);
    try {
      await promptRef.current?.activateIfNeeded();
      refreshServerVersion();
    } finally {
      setApplying(false);
    }
  };

  const unchanged = activeInfo !== null && serverVersion !== null && activeInfo.version === serverVersion;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2 px-3.5 pt-2">
        <p className="text-[11px] leading-relaxed text-[var(--text-faint)]">
          카드에 붙여넣은 영어 대본을 장면으로 나눌 때 쓰는 프롬프트입니다. 고친 뒤 버전을 저장하고 &quot;장면 변환에
          적용&quot;을 눌러야 다음 영상부터 쓰입니다. 지금 적용: {serverVersion !== null ? `v${serverVersion}` : "없음"}
        </p>
        <button
          type="button"
          onClick={() => void apply()}
          disabled={applying || activeInfo === null || unchanged}
          title={unchanged ? "지금 불러온 버전이 이미 적용돼 있습니다" : undefined}
          className="ui-btn ui-btn-primary flex-none rounded-lg px-2 py-1 text-[10.5px] font-semibold disabled:opacity-50"
        >
          {applying ? "적용 중..." : "장면 변환에 적용"}
        </button>
      </div>
      <PromptVersionReference
        ref={promptRef}
        category={CATEGORY}
        name={NAME}
        serverVersion={serverVersion}
        promptHistory={history}
        testVersion={testVersion}
        onTestVersionChange={setTestVersion}
        onServerVersionChange={setServerVersion}
        onPromptHistoryRefresh={refreshHistory}
        onActiveInfoChange={setActiveInfo}
        bare
      />
    </div>
  );
}
