"use client";

import { RichTextEditor } from "@/components/RichTextEditor";
import { CoverImageField } from "@/components/CoverImageField";
import type {
  CmsKeyword,
  CmsPostBody,
  CmsPostInput,
  MbtiGroup,
} from "@/lib/types";

// 노출 채널 선택 UI는 뺐다 — "오늘의 1면"/"기사 피드"는 프론트가 아직 CMS 글을
// 안 읽어서 실제로 아무 효과가 없었다(2026-08-04 확인). 모든 글은 유일하게
// 작동하는 "letters" 채널로 고정 발행한다. posts/edit/page.tsx 의 기본값 참조.

// 정본 4인 (CLAUDE.md — 민철/하은/준서/소율). 비우면 'AI LENS 편집팀' 명의.
const EDITORS: Array<{ id: string; group: MbtiGroup; label: string }> = [
  { id: "민철", group: "NT", label: "민철 (NT · 전략 분석)" },
  { id: "하은", group: "NF", label: "하은 (NF · 오피니언)" },
  { id: "준서", group: "ST", label: "준서 (ST · 팩트 큐레이션)" },
  { id: "소율", group: "SF", label: "소율 (SF · 트렌드)" },
];

const LABEL = "block text-xs font-semibold text-gray-700 mb-1.5";

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
   * 본문 에디터도 갈린다 — AI 레터는 Editor Pick 이 만드는 body[] + 마커
   * (■/[라벨]/Q.A./![]()) 형식을 그대로 유지해야 해서 plain 텍스트 에디터를
   * 쓰고, 사람이 처음부터 쓰는 CMS 글만 리치텍스트(Tiptap, body_html)로 간다.
   */
  mode?: "post" | "letter" | "trend_card";
}

const SECTION_LABEL: Record<"trend" | "column", string> = {
  trend: "요즘 화제의 경제 이슈",
  column: "이번 주 인기 칼럼",
};

// 문단마다 박스를 늘어놓던 옛 UI 대신, 빈 줄로 문단을 가르는 텍스트영역
// 하나로 — AI 레터 본문(body[] + ■/[라벨]/Q.A./![]() 마커)은 이 plain
// 포맷을 그대로 유지해야 하므로 리치텍스트로 못 바꾼다.
function PlainBodyEditor({
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

// 핵심 정리 / 키워드 — 한 줄에 한 항목. "+ 추가" 없이 줄바꿈만으로 늘고 준다.
function LineList({
  label,
  hint,
  items,
  onChange,
  rows = 4,
  placeholder,
}: {
  label: string;
  hint?: string;
  items: string[];
  onChange: (next: string[]) => void;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <div>
      <label className={LABEL}>
        {label}
        {hint && <span className="ml-2 font-normal text-gray-500">{hint}</span>}
      </label>
      <textarea
        value={items.join("\n")}
        onChange={(e) => onChange(e.target.value.split("\n"))}
        rows={rows}
        placeholder={placeholder}
        className="ui-input w-full rounded-lg px-3 py-2.5 text-sm leading-relaxed"
      />
    </div>
  );
}

function stringifyKeyword(k: CmsKeyword): string {
  return k.explain ? `${k.term}: ${k.explain}` : k.term;
}

function parseKeywordLine(line: string): CmsKeyword {
  const idx = line.indexOf(":");
  if (idx === -1) return { term: line.trim(), explain: "" };
  return { term: line.slice(0, idx).trim(), explain: line.slice(idx + 1).trim() };
}

// 저장 직전 정리 — 줄바꿈 기반 입력이 타이핑 중엔 빈 줄을 그대로 담고 있어야
// 커서가 안 튀므로(위 컴포넌트들 참조), 정리는 여기서 한 번만 한다.
export function cleanPostBody(body: CmsPostBody): CmsPostBody {
  return {
    body: body.body.map((s) => s.trim()).filter(Boolean),
    body_html: body.body_html,
    key_points: body.key_points.map((s) => s.trim()).filter(Boolean),
    keywords: body.keywords
      .map((k) => ({ term: k.term.trim(), explain: k.explain.trim() }))
      .filter((k) => k.term),
    images: body.images,
  };
}

export function cleanClosingLine(s: string): string {
  return s.trim();
}

// mode="post" 는 핵심정리·키워드·닫는줄 입력창을 따로 안 둔다 — 대신 Tiptap
// 에디터 안에서 (이미 있는 H2/H3 툴바 버튼으로) "핵심 정리" / "키워드" /
// "닫는 줄" 이라는 소제목을 쓰면, 그 소제목부터 다음 소제목 전까지를 저장
// 시점에 그 필드로 갈라낸다. 새 문법을 안 배워도 되고, 한 캔버스에서 끝난다.
const SECTION_ALIASES: Record<string, "key_points" | "keywords" | "closing_line"> = {
  핵심정리: "key_points",
  핵심요약: "key_points",
  요약: "key_points",
  키워드: "keywords",
  용어: "keywords",
  닫는줄: "closing_line",
  마무리: "closing_line",
  클로징: "closing_line",
};

function matchSection(headingText: string) {
  return SECTION_ALIASES[headingText.trim().replace(/\s+/g, "")];
}

export function splitRichBody(html: string): {
  body_html: string;
  key_points: string[];
  keywords: CmsKeyword[];
  closing_line: string;
} {
  if (typeof window === "undefined" || !html) {
    return { body_html: html ?? "", key_points: [], keywords: [], closing_line: "" };
  }
  const doc = new DOMParser().parseFromString(html, "text/html");
  const nodes = Array.from(doc.body.children);

  let section: "body" | "key_points" | "keywords" | "closing_line" = "body";
  const buckets: Record<string, Element[]> = { body: [], key_points: [], keywords: [], closing_line: [] };

  for (const el of nodes) {
    if (/^H[1-6]$/.test(el.tagName)) {
      const hit = matchSection(el.textContent ?? "");
      if (hit) {
        section = hit;
        continue; // 소제목 자체는 어느 필드에도 안 들어간다.
      }
    }
    buckets[section].push(el);
  }

  const linesOf = (els: Element[]): string[] =>
    els.flatMap((el) => {
      if (el.tagName === "UL" || el.tagName === "OL") {
        return Array.from(el.querySelectorAll("li")).map((li) => (li.textContent ?? "").trim());
      }
      return [(el.textContent ?? "").trim()];
    }).filter(Boolean);

  return {
    body_html: buckets.body.map((el) => el.outerHTML).join(""),
    key_points: linesOf(buckets.key_points),
    keywords: linesOf(buckets.keywords).map(parseKeywordLine),
    closing_line: linesOf(buckets.closing_line).join(" "),
  };
}

export function PostForm({ value, onChange, mode = "post" }: Props) {
  const body = value.body_inline ?? EMPTY_BODY;
  const patch = (p: Partial<CmsPostInput>) => onChange({ ...value, ...p });
  const patchBody = (p: Partial<CmsPostBody>) =>
    patch({ body_inline: { ...body, ...p } });

  // mode="post": Medium/Notion 식 — 제목이 문서 맨 위에 크게, 메타정보(발행일·
  // 에디터·채널)는 얇은 한 줄로 축소, 본문 에디터가 화면 대부분을 차지한다.
  // 카드 3개로 쪼개져 있던 옛 레이아웃(제목 카드 / 본문 카드 / 이미지 카드)을
  // 하나의 이어진 문서로 합쳐서 "폼 작성" 느낌을 줄였다.
  if (mode === "post") {
    return (
      <div className="max-w-[760px] mx-auto space-y-3">
        <CoverImageField
          value={value.cover_image_url ?? null}
          onChange={(url) => patch({ cover_image_url: url })}
        />
        <div className="ui-card rounded-2xl overflow-hidden">
          <div className="px-6 pt-6 pb-3">
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

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-gray-100 bg-gray-50/70 px-6 py-2.5 text-[13px]">
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
            <label className="flex items-center gap-1.5 text-gray-400">
              에디터
              <select
                value={value.editor_id ?? ""}
                onChange={(e) => {
                  const ed = EDITORS.find((x) => x.id === e.target.value);
                  patch({
                    editor_id: e.target.value || null,
                    mbti_group: ed ? ed.group : null,
                  });
                }}
                className="cursor-pointer border-0 bg-transparent font-medium text-gray-700 outline-none"
              >
                <option value="">편집팀</option>
                {EDITORS.map((ed) => (
                  <option key={ed.id} value={ed.id}>
                    {ed.label}
                  </option>
                ))}
              </select>
            </label>
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

  // mode="trend_card" — 홈 피드의 "요즘 화제의 경제 이슈"/"이번 주 인기 칼럼"
  // 카드. letters 처럼 무거운 리치텍스트 본문이 아니라 제목+짧은 요약뿐이라
  // 폼도 그만큼 가볍게 — 발행일 한 줄 + 섹션 토글 + 제목 + 라벨 + 요약이 전부.
  if (mode === "trend_card") {
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

  // mode="letter" — AI 레터는 발행일·에디터·채널 편집 불가(파이프라인 소관)라
  // 기존 폼 레이아웃 그대로 유지.
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
