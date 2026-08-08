import { LABEL } from "./shared";

// 문단마다 박스를 늘어놓던 옛 UI 대신, 빈 줄로 문단을 가르는 텍스트영역
// 하나로 — AI 레터 본문(body[] + ■/[라벨]/Q.A./![]() 마커)은 이 plain
// 포맷을 그대로 유지해야 하므로 리치텍스트로 못 바꾼다.
export function PlainBodyEditor({
  items,
  onChange,
}: {
  items: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <div>
      <label className={LABEL}>
        본문 *
        <span className="ml-2 font-normal text-gray-500">
          빈 줄로 문단을 나누세요. ■ 헤더 / [라벨] 콜아웃 / Q. A. FAQ 마커,
          ![](url) 이미지 마커를 그대로 씁니다.
        </span>
      </label>
      <textarea
        value={items.join("\n\n")}
        onChange={(e) => onChange(e.target.value.split(/\n\n+/))}
        rows={16}
        placeholder={"첫 문단...\n\n빈 줄 하나 띄우고 다음 문단..."}
        className="ui-input w-full rounded-lg px-3 py-2.5 text-sm leading-relaxed font-mono"
      />
    </div>
  );
}
