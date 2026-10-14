import { Fragment } from 'react';
import { inlineSegments } from '@ailens/domain';
import { wrapWithTerms } from '@/shared/ui/notice/TermTooltip';

// 레터 인라인 서식 렌더러(LensFormatPanel과 30초 핵심 카드가 같은 규칙을 쓴다).
// 서식 해석(굵게·기울임·따옴표·금액 강조·화살표)은 웹·앱 공용이라 @ailens/domain 의 inlineSegments 가 하고, 여기서는 그 결과를 React 로 그린다.
// 나머지 글자에는 용어 하이라이트를 입힌다.

type Glossary = Parameters<typeof wrapWithTerms>[1];

export function renderInline(raw: string, kw: Glossary, opts: { numbers?: boolean } = {}) {
  return inlineSegments(raw, opts).map((seg, i) => {
    if (seg.kind === 'bold' || seg.kind === 'number') return <strong key={i}>{seg.kind === 'bold' ? wrapWithTerms(seg.text, kw) : seg.text}</strong>;
    if (seg.kind === 'italic') return <em key={i}>{wrapWithTerms(seg.text, kw)}</em>;
    return <Fragment key={i}>{wrapWithTerms(seg.text, kw)}</Fragment>;
  });
}
