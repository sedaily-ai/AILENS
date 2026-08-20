"use client";

import { useState } from "react";
import { DatePickerField } from "@/components/DatePickerField";
import { CoverImageField } from "@/components/CoverImageField";
import { PostFormShell } from "./PostFormShell";
import { MetaField, MetaDivider } from "./MetaField";
import { LABEL, type ModeProps } from "./shared";
import { LineList } from "./LineList";
import { WebtoonPanelsEditor } from "./WebtoonPanelsEditor";
import { AdminApiError, adminApi } from "@/lib/adminClient";
import { useToast } from "@/components/Toast";
import type { CmsLensItem } from "@/lib/types";

// YouTube 링크 → 영상 ID(VideoMode.tsx와 동일 로직, admin/frontend 안에서도
// 중복 — 서비스 프런트와의 중복(shared/lib/videoEmbed.ts)과 같은 이유로
// 감수한다). 영상·팟캐스트 두 탭 모두 이 미리보기를 쓴다.
function extractYouTubeId(url: string): string | null {
  const m = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
  );
  return m ? m[1] : null;
}

// mode="lens" — "오늘의 이슈, 4가지 시선"(2026-08-12) → "4개 포맷 편집"으로
// 재구성(2026-08-19). 원래는 "원인이 궁금한 사람/사람이 먼저 보이는 사람/
// 내 일이 걱정되는 사람/숫자부터 찾는 사람" 4개 고정 독자-관점 라벨로,
// 관리자가 매번 새로 짓지 않고 질문+불릿만 채우면 됐다.
//
// service/frontend의 공개 페이지(LensViewClient.tsx)는 애초에 이 4개 슬롯을
// 인덱스 기준으로 "레터/웹툰(카드뉴스로 시작했던 것)/팟캐스트/영상" 4개
// 출력 포맷으로 다시 해석해 보여주고 있었다(shared/constants/
// lensPerspectives.ts의 LENS_FORMATS, 2026-08-18 "국장님 지시"). 그런데
// admin의 라벨·질문 문구는 여전히 "누구의 시선인가"를 묻고 있어서 관리자
// 입장에서 자신이 채우는 게 실제로 어떤 포맷으로 나가는지 알 수 없었다.
// 이번 개편으로 admin 라벨 자체를 실제 출력 포맷(레터/웹툰/팟캐스트/영상)
// 이름으로 맞추고, 각 포맷의 프롬프트(admin/frontend/src/app/(authenticated)/
// posts,webtoon,video,podcast의 "프롬프트" 버튼과 같은 DB, PROMPT#<channel>/
// published)를 그대로 가져와 "AI로 생성" 버튼으로 즉석에서 결과를 보여준다
// (POST /admin/prompts/{category}/{name}/test, PromptDrawer와 동일 백엔드).
// 인덱스 순서·타이틀·독자 관점 UI(LENS_PERSPECTIVES) 자체는 이미 승인된
// 디자인이라 손대지 않았다 — 여긴 그 슬롯에 무엇을 채우는지 안내하는 admin
// 쪽 라벨만 바꾼다.
export const LENS_LABELS = ["레터", "웹툰", "팟캐스트", "영상"] as const;

// 프롬프트 DB의 category(=channel) — LENS_LABELS와 같은 인덱스 순서.
// admin/backend/routes/prompts.py는 category에 별도 허용 목록이 없어
// letters/webtoon/podcast/video 그대로 쓸 수 있다.
const FORMAT_CHANNELS = ["letters", "webtoon", "podcast", "video"] as const;

const FORMAT_HINTS = [
  "구조와 인과 중심의 전체 글. 문단으로 쓴다.",
  "컷(이미지+캡션)을 순서대로 올린다 — 웹툰 화면과 같은 방식.",
  "1인 화자 대본. 오디오·영상 링크가 있으면 홈 플레이어와 같은 방식으로 붙인다.",
  "컷별 각본을 불릿으로 정리하고, 실제 영상 링크가 있으면 붙인다.",
] as const;

export const EMPTY_LENSES: CmsLensItem[] = LENS_LABELS.map((label) => ({
  label,
  question: "",
  bullets: [],
  paragraphs: [],
}));

export function LensMode({ value, body, patch, patchBody }: ModeProps) {
  const toast = useToast();
  const lenses = body.lenses && body.lenses.length === 4 ? body.lenses : EMPTY_LENSES;
  const [tab, setTab] = useState(0);
  const [article, setArticle] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState<string | null>(null);

  const patchLens = (i: number, p: Partial<CmsLensItem>) => {
    const next = lenses.map((l, idx) => (idx === i ? { ...l, ...p } : l));
    patchBody({ lenses: next });
  };

  const generate = async () => {
    if (!article.trim()) {
      toast.show("기사 원문을 붙여넣어 주세요", "error");
      return;
    }
    setGenerating(true);
    setGenerated(null);
    try {
      const channel = FORMAT_CHANNELS[tab];
      const { active_content } = await adminApi.getPrompt(channel, "published");
      if (!active_content.trim()) {
        toast.show(
          `${LENS_LABELS[tab]} 프롬프트가 비어 있습니다 — 먼저 ${channel} 화면에서 프롬프트를 채워주세요`,
          "error"
        );
        return;
      }
      const { output } = await adminApi.testPrompt(channel, "published", active_content, article);
      setGenerated(output);
    } catch (err) {
      toast.show(
        `생성 실패: ${err instanceof AdminApiError ? err.message : "알 수 없는 오류"}`,
        "error"
      );
    } finally {
      setGenerating(false);
    }
  };

  const lens = lenses[tab];

  return (
    <PostFormShell
      className="space-y-3"
      coverImage={{
        value: value.cover_image_url ?? null,
        onChange: (url) => patch({ cover_image_url: url }),
        fallbackHint: "표지·포맷 카드 배경으로 함께 쓰입니다.",
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
        {/* 순수 기사 사진 — 이전과 동일. */}
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

        {/* 기사 원문 — 4개 포맷 전부가 공유하는 AI 생성용 원본. 저장 대상이
            아니다(DB에 안 들어감) — 탭을 옮겨도 유지되도록 컴포넌트 로컬
            상태로만 둔다. */}
        <div>
          <label className={LABEL}>
            기사 원문 (AI 생성용)
            <span className="ml-2 font-normal text-gray-500">
              여기 붙여넣고 각 포맷 탭에서 &ldquo;AI로 생성&rdquo;을 누르면 그 포맷의
              프롬프트로 초안을 만들어줍니다. 저장되지 않는 임시 입력입니다.
            </span>
          </label>
          <textarea
            value={article}
            onChange={(e) => setArticle(e.target.value)}
            rows={6}
            placeholder="기사 원문을 붙여넣으세요"
            className="ui-input w-full rounded-lg px-3 py-2.5 text-sm leading-relaxed"
          />
        </div>

        <div>
          <p className={LABEL}>
            4개 포맷{" "}
            <span className="ml-2 font-normal text-gray-500">
              이왕이면 순서대로(레터 → 웹툰 → 팟캐스트 → 영상) 편집해 보세요.
            </span>
          </p>

          {/* 탭 — "이왕이면 4개의 탭을 주고 순서대로 편집"(2026-08-19 요청). */}
          <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
            {LENS_LABELS.map((label, i) => (
              <button
                key={label}
                type="button"
                onClick={() => {
                  setTab(i);
                  setGenerated(null);
                }}
                className={`flex-1 rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${
                  tab === i ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="mt-3 rounded-xl border border-gray-200 p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-gray-500">{FORMAT_HINTS[tab]}</p>
              <button
                type="button"
                onClick={() => void generate()}
                disabled={generating}
                className="ui-btn ui-btn-primary shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold"
              >
                {generating ? "생성 중..." : "AI로 생성"}
              </button>
            </div>

            {generated && (
              <div className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg bg-gray-50 p-3 text-[13px] leading-relaxed text-gray-700">
                {generated}
              </div>
            )}

            <div>
              <label className={LABEL}>제목·질문</label>
              <input
                value={lens.question}
                onChange={(e) => patchLens(tab, { question: e.target.value })}
                placeholder={tab === 0 ? "레터 제목" : `${LENS_LABELS[tab]} 카드의 짧은 제목`}
                className="ui-input w-full rounded-lg px-3 py-2 text-sm"
              />
            </div>

            {/* 포맷별 실제 미디어 입력 — "웹툰 탭 누르면 웹툰을 넣을 수
                있어야 한다"(2026-08-19 요청). 각자 다른 채널의 편집 화면과
                같은 컴포넌트·패턴을 그대로 재사용하되, 저장 위치만 이
                lens 슬롯(CmsLensItem)이다 — channels:["webtoon"/"video"]
                글의 body_inline과는 완전히 별개 공간. */}
            {tab === 0 && (
              <LineList
                label="본문 (문단)"
                hint="빈 줄로 문단을 나눕니다"
                items={lens.paragraphs ?? []}
                onChange={(v) => patchLens(tab, { paragraphs: v })}
                rows={10}
                placeholder={"첫 문단\n\n두 번째 문단"}
              />
            )}

            {tab === 1 && (
              <div>
                <label className={LABEL}>
                  컷
                  <span className="ml-2 font-normal text-gray-500">
                    위에서 아래로 순서대로 보여집니다. webtoon/edit과 같은 편집기입니다.
                  </span>
                </label>
                <WebtoonPanelsEditor
                  panels={lens.images ?? []}
                  onChange={(v) => patchLens(tab, { images: v })}
                />
              </div>
            )}

            {tab === 2 && (
              <div>
                <label className={LABEL}>
                  미디어 링크
                  <span className="ml-2 font-normal text-gray-500">
                    홈 플레이어와 같은 방식 — YouTube 등 오디오/영상 링크.
                  </span>
                </label>
                <input
                  type="url"
                  value={lens.media_url ?? ""}
                  onChange={(e) => patchLens(tab, { media_url: e.target.value })}
                  placeholder="https://www.youtube.com/watch?v=..."
                  className="ui-input w-full rounded-lg px-3 py-2 text-sm"
                />
              </div>
            )}

            {tab === 3 && (
              <div>
                <label className={LABEL}>영상 URL</label>
                <input
                  type="url"
                  value={lens.video_url ?? ""}
                  onChange={(e) => patchLens(tab, { video_url: e.target.value })}
                  placeholder="https://www.youtube.com/watch?v=... 또는 youtu.be/..."
                  className="ui-input w-full rounded-lg px-3 py-2 text-sm"
                />
                {(() => {
                  const videoId = extractYouTubeId(lens.video_url ?? "");
                  return videoId ? (
                    <div className="mt-3 aspect-video w-full max-w-[280px] overflow-hidden rounded-lg bg-black">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`https://img.youtube.com/vi/${videoId}/hqdefault.jpg`}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    </div>
                  ) : lens.video_url ? (
                    <p className="mt-2 text-xs text-amber-600">
                      YouTube 링크가 아니면 썸네일 미리보기가 안 뜰 수 있어요 — 저장은 그대로 됩니다.
                    </p>
                  ) : null;
                })()}
              </div>
            )}

            {tab !== 0 && (
              <LineList
                label={tab === 1 ? "요약 문구 (이미지 없을 때 대체 텍스트)" : tab === 2 ? "챕터" : "타임라인"}
                hint="한 줄에 한 항목, 보통 3~5개"
                items={lens.bullets}
                onChange={(v) => patchLens(tab, { bullets: v })}
                rows={6}
                placeholder={tab === 1 ? "훅 — 캡션" : "1) 사실 하나\n2) 사실 둘"}
              />
            )}

            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={() => {
                  setTab((t) => Math.max(0, t - 1));
                  setGenerated(null);
                }}
                disabled={tab === 0}
                className="ui-btn ui-btn-ghost rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-40"
              >
                ← 이전
              </button>
              <button
                type="button"
                onClick={() => {
                  setTab((t) => Math.min(3, t + 1));
                  setGenerated(null);
                }}
                disabled={tab === 3}
                className="ui-btn ui-btn-ghost rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-40"
              >
                다음 →
              </button>
            </div>
          </div>
        </div>
      </div>
    </PostFormShell>
  );
}
