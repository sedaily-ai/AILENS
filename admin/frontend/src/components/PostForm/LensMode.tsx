"use client";

import { DatePickerField } from "@/components/DatePickerField";
import { CoverImageField } from "@/components/CoverImageField";
import { PostFormShell } from "./PostFormShell";
import { MetaField, MetaDivider } from "./MetaField";
import { LABEL, type ModeProps } from "./shared";
import { LineList } from "./LineList";
import type { CmsLensItem } from "@/lib/types";

// mode="lens" — "오늘의 이슈, 4가지 시선"(2026-08-12). Instagram @ailens
// 카드뉴스 포맷(다크톤, "시선 ①~④" 고정 라벨 + Q&A + 불릿) 그대로 웹에
// 옮긴다. 관리자가 직접 작성(퀴즈와 같은 이유로 AI 반자동화 없음) — 하루
// 하나의 이슈를 원인이 궁금한 사람/사람이 먼저 보이는 사람/내 일이 걱정되는
// 사람/숫자부터 찾는 사람, 4개 고정 렌즈로 훑는다. 라벨·순서는 고정이라
// 관리자가 매번 새로 짓지 않고 질문+불릿만 채우면 된다.
export const LENS_LABELS = [
  "시선 ① — 원인이 궁금한 사람",
  "시선 ② — 사람이 먼저 보이는 사람",
  "시선 ③ — 내 일이 걱정되는 사람",
  "시선 ④ — 숫자부터 찾는 사람",
] as const;

export const EMPTY_LENSES: CmsLensItem[] = LENS_LABELS.map((label) => ({
  label,
  question: "",
  bullets: [],
}));

export function LensMode({ value, body, patch, patchBody }: ModeProps) {
  const lenses = body.lenses && body.lenses.length === 4 ? body.lenses : EMPTY_LENSES;

  const patchLens = (i: number, p: Partial<CmsLensItem>) => {
    const next = lenses.map((l, idx) => (idx === i ? { ...l, ...p } : l));
    patchBody({ lenses: next });
  };

  return (
    <PostFormShell
      className="space-y-3"
      coverImage={{
        value: value.cover_image_url ?? null,
        onChange: (url) => patch({ cover_image_url: url }),
        fallbackHint: "표지·시선 카드 배경으로 함께 쓰입니다.",
      }}
      headline={value.headline ?? ""}
      onHeadlineChange={(v) => patch({ headline: v })}
      headlinePlaceholder="예: 카카오뱅크 주담대 접수가 마감되기까지 걸린 시간"
      subtitle={value.subtitle ?? ""}
      onSubtitleChange={(v) => patch({ subtitle: v })}
      subtitlePlaceholder="핵심요약 — 무슨 일이 있었는지 2~3문장으로"
      subtitleRows={4}
      metaRow={
        <>
          <MetaField label="발행일">
            <DatePickerField
              value={value.publish_date ?? ""}
              onChange={(v) => patch({ publish_date: v })}
            />
          </MetaField>
          <MetaDivider />
          {/* 원문 URL — 서울경제 원본 취재 기사 링크(2026-08-13, SEO/GEO/AEO
              감사). 없어도 발행은 된다 — 있으면 상세 페이지에 "원문 보기"
              링크와 JSON-LD citation으로 노출된다. */}
          <MetaField label="원문 URL">
            <input
              value={value.source_url ?? ""}
              onChange={(e) => patch({ source_url: e.target.value || null })}
              placeholder="https://www.sedaily.com/..."
              className="ui-input rounded-lg px-2 py-0.5 text-[12.5px]"
              style={{ width: 220 }}
            />
          </MetaField>
        </>
      }
    >
      <div className="space-y-5 px-6 py-5">
        {/* 순수 기사 사진(2026-08-14 신설) — 위 표지(cover_image_url)는 인스타
            카드뉴스 완성형 그래픽이라 헤드라인·날짜가 이미지 안에 그려져 있다.
            웹 홈·목록·상세의 "사진 칸"에 그걸 쓰면 우리 HTML 헤드라인과 글자가
            중복되고 광고 문구까지 노출돼서, 텍스트 없는 사진을 따로 받는다.
            비워두면 웹에서는 사진 칸을 아예 표시하지 않는다(중복 노출 방지). */}
        <div>
          <p className={LABEL}>
            기사 사진 (텍스트 없는 원본)
            <span className="ml-2 font-normal text-gray-500">
              웹 카드의 사진 칸에 쓰입니다. 글자·로고가 없는 사진을 넣어주세요. 비우면 사진 없이 텍스트만 나갑니다.
            </span>
          </p>
          <CoverImageField
            value={body.photo_image_url ?? null}
            onChange={(url) => patchBody({ photo_image_url: url })}
            fallbackHint="비워두면 웹에서 사진 칸 없이 텍스트만 노출됩니다."
          />
        </div>

        <p className={LABEL}>
          4가지 시선
          <span className="ml-2 font-normal text-gray-500">
            라벨·순서는 고정 — 질문(따옴표 안 문장)과 사실 불릿만 채우면 됩니다.
          </span>
        </p>
        {lenses.map((lens, i) => (
          <div key={lens.label} className="rounded-xl border border-gray-200 p-4 space-y-3">
            <p className="text-sm font-semibold text-gray-900">{lens.label}</p>
            <div>
              <label className={LABEL}>질문</label>
              <input
                value={lens.question}
                onChange={(e) => patchLens(i, { question: e.target.value })}
                placeholder={i === 0 ? '예: "왜 갑자기 대출이 막혔지?"' : "그 시선이 궁금해할 질문 한 줄"}
                className="ui-input w-full rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <LineList
              label="사실 불릿"
              hint="한 줄에 한 항목, 보통 3~4개"
              items={lens.bullets}
              onChange={(v) => patchLens(i, { bullets: v })}
              rows={4}
              placeholder={"1) 사실 하나\n2) 사실 둘"}
            />
          </div>
        ))}
      </div>
    </PostFormShell>
  );
}
