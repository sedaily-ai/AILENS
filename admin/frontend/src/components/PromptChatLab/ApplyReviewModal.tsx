"use client";

import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ActivationHistoryList } from "./ActivationHistory";
import type { CmsChannel } from "@/lib/types";

/* "프로덕션에 적용" 중간 검토 모달 — 2026-09-26 신설, 사용자 요청: "테스트쪽에서
   프로덕션에 적용 버튼 클릭하면... 약간 중간 단계 하나 넣어야 안정적일듯...
   현재 설정한 것들... 최종적으로 검토를 하도록 하고, 해당 테스트에서 출력된
   결과도 같이 보면서 검토하도록... 중앙 모달 창 띄우고요." 클릭 한 번으로
   바로 실제 프로덕션에 반영되던 걸(webtoon/podcast/video 공통), 확인 단계
   하나를 끼워 넣는다 — "지금 이 설정+이 결과물이 그대로 나간다"를 실제로
   눈으로 보고 확정하게 한다.

   웹툰/팟캐스트/영상 3곳이 전부 이 모달을 그대로 재사용한다 — settingsSummary/
   resultPreview는 각 생성기가 자기 사정에 맞는 내용을 children처럼 넘긴다
   (버전 요약, 이미지 모델/음성/포맷 등은 서로 다른 모양이라 여기서 공통
   구조로 억지로 맞추지 않았다). 모달 자체가 갖는 공통 책임은: 확인/취소
   버튼, 적용 중 로딩 애니메이션, "최근 적용 이력"(누가·언제·몇 버전) —
   전부 3곳에서 완전히 동일해야 하는 부분들이다. */
export function ApplyReviewModal({
  category,
  name,
  channel,
  urlPath,
  settingsSummary,
  resultPreview,
  confirmLabel = "프로덕션에 적용",
  onCancel,
  onConfirm,
}: {
  category: string;
  name: string;
  /** "최근 적용 이력"이 그 기간에 뭐가 발행됐는지 같이 보여주기 위한
   *  채널/URL — LatestPublishedContentLink.tsx/ActivationHistory.tsx와
   *  동일 원칙(팟캐스트는 channel="home_player"로 호출부가 대체). */
  channel: CmsChannel;
  urlPath: string;
  /** "지금 이 설정이 그대로 나간다"를 보여주는 영역 — 버전+이름, 이미지
   *  모델/음성/포맷 등 호출부가 자기 사정에 맞게 렌더링해서 넘긴다. */
  settingsSummary: ReactNode;
  /** 이 테스트 카드에서 실제로 생성된 결과물(이미지/오디오/영상)을 보여주는
   *  영역 — 아직 아무것도 안 만들었으면 호출부가 "결과 없음" 안내를 직접
   *  그려서 넘긴다. */
  resultPreview: ReactNode;
  confirmLabel?: string;
  onCancel: () => void;
  /** 실제 적용 로직(activateIfNeeded + 부속 설정 발행 등) — 모달이 로딩
   *  상태·에러를 자체적으로 들고 있는다, 실패해도 모달은 안 닫는다(사용자가
   *  다시 시도할 수 있게). */
  onConfirm: () => Promise<void>;
}) {
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);

  const handleConfirm = async () => {
    if (applying) return;
    setApplying(true);
    setApplyError(null);
    try {
      await onConfirm();
    } catch (err) {
      setApplyError(err instanceof Error ? err.message : "적용 실패");
    } finally {
      setApplying(false);
    }
  };

  // 2026-09-27 — ActivationHistory.tsx/PromptVersionReference.tsx와 동일한
  // 스태킹 컨텍스트 트랩 방지용 포털(그 파일들 주석 참고) — 이 모달도
  // 프로덕션 카드(position:sticky+z-index) 안에서 열릴 수 있다.
  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4"
      role="presentation"
      onClick={applying ? undefined : onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-[var(--surface-card)] shadow-2xl"
      >
        <div className="flex-none border-b ui-divider px-5 py-4">
          <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">프로덕션 적용 검토</h3>
          <p className="mt-1 text-[11.5px] text-[var(--text-faint)]">
            아래 설정과 결과를 확인한 뒤 적용하세요 — 실제 자동 생성에 바로 반영됩니다.
          </p>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <section>
            <h4 className="mb-1.5 text-[11px] font-semibold text-[var(--text-faint)]">지금 적용될 설정</h4>
            {settingsSummary}
          </section>
          <section>
            <h4 className="mb-1.5 text-[11px] font-semibold text-[var(--text-faint)]">이 테스트에서 생성된 결과</h4>
            {resultPreview}
          </section>
          <section>
            <h4 className="mb-1.5 text-[11px] font-semibold text-[var(--text-faint)]">최근 적용 이력</h4>
            <ActivationHistoryList category={category} name={name} channel={channel} urlPath={urlPath} />
          </section>
          {applyError && <p className="text-[11px] font-medium text-[var(--danger)]">{applyError}</p>}
        </div>
        <div className="flex flex-none items-center justify-end gap-2 border-t ui-divider px-5 py-3.5">
          <button
            type="button"
            onClick={onCancel}
            disabled={applying}
            className="ui-btn rounded-lg px-3.5 py-1.5 text-[12px] font-semibold disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={applying}
            className="ui-btn ui-btn-primary flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[12px] font-semibold disabled:opacity-60"
          >
            {applying && (
              <span className="h-3 w-3 flex-none animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" />
            )}
            {applying ? "적용 중..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
