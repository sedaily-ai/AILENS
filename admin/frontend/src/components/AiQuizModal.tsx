"use client";

import { useEffect, useState } from "react";

/** 퍼블릭 InteractiveBlock 이 기대하는 모양과 1:1
 * (service/frontend/src/features/news-feed/components/InteractiveBlock.tsx). */
export interface AiQuizData {
  mode: "quiz" | "poll";
  icon?: string;
  title: string;
  question: string;
  options: string[];
  correctIndex?: number;
  explanation?: string;
}

// aiQuizExtension.tsx(에디터 노드뷰)도 data 가 null 인 저장된 콘텐츠를 만나면
// 이 기본값으로 폴백한다 — export 해서 두 곳이 같은 빈 모양을 쓰게 한다.
export const EMPTY: AiQuizData = {
  mode: "quiz",
  icon: "",
  title: "",
  question: "",
  options: ["", ""],
  correctIndex: 0,
  explanation: "",
};

const LABEL = "block text-xs font-semibold text-gray-700 mb-1.5";

interface Props {
  open: boolean;
  initial: AiQuizData | null;
  onSubmit: (data: AiQuizData) => void;
  onClose: () => void;
  onDelete?: () => void;
}

export function AiQuizModal({ open, initial, onSubmit, onClose, onDelete }: Props) {
  const [draft, setDraft] = useState<AiQuizData>(initial ?? EMPTY);

  // 모달을 열 때마다(새로 삽입 vs 기존 카드 수정) 값을 다시 채운다.
  useEffect(() => {
    if (open) setDraft(initial ?? EMPTY);
  }, [open, initial]);

  if (!open) return null;

  const patch = (p: Partial<AiQuizData>) => setDraft((d) => ({ ...d, ...p }));
  const setOption = (i: number, v: string) =>
    setDraft((d) => ({ ...d, options: d.options.map((o, idx) => (idx === i ? v : o)) }));
  const addOption = () => setDraft((d) => ({ ...d, options: [...d.options, ""] }));
  const removeOption = (i: number) =>
    setDraft((d) => ({
      ...d,
      options: d.options.filter((_, idx) => idx !== i),
      correctIndex:
        d.mode === "quiz" && d.correctIndex != null
          ? d.correctIndex >= i
            ? Math.max(0, d.correctIndex - 1)
            : d.correctIndex
          : d.correctIndex,
    }));

  const cleanOptions = draft.options.map((o) => o.trim()).filter(Boolean);
  const valid =
    draft.title.trim() &&
    draft.question.trim() &&
    cleanOptions.length >= 2 &&
    (draft.mode === "poll" ||
      (draft.correctIndex != null && draft.correctIndex < cleanOptions.length));

  const submit = () => {
    if (!valid) return;
    const data: AiQuizData = {
      mode: draft.mode,
      title: draft.title.trim(),
      question: draft.question.trim(),
      options: cleanOptions,
    };
    if (draft.icon?.trim()) data.icon = draft.icon.trim();
    if (draft.mode === "quiz") {
      data.correctIndex = Math.min(draft.correctIndex ?? 0, cleanOptions.length - 1);
      if (draft.explanation?.trim()) data.explanation = draft.explanation.trim();
    }
    onSubmit(data);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 backdrop-blur-[2px] p-4"
      onClick={onClose}
    >
      <div
        className="ui-card w-full max-w-[520px] max-h-[85vh] overflow-y-auto rounded-2xl p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-gray-900">
            {initial ? "퀴즈·투표 수정" : "퀴즈·투표 삽입"}
          </h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-700 cursor-pointer">
            ✕
          </button>
        </div>

        <div className="flex gap-1">
          {(["quiz", "poll"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => patch({ mode: m })}
              className={`text-[13px] font-medium px-3 py-1.5 rounded-lg cursor-pointer transition-colors ${
                draft.mode === m ? "font-semibold" : "hover:bg-[var(--surface-sunken)]"
              }`}
              style={{
                background: draft.mode === m ? "var(--accent-soft)" : undefined,
                color: draft.mode === m ? "var(--accent)" : "var(--text-secondary)",
              }}
            >
              {m === "quiz" ? "퀴즈 (정답 있음)" : "투표 (정답 없음)"}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-[64px_1fr] gap-3">
          <div>
            <label className={LABEL}>아이콘</label>
            <input
              value={draft.icon ?? ""}
              onChange={(e) => patch({ icon: e.target.value })}
              placeholder="🎯"
              className="ui-input w-full rounded-lg px-2 py-2 text-sm text-center"
            />
          </div>
          <div>
            <label className={LABEL}>제목 *</label>
            <input
              value={draft.title}
              onChange={(e) => patch({ title: e.target.value })}
              placeholder="예: 먼저 맞혀보세요"
              className="ui-input w-full rounded-lg px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div>
          <label className={LABEL}>질문 *</label>
          <textarea
            value={draft.question}
            onChange={(e) => patch({ question: e.target.value })}
            rows={2}
            className="ui-input w-full rounded-lg px-3 py-2 text-sm leading-relaxed"
          />
        </div>

        <div>
          <label className={LABEL}>
            선택지 *
            {draft.mode === "quiz" && (
              <span className="ml-2 font-normal text-gray-500">라디오로 정답을 고르세요</span>
            )}
          </label>
          <div className="space-y-2">
            {draft.options.map((opt, i) => (
              <div key={i} className="flex items-center gap-2">
                {draft.mode === "quiz" && (
                  <input
                    type="radio"
                    name="correct"
                    checked={draft.correctIndex === i}
                    onChange={() => patch({ correctIndex: i })}
                    className="cursor-pointer"
                  />
                )}
                <input
                  value={opt}
                  onChange={(e) => setOption(i, e.target.value)}
                  placeholder={`선택지 ${i + 1}`}
                  className="ui-input flex-1 rounded-lg px-3 py-2 text-sm"
                />
                {draft.options.length > 2 && (
                  <button
                    type="button"
                    onClick={() => removeOption(i)}
                    className="text-gray-400 hover:text-red-600 cursor-pointer px-1"
                    aria-label="선택지 삭제"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addOption}
            className="mt-2 text-[13px] font-medium text-[var(--accent)] hover:underline cursor-pointer"
          >
            + 선택지 추가
          </button>
        </div>

        {draft.mode === "quiz" && (
          <div>
            <label className={LABEL}>해설 (선택)</label>
            <textarea
              value={draft.explanation ?? ""}
              onChange={(e) => patch({ explanation: e.target.value })}
              rows={2}
              placeholder="정답을 선택한 뒤 보여줄 설명"
              className="ui-input w-full rounded-lg px-3 py-2 text-sm leading-relaxed"
            />
          </div>
        )}

        <div className="flex items-center justify-between pt-2">
          {onDelete ? (
            <button
              type="button"
              onClick={onDelete}
              className="text-[13px] font-medium text-red-600 hover:underline cursor-pointer"
            >
              카드 삭제
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-gray-600 ring-1 ring-gray-300 hover:bg-gray-50 cursor-pointer"
            >
              취소
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={!valid}
              className="ui-btn ui-btn-primary rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-40 disabled:cursor-default"
            >
              {initial ? "저장" : "삽입"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
