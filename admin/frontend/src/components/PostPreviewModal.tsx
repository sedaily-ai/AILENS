"use client";

import { useEffect, useMemo } from "react";
import { splitRichBody } from "./PostForm";
import type { AiQuizData } from "./AiQuizFields";
import type { CmsPostInput } from "@/lib/types";

// 2026-08-09 — "발행 보기"는 실제로 발행해야만 볼 수 있고, 초안일 땐 확인할
// 방법이 없었다("미리보기가 없네요, 웹툰은 되는데" 요청). 저장 전 draft를
// 그대로 받아 독자가 보는 화면에 가깝게 렌더한다 — 별도 API 호출 없이
// 지금 화면에 있는 값(제목/부제/본문 HTML/핵심정리/키워드/닫는줄)만으로.
// 본문 HTML은 저장 시(save()) 쓰는 것과 같은 splitRichBody로 갈라서, 소제목
// 트릭("핵심 정리"/"키워드"/"닫는 줄")까지 실제 저장 결과와 동일하게 반영한다.

interface Props {
  post: CmsPostInput;
  onClose: () => void;
}

type BodyPart = { type: "html"; content: string } | { type: "quiz"; data: AiQuizData };

function splitQuizMarkers(html: string): BodyPart[] {
  if (typeof window === "undefined" || !html) return [{ type: "html", content: html }];
  const doc = new DOMParser().parseFromString(html, "text/html");
  const parts: BodyPart[] = [];
  let buffer = "";
  for (const el of Array.from(doc.body.children)) {
    const raw = el.getAttribute("data-ai-quiz");
    if (raw) {
      if (buffer) {
        parts.push({ type: "html", content: buffer });
        buffer = "";
      }
      try {
        parts.push({ type: "quiz", data: JSON.parse(raw) });
      } catch {
        buffer += el.outerHTML;
      }
    } else {
      buffer += el.outerHTML;
    }
  }
  if (buffer) parts.push({ type: "html", content: buffer });
  return parts;
}

// 저장되는 body_html은 이미지가 그냥 <img alt="..."> 한 줄이다(에디터
// 재로딩 시 스키마 불일치 위험 때문에 저장 형태 자체는 안 건드림 —
// resizableImageExtension.tsx 참고). 캡션을 실제로 화면에 보여주는 건
// "읽는 화면"의 몫이라, alt가 있는 이미지를 표시 시점에만 <figure>+
// <figcaption>으로 감싼다(네이버 블로그처럼 사진 밑에 설명이 보이도록).
function injectImageCaptions(html: string): string {
  if (typeof window === "undefined" || !html) return html;
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("img[alt]").forEach((img) => {
    const alt = img.getAttribute("alt");
    if (!alt?.trim() || img.parentElement?.tagName === "FIGURE") return;
    const figure = doc.createElement("figure");
    figure.setAttribute("style", "margin:0;");
    img.replaceWith(figure);
    figure.appendChild(img);
    const caption = doc.createElement("figcaption");
    caption.textContent = alt;
    caption.setAttribute(
      "style",
      "margin-top:8px;font-size:12.5px;font-style:italic;color:#9ca3af;text-align:center;"
    );
    figure.appendChild(caption);
  });
  return doc.body.innerHTML;
}

function QuizPreviewCard({ data }: { data: AiQuizData }) {
  return (
    <div className="my-4 rounded-2xl border border-gray-200 bg-gray-50 p-4">
      <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-gray-500">
        {data.icon ? `${data.icon} ` : ""}
        {data.mode === "quiz" ? "퀴즈" : "투표"} 위젯
      </p>
      <p className="mb-1 text-[13px] font-bold text-gray-900">{data.title || "(제목 없음)"}</p>
      <p className="mb-2 text-[13px] text-gray-700">{data.question || "(질문 없음)"}</p>
      <div className="flex flex-col gap-1">
        {(data.options ?? []).map((opt, i) => (
          <span
            key={i}
            className={`rounded-md border px-2 py-1 text-[12px] ${
              data.mode === "quiz" && data.correctIndex === i
                ? "border-emerald-400 bg-emerald-50 font-semibold text-emerald-700"
                : "border-gray-200 bg-white text-gray-600"
            }`}
          >
            {opt}
            {data.mode === "quiz" && data.correctIndex === i ? " ✓" : ""}
          </span>
        ))}
      </div>
    </div>
  );
}

export function PostPreviewModal({ post, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const split = useMemo(() => splitRichBody(post.body_inline?.body_html ?? ""), [post.body_inline?.body_html]);
  const closingLine = split.closing_line || post.closing_line || "";
  const parts = useMemo(() => splitQuizMarkers(split.body_html), [split.body_html]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-4 py-10 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="ui-card w-full max-w-[760px] overflow-hidden rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between gap-3 border-b px-6 py-3.5"
          style={{ borderColor: "var(--border-hairline)" }}
        >
          <span className="text-[12.5px] font-semibold text-gray-500">
            미리보기 — 독자에게 보이는 화면과 가깝게 보여줍니다 (저장 전 내용 포함)
          </span>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 cursor-pointer text-gray-400 hover:text-gray-700"
            aria-label="닫기"
          >
            ✕
          </button>
        </div>

        <div className="max-h-[80vh] overflow-y-auto" style={{ background: "var(--surface-page)" }}>
          <article className="mx-auto bg-white px-8 py-10" style={{ maxWidth: 640 }}>
            {post.cover_image_url && (
              // eslint-disable-next-line @next/next/no-img-element -- 외부(S3) 원본, 미리보기 전용
              <img
                src={post.cover_image_url}
                alt=""
                className="mb-8 w-full rounded-xl object-cover"
                style={{ maxHeight: 360 }}
              />
            )}
            <h1
              className="text-[28px] font-bold leading-[1.35] text-gray-900"
              style={{ fontFamily: '"Noto Serif KR", serif', letterSpacing: "-0.02em" }}
            >
              {post.headline || "(제목 없음)"}
            </h1>
            {post.subtitle && (
              <p className="mt-3 text-[15px] leading-[1.6] text-gray-500">{post.subtitle}</p>
            )}
            <p className="mt-4 text-[12.5px] text-gray-400">{post.publish_date}</p>

            <div className="prose-editor mt-8 text-[16px] leading-[1.9] text-gray-700">
              {parts.length === 0 || (parts.length === 1 && parts[0].type === "html" && !parts[0].content) ? (
                <p className="text-gray-400">(본문 없음)</p>
              ) : (
                parts.map((part, i) =>
                  part.type === "html" ? (
                    <div key={i} dangerouslySetInnerHTML={{ __html: injectImageCaptions(part.content) }} />
                  ) : (
                    <QuizPreviewCard key={i} data={part.data} />
                  )
                )
              )}
            </div>

            {split.key_points.length > 0 && (
              <div className="mt-8 rounded-xl bg-gray-50 px-6 py-5">
                <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                  핵심 정리
                </p>
                <ul className="list-disc space-y-1.5 pl-5">
                  {split.key_points.map((kp, i) => (
                    <li key={i} className="text-[14px] leading-[1.7] text-gray-700">
                      {kp}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {closingLine && (
              <blockquote
                className="mt-8 border-t-2 pt-6 text-[20px] font-semibold leading-[1.55] text-gray-900"
                style={{ borderColor: "var(--accent)", fontFamily: '"Noto Serif KR", serif' }}
              >
                {closingLine}
              </blockquote>
            )}

            {split.keywords.length > 0 && (
              <div className="mt-8 border-t pt-6" style={{ borderColor: "var(--border-hairline)" }}>
                <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-gray-400">단어</p>
                <div className="space-y-3">
                  {split.keywords.map((kw, i) => (
                    <div key={i}>
                      <p className="text-[13px] font-semibold text-gray-900">{kw.term}</p>
                      {kw.explain && (
                        <p className="text-[13px] leading-[1.6] text-gray-500">{kw.explain}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </article>
        </div>
      </div>
    </div>
  );
}
