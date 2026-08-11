"use client";

import type { Editor } from "@tiptap/react";
import type { CmsPostBody, CmsPostInput } from "@/lib/types";
import { PostMode } from "./PostMode";
import { WebtoonMode } from "./WebtoonMode";
import { VideoMode } from "./VideoMode";
import { LetterMode } from "./LetterMode";

// 노출 채널 선택 UI는 뺐다 — "오늘의 1면"/"기사 피드"는 프론트가 아직 CMS 글을
// 안 읽어서 실제로 아무 효과가 없었다(2026-08-04 확인). 모든 글은 유일하게
// 작동하는 "letters" 채널로 고정 발행한다. posts/edit/page.tsx 의 기본값 참조.
//
// mode="trend_card"는 2026-08-09부로 없다 — "트렌드·칼럼 카드"라는 별도
// 진입점 자체가 mode="post"(레터 글)에 흡수됐다. 분류를 머니 트렌드/깊은
// 이야기로 두고 본문을 비워서 저장하면 posts/edit/page.tsx의 save()가 알아서
// channels:["trend_card"]로 쓴다 — 관리자 입장에선 "쓸지 말지"만 고르면 된다.
// mode="webtoon"/"video"도 같은 날 별도 사이드바 메뉴(/webtoon, /video)로
// 옮겨갔지만, value→body/patch/patchBody 파생 로직을 중복시키지 않으려고 그
// 화면들도 이 컴포넌트를 계속 쓴다.

const EMPTY_BODY: CmsPostBody = {
  body: [],
  key_points: [],
  keywords: [],
  images: [],
};

interface Props {
  value: CmsPostInput;
  onChange: (v: CmsPostInput) => void;
  mode?: "post" | "letter" | "webtoon" | "video";
  /** mode="post" 전용 — 리치텍스트 에디터 인스턴스. 툴바를 페이지 최상단에
   * 따로 두려고(2026-08-09) 페이지가 useRichTextEditor로 만들어 내려준다.
   * Tiptap의 useEditor는 초기화 전 null을 준다. */
  editor?: Editor | null;
  uploadError?: string | null;
}

export function PostForm({ value, onChange, mode = "post", editor, uploadError }: Props) {
  const body = value.body_inline ?? EMPTY_BODY;
  const patch = (p: Partial<CmsPostInput>) => onChange({ ...value, ...p });
  const patchBody = (p: Partial<CmsPostBody>) =>
    patch({ body_inline: { ...body, ...p } });

  const modeProps = { value, body, patch, patchBody };

  if (mode === "post") {
    if (!editor) return null; // 에디터 인스턴스가 아직 준비 전 — 페이지 쪽 로딩 상태에 맡긴다.
    return <PostMode {...modeProps} editor={editor} uploadError={uploadError} />;
  }
  if (mode === "webtoon") return <WebtoonMode {...modeProps} />;
  if (mode === "video") return <VideoMode {...modeProps} />;
  return <LetterMode {...modeProps} />;
}
