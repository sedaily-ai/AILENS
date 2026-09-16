"use client";

import type { ReactNode } from "react";

/* 설정 칼럼용 접이식 섹션 — 2026-09-16, 사용자 요청("토글로 접혔다 폈다...
   기능별·단계별로 들어가는 프롬프트로 나눈다거나, 이미지 하위에도 인물
   관련이거나 그런 것들로 구분"): 대본(설명/지침/파일) vs 이미지(화풍/인물)
   처럼 성격이 다른 설정을 계층으로 나누고, 안 보는 카테고리는 접어둘 수
   있게 한다. 네이티브 <details>/<summary>를 쓴다 — JS state 없이 열림/닫힘이
   되고 접근성(키보드 포커스, 스크린리더)도 브라우저가 기본 처리해준다.
   화살표 아이콘 회전은 Tailwind의 `group-open:` 변형(Tailwind 3.4+ 기본
   지원, [open] 속성 대상)만으로 된다 — 새 의존성 없음. 아이콘 규격(14px,
   viewBox 24, strokeWidth 2, 다운셰브론 경로 "m6 9 6 6 6-6")과 기본
   -90도/열리면 0도 회전 방식은 Sidebar.tsx의 접이식 네비 그룹 헤더
   (IconChevron)와 동일하게 맞췄다(2026-09-16, UI 디테일 정리 — 이 앱
   안에 이미 있던 같은 용도 아이콘과 다르게 새로 만들 이유가 없었다). */
export function CollapsibleSection({
  title,
  badge,
  indent = false,
  defaultOpen = false,
  children,
}: {
  title: string;
  /** 접혀 있어도 "바뀐 내용 있음" 같은 걸 한눈에 보여주는 작은 배지. */
  badge?: ReactNode;
  /** true면 중첩 섹션(예: 인물 하위의 A/B)처럼 한 단 들여쓴다. */
  indent?: boolean;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details className={`group ${indent ? "ml-2" : ""}`} open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3.5 py-2 [&::-webkit-details-marker]:hidden">
        <span
          className={`flex min-w-0 items-center gap-1.5 ${
            indent
              ? "text-[11px] font-medium text-[var(--text-muted)]"
              : "text-[12px] font-semibold text-[var(--text-secondary)]"
          }`}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="flex-none text-[var(--text-faint)] transition-transform duration-150 -rotate-90 group-open:rotate-0"
            aria-hidden="true"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
          <span className="truncate">{title}</span>
        </span>
        {badge}
      </summary>
      <div className="pb-2">{children}</div>
    </details>
  );
}
