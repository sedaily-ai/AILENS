import { Fragment } from 'react';
import { wrapWithTerms } from '@/shared/ui/TermTooltip';

// 레터 인라인 서식 렌더러(2026-10-01, LensFormatPanel에서 분리 — 30초 핵심 카드도 같은 규칙을 쓰려고).
//
//  · 마크다운 **굵게** / *기울임* — 기호가 그대로 보이지 않게 푼다.
//  · 따옴표로 묶인 말(“…” ‘…’ "…" '…')은 기호가 없어도 자동으로 굵게. 홑따옴표는 영어 아포스트로피와 겹치지
//    않게 글자·숫자 바로 옆에 붙은 경우를 빼고, 길이도 제한한다.
//  · 금액·퍼센트·배수(예: 1,500억 원 / 20% / 5배)는 굵게 — 한 번에 너무 많이 튀지 않게 문단당 앞 1곳까지만(리서치: 강조는 드물수록 효과적).
//    연도·날짜·면적·대수 같은 숫자는 그대로 둔다.
//  · "->" 화살표는 "→"로(본문에 기호가 날것으로 보이지 않게).
//  · 나머지 글자에는 용어 하이라이트를 입힌다.

type Glossary = Parameters<typeof wrapWithTerms>[1];

const INLINE_SPLIT =
  /(\*\*[^*\n]+\*\*|\*[^*\s][^*\n]*\*|“[^”\n]{1,60}”|‘[^’\n]{1,40}’|"[^"\n]{1,60}"|(?<![\p{L}\p{N}])'[^'\n]{1,40}'(?![\p{L}\p{N}]))/gu;
const QUOTED = /^(?:“[^”]+”|‘[^’]+’|"[^"]+"|'[^']+')$/u;
const NUMBER_SPLIT =
  /(\d[\d,.]*(?:\s?(?:조|억|만)(?:\s?\d[\d,.]*(?:억|만)?)?)?\s?원|\d[\d,.]*\s?(?:%p|%|배)(?![\p{L}]))/gu;
const MAX_NUMBER_EMPHASIS = 1;

export function renderInline(raw: string, kw: Glossary, opts: { numbers?: boolean } = {}) {
  const text = raw.replace(/\s*(?:-+|=)>\s*/g, ' → ');
  let used = 0;
  const plain = (part: string, key: number) => {
    if (!opts.numbers || used >= MAX_NUMBER_EMPHASIS) return <Fragment key={key}>{wrapWithTerms(part, kw)}</Fragment>;
    return (
      <Fragment key={key}>
        {part.split(NUMBER_SPLIT).map((seg, j) => {
          if (j % 2 === 1 && used < MAX_NUMBER_EMPHASIS) {
            used += 1;
            return <strong key={j}>{seg}</strong>;
          }
          return <Fragment key={j}>{wrapWithTerms(seg, kw)}</Fragment>;
        })}
      </Fragment>
    );
  };
  return text.split(INLINE_SPLIT).map((part, i) => {
    if (/^\*\*[^*]+\*\*$/.test(part)) return <strong key={i}>{wrapWithTerms(part.slice(2, -2), kw)}</strong>;
    if (/^\*[^*]+\*$/.test(part)) return <em key={i}>{wrapWithTerms(part.slice(1, -1), kw)}</em>;
    if (QUOTED.test(part)) return <strong key={i}>{wrapWithTerms(part, kw)}</strong>;
    return plain(part, i);
  });
}
