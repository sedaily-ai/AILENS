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
   viewBox 24, strokeWidth 2, 다운셰브론 경로 "m6 9 6 6 6-6")은 Sidebar.tsx의
   접이식 네비 그룹 헤더(IconChevron)와 동일하게 맞췄다(2026-09-16, UI
   디테일 정리 — 이 앱 안에 이미 있던 같은 용도 아이콘과 다르게 새로
   만들 이유가 없었다).

   2026-09-26 — 회전 방향은 Sidebar.tsx와 갈라졌다. 원래 둘 다 "닫힘=
   오른쪽 화살표, 열림=아래 화살표"(탐색기/파일트리 관용구)였는데,
   사용자 지적: "닫혔으면.. 위로 올라간 화살표여야하지않나? 펼쳐지면
   아래로 가는 화살표이고" — 이 프롬프트 랩 사이드바(프로덕션/테스트
   카드 토글)에 한해 "닫힘=위, 열림=아래"로 바꿨다. Sidebar.tsx의 좌측
   네비 아코디언은 이번 지적 대상이 아니라서 그대로 뒀다 — 둘을 다시
   맞추고 싶으면 그쪽도 같이 고칠 것.

   2026-09-26(후속) — 사용자가 다시 지적: "토글... 위로 가는 화살표
   말고... 접혔을때는 노션 구조처럼.. 삼각형 > 화살표 방향으로" —
   위/아래 회전 대신 노션 디스클로저 삼각형 관용구(닫힘=오른쪽 ▶,
   열림=아래 ▼)로 되돌렸다. 아이콘 path를 오른쪽 화살표로 바꾸고
   회전각만 globals.css의 `.cs-chevron`에서 조정(0deg→90deg).

   2026-09-26 (같은 날, 뒤이어) — 위 회전을 처음엔 Tailwind
   `group`/`group-open:`로 짰는데, 이 섹션은 서로 중첩된다(프로덕션 >
   음성 설정 > 세부 설정처럼 3단까지). `group-open:`이 만드는 CSS는
   `.group[open] &`, 즉 자손 선택자라 "가장 가까운 조상"이 아니라
   "열려있는 아무 조상"에 걸린다 — 그래서 부모(음성 설정)가 열려있으면
   자식(세부 설정, 실제로는 닫힘)의 화살표까지 열림 모양으로 잘못
   그려지는 버그가 있었다(사용자 스크린샷으로 발견). `>` 자식 결합자로
   "바로 위 details"에만 걸리는 순수 CSS(`.cs-chevron`, globals.css)로
   바꿔서 중첩 깊이와 무관하게 각자 자기 상태만 반영하게 했다. */
export function CollapsibleSection({
  title,
  titleExtra,
  badge,
  indent = false,
  defaultOpen = false,
  children,
}: {
  title: string;
  /** 2026-09-26 신설 — 제목 바로 옆(왼쪽 무리)에 놓을 컨트롤. 사용자
   *  지적: "버전 드롭다운을 좌측에 두면 안되나? 지금 우측에있어요" —
   *  `badge`는 항상 summary 오른쪽 끝(justify-between)에 붙어서 제목과
   *  멀어진다. 제목과 "같이 보여야 하는" 컨트롤(예: 버전 선택 드롭다운)은
   *  이쪽에, "상태 표시"(예: "채팅에서 사용 중" 배지)는 계속 `badge`에
   *  둔다 — PromptVersionReference.tsx 참고. */
  titleExtra?: ReactNode;
  /** 접혀 있어도 "바뀐 내용 있음" 같은 걸 한눈에 보여주는 작은 배지. */
  badge?: ReactNode;
  /** true면 중첩 섹션(예: 인물 하위의 A/B)처럼 한 단 들여쓴다. */
  indent?: boolean;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details className={indent ? "ml-2" : ""} open={defaultOpen}>
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
            className="cs-chevron flex-none text-[var(--text-faint)] transition-transform duration-150"
            aria-hidden="true"
          >
            <path d="m9 6 6 6-6 6" />
          </svg>
          <span className="truncate">{title}</span>
          {titleExtra}
        </span>
        {badge}
      </summary>
      <div className="pb-2">{children}</div>
    </details>
  );
}
