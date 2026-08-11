"use client";

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

// 새로 삽입한 위젯인지(= 아직 아무것도 안 채웠는지) 판정 — 새로 넣은 카드는
// 곧바로 편집 상태로 열어서 "삽입 → 팝업에서 채우기"가 아니라 "삽입 →
// 바로 그 자리에서 타이핑"이 되게 한다(aiQuizExtension.tsx 참조).
export function isEmptyQuizData(d: AiQuizData): boolean {
  return !d.title.trim() && !d.question.trim() && d.options.every((o) => !o.trim());
}

const LABEL = "block text-xs font-semibold text-gray-700 mb-1.5";

// 2026-08-09 — 원래 AiQuizModal.tsx(화면 중앙 팝업)이던 걸 순수 폼으로
// 뽑았다("모달이 뜰 이유가 있나요, 노션처럼 그 자리에서 바로 편집되면
// 되는거지" 요청). 여기는 값만 받고 바꿀 때마다 즉시 onChange로 올려보내는
// 완전 제어 컴포넌트다 — 별도의 저장/취소 버튼이 없다(다른 본문 텍스트와
// 똑같이 타이핑하는 대로 반영, 글 전체 저장은 에디터 바깥의 "저장" 버튼이
// 담당). 삽입/삭제처럼 이 카드 자체의 존재를 좌우하는 동작은 호출부
// (aiQuizExtension.tsx)가 맡는다 — 여긴 내용만.
export function AiQuizFields({ value, onChange }: { value: AiQuizData; onChange: (next: AiQuizData) => void }) {
  const patch = (p: Partial<AiQuizData>) => onChange({ ...value, ...p });
  const setOption = (i: number, v: string) =>
    onChange({ ...value, options: value.options.map((o, idx) => (idx === i ? v : o)) });
  const addOption = () => onChange({ ...value, options: [...value.options, ""] });
  const removeOption = (i: number) => {
    if (value.options.length <= 2) return;
    onChange({
      ...value,
      options: value.options.filter((_, idx) => idx !== i),
      correctIndex:
        value.mode === "quiz" && value.correctIndex != null
          ? value.correctIndex >= i
            ? Math.max(0, value.correctIndex - 1)
            : value.correctIndex
          : value.correctIndex,
    });
  };

  return (
    <div className="space-y-3" onClick={(e) => e.stopPropagation()}>
      <div className="flex gap-1">
        {(["quiz", "poll"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => patch({ mode: m })}
            className={`text-[12.5px] font-medium px-2.5 py-1 rounded-md cursor-pointer transition-colors ${
              value.mode === m ? "font-semibold" : "hover:bg-white"
            }`}
            style={{
              background: value.mode === m ? "var(--surface-card)" : undefined,
              color: value.mode === m ? "var(--accent)" : "var(--text-secondary)",
              boxShadow: value.mode === m ? "var(--shadow-sm)" : undefined,
            }}
          >
            {m === "quiz" ? "퀴즈 (정답 있음)" : "투표 (정답 없음)"}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-[56px_1fr] gap-3">
        <div>
          <label className={LABEL}>아이콘</label>
          <input
            value={value.icon ?? ""}
            onChange={(e) => patch({ icon: e.target.value })}
            placeholder="🎯"
            className="ui-input w-full rounded-lg px-2 py-2 text-sm text-center bg-white"
          />
        </div>
        <div>
          <label className={LABEL}>제목</label>
          <input
            value={value.title}
            onChange={(e) => patch({ title: e.target.value })}
            placeholder="예: 먼저 맞혀보세요"
            className="ui-input w-full rounded-lg px-3 py-2 text-sm bg-white"
          />
        </div>
      </div>

      <div>
        <label className={LABEL}>질문</label>
        <textarea
          value={value.question}
          onChange={(e) => patch({ question: e.target.value })}
          rows={2}
          className="ui-input w-full rounded-lg px-3 py-2 text-sm leading-relaxed bg-white"
        />
      </div>

      <div>
        <label className={LABEL}>
          선택지
          {value.mode === "quiz" && (
            <span className="ml-2 font-normal text-gray-500">라디오로 정답을 고르세요</span>
          )}
        </label>
        <div className="space-y-2">
          {value.options.map((opt, i) => (
            <div key={i} className="flex items-center gap-2">
              {value.mode === "quiz" && (
                <input
                  type="radio"
                  name="correct"
                  checked={value.correctIndex === i}
                  onChange={() => patch({ correctIndex: i })}
                  className="cursor-pointer"
                />
              )}
              <input
                value={opt}
                onChange={(e) => setOption(i, e.target.value)}
                placeholder={`선택지 ${i + 1}`}
                className="ui-input flex-1 rounded-lg px-3 py-2 text-sm bg-white"
              />
              {value.options.length > 2 && (
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
          className="mt-2 text-[12.5px] font-medium text-[var(--accent)] hover:underline cursor-pointer"
        >
          + 선택지 추가
        </button>
      </div>

      {value.mode === "quiz" && (
        <div>
          <label className={LABEL}>해설 (선택)</label>
          <textarea
            value={value.explanation ?? ""}
            onChange={(e) => patch({ explanation: e.target.value })}
            rows={2}
            placeholder="정답을 선택한 뒤 보여줄 설명"
            className="ui-input w-full rounded-lg px-3 py-2 text-sm leading-relaxed bg-white"
          />
        </div>
      )}
    </div>
  );
}
