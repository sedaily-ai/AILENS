'use client';

import { ChevronDown } from 'lucide-react';
import { PostVote, parseVoteChoices } from './PostVote';
import { renderInline } from './renderInline';
import type { CSSProperties } from 'react';
import { chapterId } from './lensChapters';
import { BADGE_HEAD, type LetterBlock } from './lensBlocks';
import { SentenceSelectionPopover } from '@/widgets/SentenceSelectionPopover';
import { READING_ACCENT } from '@/shared/constants/lensPerspectives';
import { coreSummaryBullets } from './lensSamples';
import type { CmsLens, CmsLensItem } from '@/shared/lib/api/cmsPostsApi';

// 좌우 비교 칸 안의 글은 문장마다 문단으로 나눠 샘플 HTML처럼 짧게 끊어 보여 준다.
const splitSentences = (text: string) => text.split(/(?<=[.!?다요죠])\s+(?=[가-힣A-Z0-9"'“‘(])/u).map((t) => t.trim()).filter(Boolean);

/** 레터 형식의 본문(읽기 폭 상한·1분 요약·소제목 번호·비교/투표 박스·사인오프). LensFormatPanel.tsx 에서 분리(리팩토링 5단계, 내용 불변). */
export function LetterReadingBody({
  lens,
  l,
  on,
  letterBlocks,
  isNewFormat,
}: {
  lens: CmsLens;
  l: CmsLensItem;
  on: boolean;
  letterBlocks: LetterBlock[] | null;
  isNewFormat: boolean;
}) {
  return (
  <article data-letter-body>
    <div className="lread" data-tpl={isNewFormat ? 'v2' : undefined} style={{ ['--lc' as string]: READING_ACCENT } as CSSProperties}>
      {/* 본문 블록 렌더 — parseLetterBlocks가 소제목·목록·인용·구분선을 읽어 풀어 주므로 프롬프트 출력 형식이 바뀌어도 기호가 그대로 노출되지 않는다.
          소제목 id는 오른쪽 구간 목차의 앵커이다. */}
      {(() => {
        const blocks = letterBlocks ?? [];
        const chTotal = blocks.filter((x) => x.type === 'sub').length;
        const kw = l.keywords ?? [];
        // 상단 핵심 요약과 같은 문장은 다시 표시하지 않는다. 추가 요약 문장은 보존한다.
        const shownSummary = new Set(coreSummaryBullets(lens));
        const additionalSummary = l.bullets.filter((bullet) => !shownSummary.has(bullet));
        const renderPlain = (b: LetterBlock, bi: number) => {
          if (b.type === 'ul' || b.type === 'ol') {
            const Tag = b.type;
            return (
              <Tag key={bi}>
                {b.items.map((it, ii) => (
                  <li key={ii}>{renderInline(it, kw, { numbers: true })}</li>
                ))}
              </Tag>
            );
          }
          if (b.type === 'quote') return <blockquote key={bi}>{renderInline(b.text, kw)}</blockquote>;
          if (b.type === 'p' || b.type === 'lead') return <p key={bi}>{renderInline(b.text, kw, { numbers: true })}</p>;
          return null;
        };
        const summary =
          isNewFormat && additionalSummary.length > 0 ? (
            <div key="summary" className="lread-summary">
              <div className="lread-box-title">추가 요약</div>
              {additionalSummary.map((b, bi) => (
                <p key={bi}>{renderInline(b, kw)}</p>
              ))}
              <p className="lread-summary-hint">자세한 내용은 아래 본문에서 이어 읽어보세요.</p>
            </div>
          ) : null;
        const rendered = blocks.map((b, bi) => {
        switch (b.type) {
          case 'compare':
            return (
              <div key={bi} className="lread-compare">
                {b.intro && <p>{renderInline(b.intro, kw)}</p>}
                <div className="lread-compare-cols">
                  <div className="lread-compare-col lread-compare-a">
                    <div className="lread-box-title">{b.a.label}</div>
                    {splitSentences(b.a.text).map((t, ti) => (
                      <p key={ti}>{renderInline(t, kw, { numbers: true })}</p>
                    ))}
                  </div>
                  <div className="lread-compare-col lread-compare-b">
                    <div className="lread-box-title">{b.b.label}</div>
                    {splitSentences(b.b.text).map((t, ti) => (
                      <p key={ti}>{renderInline(t, kw, { numbers: true })}</p>
                    ))}
                  </div>
                </div>
                {b.outro && <p>{renderInline(b.outro, kw)}</p>}
              </div>
            );
          case 'box': {
            const choices = b.kind === 'vote' ? parseVoteChoices(b.children.flatMap((c) => (c.type === 'p' ? [c.text] : []))) : null;
            const title = [b.head, b.question].filter(Boolean).join(b.kind === 'vote' ? ' ' : ': ');
            if (b.kind === 'more') {
              return (
                <details key={bi} className="lread-more">
                  <summary><span>{title}</span><ChevronDown size={18} aria-hidden /></summary>
                  <div className="lread-more-content">{b.children.map(renderPlain)}</div>
                </details>
              );
            }
            if (choices && choices.length >= 2) return <PostVote key={bi} slug={lens.id} title={title} choices={choices} />;
            return (
              <div key={bi} className={`lread-box lread-box-${b.kind}`}>
                <div className="lread-box-title">{title}</div>
                {choices ? choices.filter(Boolean).map((c, ci) => <p key={ci}>{c}</p>) : b.children.map(renderPlain)}
              </div>
            );
          }
          case 'lead':
            return (
              <p key={bi} className="lread-lead">
                {renderInline(b.text, kw)}
              </p>
            );
          case 'sub':
            return (
              <h3 key={bi} id={chapterId(b.no)} className="lread-sub" data-badge={BADGE_HEAD.test(b.head) && b.question ? String(b.no % 4) : undefined}>
                <span className="ch-no">
                  {String(b.no + 1).padStart(2, '0')}
                  <i>/ {String(chTotal).padStart(2, '0')}</i>
                </span>
                <span className="ch-t">{renderInline(b.head, kw)}</span>
                {b.question && <span className="ch-q">{renderInline(b.question, kw)}</span>}
              </h3>
            );
          case 'ul':
            return (
              <ul key={bi}>
                {b.items.map((it, ii) => (
                  <li key={ii}>{renderInline(it, kw, { numbers: true })}</li>
                ))}
              </ul>
            );
          case 'ol':
            return (
              <ol key={bi}>
                {b.items.map((it, ii) => (
                  <li key={ii}>{renderInline(it, kw, { numbers: true })}</li>
                ))}
              </ol>
            );
          case 'quote':
            return <blockquote key={bi}>{renderInline(b.text, kw)}</blockquote>;
          case 'hr':
            return (
              <div key={bi} className="lread-hr" aria-hidden>
                ···
              </div>
            );
          default:
            return <p key={bi}>{renderInline(b.text, kw, { numbers: true })}</p>;
        }
        });
        return (
          <>
            {summary}
            {rendered}
          </>
        );
      })()}
      {/* 레터 사인오프 — 얇은 룰 + 형식 색 마크 + 발신인 라벨로 뉴스레터 서명처럼 마무리한다. */}
      <div className="lread-sign">
        <p className="lread-thanks">끝까지 읽어주셔서 고마워요.</p>
        <p className="lread-from">
          <span className="lread-sign-mark" style={{ background: READING_ACCENT }} aria-hidden />
          <span className="lread-sign-name">AI LENS 편집팀</span>
        </p>
      </div>
    </div>
    {on && <SentenceSelectionPopover letter={{ id: lens.id, headline: lens.headline, publishedAt: lens.date }} glossary={l.keywords} />}
  </article>
  );
}
