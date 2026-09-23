"use client";

import { useState } from "react";
import { PromptChatLab } from "./PromptChatLab";
import { PromptTextLab } from "./PromptTextLab";

/* 프롬프트 실험 — 4포맷 탭(2026-09-22 신설). 사용자 요청: "지금 웹툰은
   완성이 되어있는데... 웹툰 프롬프트쪽을 활용... 상단에 탭 4개를 만들면
   어떨까요? 탭별로 이동을 하고, 원하는 페이지로 가서 실험을 하고,
   파이프라인을 웹툰 환경처럼 개선할 수 있도록" — 지금까지 웹툰만
   PromptChatLab(챗 기반+버전 히스토리)을 썼고, 레터·팟캐스트·영상은
   PromptDrawer(textarea+비스트리밍 테스트)뿐이었다. 이 컴포넌트가 4개
   포맷 페이지(webtoon/letters/podcast/video) 각각의 "프롬프트 실험"
   버튼이 여는 화면을 하나로 통일한다 — 탭을 눌러도 페이지를 안 떠나고
   같은 전체화면 안에서 카테고리만 바뀐다.

   웹툰 탭은 기존 PromptChatLab을 그대로 쓴다(컷 이미지 생성·GPU 제어가
   있는 유일한 포맷이라 그 컴포넌트 자체는 안 건드림). 나머지 3개는
   PromptTextLab(신설, 순수 텍스트 스트리밍 버전)을 쓴다. `key={category}`로
   레터↔팟캐스트↔영상 전환 시에도 항상 새로 마운트되게 한다 — 대화
   목록·프롬프트 버전·입력창 같은 카테고리별 상태가 이전 탭 것과 섞이지
   않도록(리액트가 "같은 컴포넌트 타입"이라 기본적으론 리마운트 없이
   props만 갈아끼우는데, 그러면 messages/threadId 등이 그대로 남는다). */

const TABS = [
  { id: "letters", label: "레터" },
  { id: "webtoon", label: "웹툰" },
  { id: "podcast", label: "팟캐스트" },
  { id: "video", label: "영상" },
] as const;

export type PromptLabCategory = (typeof TABS)[number]["id"];

export function PromptLab({
  open,
  onClose,
  initialCategory = "webtoon",
}: {
  open: boolean;
  onClose: () => void;
  initialCategory?: PromptLabCategory;
}) {
  const [category, setCategory] = useState<PromptLabCategory>(initialCategory);

  return (
    <aside
      role="dialog"
      aria-modal="true"
      aria-labelledby="prompt-lab-title"
      inert={!open}
      className={`fixed inset-0 z-50 flex h-full w-full flex-col bg-[var(--surface-card)] transition-opacity duration-200 ease-out ${
        open ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
    >
      <div className="ui-divider flex flex-none items-center gap-1 border-b bg-[var(--surface-sunken)] px-3 py-2">
        <span id="prompt-lab-title" className="sr-only">
          프롬프트 실험
        </span>
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setCategory(t.id)}
            className="rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors"
            style={
              category === t.id
                ? { background: "var(--surface-card)", color: "var(--text-primary)" }
                : { color: "var(--text-muted)" }
            }
          >
            {t.label}
          </button>
        ))}
        <div className="flex-1" />
        <button
          type="button"
          onClick={onClose}
          className="flex-none rounded-lg p-1.5 text-[var(--text-faint)] transition-colors hover:bg-[var(--surface-card)] hover:text-[var(--text-primary)]"
          aria-label="닫기"
          title="닫기"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="min-h-0 flex-1">
        {category === "webtoon" ? (
          <PromptChatLab open={open} onClose={onClose} embedded />
        ) : (
          <PromptTextLab
            key={category}
            open={open}
            onClose={onClose}
            embedded
            category={category}
            categoryLabel={TABS.find((t) => t.id === category)!.label}
          />
        )}
      </div>
    </aside>
  );
}
