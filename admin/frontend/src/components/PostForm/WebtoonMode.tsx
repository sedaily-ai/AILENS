"use client";

import { useEffect, useState } from "react";
import { DatePickerField } from "@/components/DatePickerField";
import { CustomSelect } from "@/components/CustomSelect";
import { WEBTOON_CATEGORIES } from "@/lib/types";
import { adminApi } from "@/lib/adminClient";
import { PostFormShell } from "./PostFormShell";
import { MetaField, MetaDivider } from "./MetaField";
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
// 시리즈 제목 자동완성 목록(2026-08-21) — "여러 개의 독립된 웹툰 시리즈"로
// 재구조화하면서 매 편에 시리즈 제목을 자유 텍스트로 입력받는다. 마스터
// 테이블이 없어서 오타 하나로 같은 시리즈가 두 개로 갈라질 수 있다("관세전쟁"
// vs "관세 전쟁") — 기존에 실제로 쓰인 시리즈 제목을 datalist로 보여줘 그
// 위험을 줄인다. 목록은 채널 전체(최대 200건)를 훑어 만든다 — posts_repo가
// 이미 admin 화면(/webtoon)에서 쓰는 것과 같은 호출.
function useExistingSeriesTitles(): string[] {
  const [titles, setTitles] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    adminApi
      .listPosts({ channel: "webtoon", limit: 200 })
      .then((r) => {
        if (cancelled) return;
        const set = new Set<string>();
        for (const p of r.posts) {
          const t = p.body_inline?.series_title?.trim();
          if (t) set.add(t);
        }
        setTitles([...set].sort());
      })
      .catch(() => {
        /* 자동완성 실패는 조용히 무시 — 직접 타이핑은 여전히 가능하다. */
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return titles;
}

export function WebtoonMode({ value, body, patch, patchBody }: ModeProps) {
  const [previewCollapsed, setPreviewCollapsed] = useState(false);
  const seriesTitles = useExistingSeriesTitles();

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
          <>
            {/* 시리즈 제목(2026-08-21) — 같은 문자열을 쓴 편들이 하나의
                시리즈로 묶인다("여러 개의 독립된 웹툰 시리즈" 재구조화).
                비워두면 이 편 하나가 그 자체로 "단편" 시리즈가 된다(제목을
                시리즈명으로 프론트가 폴백). 시리즈 마스터 테이블이 없어
                오타가 곧 새 시리즈가 되므로, 기존에 쓰인 제목을 datalist로
                띄워 그대로 고르게 유도한다 — 강제하진 않는다(신작 시리즈는
                당연히 목록에 없어야 정상이다). */}
            <MetaField label="시리즈">
              <input
                list="webtoon-series-titles"
                value={body.series_title ?? ""}
                onChange={(e) => patchBody({ series_title: e.target.value || undefined })}
                placeholder="예: 관세전쟁"
                className="ui-input rounded-lg px-2 py-0.5 text-[12.5px]"
                style={{ width: 140 }}
              />
              <datalist id="webtoon-series-titles">
                {seriesTitles.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </MetaField>
            <MetaDivider />
            <MetaField label="발행일">
              <DatePickerField
                value={value.publish_date ?? ""}
                onChange={(v) => patch({ publish_date: v })}
              />
            </MetaField>
            <MetaDivider />
            {/* 카테고리(2026-08-21) — 증시/부동산/산업/금융·정책/국제/문화
                (2026-09-11 "재테크" 제거). ECON_CATEGORIES와 같은 라벨 세트로
                통일했다(경제 레터·웹툰이 같은 분류 체계를 쓰도록). 비워두면
                (미분류) 목록의 카테고리 칩에 안 잡히고 "전체"에만 나온다. */}
            <MetaField label="카테고리">
              <CustomSelect
                value={body.category ?? ""}
                onChange={(v) => patchBody({ category: v || undefined })}
                options={[
                  { value: "", label: "미분류" },
                  ...WEBTOON_CATEGORIES.map((c) => ({ value: c, label: c })),
                ]}
              />
            </MetaField>
            <MetaDivider />
            {/* 추천 순서(2026-08-21) — /webtoon 목록 "편집국 추천" 레일에
                올릴 편과 그 순서. 비워두면 추천에 안 올라간다(그래도 오늘의
                웹툰·경제 소식에는 정상 노출).

                원래 요청은 "인기 소식" 섹션이었는데 조회수 같은 지표가 시스템에
                없어서 인기 순위를 만들 수가 없다 — 최신순에 "인기"라고 이름만
                붙이는 대신 편집자가 직접 고르는 방식으로 바꿨다.

                필드는 새로 만들지 않고 home_player 재생 순서용으로 이미 있던
                display_order 를 그대로 쓴다(작은 값이 앞). */}
            <MetaField label="추천 순서">
              <input
                type="number"
                min={1}
                value={value.display_order ?? ""}
                onChange={(e) =>
                  patch({ display_order: e.target.value === "" ? null : Number(e.target.value) })
                }
                placeholder="없음"
                className="ui-input rounded-lg px-2 py-0.5 text-[12.5px]"
                style={{ width: 64 }}
              />
            </MetaField>
          </>
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
