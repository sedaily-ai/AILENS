import { RichTextEditor } from "@/components/RichTextEditor";
import { CoverImageField } from "@/components/CoverImageField";
import { DatePickerField } from "@/components/DatePickerField";
import { CustomSelect } from "@/components/CustomSelect";
import type { ModeProps } from "./shared";

// mode="post": Medium/Notion 식 — 제목이 문서 맨 위에 크게, 메타정보(발행일·
// 에디터·채널)는 얇은 한 줄로 축소, 본문 에디터가 화면 대부분을 차지한다.
// 카드 3개로 쪼개져 있던 옛 레이아웃(제목 카드 / 본문 카드 / 이미지 카드)을
// 하나의 이어진 문서로 합쳐서 "폼 작성" 느낌을 줄였다.
export function PostMode({ value, body, patch, patchBody }: ModeProps) {
  return (
    <div className="max-w-[760px] mx-auto space-y-3">
      <CoverImageField
        value={value.cover_image_url ?? null}
        onChange={(url) => patch({ cover_image_url: url })}
        fallbackHint="AI LENS 기본 로고가 대신 나갑니다."
      />
      {/* overflow-hidden 이었다가 제거 — 카드 안에 스크롤 시 고정되는 글쓰기
          도구 툴바가 들어있는데, overflow가 visible이 아닌 조상이 하나라도
          있으면 그 안의 position:sticky가 전부 무력화된다(2026-08-07,
          "스크롤 내려도 글쓰기 도구는 고정" 요청이 안 먹히던 원인). 카드
          테두리 자체는 각 진 배경을 칠하는 자식이 없어 클리핑 없이도
          둥근 모서리가 그대로 유지된다. */}
      <div className="ui-card rounded-2xl">
        <div className="rounded-t-2xl px-6 pt-6 pb-3">
          <input
            value={value.headline ?? ""}
            onChange={(e) => patch({ headline: e.target.value })}
            placeholder="제목을 입력하세요"
            className="font-display w-full border-0 outline-none bg-transparent text-[28px] font-bold leading-tight text-gray-900 placeholder-gray-300"
          />
          <input
            value={value.subtitle ?? ""}
            onChange={(e) => patch({ subtitle: e.target.value })}
            placeholder="부제 (선택)"
            className="mt-2 w-full border-0 outline-none bg-transparent text-[15px] text-gray-500 placeholder-gray-300"
          />
        </div>

        {/* 회색 배경 띠였던 걸 지웠다 — 옅은 구분선 하나로만, 폼처럼
            보이지 않고 미디엄/노션의 "속성 줄"처럼 본문에 곁들이는
            정도로(2026-08-07 "깔끔하고 모던하게" 요청). */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-gray-100 px-6 py-2 text-[12.5px] text-gray-400">
          <label className="flex items-center gap-1.5">
            발행일
            <DatePickerField
              value={value.publish_date ?? ""}
              onChange={(v) => patch({ publish_date: v })}
            />
          </label>
          <span className="h-3 w-px bg-gray-200" />
          <label className="flex items-center gap-1.5">
            분류
            <CustomSelect
              value={body.section ?? ""}
              onChange={(v) => patchBody({ section: (v || undefined) as "trend" | "column" | undefined })}
              options={[
                { value: "", label: "일반 레터" },
                { value: "trend", label: "트렌드" },
                { value: "column", label: "인기 칼럼" },
              ]}
            />
          </label>
          {/* 트렌드/인기 칼럼으로 태그하면 홈 화면 카드 상단 라벨(예: "증시",
              "투자 인사이트")도 admin이 직접 정할 수 있어야 한다 — 안 정하면
              이 값이 비어 카드에 기본값("AI LENS")이 그대로 노출된다
              (2026-08-07 확인, mode="trend_card" 쪽 카테고리 입력과 동일 필드). */}
          {(body.section === "trend" || body.section === "column") && (
            <>
              <span className="h-3 w-px bg-gray-200" />
              <label className="flex items-center gap-1.5">
                {body.section === "trend" ? "카테고리" : "연재명"}
                <input
                  value={body.category ?? ""}
                  onChange={(e) => patchBody({ category: e.target.value })}
                  placeholder={body.section === "trend" ? "예: 증시, 환율·금리" : "예: 투자 인사이트"}
                  className="w-28 border-0 bg-transparent font-medium text-gray-600 outline-none placeholder-gray-300"
                />
              </label>
            </>
          )}
        </div>

        <div className="border-t border-gray-100">
          <RichTextEditor
            value={body.body_html ?? ""}
            onChange={(html) => patchBody({ body_html: html })}
            placeholder="본문을 써보세요. 이미지는 끌어놓거나 붙여넣으면 그 자리에 들어갑니다."
          />
        </div>
      </div>

      <p className="px-1 text-xs text-gray-400">
        핵심 정리·키워드·닫는 줄은 본문에 <b className="mr-1 text-gray-500">H2</b>소제목으로
        &ldquo;핵심 정리&rdquo; / &ldquo;키워드&rdquo; / &ldquo;닫는 줄&rdquo;이라고 쓰면 저장 시 자동으로 나뉩니다.
      </p>
    </div>
  );
}
