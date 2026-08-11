"use client";

import { useState } from "react";
import type { CmsImage } from "@/lib/types";

// 실시간 미리보기(2026-08-07, "오른쪽 빈 공간에 실제로 어떻게 보이는지
// 보여달라" 요청) — 실제 공개 페이지(app/webtoon/view/WebtoonViewClient.tsx)
// 와 같은 마크업·톤을 축소판으로 재현한다. 컷을 카드별로 따로 편집하다 보면
// 전체 흐름이 한눈에 안 들어온다는 문제를 같이 푼다. 스크린샷이 아니라 실제
// React 렌더라 타이핑하는 대로 즉시 갱신된다.
//
// 2026-08-09 — 접기/펼치기와 크게 보기를 추가했다. 1차 시도는 이 컴포넌트
// 안에서만 collapsed 상태를 들고 내용만 숨겼는데 — 그리드 칼럼 폭은 그대로라
// "미리보기" 헤더 아래로 빈 공간만 남고 폼 칼럼은 안 넓어지는 문제가 있었다
// (지적: "접어도 의미가 없다"). 그래서 collapsed 상태를 그리드를 소유한
// WebtoonMode로 올리고, 접었을 때 이 칼럼 자체가 좁은 세로 레일로 줄어들며
// 폼 칼럼이 남는 폭을 실제로 가져가도록 바꿨다. 실제 렌더 마크업은
// <PreviewBody>로 뽑아서 사이드 패널·모달 둘 다 같은 걸 쓴다 — 스크린샷이
// 아니라 실제 렌더라는 이 컴포넌트의 원래 취지가 "크게 보기"에서도 그대로
// 유지된다.

interface Props {
  title: string;
  excerpt: string;
  panels: CmsImage[];
  collapsed: boolean;
  onToggleCollapse: () => void;
}

function ExpandIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3" />
    </svg>
  );
}

// 오른쪽 사이드 패널이 접힐/펼쳐질 방향을 그대로 가리킨다 — 접기(→, 오른쪽
// 가장자리로 밀려남) / 펼치기(←, 다시 왼쪽으로 펼쳐짐). 회전 대신 방향이
// 다른 아이콘 둘을 쓰는 게 "레일로 접힌다"는 새 동작을 더 명확히 전달한다.
function ChevronIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={direction === "right" ? "M9 6l6 6-6 6" : "M15 6l-6 6 6 6"} />
    </svg>
  );
}

function PreviewBody({ title, excerpt, panels }: { title: string; excerpt: string; panels: CmsImage[] }) {
  return (
    <>
      <div style={{ padding: "20px 18px 12px", textAlign: "center" }}>
        <h1
          style={{
            fontFamily: '"Noto Serif KR", serif',
            fontSize: 18,
            fontWeight: 700,
            color: "#111827",
            marginBottom: 6,
            letterSpacing: "-0.01em",
          }}
        >
          {title || "제목을 입력하세요"}
        </h1>
        {excerpt && (
          <p style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.6 }}>{excerpt}</p>
        )}
      </div>

      {panels.length === 0 && (
        <p className="text-center text-[13px] text-gray-400 py-10 px-5">
          컷을 추가하면 여기에 순서대로 나타납니다.
        </p>
      )}

      <div className="flex flex-col">
        {panels.map((p, i) => (
          <div key={i} style={{ background: "#fff" }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- 외부(S3) 원본, 컷마다 비율이 달라 next/image 불가 */}
            <img
              src={p.url}
              alt={`컷 ${i + 1}`}
              style={{ display: "block", width: "100%", height: "auto" }}
            />
            {p.caption && (
              <p
                style={{
                  margin: 0,
                  padding: "10px 16px",
                  fontSize: 12,
                  lineHeight: 1.6,
                  color: "#374151",
                  textAlign: "center",
                  background: "#fafaf9",
                  borderTop: "1px solid #f0f0ef",
                  borderBottom: "1px solid #f0f0ef",
                }}
              >
                {p.caption}
              </p>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

export function WebtoonLivePreview({ title, excerpt, panels, collapsed, onToggleCollapse }: Props) {
  const [expanded, setExpanded] = useState(false);

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={onToggleCollapse}
        className="hidden lg:flex w-11 flex-col items-center gap-3 rounded-xl py-4 ring-1 ring-gray-200 bg-white cursor-pointer hover:bg-[var(--surface-sunken)]"
        title="미리보기 펼치기"
        aria-label="미리보기 펼치기"
        aria-expanded={false}
      >
        <ChevronIcon direction="left" />
        <span
          className="text-[11px] font-semibold text-gray-500"
          style={{ writingMode: "vertical-rl" }}
        >
          미리보기
        </span>
      </button>
    );
  }

  return (
    <>
      <div className="rounded-xl overflow-hidden ring-1 ring-gray-200" style={{ background: "#f5f5f4" }}>
        <div className="flex items-center justify-between gap-2 px-4 py-2.5 bg-white border-b border-gray-100">
          <span className="text-[11px] font-semibold text-gray-500">미리보기</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-gray-400 hover:bg-[var(--surface-sunken)] hover:text-gray-700"
              title="크게 보기"
              aria-label="미리보기 크게 보기"
            >
              <ExpandIcon />
            </button>
            <button
              type="button"
              onClick={onToggleCollapse}
              className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-gray-400 hover:bg-[var(--surface-sunken)] hover:text-gray-700"
              title="미리보기 접기"
              aria-label="미리보기 접기"
              aria-expanded={true}
            >
              <ChevronIcon direction="right" />
            </button>
          </div>
        </div>
        <div className="max-h-[calc(100vh-220px)] overflow-y-auto">
          <PreviewBody title={title} excerpt={excerpt} panels={panels} />
        </div>
      </div>

      {expanded && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 backdrop-blur-[2px] p-6"
          onClick={() => setExpanded(false)}
        >
          <div
            className="ui-card w-full max-w-[560px] max-h-[90vh] overflow-hidden rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b" style={{ borderColor: "var(--border-hairline)" }}>
              <span className="text-[12.5px] font-semibold" style={{ color: "var(--text-secondary)" }}>
                미리보기 — 실제 화면과 동일한 순서·톤
              </span>
              <button
                type="button"
                onClick={() => setExpanded(false)}
                className="cursor-pointer text-gray-400 hover:text-gray-700"
                aria-label="닫기"
              >
                ✕
              </button>
            </div>
            <div className="max-h-[calc(90vh-45px)] overflow-y-auto" style={{ background: "#f5f5f4" }}>
              <PreviewBody title={title} excerpt={excerpt} panels={panels} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
