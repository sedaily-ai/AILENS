"use client";

import { useEffect, useState } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Youtube from "@tiptap/extension-youtube";
import { uploadImage } from "@/lib/uploadImage";
import { ResizableImage } from "./resizableImageExtension";
import { AiQuiz } from "./aiQuizExtension";
import { EMPTY as EMPTY_AI_QUIZ_DATA } from "./AiQuizFields";

// 2026-08-09 — 툴바를 페이지 최상단(발행일·분류 메타줄보다 위)으로 옮기면서
// 훅 + 툴바 컴포넌트 + 본문 컴포넌트 세 조각으로 쪼갰다(티스토리 등 다른
// 에디터가 서식 도구모음을 카테고리보다 위에 고정해두는 것과 같은 구조로
// 맞춰달라는 요청). editor 인스턴스는 페이지(posts/edit/page.tsx)가
// useRichTextEditor로 만들어 위쪽엔 <EditorToolbar>, 본문 자리엔
// <EditorBody>를 각각 내려준다 — Tiptap의 Editor는 순수 JS 인스턴스라
// DOM 위치와 무관하게 어디서든 같은 걸 참조할 수 있다.

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
  Info: () => (
    <svg {...ICON_PROPS}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <path d="M12 7.3v.01" strokeWidth={2.6} />
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

/** 페이지 최상단에 고정되는 서식 도구모음 — editor 인스턴스만 있으면 어디서든
 * 렌더 가능(Tiptap Editor는 DOM 위치와 무관한 JS 인스턴스). 이미지 자체의
 * 정렬·교체·ALT·삭제는 여기가 아니라 이미지 옆에 붙는 컨텍스트 툴바
 * (resizableImageExtension.tsx)가 담당한다 — 처음엔 이 상단 툴바로
 * 옮겨봤지만 "이미지 쪽에 있어야지, 위쪽 말고" 피드백으로 되돌렸다
 * (2026-08-09). */
export function EditorToolbar({
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
    <div className="flex flex-wrap items-center gap-1 px-6 py-2.5">
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
      {/* 라벨(아이콘+글자)로 다른 서식 버튼과 구분했다 — 색은 뺐다(2026-08-09,
          "화면에 색이 여기 하나뿐이라 부가 기능인데도 시선이 여기로 먼저
          간다"는 피드백). 저장/발행처럼 진짜 주요 액션에만 색을 남기고,
          툴바 안에서는 다른 아이콘 버튼과 같은 중립 톤 — 라벨 텍스트만으로도
          충분히 구분된다. */}
      <button
        type="button"
        onClick={onInsertQuiz}
        className="ml-0.5 flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-semibold text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
      >
        <Icon.Widget />
        퀴즈·투표
      </button>
      {/* 예전엔 카드 아래 항상 떠 있는 문장이었다 — 본문을 한 글자도 안 쓴
          상태에서도 늘 보여서 화면이 조용하지 않았다(2026-08-09 지적).
          아이콘 하나로 줄이고 필요할 때만 hover로 보게 했다.
          2026-08-09 — ml-auto로 반대쪽 끝에 혼자 떨어뜨려 뒀더니 "도구모음
          정렬·균형이 안 맞아 보인다"는 지적 — 나머지 아이콘들과 같은 왼쪽
          그룹 안으로 옮겼다(구분선만 하나 두고 이어붙임). 툴바 전체가
          한 덩어리로 왼쪽에 모여 있는 게, 좌우로 억지로 벌려놓은 것보다
          더 차분하고 정돈돼 보인다. */}
      <span className="mx-1 h-5 w-px bg-gray-200" />
      <span
        title={'핵심 정리·키워드·닫는 줄은 본문에 H2 소제목으로 "핵심 정리" / "키워드" / "닫는 줄"이라고 쓰면 저장 시 자동으로 나뉩니다.'}
        className="flex h-7 w-7 items-center justify-center rounded-md text-gray-300 hover:bg-gray-100 hover:text-gray-500 cursor-help"
      >
        <Icon.Info />
      </span>
    </div>
  );
}

/** 실제 Tiptap 편집 영역. 툴바와 분리돼 있어 페이지 아래쪽(제목·메타줄 다음)에 둔다. */
export function EditorBody({
  editor,
  placeholder,
  uploadError,
}: {
  editor: Editor;
  placeholder?: string;
  uploadError?: string | null;
}) {
  const isEmpty = editor.isEmpty;
  return (
    <div className="relative">
      <EditorContent editor={editor} />
      {isEmpty && placeholder && (
        <p className="pointer-events-none absolute left-6 top-5 text-[15.5px] text-gray-300">
          {placeholder}
        </p>
      )}
      {uploadError && <p className="px-6 pb-4 text-xs text-red-600">이미지 업로드 실패: {uploadError}</p>}
    </div>
  );
}

interface UseRichTextEditorArgs {
  /** Tiptap HTML — 미디엄/네이버 블로그처럼 굵게·글머리·이미지가 그 위치에
   * 그대로 저장된다. AI 레터(body[] + 마커 방식)와는 별개 경로. */
  value: string;
  onChange: (html: string) => void;
}

export function useRichTextEditor({ value, onChange }: UseRichTextEditorArgs) {
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

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
      // 2026-08-09 — 기본 Image 대신 크기 조절·정렬·alt·삭제 버튼이 있는
      // ResizableImage로 교체("네이버는 그런 기능이 있잖아요" 요청).
      // 클래스 대신 노드뷰 자체가 스타일을 다 들고 있다.
      ResizableImage,
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
        // min-height 540px는 새 글일 때 카드 하단까지 텅 빈 공백이 크게
        // 남아 "빈 백지"가 부담스러워 보였다(2026-08-09 지적) — 클릭 영역은
        // 충분히 확보하되 내용에 따라 자라나도록 대폭 줄였다.
        class: "px-6 py-5 text-[15.5px] leading-[1.85] min-h-[180px] focus:outline-none prose-editor",
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
  //
  // setContent를 이 effect 안에서 그대로 동기 호출하면, 본문에 이미지 노드가
  // 있을 때 그 노드뷰(ResizableImageView)를 마운트하며 Tiptap이 내부적으로
  // ReactDOM.flushSync를 부르는데 — 그 시점이 아직 React가 이 effect를
  // 커밋하는 도중이라 "flushSync was called from inside a lifecycle method"
  // 콘솔 에러로 이어진다(2026-08-09, 이미지 업로드 후 실제로 발생 확인).
  // 마이크로태스크로 한 틱 미뤄서 React의 커밋이 끝난 뒤에 실행되게 한다.
  useEffect(() => {
    if (!editor) return;
    if (value !== editor.getHTML()) {
      queueMicrotask(() => {
        if (editor.isDestroyed || value === editor.getHTML()) return;
        editor.commands.setContent(stripBrokenYoutubeEmbeds(value || ""), { emitUpdate: false });
      });
    }
  }, [editor, value]);

  const pickImage = () => {
    if (!editor) return;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/jpeg,image/png,image/webp,image/gif";
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) runUpload(file, (url) => insertImage(editor, url));
    };
    input.click();
  };

  // 2026-08-09 — "퀴즈·투표" 툴바 버튼이 팝업 모달을 먼저 열어서 내용을
  // 다 채우게 하던 흐름을 없앴다. 이제 빈 카드를 바로 삽입한다 — 그 카드는
  // 새로 삽입된(= 빈) 상태라 노드뷰(aiQuizExtension.tsx)가 자동으로 편집
  // 모드로 열어서, 삽입 즉시 그 자리에서 채워 넣을 수 있다.
  const insertQuiz = () => {
    if (!editor) return;
    editor.chain().focus().insertContent({ type: "aiQuiz", attrs: { data: EMPTY_AI_QUIZ_DATA } }).run();
  };

  return {
    editor,
    uploading,
    uploadError: err,
    pickImage,
    insertQuiz,
  };
}
