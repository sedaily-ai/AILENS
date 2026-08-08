"use client";

import type { CmsPostBody, CmsPostInput } from "@/lib/types";
import { PostMode } from "./PostMode";
import { TrendCardMode } from "./TrendCardMode";
import { WebtoonMode } from "./WebtoonMode";
import { VideoMode } from "./VideoMode";
import { LetterMode } from "./LetterMode";

// 노출 채널 선택 UI는 뺐다 — "오늘의 1면"/"기사 피드"는 프론트가 아직 CMS 글을
// 안 읽어서 실제로 아무 효과가 없었다(2026-08-04 확인). 모든 글은 유일하게
// 작동하는 "letters" 채널로 고정 발행한다. posts/edit/page.tsx 의 기본값 참조.

const EMPTY_BODY: CmsPostBody = {
  body: [],
  key_points: [],
  keywords: [],
  images: [],
};

interface Props {
  value: CmsPostInput;
  onChange: (v: CmsPostInput) => void;
  /**
   * "letter" 면 발행일·에디터·채널 선택을 숨긴다. AI 레터는 그 값들이
   * 파이프라인에서 정해지고 편집 대상이 아니다 (backend _UPDATABLE 과 일치).
   */
  mode?: "post" | "letter" | "trend_card" | "webtoon" | "video";
}

export function PostForm({ value, onChange, mode = "post" }: Props) {
  const body = value.body_inline ?? EMPTY_BODY;
  const patch = (p: Partial<CmsPostInput>) => onChange({ ...value, ...p });
  const patchBody = (p: Partial<CmsPostBody>) =>
    patch({ body_inline: { ...body, ...p } });

  const modeProps = { value, body, patch, patchBody };

  if (mode === "post") return <PostMode {...modeProps} />;
  if (mode === "trend_card") return <TrendCardMode {...modeProps} />;
  if (mode === "webtoon") return <WebtoonMode {...modeProps} />;
  if (mode === "video") return <VideoMode {...modeProps} />;
  return <LetterMode {...modeProps} />;
}
