// 레터 본문 한 줄(문단)의 인라인 서식 해석 — 웹·앱 공용(@ailens/domain). UI 비의존 순수 함수.
//
//  · 마크다운 **굵게** / *기울임* — 기호가 그대로 보이지 않게 푼다.
//  · 따옴표로 묶인 말(“…” ‘…’ "…" '…')은 기호가 없어도 자동으로 굵게. 홑따옴표는 영어 아포스트로피와 겹치지 않게 글자·숫자 바로 옆에 붙은 경우를 빼고, 길이도 제한한다.
//  · 금액·퍼센트·배수(예: 1,500억 원 / 20% / 5배)는 굵게 — 한 번에 너무 많이 튀지 않게 문단당 앞 1곳까지만. 연도·날짜·면적·대수 같은 숫자는 그대로 둔다.
//  · "->" 화살표는 "→"로.
//  · 용어 하이라이트(용어집)는 splitByTerms 가 text 조각에서 따로 찾는다.

export type InlineSegment =
  | { kind: 'text'; text: string }
  | { kind: 'bold'; text: string }
  | { kind: 'italic'; text: string }
  /** 금액·퍼센트 강조(문단당 1곳). 화면은 bold 와 같이 그린다. */
  | { kind: 'number'; text: string };

const INLINE_SPLIT =
  /(\*\*[^*\n]+\*\*|\*[^*\s][^*\n]*\*|“[^”\n]{1,60}”|‘[^’\n]{1,40}’|"[^"\n]{1,60}"|(?<![\p{L}\p{N}])'[^'\n]{1,40}'(?![\p{L}\p{N}]))/gu;
const QUOTED = /^(?:“[^”]+”|‘[^’]+’|"[^"]+"|'[^']+')$/u;
const NUMBER_SPLIT =
  /(\d[\d,.]*(?:\s?(?:조|억|만)(?:\s?\d[\d,.]*(?:억|만)?)?)?\s?원|\d[\d,.]*\s?(?:%p|%|배)(?![\p{L}]))/gu;
const MAX_NUMBER_EMPHASIS = 1;

export function inlineSegments(raw: string, opts: { numbers?: boolean } = {}): InlineSegment[] {
  const text = raw.replace(/\s*(?:-+|=)>\s*/g, ' → ');
  let used = 0;
  const out: InlineSegment[] = [];
  const plain = (part: string) => {
    if (!part) return;
    if (!opts.numbers || used >= MAX_NUMBER_EMPHASIS) {
      out.push({ kind: 'text', text: part });
      return;
    }
    part.split(NUMBER_SPLIT).forEach((seg, j) => {
      if (!seg) return;
      if (j % 2 === 1 && used < MAX_NUMBER_EMPHASIS) {
        used += 1;
        out.push({ kind: 'number', text: seg });
      } else out.push({ kind: 'text', text: seg });
    });
  };
  for (const part of text.split(INLINE_SPLIT)) {
    if (/^\*\*[^*]+\*\*$/.test(part)) out.push({ kind: 'bold', text: part.slice(2, -2) });
    else if (/^\*[^*]+\*$/.test(part)) out.push({ kind: 'italic', text: part.slice(1, -1) });
    else if (QUOTED.test(part)) out.push({ kind: 'bold', text: part });
    else plain(part);
  }
  return out;
}

export interface GlossaryTerm {
  term: string;
  explain: string;
}

export interface TermPiece {
  text: string;
  /** 용어집에 있는 말이면 그 설명. */
  explain?: string;
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** 텍스트에서 용어집의 말을 찾아 조각으로 나눈다(긴 말 우선). 용어가 없으면 [{text}] 하나. 웹 wrapWithTerms 와 같은 규칙. */
export function splitByTerms(text: string, glossary: readonly GlossaryTerm[] | null | undefined): TermPiece[] {
  if (!glossary || glossary.length === 0 || !text) return [{ text }];
  const sorted = [...glossary].sort((a, b) => b.term.length - a.term.length);
  const pattern = new RegExp(sorted.map((t) => escapeRegex(t.term)).join('|'), 'g');
  const lookup = new Map(glossary.map((g) => [g.term, g.explain]));
  const out: TermPiece[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(text)) !== null) {
    if (m[0] === '') {
      pattern.lastIndex += 1;
      continue;
    }
    if (m.index > last) out.push({ text: text.slice(last, m.index) });
    out.push({ text: m[0], explain: lookup.get(m[0]) ?? '' });
    last = m.index + m[0].length;
  }
  if (out.length === 0) return [{ text }];
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}
