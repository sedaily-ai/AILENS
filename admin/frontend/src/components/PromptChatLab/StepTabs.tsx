"use client";

import { useState, type ReactNode } from "react";

/* 카드 안의 순차 단계 탭 — 2026-09-26 신설. 사용자 지적: "각 카드안에..
   토글들로 위치했는데.. 이거를 탭구조로 바꾸는거 어떤가요? 토글로 다
   펼쳐도 사실 다 볼 수가 한 화면에 없는거고, 그래서 결국에.. 탭구조로..
   단계적으로 순서를 보여주는 느낌으로 하는게 더 낳을 수도 있을듯요.
   화살표로 이어지는 구조로 보이게 한다거나.. step1 -> step2?" — 뒤이어
   "토글을 다 펼쳐도 결국... 스크롤을 해야 볼 수 있는걸... 다펼치면..."
   이라는 반박으로, 세로로 쌓이는 CollapsibleSection들(생성 프롬프트/
   이미지 생성 등)이 다 펼쳐도 한 화면에 안 들어와 스크롤이 필요하다는
   지적을 받아들였다 — "토글도 유지하고 탭도 만들어서 사용자가 고르게"
   하자는 대안도 나왔지만, 두 레이아웃을 동시에 유지보수하는 비용이
   실익보다 커서(파일 3~5개를 매번 이중 반영) 탭 하나로 전면 교체했다.

   실제 작업 순서를 그대로 반영한다 — 웹툰: 생성 프롬프트 → 이미지 생성.
   팟캐스트: 생성 프롬프트 → 음성 설정. 영상: 생성 프롬프트 → 음성 설정
   → 영상 설정("동영상은 여기에 동영상 부분 하나 더 붙는거구요").

   모든 스텝의 콘텐츠는 항상 DOM에 마운트돼 있고 `hidden`으로만 감춘다
   — 조건부 렌더로 언마운트했다가 다시 마운트하면 그 스텝 안의 로컬
   상태(예: 텍스트 입력창에 타이핑 중이던 내용)가 탭을 옮길 때마다
   날아간다. */
export interface StepTabItem {
  key: string;
  label: string;
  content: ReactNode;
}

export function StepTabs({ steps, className }: { steps: StepTabItem[]; className?: string }) {
  const [active, setActive] = useState(steps[0]?.key ?? "");
  return (
    <div className={className}>
      {/* 2026-09-27, 사용자 지적 — "파란색깔 배경 부분.. 이거 이렇게 뜨게
          할 이유 있나요?": 채워진 알약 배경은 이 카드 헤더의 "발행 중"·
          "프로덕션" 같은 진짜 상태 배지와 똑같은 문법이다 — 근데 이건
          상태가 아니라 "지금 보고 있는 탭"일 뿐이라 같은 문법을 쓰면
          헷갈린다. 배경 없이 텍스트 색·굵기만으로 활성 탭을 표시한다
          (좌우 패딩도 px-3.5로 통일 — CollapsibleSection 제목 줄과 같은
          기준선에 맞춰 "계단"처럼 어긋나 보이던 걸 없앴다). */}
      <div className="flex flex-wrap items-center gap-1 border-b ui-divider px-3.5 pb-1 pt-1">
        {steps.map((s, i) => (
          <div key={s.key} className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => setActive(s.key)}
              className="rounded-md px-1.5 py-1 text-[11px] transition-colors"
              style={
                active === s.key
                  ? { color: "var(--text-primary)", fontWeight: 700 }
                  : { color: "var(--text-faint)", fontWeight: 600 }
              }
            >
              {i + 1}. {s.label}
            </button>
            {i < steps.length - 1 && (
              <svg
                width="11"
                height="11"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="flex-none text-[var(--text-faint)]"
                aria-hidden="true"
              >
                <path d="m9 6 6 6-6 6" />
              </svg>
            )}
          </div>
        ))}
      </div>
      {steps.map((s) => (
        <div key={s.key} hidden={active !== s.key}>
          {s.content}
        </div>
      ))}
    </div>
  );
}
