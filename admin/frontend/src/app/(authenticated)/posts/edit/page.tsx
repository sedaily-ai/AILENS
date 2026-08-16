"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { adminApi } from "@/lib/adminClient";
import { useToast } from "@/components/Toast";
import { PostForm, splitRichBody } from "@/components/PostForm";
import { useRichTextEditor, EditorToolbar } from "@/components/RichTextEditor";
import { PostPreviewModal } from "@/components/PostPreviewModal";
import { ErrorNote } from "@/components/Feedback";
import { publicPostUrl } from "@/lib/publicUrl";
import type { CmsPost, CmsPostBody, CmsPostInput } from "@/lib/types";

// 헤더의 아이콘 전용 버튼(로고·뒤로가기·미리보기·사이트에서 보기·삭제)들이
// 라벨 글자가 없어서, 뭘 하는 버튼인지 브라우저 기본 title 툴팁(느리고
// 밋밋함)에만 기대고 있었다 — "호버하면 텍스트로 나오게, 좀 친절하게"
// 요청(2026-08-09)으로 즉시 뜨는 작은 말풍선 툴팁을 만들었다. title
// 속성은 겹쳐서 두 개가 동시에 뜨지 않도록 빼고 aria-label로만 접근성을 잡는다.
function IconAction({
  href,
  onClick,
  disabled,
  label,
  danger,
  children,
}: {
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  label: string;
  danger?: boolean;
  children: React.ReactNode;
}) {
  const className = `group relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-500 transition-colors ${
    danger ? "hover:bg-[var(--danger-soft)] hover:text-[var(--danger)]" : "hover:bg-gray-100 hover:text-gray-900"
  }`;
  const tooltip = (
    <span
      role="tooltip"
      className="pointer-events-none absolute left-1/2 top-full z-30 mt-1.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-gray-900 px-2 py-1 text-[11px] font-medium text-white opacity-0 shadow-md transition-opacity duration-150 group-hover:opacity-100"
    >
      {label}
    </span>
  );
  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" aria-label={label} className={className}>
        {children}
        {tooltip}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label} className={`${className} cursor-pointer`}>
      {children}
      {tooltip}
    </button>
  );
}

function todayKST(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + (now.getTimezoneOffset() + 540) * 60000);
  return `${kst.getFullYear()}-${String(kst.getMonth() + 1).padStart(2, "0")}-${String(
    kst.getDate()
  ).padStart(2, "0")}`;
}

// HTML 태그를 걷어내고 실제 글자가 있는지만 본다 — Tiptap의 editor.isEmpty는
// "핵심 정리"/"키워드"/"닫는 줄" 소제목까지 포함한 원본 기준이라, 저장 시점에
// 그 소제목들을 갈라낸 뒤(splitRichBody) 남는 진짜 본문만 따로 비어있는지
// 확인해야 한다(아래 save() 참조).
function isHtmlEmpty(html: string): boolean {
  if (!html) return true;
  return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim().length === 0;
}

const EMPTY_BODY: CmsPostBody = { body: [], key_points: [], keywords: [], images: [] };

const EMPTY: CmsPostInput = {
  headline: "",
  subtitle: "",
  closing_line: "",
  channels: ["letters"],
  editor_id: null,
  body_inline: EMPTY_BODY,
};

// useSearchParams 는 클라이언트 사이드 only — static export 시 Suspense boundary 필수.
export default function PostEditPageWrapper() {
  return (
    <Suspense
      fallback={
        <div className="space-y-3">
          <h1 className="font-display text-[26px] font-bold text-[var(--text-primary)]">글</h1>
          <div className="ui-spinner w-5 h-5 mt-4" />
        </div>
      }
    >
      <PostEditPage />
    </Suspense>
  );
}

function PostEditPage() {
  const router = useRouter();
  const params = useSearchParams();
  const id = params.get("id") ?? "";
  const isNew = !id;
  const toast = useToast();

  const [draft, setDraft] = useState<CmsPostInput>({
    ...EMPTY,
    publish_date: todayKST(),
  });
  const [saved, setSaved] = useState<CmsPost | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 2026-08-09 — "웹툰"/"영상"은 사이드바 별도 메뉴(/webtoon, /video)로
  // 옮겨갔고, "트렌드·칼럼 카드"는 분류(머니 트렌드/깊은 이야기) + 본문
  // 비움으로 흡수됐다(save() 참조) — 그래서 이 화면은 이제 레터 글 전용이라
  // 종류를 고르는 UI 자체가 없다. channels는 항상 letters로 저장 요청하고,
  // 본문이 실제로 비어있으면 save()가 trend_card로 대신 쓴다.
  const editorState = useRichTextEditor({
    value: draft.body_inline?.body_html ?? "",
    onChange: (html) =>
      setDraft((d) => ({ ...d, body_inline: { ...(d.body_inline ?? EMPTY_BODY), body_html: html } })),
  });
  const { editor, uploading, uploadError, pickImage, insertQuiz } = editorState;
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    adminApi
      .getPost(id)
      .then(({ post }) => {
        if (cancelled) return;
        setSaved(post);
        setDraft({
          headline: post.headline,
          subtitle: post.subtitle ?? "",
          closing_line: post.closing_line ?? "",
          publish_date: post.publish_date,
          channels: post.channels,
          editor_id: post.editor_id,
          body_inline: post.body_inline,
          cover_image_url: post.cover_image_url || null,
          source_url: post.source_url || null,
          media_embed_url: post.media_embed_url || null,
        });
      })
      .catch((err) => {
        if (!cancelled) setError((err as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const guard = (): string | null => {
    if (!(draft.headline ?? "").trim()) return "제목을 입력하세요";
    if (!(draft.publish_date ?? "").trim()) return "발행일을 선택하세요";
    return null;
  };

  const save = async () => {
    const bad = guard();
    if (bad) {
      toast.show(bad, "error");
      return;
    }
    setBusy(true);
    // "핵심 정리"/"키워드"/"닫는 줄" 소제목으로 나눠 쓴 본문을 여기서 실제
    // 필드로 갈라낸다. 분류가 머니 트렌드/깊은 이야기인데 갈라내고 남은
    // 본문이 비어있으면 — 상세 페이지 없는 카드 전용 글(trend_card)로
    // 저장한다(2026-08-09, "근본적으로 해결" — 예전엔 별도 탭이었다).
    // "오늘의 이슈"(분류 미지정)는 대응하는 카드 형태가 없어 이 규칙에서
    // 제외 — 본문 없이 저장해도 그냥 빈 본문의 레터로 남는다.
    const split = splitRichBody(draft.body_inline?.body_html ?? "");
    const section = draft.body_inline?.section;
    const isCardOnly = (section === "trend" || section === "column") && isHtmlEmpty(split.body_html ?? "");

    const payload: CmsPostInput = isCardOnly
      ? {
          ...draft,
          channels: ["trend_card"],
          body_inline: {
            body: [],
            key_points: [],
            keywords: [],
            images: [],
            section,
            category: draft.body_inline?.category ?? "",
          },
        }
      : {
          ...draft,
          channels: ["letters"],
          body_inline: {
            body: [],
            body_html: split.body_html,
            key_points: split.key_points,
            keywords: split.keywords,
            images: draft.body_inline?.images ?? [],
            // /letters 아카이브 필터 태그(트렌드/인기 칼럼).
            section: draft.body_inline?.section,
            // section이 trend/column일 때 홈 카드 상단 라벨 — 안 넘기면
            // 저장 시 계속 빠져서 카드에 기본값("AI LENS")만 노출된다
            // (2026-08-07 확인).
            category: draft.body_inline?.category,
          },
          closing_line: split.closing_line || draft.closing_line,
        };
    try {
      if (isNew) {
        const { post } = await adminApi.createPost(payload);
        toast.show("저장했습니다", "success");
        router.replace(`/posts/edit?id=${encodeURIComponent(post.id)}`);
      } else {
        const { post } = await adminApi.updatePost(id, payload);
        setSaved(post);
        toast.show("저장했습니다", "success");
      }
    } catch (err) {
      toast.show((err as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  const act = async (fn: () => Promise<{ post: CmsPost }>, msg: string) => {
    setBusy(true);
    try {
      const { post } = await fn();
      setSaved(post);
      toast.show(msg, "success");
    } catch (err) {
      toast.show((err as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(`"${draft.headline || "이 글"}"을(를) 삭제할까요? 되돌릴 수 없습니다.`)) return;
    setBusy(true);
    try {
      await adminApi.deletePost(id);
      toast.show("삭제했습니다", "success");
      router.back();
    } catch (err) {
      toast.show((err as Error).message, "error");
      setBusy(false);
    }
  };

  if (error) {
    return (
      <div className="max-w-[880px] mx-auto px-6 py-8 space-y-3">
        <h1 className="font-display text-[26px] font-bold text-[var(--text-primary)]">글</h1>
        <ErrorNote message={error} />
        <button type="button" onClick={() => router.back()} className="text-sm text-blue-700 hover:underline cursor-pointer">
          ← 목록
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* 티스토리식 풀스크린 캔버스(2026-08-09) — layout.tsx가 이 경로에서
          사이드바·max-w-6xl 래퍼를 건너뛰므로, 이 바는 진짜 화면 전체 폭이다.
          컷이 많은 웹툰 글은 스크롤이 길어서 저장 버튼을 보려고 매번 맨
          위로 스크롤해야 하는 게 불편하다는 지적(2026-08-07)으로 sticky 유지.

          액션바(← 목록·저장 등)와 서식 도구모음을 각각 따로 sticky로 쌓고
          도구모음을 회색 배경 위 흰 상자로 띄웠더니 — "이게 문서에 붙은
          건지 크롬에 붙은 건지 애매하다"는 지적을 받았다(2026-08-09). 실제로
          Tistory 등 참고 화면도 액션 버튼 줄과 서식 도구 줄을 같은 흰 바
          안에 두 줄로 붙여서 "이건 다 앱 도구모음이다"를 명확히 한다 —
          같은 구조로 하나의 sticky 블록에 합쳤다. 부수 효과로 --post-header-h
          CSS 변수 실측 로직(ResizeObserver)이 필요 없어졌다 — 두 줄이 같은
          sticky 컨테이너 안에 있어서 애초에 높이를 잴 필요가 없다. */}
      <div
        className="sticky top-0 z-20 border-b"
        style={{ background: "var(--surface-card)", borderColor: "var(--border-hairline)" }}
      >
        <div className="flex items-center justify-between flex-wrap gap-2 px-4 py-3">
          {/* 왼쪽 = 이동(로고·뒤로가기) + 이 글의 상태(배지). "목록"이라는
              글자는 빼고 아이콘 버튼 하나로("뒤로가기 버튼만 두시고" 요청,
              2026-08-09). 상태 배지는 원래 우측 조작 그룹 옆에 뒀는데
              — "우측에 몰려있을 이유 있으려나요" 지적(2026-08-09)으로
              옮겼다: 배지는 읽기 전용 정보라 조작 버튼들과 같은 무게로
              오른쪽에 있을 필요가 없고, 오히려 제목 옆(왼쪽)이 "이 글이
              지금 뭔가" 를 보여주는 자연스러운 자리다. */}
          <div className="flex items-center gap-1 min-w-0">
            <IconAction onClick={() => router.push("/")} label="AI LENS 관리자 홈">
              <span
                className="flex h-8 w-8 items-center justify-center rounded-lg ring-1 ring-black/5"
                style={{ background: "var(--accent)" }}
              >
                <span className="font-display text-[11px] font-bold leading-none text-white">AL</span>
              </span>
            </IconAction>
            <span className="mx-1.5 h-5 w-px shrink-0 bg-gray-200" />
            <IconAction onClick={() => router.back()} label="뒤로가기">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M15 6l-6 6 6 6" />
              </svg>
            </IconAction>
            <span className="ml-1 text-[13px] font-medium text-gray-400 truncate">
              {isNew ? "새 글" : "글 수정"}
            </span>
            {saved && (
              <span className={`ui-badge ml-2 shrink-0 ${saved.status === "published" ? "ui-badge-published" : "ui-badge-draft"}`}>
                {saved.status === "published" ? "발행됨" : "초안"}
              </span>
            )}
          </div>

          {/* 오른쪽 = 저장 → 발행/내리기만 색이 있는 버튼으로 남기고,
              나머지(미리보기 · 사이트에서 보기 · 삭제)는 아이콘 버튼으로
              축소해 무게를 낮췄다("핵심만 우측, 나머지는 아이콘화" 선택,
              2026-08-09) — 이 글의 진짜 흐름(저장·발행)과 가끔 쓰는 보조
              기능을 시각적으로 구분. "발행 보기"라는 말이 애매하다는
              지적도 반영해 "사이트에서 보기"로 바꿨다. */}
          <div className="flex items-center gap-1 shrink-0">
            {saved?.status === "published" && publicPostUrl(saved) && (
              <IconAction href={publicPostUrl(saved)!} label="사이트에서 보기 — 발행된 실제 페이지를 새 탭으로 엽니다">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  <path d="M15 3h6v6M10 14 21 3" />
                </svg>
              </IconAction>
            )}
            <IconAction onClick={() => setPreviewOpen(true)} label="미리보기 — 저장 전 상태를 독자 화면처럼 확인">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </IconAction>
            {saved && (
              <IconAction onClick={remove} disabled={busy} label="삭제 — 되돌릴 수 없어요" danger>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
                </svg>
              </IconAction>
            )}
            <span className="mx-1.5 h-5 w-px bg-gray-200" />
            <div className="flex items-center gap-2">
              {/* 저장 → 발행을 화살표로 이어서 "두 단계가 있다"는 걸 처음부터
                  보여준다(2026-08-09 피드백 — 예전엔 발행 버튼이 저장 전엔 아예
                  안 보여서 저장해야 발행할 수 있다는 걸 뒤늦게 알게 됐다). 저장
                  전엔 발행 버튼을 앱 공통 disabled 톤(.ui-btn:disabled, opacity
                  0.45)으로 흐리게 — 처음엔 회색 텍스트+회색 배경으로 따로 만들었다가
                  거의 안 보인다는 지적을 받고, 있는 스타일을 그대로 재사용하는
                  쪽으로 바꿨다(같은 초록 버튼이 흐려지는 것뿐이라 "버튼이 있다"는
                  건 항상 읽힌다). */}
              <button
                type="button"
                disabled={busy}
                onClick={save}
                title="지금까지 작성한 내용을 저장합니다 (아직 발행되지는 않아요)"
                className="ui-btn ui-btn-primary rounded-lg px-4 py-2 text-sm font-semibold"
              >
                저장
              </button>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-gray-300"
                aria-hidden="true"
              >
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
              {saved?.status === "published" ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => act(() => adminApi.unpublishPost(saved.id), "내렸습니다")}
                  title="발행을 취소하고 다시 초안으로 되돌립니다"
                  className="ui-btn ui-btn-warn-soft rounded-lg px-4 py-2 text-sm font-semibold"
                >
                  내리기
                </button>
              ) : (
                // 저장 전엔 발행할 대상 자체가 없다 — 옅은 초록(--ok-soft)에
                // disabled opacity를 얹으면 거의 안 보여서(2026-08-09 이전에도
                // 겪은 문제), 저장 전엔 아예 중립 회색(ui-btn-ghost)으로 다르게
                // 보여준다. 저장하고 나면 그제서야 초록으로 바뀌면서 "이제
                // 발행할 수 있다"는 신호 자체가 더 뚜렷해진다.
                <button
                  type="button"
                  disabled={busy || !saved}
                  title={saved ? "지금 상태 그대로 독자에게 공개합니다" : "먼저 저장하세요"}
                  onClick={() => saved && act(() => adminApi.publishPost(saved.id), "발행했습니다")}
                  className={`ui-btn rounded-lg px-4 py-2 text-sm font-semibold ${saved ? "ui-btn-ok-soft" : "ui-btn-ghost"}`}
                >
                  발행
                </button>
              )}
            </div>
          </div>
        </div>

        {/* 서식 도구모음 — 액션바 바로 아래, 같은 흰 sticky 블록 안 둘째 줄로
            (2026-08-09, "문서에 붙은 건지 크롬에 붙은 건지 애매하다" 지적으로
            액션바와 하나로 합쳤다 — 위 sticky div의 큰 주석 참조). editor
            준비 전엔 안 그린다. */}
        {editor && (
          <div className="border-t px-6" style={{ borderColor: "var(--border-hairline)" }}>
            <div className="max-w-[880px] mx-auto">
              <EditorToolbar
                editor={editor}
                uploading={uploading}
                onPickImage={pickImage}
                onInsertQuiz={insertQuiz}
              />
            </div>
          </div>
        )}
      </div>

      <div className="px-6 pb-8 pt-6">
        {/* 새 글은 즉시 폼을 띄운다. 기존 글은 불러오는 동안 아무것도 안 그린다 —
            스켈레톤이 전환을 오히려 느리게 느껴지게 한다는 피드백으로 제거.
            빈 폼을 보여줬다가 값이 뒤늦게 채워지면 사용자가 이미 타이핑을
            시작했을 수 있어 그냥 비워둔다(값 도착하면 바로 폼 등장). */}
        {(isNew || saved) && (
          <div className="ui-enter">
            <PostForm value={draft} onChange={setDraft} mode="post" editor={editor} uploadError={uploadError} />
          </div>
        )}
      </div>

      {previewOpen && <PostPreviewModal post={draft} onClose={() => setPreviewOpen(false)} />}
    </div>
  );
}
