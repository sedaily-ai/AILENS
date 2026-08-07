"use client";

import { useEffect, useState } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Youtube from "@tiptap/extension-youtube";
import { uploadImage } from "@/lib/uploadImage";
import { AiQuiz } from "./aiQuizExtension";
import { AiQuizModal, type AiQuizData } from "./AiQuizModal";

interface Props {
  /** Tiptap HTML — 미디엄/네이버 블로그처럼 굵게·글머리·이미지가 그 위치에
   * 그대로 저장된다. AI 레터(body[] + 마커 방식)와는 별개 경로. */
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
}

function insertImage(editor: Editor, url: string) {
  editor.chain().focus().setImage({ src: url }).run();
}

// 유튜브 붙여넣기가 실패로 끝나면(예: 파싱 중 취소) src 없는 빈 embed div가
// 저장된 HTML에 그대로 남을 수 있다 — 그 상태로 다시 열면 Youtube 확장의
// renderHTML이 null.src에 .match()를 호출해 에디터 전체가 죽는다(TypeError:
// Cannot read properties of null (reading 'match')). 로드 시점에 미리 걸러낸다.
function stripBrokenYoutubeEmbeds(html: string): string {
  if (typeof window === "undefined" || !html) return html;
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("div[data-youtube-video]").forEach((div) => {
    const src = div.querySelector("iframe")?.getAttribute("src");
    if (!src) div.remove();
  });
  return doc.body.innerHTML;
}

// 유튜브 URL은 Youtube 확장의 붙여넣기 규칙이 자동으로 임베드로 바꿔준다
// (아래 handlePaste 의 텍스트 경로 참조). 이 버튼은 "선택한 글자에 링크
// 걸기"만 담당 — 나머지 링크는 autolink 로 타이핑/붙여넣기 즉시 걸린다.
function setLink(editor: Editor) {
  const prev = editor.getAttributes("link").href as string | undefined;
  const url = window.prompt("링크 주소", prev ?? "https://");
  if (url === null) return;
  if (url.trim() === "") {
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
    return;
  }
  editor.chain().focus().extendMarkRange("link").setLink({ href: url.trim() }).run();
}

// 이모지(🔗🖼🎯) 대신 선 아이콘으로 — 서식 버튼 하나만 이모지고 나머지는
// 텍스트 글자(B, H2 등)라 뒤죽박죽이었다는 지적(2026-08-07, "AI 티나는
// 이모지 삭제하고 깔끔하고 모던하게") — 미디엄/노션류 에디터를 참고해
// 16px stroke 아이콘 세트로 통일했다. 외부 아이콘 패키지 추가 없이
// (admin/CLAUDE.md "zero-new-dependency" 정책) 직접 그린 최소 SVG.
const ICON_PROPS = {
  width: 16,
  height: 16,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const Icon = {
  Bold: () => (
    <svg {...ICON_PROPS}>
      <path d="M6 4h8a4 4 0 0 1 0 8H6zM6 12h9a4 4 0 0 1 0 8H6z" />
    </svg>
  ),
  Italic: () => (
    <svg {...ICON_PROPS}>
      <path d="M10 4h6M6 20h6M13 4 9 20" strokeWidth={2.2} />
    </svg>
  ),
  H2: () => (
    <svg {...ICON_PROPS}>
      <path d="M3 5v14M11 5v14M3 12h8" />
      <path d="M15 10a3 3 0 0 1 5.94-.6c0 1.5-1.5 2.4-2.9 3.5S15.4 15.5 15 19h6" strokeWidth={1.8} />
    </svg>
  ),
  H3: () => (
    <svg {...ICON_PROPS}>
      <path d="M3 5v14M11 5v14M3 12h8" />
      <path
        d="M15.5 9.5A2.5 2.5 0 0 1 18 7c1.4 0 2.5 1 2.5 2.3 0 1.1-.8 1.7-1.6 2 .9.3 1.8 1 1.8 2.2A2.6 2.6 0 0 1 18 16c-1.3 0-2.2-.5-2.6-1.3"
        strokeWidth={1.8}
      />
    </svg>
  ),
  BulletList: () => (
    <svg {...ICON_PROPS}>
      <circle cx="4.5" cy="6" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="12" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="18" r="1.1" fill="currentColor" stroke="none" />
      <path d="M9 6h11M9 12h11M9 18h11" />
    </svg>
  ),
  OrderedList: () => (
    <svg {...ICON_PROPS}>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <path d="M4.2 4.5v3M4.2 4.5h1M3.5 9.5h1.6M3.5 7.5h1.5M3.5 7.5c0-1.2 1.6-1.2 1.6 0S3.5 9 3.5 9.5" strokeWidth={1.4} />
      <path d="M3.5 16.5h1.8v1.5H4v1.3h1.3" strokeWidth={1.4} />
    </svg>
  ),
  Quote: () => (
    <svg {...ICON_PROPS}>
      <path d="M7 8a3 3 0 0 0-3 3v2a2 2 0 0 0 2 2h2v-4H6a1 1 0 0 1 1-1zM17 8a3 3 0 0 0-3 3v2a2 2 0 0 0 2 2h2v-4h-2a1 1 0 0 1 1-1z" />
    </svg>
  ),
  Link: () => (
    <svg {...ICON_PROPS}>
      <path d="M9 15 15 9" />
      <path d="M10.5 6.5 12 5a4 4 0 0 1 5.7 5.7l-1.5 1.5M13.5 17.5 12 19a4 4 0 0 1-5.7-5.7l1.5-1.5" />
    </svg>
  ),
  Image: () => (
    <svg {...ICON_PROPS}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="m5 18 5.5-5.5a2 2 0 0 1 2.8 0L19 18" />
    </svg>
  ),
  Widget: () => (
    <svg {...ICON_PROPS}>
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M6 6l2 2M16 16l2 2M6 18l2-2M16 8l2-2" />
      <circle cx="12" cy="12" r="3.5" />
    </svg>
  ),
};

function ToolbarButton({
  onClick,
  active,
  label,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
        active
          ? "bg-blue-50 text-blue-700"
          : "text-gray-500 hover:bg-gray-100 hover:text-gray-900"
      }`}
    >
      {children}
    </button>
  );
}

function Toolbar({
  editor,
  uploading,
  onPickImage,
  onInsertQuiz,
}: {
  editor: Editor;
  uploading: boolean;
  onPickImage: () => void;
  onInsertQuiz: () => void;
}) {
  return (
    // sticky — 페이지 헤더(posts/edit/page.tsx, top-0으로 고정)와 겹치지
    // 않게 그 아래에 붙인다. 헤더 높이는 "발행됨 · slug" 줄 유무 등으로
    // 바뀌어서 고정 px(top-20)로는 헤더에 가려지는 문제가 있었다
    // (2026-08-07) — 헤더가 실측해 넣어주는 --post-header-h를 그대로 쓴다.
    // 배경은 반투명 블러 대신 불투명 흰색으로 — 스크롤 중 본문 텍스트가
    // 아이콘 사이로 비치는 게 지저분해 보였다(2026-08-07 "깔끔하게" 요청).
    <div
      className="sticky z-10 flex flex-wrap items-center gap-0.5 border-b border-gray-100 bg-white px-4 py-2"
      style={{ top: "var(--post-header-h, 64px)" }}
    >
      <ToolbarButton
        label="굵게"
        active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <Icon.Bold />
      </ToolbarButton>
      <ToolbarButton
        label="기울임"
        active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <Icon.Italic />
      </ToolbarButton>
      <span className="mx-1 h-5 w-px bg-gray-200" />
      <ToolbarButton
        label="소제목 (큰)"
        active={editor.isActive("heading", { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      >
        <Icon.H2 />
      </ToolbarButton>
      <ToolbarButton
        label="소제목 (작은)"
        active={editor.isActive("heading", { level: 3 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
      >
        <Icon.H3 />
      </ToolbarButton>
      <span className="mx-1 h-5 w-px bg-gray-200" />
      <ToolbarButton
        label="글머리 기호"
        active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <Icon.BulletList />
      </ToolbarButton>
      <ToolbarButton
        label="번호 목록"
        active={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <Icon.OrderedList />
      </ToolbarButton>
      <ToolbarButton
        label="인용구"
        active={editor.isActive("blockquote")}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      >
        <Icon.Quote />
      </ToolbarButton>
      <span className="mx-1 h-5 w-px bg-gray-200" />
      <ToolbarButton
        label="링크"
        active={editor.isActive("link")}
        onClick={() => setLink(editor)}
      >
        <Icon.Link />
      </ToolbarButton>
      <ToolbarButton label="이미지 삽입" onClick={onPickImage}>
        {uploading ? <span className="ui-spinner w-3.5 h-3.5" /> : <Icon.Image />}
      </ToolbarButton>
      <span className="mx-1 h-5 w-px bg-gray-200" />
      {/* 색+라벨로 서식 버튼들과 구분되는 "글쓰기 도구"로 눈에 띄게 했다
          (2026-08-07) — 본문 아무 데나 커서를 두고 누르면 그 자리에 바로
          삽입되고, 넣은 뒤엔 끌어서 옮길 수 있다(aiQuizExtension.tsx 참조). */}
      <button
        type="button"
        onClick={onInsertQuiz}
        className="ml-0.5 flex h-8 items-center gap-1.5 rounded-md bg-violet-50 px-2.5 text-[13px] font-semibold text-violet-700 transition-colors hover:bg-violet-100"
      >
        <Icon.Widget />
        퀴즈·투표
      </button>
    </div>
  );
}

export function RichTextEditor({ value, onChange, placeholder }: Props) {
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [insertingQuiz, setInsertingQuiz] = useState(false);

  // 드래그드롭·붙여넣기·툴바 버튼 셋 다 여기로 모은다 — 실패를 조용히
  // 삼키면(예전 버그) 아무 반응 없이 그냥 안 들어간 것처럼 보인다.
  const runUpload = (file: File, insert: (url: string) => void) => {
    setUploading(true);
    setErr(null);
    uploadImage(file)
      .then(insert)
      .catch((e) => setErr((e as Error).message))
      .finally(() => setUploading(false));
  };

  const editor = useEditor({
    extensions: [
      // codeBlock 끄기 — 경제레터 CMS에 코드블록 쓸 일이 없는데, 붙여넣기 시
      // 클립보드의 <pre> 태그를 코드블록으로 오인해 검정 박스로 렌더링되는
      // 문제가 있었다 (마크다운 텍스트를 그대로 붙였을 때 특히 자주 발생).
      // Tiptap v3의 StarterKit은 Link를 이미 내장한다 — 별도로 Link 확장을
      // 더 추가하면 "duplicate extension names found: ['link']"로 스키마가
      // 꼬여 다른 확장(Youtube 등)의 renderHTML이 null.match()로 죽는다.
      // link 옵션은 StarterKit.configure의 link 키로 넘긴다.
      StarterKit.configure({
        codeBlock: false,
        link: {
          // autolink: 타이핑·붙여넣기로 들어온 URL 텍스트를 즉시 실제 링크로.
          // openOnClick: false — 에디터 안에서 클릭하면 이동해버리면 편집이
          // 안 되니 여기선 걸기만 하고, 열람은 발행된 글에서.
          autolink: true,
          openOnClick: false,
          HTMLAttributes: {
            class: "text-blue-600 underline underline-offset-2",
            rel: "noopener noreferrer",
            target: "_blank",
          },
        },
      }),
      Image.configure({ HTMLAttributes: { class: "rounded-xl w-full" } }),
      // 유튜브 링크를 단독 줄로 붙여넣으면 자동으로 영상 임베드로 바뀐다
      // (미디엄 붙여넣기 임베드와 동일한 동작 — 확장 자체의 붙여넣기 규칙).
      Youtube.configure({
        nocookie: true,
        HTMLAttributes: {
          style: "width:100%;aspect-ratio:16/9;border-radius:14px;border:0;display:block;",
        },
      }),
      AiQuiz,
    ],
    content: stripBrokenYoutubeEmbeds(value),
    // Next.js(static export 포함) 는 빌드 시점에 한 번 프리렌더하므로, 이걸 안 끄면
    // "SSR has been detected" 하이드레이션 경고가 뜬다 — 클라이언트에서만 초기화.
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "px-6 py-5 text-[15.5px] leading-[1.85] min-h-[540px] focus:outline-none prose-editor",
      },
      handleDrop(view, event, _slice, moved) {
        if (moved) return false; // 에디터 내부에서 옮기는 건 기본 동작에 맡긴다.
        const file = event.dataTransfer?.files?.[0];
        if (!file || !file.type.startsWith("image/")) return false;
        event.preventDefault();
        const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });
        const pos = coords?.pos ?? view.state.selection.from;
        runUpload(file, (url) => {
          const node = view.state.schema.nodes.image.create({ src: url });
          view.dispatch(view.state.tr.insert(pos, node));
        });
        return true;
      },
      handlePaste(view, event) {
        const file = Array.from(event.clipboardData?.items ?? [])
          .find((it) => it.type.startsWith("image/"))
          ?.getAsFile();
        if (!file) return false;
        event.preventDefault();
        const pos = view.state.selection.from;
        runUpload(file, (url) => {
          const node = view.state.schema.nodes.image.create({ src: url });
          view.dispatch(view.state.tr.insert(pos, node));
        });
        return true;
      },
    },
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });

  // value 가 "외부에서" 바뀌었을 때(기존 글 로딩)만 동기화한다 — 매 타이핑마다
  // onUpdate → 부모 setState → 이 prop 이 도는데, 그때마다 setContent 하면
  // 커서가 맨 앞으로 튄다. 에디터가 지금 들고 있는 값과 다를 때만 맞춘다.
  useEffect(() => {
    if (!editor) return;
    if (value !== editor.getHTML()) {
      editor.commands.setContent(stripBrokenYoutubeEmbeds(value || ""), { emitUpdate: false });
    }
  }, [editor, value]);

  if (!editor) {
    return <div className="px-6 py-5 text-[15.5px] text-gray-300 min-h-[540px]">에디터 불러오는 중…</div>;
  }

  const pickImage = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/jpeg,image/png,image/webp,image/gif";
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) runUpload(file, (url) => insertImage(editor, url));
    };
    input.click();
  };

  const isEmpty = editor.isEmpty;

  const insertQuiz = (data: AiQuizData) => {
    editor.chain().focus().insertContent({ type: "aiQuiz", attrs: { data } }).run();
    setInsertingQuiz(false);
  };

  return (
    <div className="relative">
      <Toolbar
        editor={editor}
        uploading={uploading}
        onPickImage={pickImage}
        onInsertQuiz={() => setInsertingQuiz(true)}
      />
      <div className="relative">
        <EditorContent editor={editor} />
        {isEmpty && placeholder && (
          <p className="pointer-events-none absolute left-6 top-5 text-[15.5px] text-gray-300">
            {placeholder}
          </p>
        )}
      </div>
      {err && <p className="px-6 pb-4 text-xs text-red-600">이미지 업로드 실패: {err}</p>}

      <AiQuizModal
        open={insertingQuiz}
        initial={null}
        onClose={() => setInsertingQuiz(false)}
        onSubmit={insertQuiz}
      />
    </div>
  );
}
