"use client";

import TiptapImage from "@tiptap/extension-image";
import { ReactNodeViewRenderer, NodeViewWrapper, type ReactNodeViewProps } from "@tiptap/react";
import { useRef, useState } from "react";
import { uploadImage } from "@/lib/uploadImage";

// 2026-08-09 — 기본 Image 확장은 그냥 <img> 하나만 넣고 끝이라, 넣은 뒤에
// 손댈 방법이 하나도 없었다("삭제하는 게 불편하다, 크기도 못 바꾸고 정렬도
// 안 되고 alt도 못 쓴다, 네이버는 되잖아요" 요청). width·align·alt를
// 노드 속성으로 들고, 저장되는 HTML에도 인라인 style로 그대로 박아
// 넣는다 — 퍼블릭 사이트(service/frontend)는 body_html을
// dangerouslySetInnerHTML로 그대로 렌더링해서, 이 인라인 style만으로
// 발행된 글에서도 별도 CSS 없이 크기·정렬이 그대로 반영된다.
//
// 정렬·교체·삭제 컨트롤은 이미지 바로 위(호버/선택 시)에 뜨는 작은
// 툴바에 둔다 — 한 번은 상단 고정 도구모음으로 옮겨봤지만 "이미지 쪽에
// 있어야지, 위쪽 말고" 피드백으로 되돌렸다. alt(=캡션)는 그 툴바 안
// 입력창이 아니라, 네이버 블로그처럼 이미지 바로 아래 항상 보이는 캡션
// 줄로 둔다 — 호버 안 해도 항상 보여야 하고("이미지 밑에 텍스트가
// 안뜨네요"), 비어있으면 "사진 설명을 입력하세요" placeholder가 보이고
// 채우면 그 텍스트가 그대로 보인다(2026-08-09). 저장되는 HTML(<img alt=...>)
// 자체는 그대로 두고 — 캡션을 실제로 화면에 보여주는 <figure>/<figcaption>
// 래핑은 "읽는 화면"(PostPreviewModal.tsx, 공개 사이트) 쪽에서 표시 시점에
// 씌운다. renderHTML에서 직접 figcaption을 만들면, 에디터가 그 글을 다시
// 열 때 ProseMirror가 스키마에 없는 figcaption 텍스트를 별도 문단으로
// 잘못 흡수해 캡션이 중복되는 위험이 있어 피했다.

export type Align = "left" | "center" | "right";

function alignStyle(align: Align): string {
  if (align === "left") return "margin:0 auto 0 0";
  if (align === "right") return "margin:0 0 0 auto";
  return "margin:0 auto";
}

function AlignIcon({ dir }: { dir: Align }) {
  const lines =
    dir === "left"
      ? ["M4 6h16", "M4 12h10", "M4 18h13"]
      : dir === "right"
      ? ["M4 6h16", "M10 12h10", "M7 18h13"]
      : ["M4 6h16", "M7 12h10", "M5.5 18h13"];
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      {lines.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

function ResizableImageView({ node, updateAttributes, deleteNode, selected }: ReactNodeViewProps) {
  const { src, alt, width, align } = node.attrs as { src: string; alt: string | null; width: number | null; align: Align };
  const wrapRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [hovering, setHovering] = useState(false);
  const [resizing, setResizing] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const active = hovering || selected || resizing;

  // 코너를 잡고 좌우로 끌면 너비가 늘거나 준다 — 높이는 항상 auto(비율
  // 유지). 왼쪽 코너는 반대 방향으로 끌어야 커지는 게 자연스러워 부호를
  // 뒤집는다.
  const startResize = (corner: "left" | "right") => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const img = imgRef.current;
    if (!img) return;
    const startX = e.clientX;
    const startWidth = img.getBoundingClientRect().width;
    setResizing(true);
    const onMove = (ev: MouseEvent) => {
      const delta = corner === "right" ? ev.clientX - startX : startX - ev.clientX;
      const next = Math.max(80, Math.round(startWidth + delta));
      updateAttributes({ width: next });
    };
    const onUp = () => {
      setResizing(false);
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  // src만 새 파일로 갈아끼운다 — width·align·alt는 그대로 유지.
  const replaceImage = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/jpeg,image/png,image/webp,image/gif";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      setReplacing(true);
      uploadImage(file)
        .then((url) => updateAttributes({ src: url }))
        .catch(() => {})
        .finally(() => setReplacing(false));
    };
    input.click();
  };

  return (
    <NodeViewWrapper
      className="my-4"
      style={{ display: "flex" }}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      <div
        ref={wrapRef}
        className="relative"
        style={{ width: width ? `${width}px` : "100%", maxWidth: "100%", [align === "left" ? "marginRight" : align === "right" ? "marginLeft" : "marginInline"]: "auto" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- 외부(S3) 원본 URL, Tiptap 노드뷰 안 */}
        <img
          ref={imgRef}
          src={src}
          alt={alt ?? ""}
          draggable={false}
          className="block h-auto w-full rounded-xl"
          style={{ outline: selected ? "2px solid var(--accent)" : undefined, outlineOffset: 2 }}
        />

        {active && (
          <>
            <div
              className="absolute left-1/2 top-0 z-10 flex -translate-x-1/2 -translate-y-[calc(100%+8px)] items-center gap-0.5 rounded-lg border bg-white p-0.5 shadow-md"
              style={{ borderColor: "var(--border-hairline)" }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              {(["left", "center", "right"] as const).map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => updateAttributes({ align: a })}
                  title={a === "left" ? "왼쪽 정렬" : a === "right" ? "오른쪽 정렬" : "가운데 정렬"}
                  className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md"
                  style={{
                    background: align === a ? "var(--accent-soft)" : undefined,
                    color: align === a ? "var(--accent)" : "var(--text-secondary)",
                  }}
                >
                  <AlignIcon dir={a} />
                </button>
              ))}
              <span className="mx-0.5 h-4 w-px" style={{ background: "var(--border-hairline)" }} />
              <button
                type="button"
                onClick={replaceImage}
                title="이미지 교체"
                className="flex h-7 items-center justify-center gap-1 rounded-md px-2 text-[11px] font-bold cursor-pointer"
                style={{ color: "var(--text-secondary)" }}
              >
                {replacing ? (
                  <span className="ui-spinner h-3 w-3" />
                ) : (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M4 12a8 8 0 0 1 14-5.3M20 4v5h-5" />
                    <path d="M20 12a8 8 0 0 1-14 5.3M4 20v-5h5" />
                  </svg>
                )}
                교체
              </button>
              <span className="mx-0.5 h-4 w-px" style={{ background: "var(--border-hairline)" }} />
              <button
                type="button"
                onClick={() => deleteNode()}
                title="이미지 삭제"
                className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md hover:bg-[var(--danger-soft)]"
                style={{ color: "var(--danger)" }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
                </svg>
              </button>
            </div>

            {/* 좌우 코너 리사이즈 손잡이 — 높이는 항상 비율 유지(auto)라
                손잡이는 좌·우 두 개면 충분하다. */}
            <div
              onMouseDown={startResize("left")}
              className="absolute bottom-1 left-1 h-3.5 w-3.5 cursor-nesw-resize rounded-full border-2 border-white"
              style={{ background: "var(--accent)" }}
            />
            <div
              onMouseDown={startResize("right")}
              className="absolute bottom-1 right-1 h-3.5 w-3.5 cursor-nwse-resize rounded-full border-2 border-white"
              style={{ background: "var(--accent)" }}
            />
          </>
        )}

        {/* 캡션 — 호버 여부와 무관하게 항상 보인다(네이버 블로그 참고).
            비어있으면 placeholder만, 채우면 그 텍스트가 그대로. alt
            속성과 같은 값이라 접근성 alt와 화면에 보이는 캡션이 항상
            일치한다. */}
        <input
          value={alt ?? ""}
          onChange={(e) => updateAttributes({ alt: e.target.value === "" ? null : e.target.value })}
          placeholder="사진 설명을 입력하세요"
          title="이미지 설명(캡션 · alt)"
          className="mt-2 w-full border-0 bg-transparent px-1 text-center text-[12.5px] italic focus:outline-none"
          style={{ color: "var(--text-muted)" }}
        />
      </div>
    </NodeViewWrapper>
  );
}

export const ResizableImage = TiptapImage.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (element: HTMLElement) => {
          const w = element.style.width || element.getAttribute("width");
          const n = w ? parseInt(w, 10) : NaN;
          return Number.isFinite(n) ? n : null;
        },
        renderHTML: (attributes: { width: number | null }) => (attributes.width ? { width: attributes.width } : {}),
      },
      align: {
        default: "center",
        parseHTML: (element: HTMLElement) => (element.getAttribute("data-align") as Align) || "center",
        renderHTML: (attributes: { align: Align }) => ({ "data-align": attributes.align }),
      },
    };
  },

  // width(px)·정렬(margin)을 인라인 style로 직접 박아 넣는다 — 퍼블릭
  // 사이트가 body_html을 그대로 렌더링해서, 여기 style 하나로 발행된
  // 글에서도 CSS 추가 없이 그대로 보인다.
  renderHTML({ HTMLAttributes }) {
    const width = HTMLAttributes.width as number | undefined;
    const align = (HTMLAttributes["data-align"] as Align) || "center";
    const style = [
      "display:block",
      "max-width:100%",
      "height:auto",
      width ? `width:${width}px` : "",
      alignStyle(align),
    ]
      .filter(Boolean)
      .join(";");
    return ["img", { ...HTMLAttributes, style }];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageView);
  },
});
