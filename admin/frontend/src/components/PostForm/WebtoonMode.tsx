"use client";

import { useState } from "react";
import { DatePickerField } from "@/components/DatePickerField";
import { PostFormShell } from "./PostFormShell";
import { MetaField } from "./MetaField";
import { LABEL, type ModeProps } from "./shared";
import { WebtoonPanelsEditor } from "./WebtoonPanelsEditor";
import { WebtoonLivePreview } from "./WebtoonLivePreview";

// mode="webtoon" — 연재 웹툰 파일럿(2026-08-06). 컷(이미지+캡션)을 순서대로
// 쌓는 게 전부라 트렌드 카드보다도 가볍다. 그림은 GPT 등으로 미리 만들어와
// 업로드만 하면 된다. 왼쪽 폼은 다른 탭과 같은 PostFormShell(2026-08-09
// 디자인 통일) — 컷 목록은 셸의 본문 슬롯에 들어간다.
//
// 2026-08-09 — 미리보기 접기 상태(collapsed)를 여기서 들고 그리드 칼럼 폭
// 자체를 바꾼다("접었는데 폼 칼럼이 안 넓어져서 빈 공간만 남는다" 지적).
// WebtoonLivePreview 안에서만 접었다 폈다 하면 그리드는 그대로라 접어도
// 아무 의미가 없었다 — 그리드를 소유한 이 컴포넌트가 상태도 같이 들고,
// 접히면 오른쪽 칼럼을 좁은 레일 폭(auto)으로, 폼 칼럼을 1fr로 바꿔서
// 남는 폭을 실제로 가져가게 했다.
export function WebtoonMode({ value, body, patch, patchBody }: ModeProps) {
  const [previewCollapsed, setPreviewCollapsed] = useState(false);

  return (
    <div
      className={`grid grid-cols-1 gap-8 items-start ${
        previewCollapsed ? "lg:grid-cols-[1fr_auto]" : "lg:grid-cols-[minmax(0,760px)_1fr]"
      }`}
    >
      <PostFormShell
        className="space-y-3"
        // _shape_webtoon(cms_posts_public.py)이 cover_image_url을 명시적으로
        // 쓰고, 안 정하면 첫 컷 이미지로 자동 폴백한다 — 그래서 여기 커버
        // 필드는 트렌드 카드와 달리 실제 효과가 있다(선택 입력, 비우면 기존
        // 동작 그대로 첫 컷 사용).
        coverImage={{
          value: value.cover_image_url ?? null,
          onChange: (url) => patch({ cover_image_url: url }),
          fallbackHint: "첫 번째 컷 이미지가 대신 쓰입니다.",
        }}
        headline={value.headline ?? ""}
        onHeadlineChange={(v) => patch({ headline: v })}
        headlinePlaceholder="예: 관세전쟁 1화 — 협상 테이블의 그 남자"
        subtitle={value.subtitle ?? ""}
        onSubtitleChange={(v) => patch({ subtitle: v })}
        subtitlePlaceholder="목록 카드에 들어갈 한두 문장"
        subtitleRows={3}
        metaRow={
          <MetaField label="발행일">
            <DatePickerField
              value={value.publish_date ?? ""}
              onChange={(v) => patch({ publish_date: v })}
            />
          </MetaField>
        }
      >
        <div className="space-y-3 px-6 py-5">
          <label className={LABEL}>
            컷
            <span className="ml-2 font-normal text-gray-500">
              위에서 아래로 순서대로 보여집니다. 컷마다 캡션(대사)을 달 수 있어요.
            </span>
          </label>
          <WebtoonPanelsEditor
            panels={body.images}
            onChange={(v) => patchBody({ images: v })}
          />
        </div>
      </PostFormShell>

      {/* 데스크톱에서만 나란히 — 좁은 화면은 폼 아래로 자연스럽게 스택. */}
      <div className="hidden lg:block sticky top-20">
        <WebtoonLivePreview
          title={value.headline ?? ""}
          excerpt={value.subtitle ?? ""}
          panels={body.images}
          collapsed={previewCollapsed}
          onToggleCollapse={() => setPreviewCollapsed((v) => !v)}
        />
      </div>
    </div>
  );
}
