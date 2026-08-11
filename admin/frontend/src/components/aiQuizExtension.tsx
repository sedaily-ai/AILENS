"use client";

import { Node as TiptapNode, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper, type ReactNodeViewProps } from "@tiptap/react";
import { useEffect, useRef, useState } from "react";
import { AiQuizFields, EMPTY as EMPTY_AI_QUIZ_DATA, isEmptyQuizData, type AiQuizData } from "./AiQuizFields";

// 본문 중 퀴즈/투표 위젯 — 저장 시 <div data-ai-quiz='{...}'></div> 로 직렬화된다.
// 퍼블릭 프론트(LetterDetailClient.tsx RichBodyWithInteractiveBlocks)가 이
// data-ai-quiz 속성을 읽어 InteractiveBlock 컴포넌트로 바꿔 렌더한다 — 그
// 컴포넌트가 기대하는 모양(AiQuizData)과 여기 데이터가 1:1로 맞아야 한다.
function AiQuizNodeView({ node, updateAttributes, deleteNode, selected, editor, getPos }: ReactNodeViewProps) {
  // node.attrs.data 가 null 일 수 있다(default: null, parseHTML 이 data-ai-quiz
  // 속성 누락·JSON 파싱 실패 시 null 반환) — 방어 없이 바로 data.icon 등을 읽으면
  // 저장된 글에 손상된 퀴즈 노드가 하나만 있어도 에디터 전체가 크래시한다
  // (2026-08-08, 사용자가 실제로 겪은 "Cannot read properties of null (reading
  // 'icon')" 크래시 리포트로 발견).
  const data = (node.attrs.data as AiQuizData | null) ?? EMPTY_AI_QUIZ_DATA;
  // 2026-08-09 — 화면 중앙 팝업(AiQuizModal) 대신 카드 안에서 바로 펼쳐지는
  // 인라인 편집으로 바꿨다("모달이 뜰 이유가 있나요, 노션처럼 그 자리에서
  // 바로 편집" 요청). 방금 새로 삽입한(아직 아무것도 안 채운) 카드는 굳이
  // 클릭을 기다리지 않고 처음부터 편집 상태로 연다 — "삽입 → 팝업에서
  // 채우기"였던 흐름이 "삽입 → 바로 그 자리에서 타이핑"이 되게.
  const [editing, setEditing] = useState(() => isEmptyQuizData(data));
  const wrapperRef = useRef<HTMLDivElement>(null);

  // 편집 중 카드 바깥을 클릭하면 미리보기로 접힌다 — 노션의 인라인 편집이
  // 닫히는 방식과 동일. "완료" 버튼도 따로 두지만(발견성), 이게 기본 동작.
  useEffect(() => {
    if (!editing) return;
    const onClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setEditing(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [editing]);

  // 네이티브 HTML5 드래그(끌어서 이동)는 draggable=true 등 속성은 다 맞게
  // 잡혀 있는데도 트랙패드·브라우저에 따라 드래그 자체가 아예 시작되지
  // 않는 경우가 있었다(2026-08-07, "꾹 잡고 위아래로 이동해도 안 움직여요"
  // 리포트). 제스처에 기대는 대신 위/아래 버튼으로 인접 블록과 위치를
  // 맞바꾸는, 항상 확실하게 동작하는 방법을 추가한다. 손잡이(⠿)는 그대로
  // 두되(드래그가 되는 환경에서는 여전히 동작) 버튼이 기본 조작이 된다.
  const moveNode = (direction: "up" | "down") => {
    const pos = getPos();
    if (typeof pos !== "number") return;
    const { state, dispatch } = editor.view;
    const $pos = state.doc.resolve(pos);
    const parent = $pos.parent;
    const index = $pos.index();
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= parent.childCount) return;

    const thisNode = parent.child(index);
    const otherNode = parent.child(targetIndex);
    const thisStart = pos;
    const thisEnd = thisStart + thisNode.nodeSize;
    const otherStart = direction === "up" ? thisStart - otherNode.nodeSize : thisEnd;
    const otherEnd = otherStart + otherNode.nodeSize;
    const from = Math.min(thisStart, otherStart);
    const to = Math.max(thisEnd, otherEnd);

    const [first, second] = direction === "up" ? [thisNode, otherNode] : [otherNode, thisNode];
    dispatch(state.tr.replaceWith(from, to, [first, second]));
  };

  return (
    <NodeViewWrapper
      ref={wrapperRef}
      className={`group my-4 rounded-2xl border p-4 transition-colors ${
        editing ? "cursor-default" : "cursor-pointer"
      } ${selected ? "border-blue-400 bg-blue-50/40" : editing ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-gray-200 bg-gray-50"}`}
      onClick={() => !editing && setEditing(true)}
      contentEditable={false}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="flex items-center gap-1.5 text-[11px] font-bold tracking-wide text-gray-500 uppercase">
          {/* 이 박스 전체가 draggable(노드 설정) — 트랙패드·브라우저에 따라
              드래그 자체가 안 먹는 경우가 있어(2026-08-07 "꾹 잡고 이동해도
              안 움직여요") 옆에 항상 확실히 동작하는 위/아래 버튼을 뒀다.
              손잡이는 "끌 수도 있다"는 보조 힌트로 남긴다. */}
          <span
            className="cursor-grab select-none text-gray-300 opacity-0 transition-opacity group-hover:opacity-100 active:cursor-grabbing"
            title="끌어서 위치 이동"
            aria-hidden="true"
          >
            ⠿
          </span>
          {data.icon ? `${data.icon} ` : ""}
          {data.mode === "quiz" ? "퀴즈" : "투표"} 위젯
        </span>
        <span className="flex items-center gap-2">
          <span className={`flex items-center overflow-hidden rounded-md border border-gray-200 transition-opacity ${editing ? "" : "opacity-0 group-hover:opacity-100"}`}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                moveNode("up");
              }}
              className="flex h-6 w-6 items-center justify-center text-gray-500 hover:bg-gray-100 hover:text-gray-900"
              title="위로 이동"
              aria-label="위로 이동"
            >
              ↑
            </button>
            <span className="h-4 w-px bg-gray-200" aria-hidden="true" />
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                moveNode("down");
              }}
              className="flex h-6 w-6 items-center justify-center text-gray-500 hover:bg-gray-100 hover:text-gray-900"
              title="아래로 이동"
              aria-label="아래로 이동"
            >
              ↓
            </button>
          </span>
          {editing ? (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  deleteNode();
                }}
                className="cursor-pointer text-[12px] font-medium text-red-600 hover:underline"
              >
                삭제
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setEditing(false);
                }}
                className="cursor-pointer text-[12px] font-semibold hover:underline"
                style={{ color: "var(--accent)" }}
              >
                완료
              </button>
            </>
          ) : (
            <span className="text-[12px] text-blue-600 font-medium">클릭해서 수정</span>
          )}
        </span>
      </div>

      {editing ? (
        <AiQuizFields value={data} onChange={(next) => updateAttributes({ data: next })} />
      ) : (
        <>
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
        </>
      )}
    </NodeViewWrapper>
  );
}

export const AiQuiz = TiptapNode.create({
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
