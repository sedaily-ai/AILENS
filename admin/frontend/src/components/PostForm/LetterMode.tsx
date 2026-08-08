import { LABEL, type ModeProps } from "./shared";
import { PlainBodyEditor } from "./PlainBodyEditor";
import { LineList } from "./LineList";
import { stringifyKeyword, parseKeywordLine } from "./bodyUtils";

/**
 * mode="letter" — AI 레터는 발행일·에디터·채널 편집 불가(파이프라인 소관)라
 * 기존 폼 레이아웃 그대로 유지. 본문 에디터도 갈린다 — AI 레터는 Editor
 * Pick 이 만드는 body[] + 마커(■/[라벨]/Q.A./![]()) 형식을 그대로 유지해야
 * 해서 plain 텍스트 에디터를 쓰고, 사람이 처음부터 쓰는 CMS 글만
 * 리치텍스트(PostMode, body_html)로 간다.
 */
export function LetterMode({ value, body, patch, patchBody }: ModeProps) {
  return (
    <div className="space-y-6">
      <div className="ui-card rounded-2xl p-5 space-y-4">
        <div>
          <label className={LABEL}>제목 *</label>
          <input
            value={value.headline ?? ""}
            onChange={(e) => patch({ headline: e.target.value })}
            className="ui-input w-full rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className={LABEL}>부제</label>
          <input
            value={value.subtitle ?? ""}
            onChange={(e) => patch({ subtitle: e.target.value })}
            className="ui-input w-full rounded-lg px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="ui-card rounded-2xl p-5 space-y-5">
        <PlainBodyEditor items={body.body} onChange={(v) => patchBody({ body: v })} />
        <LineList
          label="핵심 정리"
          hint="한 줄에 한 항목"
          items={body.key_points}
          onChange={(v) => patchBody({ key_points: v })}
          rows={4}
          placeholder={"핵심 포인트 1\n핵심 포인트 2"}
        />
        <LineList
          label="키워드"
          hint="한 줄에 하나, 용어: 설명 (설명 생략 가능)"
          items={body.keywords.map(stringifyKeyword)}
          onChange={(v) => patchBody({ keywords: v.map(parseKeywordLine) })}
          rows={4}
          placeholder={"기준금리: 중앙은행이 결정하는 정책금리\n환율"}
        />
        <div>
          <label className={LABEL}>닫는 줄</label>
          <input
            value={value.closing_line ?? ""}
            onChange={(e) => patch({ closing_line: e.target.value })}
            className="ui-input w-full rounded-lg px-3 py-2 text-sm"
          />
        </div>
      </div>
    </div>
  );
}
