import { LABEL, type ModeProps } from "./shared";

const SECTION_LABEL: Record<"trend" | "column", string> = {
  trend: "요즘 화제의 경제 이슈",
  column: "이번 주 인기 칼럼",
};

// mode="trend_card" — 홈 피드의 "요즘 화제의 경제 이슈"/"이번 주 인기 칼럼"
// 카드. letters 처럼 무거운 리치텍스트 본문이 아니라 제목+짧은 요약뿐이라
// 폼도 그만큼 가볍게 — 발행일 한 줄 + 섹션 토글 + 제목 + 라벨 + 요약이 전부.
export function TrendCardMode({ value, body, patch, patchBody }: ModeProps) {
  const section = body.section ?? "trend";
  return (
    <div className="max-w-[640px] mx-auto space-y-4">
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
          <span className="h-3.5 w-px bg-gray-300" />
          <div className="flex gap-1">
            {(Object.keys(SECTION_LABEL) as Array<"trend" | "column">).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => patchBody({ section: s })}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                  section === s
                    ? "bg-blue-50 text-blue-700"
                    : "text-gray-500 hover:bg-gray-50"
                }`}
              >
                {SECTION_LABEL[s]}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className={LABEL}>제목 *</label>
          <input
            value={value.headline ?? ""}
            onChange={(e) => patch({ headline: e.target.value })}
            placeholder="예: 코스피 6600 돌파, 이번엔 진짜 다른가"
            className="ui-input w-full rounded-lg px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className={LABEL}>
            라벨
            <span className="ml-2 font-normal text-gray-500">
              {section === "trend" ? "카테고리 (예: 증시, 환율·금리)" : "연재명 (예: 투자 인사이트)"}
            </span>
          </label>
          <input
            value={body.category ?? ""}
            onChange={(e) => patchBody({ category: e.target.value })}
            className="ui-input w-full rounded-lg px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className={LABEL}>요약</label>
          <textarea
            value={value.subtitle ?? ""}
            onChange={(e) => patch({ subtitle: e.target.value })}
            rows={3}
            placeholder="카드에 들어갈 두어 문장 요약"
            className="ui-input w-full rounded-lg px-3 py-2.5 text-sm leading-relaxed"
          />
        </div>
      </div>
    </div>
  );
}
