"use client";

import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper, type ReactNodeViewProps } from "@tiptap/react";
import { useState } from "react";
import { AiQuizModal, type AiQuizData } from "./AiQuizModal";

// 본문 중 퀴즈/투표 위젯 — 저장 시 <div data-ai-quiz='{...}'></div> 로 직렬화된다.
// 퍼블릭 프론트(LetterDetailClient.tsx RichBodyWithInteractiveBlocks)가 이
// data-ai-quiz 속성을 읽어 InteractiveBlock 컴포넌트로 바꿔 렌더한다 — 그
// 컴포넌트가 기대하는 모양(AiQuizData)과 여기 데이터가 1:1로 맞아야 한다.
function AiQuizNodeView({ node, updateAttributes, deleteNode, selected }: ReactNodeViewProps) {
  const data = node.attrs.data as AiQuizData;
  const [editing, setEditing] = useState(false);

  return (
    <NodeViewWrapper
      className={`my-4 rounded-2xl border p-4 cursor-pointer transition-colors ${
        selected ? "border-blue-400 bg-blue-50/40" : "border-gray-200 bg-gray-50"
      }`}
      onClick={() => setEditing(true)}
      contentEditable={false}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-bold tracking-wide text-gray-500 uppercase">
          {data.icon ? `${data.icon} ` : ""}
          {data.mode === "quiz" ? "퀴즈" : "투표"} 위젯
        </span>
        <span className="text-[12px] text-blue-600 font-medium">클릭해서 수정</span>
      </div>
      <p className="text-[13px] font-bold text-gray-900 mb-1">{data.title || "(제목 없음)"}</p>
      <p className="text-[13px] text-gray-700 mb-2">{data.question || "(질문 없음)"}</p>
      <div className="flex flex-col gap-1">
        {(data.options ?? []).map((opt, i) => (
          <span
            key={i}
            className={`text-[12px] px-2 py-1 rounded-md border ${
              data.mode === "quiz" && data.correctIndex === i
                ? "border-emerald-400 bg-emerald-50 text-emerald-700 font-semibold"
                : "border-gray-200 bg-white text-gray-600"
            }`}
          >
            {opt}
            {data.mode === "quiz" && data.correctIndex === i ? " ✓" : ""}
          </span>
        ))}
      </div>

      <AiQuizModal
        open={editing}
        initial={data}
        onClose={() => setEditing(false)}
        onSubmit={(next) => {
          updateAttributes({ data: next });
          setEditing(false);
        }}
        onDelete={() => {
          deleteNode();
          setEditing(false);
        }}
      />
    </NodeViewWrapper>
  );
}

export const AiQuiz = Node.create({
  name: "aiQuiz",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      data: {
        default: null,
        parseHTML: (element: HTMLElement) => {
          const raw = element.getAttribute("data-ai-quiz");
          if (!raw) return null;
          try {
            return JSON.parse(raw);
          } catch {
            return null;
          }
        },
        renderHTML: (attributes: { data: AiQuizData | null }) => {
          if (!attributes.data) return {};
          return { "data-ai-quiz": JSON.stringify(attributes.data) };
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-ai-quiz]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes)];
  },

  addNodeView() {
    return ReactNodeViewRenderer(AiQuizNodeView);
  },
});
