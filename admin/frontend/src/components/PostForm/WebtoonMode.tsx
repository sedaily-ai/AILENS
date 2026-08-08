import { LABEL, type ModeProps } from "./shared";
import { WebtoonPanelsEditor } from "./WebtoonPanelsEditor";
import { WebtoonLivePreview } from "./WebtoonLivePreview";

// mode="webtoon" — 연재 웹툰 파일럿(2026-08-06). 컷(이미지+캡션)을 순서대로
// 쌓는 게 전부라 트렌드 카드보다도 가볍다. 그림은 GPT 등으로 미리 만들어와
// 업로드만 하면 된다.
export function WebtoonMode({ value, body, patch, patchBody }: ModeProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,640px)_1fr] gap-8 items-start">
      <div className="space-y-4">
        <div className="ui-card rounded-2xl p-5 space-y-4">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px]">
            <label className="flex items-center gap-1.5 text-gray-400">
              발행일
              <input
                type="date"
                value={value.publish_date ?? ""}
                onChange={(e) => patch({ publish_date: e.target.value })}
                className="border-0 bg-transparent font-medium text-gray-700 outline-none"
              />
            </label>
          </div>

          <div>
            <label className={LABEL}>제목 *</label>
            <input
              value={value.headline ?? ""}
              onChange={(e) => patch({ headline: e.target.value })}
              placeholder="예: 관세전쟁 1화 — 협상 테이블의 그 남자"
              className="ui-input w-full rounded-lg px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className={LABEL}>줄거리 요약</label>
            <textarea
              value={value.subtitle ?? ""}
              onChange={(e) => patch({ subtitle: e.target.value })}
              rows={2}
              placeholder="목록 카드에 들어갈 한두 문장"
              className="ui-input w-full rounded-lg px-3 py-2.5 text-sm leading-relaxed"
            />
          </div>
        </div>

        <div>
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
      </div>

      {/* 데스크톱에서만 나란히 — 좁은 화면은 폼 아래로 자연스럽게 스택. */}
      <div className="hidden lg:block sticky top-20">
        <WebtoonLivePreview
          title={value.headline ?? ""}
          excerpt={value.subtitle ?? ""}
          panels={body.images}
        />
      </div>
    </div>
  );
}
