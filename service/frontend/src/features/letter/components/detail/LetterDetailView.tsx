'use client';

import { useMemo, useState } from 'react';
import { useNewsReadingSignal } from '@/entities/user';
import Link from 'next/link';
import { trackEvent } from '@/shared/lib/tracking/trackEvent';
import { AXIS_META, asBlock, type IssueLetter, type LetterSegment, type LetterSource } from '../../data/letterTypes';
import { LetterBlockView } from './LetterBlocks';
import { AxisBadge } from '../AxisBadge';
import { editorsOfLetter } from '../../data/editors';
import { EditorAvatar } from '../EditorAvatar';
import { LetterToc } from './LetterToc';
import { RelatedLetters, relatedOf } from './RelatedLetters';
import { ReadingTools } from './ReadingTools';
import { SubscribeDialog } from '../dialog/SubscribeDialog';
import { TermTooltip } from '@/shared/ui/notice/TermTooltip';
import { splitByGlossary } from '../../data/glossary';
import { formatLetterDate } from '../list/LetterCard';
import { LetterVote } from './LetterVote';
import { SourcesPanel } from './SourcesPanel';
import { LETTER_CSS } from '../letterStyles';

/** 주소 비교용: 쿼리·해시·끝 슬래시를 떼고 소문자로. 서울경제 기사는 번호가 같으면 같은 기사로 본다. */
function articleKey(href: string): string {
  const m = href.match(/sedaily\.com\/(?:article|NewsView)\/(\w+)/i);
  if (m) return `sedaily:${m[1].toLowerCase()}`;
  return href.split('#')[0].split('?')[0].replace(/\/$/, '').toLowerCase();
}

/** 본문 링크: 마우스를 올리거나 키보드로 초점을 주면 그 기사의 제목·매체를 카드로 미리 보여 준다(쓰인 기사 목록과 주소로 대응). */
function InlineLink({ part, source, letterSlug }: { part: { text: string; href: string }; source?: LetterSource; letterSlug: string }) {
  const outbound = part.href.startsWith('http') && !part.href.includes('ailens.sedaily.ai');
  return (
    <span className="ld-link">
      <a
        href={part.href}
        onClick={() => trackEvent('letter_source_click', { letter: letterSlug, place: 'inline', outbound })}
        {...(outbound ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      >
        {part.text}
      </a>
      {source && (
        <span className="ld-link-card" role="tooltip">
          <span className="ld-link-outlet">{source.outlet}{!source.internal ? ' · 외부 기사' : ''}</span>
          <span className="ld-link-title">{source.title}</span>
          <span className="ld-link-go">원문 읽기 ↗</span>
        </span>
      )}
    </span>
  );
}

function Segments({ parts, letterSlug, sources, pieces }: { parts: LetterSegment[]; letterSlug: string; sources: LetterSource[]; pieces: Map<string, ReturnType<typeof splitByGlossary>> }) {
  const byKey = new Map(sources.map((s) => [articleKey(s.href), s]));
  return (
    <>
      {parts.map((p, i) =>
        typeof p === 'string' ? (
          <span key={i}>
            {(pieces.get(p) ?? [{ text: p }]).map((piece, j) => ('term' in piece ? <TermTooltip key={j} term={piece.term.term} explain={piece.term.explain}>{piece.text}</TermTooltip> : <span key={j}>{piece.text}</span>))}
          </span>
        ) : 'href' in p ? (
          <InlineLink key={i} part={p} source={byKey.get(articleKey(p.href))} letterSlug={letterSlug} />
        ) : null,
      )}
    </>
  );
}

export function LetterDetailView({ letter, prevSlug, nextSlug, others = [] }: { letter: IssueLetter; prevSlug?: string; nextSlug?: string; others?: IssueLetter[] }) {
  useNewsReadingSignal({ id: letter.slug, kind: 'letter', title: letter.title, categories: letter.categories.slice(0, 10), keywords: (letter.topics ?? []).slice(0, 30) });
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [subOpen, setSubOpen] = useState(false);
  // 레터 한 편에서 같은 용어는 처음 한 번만 표시한다. 렌더 중에 부수효과가 없도록 본문 문자열별 조각을 미리 계산해 둔다(서버·클라이언트 결과가 같다).
  const termPieces = useMemo(() => {
    const seen = new Set<string>();
    const map = new Map<string, ReturnType<typeof splitByGlossary>>();
    for (const sec of letter.sections) for (const para of sec.paragraphs) for (const part of para) if (typeof part === 'string' && !map.has(part)) map.set(part, splitByGlossary(part, seen));
    return map;
  }, [letter.sections]);
  const editors = editorsOfLetter(letter).slice(0, 2);

  return (
    <div id="main-content" tabIndex={-1} className="ld-wrap">
      <style>{LETTER_CSS}</style>
      <LetterToc sections={letter.sections} />
      <Link href="/letter" className="ld-back">
        ← 레터 목록으로
      </Link>

      <header className="ld-head">
        <div className="ld-cat">
          <span>{letter.categories.join(' · ')}</span>
          <span className="ld-meta">{formatLetterDate(letter.publishedAt)} · AI LENS 편집팀</span>
          <span className="ld-cat-no">제 {letter.issueNumber}호</span>
        </div>
        <h1 className="ld-title">{letter.title}</h1>
        <p className="ld-deck">{letter.deck}</p>
        <div className="ld-byline">
          <div className="ld-authors">
          {editorsOfLetter(letter).slice(0, 2).map((e) => (
            <Link key={e.id} href={`/letter/editors/${e.id}`} className="ld-editor" aria-label={`${e.name}의 레터 보기`} title={`${e.name}의 다른 레터 보기`}>
              <EditorAvatar editor={e} size={22} />
              <span>{e.name} <span className="ld-editor-action">레터 보기</span></span>
              <span className="ld-editor-arrow" aria-hidden>›</span>
            </Link>
          ))}
          </div>
          <ReadingTools slug={letter.slug} title={letter.title} />
        </div>
        {letter.topics && letter.topics.length > 0 && (
          <ul className="ld-topics" aria-label="이 레터의 주제">
            {letter.topics.slice(0, 4).map((name) => (
              <li key={name} className="lt-topic">{name}</li>
            ))}
          </ul>
        )}
        {letter.mock && <p className="ld-mock">목업 화면입니다. 기획서 예시 문구만으로 구성한 레터라 내용이 실제와 다를 수 있어요.</p>}
      </header>

      {/* 순서: 제목 → 1분 요약 → 관점 3개 → 본문 → (한마디·투표) → 쓰인 기사. 레터탭 피드백 01(2026-10-20) */}
      <section className="ld-sum" aria-label="1분 요약">
        <div className="ld-sum-h">
          <strong>1분 요약</strong>
          <button type="button" className="ld-sum-btn" onClick={() => {
              trackEvent('letter_summary_toggle', { letter: letter.slug, open: !summaryOpen });
              setSummaryOpen((v) => !v);
            }} aria-expanded={summaryOpen}>
            {summaryOpen ? '접기' : '펼치기'}
          </button>
        </div>
        {summaryOpen ? (
          <ol>
            {letter.summary.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        ) : (
          <p className="ld-sum-peek">{letter.summary[0]}</p>
        )}
      </section>

      <section className="ld-outline" aria-label="이 레터에서 읽을 내용">
        <h2>이 레터에서 읽을 내용</h2>
        <ul className="ld-axlist" aria-label="이 레터의 3가지 관점">
          {letter.axisLabels.map((a) => {
            const isDefault = a.label.replace(/[^가-힣a-zA-Z0-9]/g, '') === AXIS_META[a.axis].label.replace(/\s/g, '');
            const detail = isDefault ? letter.sections.find((section) => section.axis === a.axis)?.heading : a.label;
            return (
              <li key={a.axis + a.label}>
                <AxisBadge axis={a.axis} />
                {detail && <span>{detail}</span>}
              </li>
            );
          })}
        </ul>
      </section>

      {letter.sections.map((sec, i) => (
        <section key={i} id={`ld-sec-${i}`} className="ld-sec" style={{ ['--ax' as string]: AXIS_META[sec.axis].tone }}>
          <div className="ld-sec-top">
            <span className="ld-sec-no">{String(i + 1).padStart(2, '0')}</span>
            <span className="ld-axis-label" style={{ color: AXIS_META[sec.axis].tone }}>{AXIS_META[sec.axis].label}</span>
          </div>
          <h2 className="ld-sec-h">{sec.heading}</h2>
          <p className="ld-key"><span className="ld-key-l">핵심:</span> {sec.keyLine}</p>
          {sec.paragraphs.map((para, j) => {
            const block = asBlock(para);
            return block ? (
              <LetterBlockView key={j} block={block} tone={AXIS_META[sec.axis].tone} />
            ) : (
              <p key={j} className="ld-p">
                <Segments parts={para} letterSlug={letter.slug} sources={letter.sources} pieces={termPieces} />
              </p>
            );
          })}
        </section>
      ))}

      <section className="ld-note" aria-label="에디터 한마디">
        {(() => {
          const ed = editorsOfLetter(letter)[0];
          return (
            <div className="ld-note-head">
              {ed && <Link href={`/letter/editors/${ed.id}`} className="ld-note-ava" aria-label={ed.name}><EditorAvatar editor={ed} size={36} /></Link>}
              <div>
                <h2>에디터 한마디</h2>
                {ed && <span className="ld-note-by">{ed.name}</span>}
              </div>
            </div>
          );
        })()}
        <p>{letter.editorNote}</p>
      </section>

      {letter.vote && <LetterVote slug={letter.slug} vote={letter.vote} />}

      <SourcesPanel sources={letter.sources} letterSlug={letter.slug} />

      <RelatedLetters items={relatedOf(letter, others)} />

      <section className="ld-next" aria-label="다음 레터">
        <div>
          <strong>이런 레터를 메일로 받아보세요</strong>
          <p>{editors.length > 0 ? `${editors.map((e) => e.name).join(' · ')}의 담당 분야와 겹치는 새 레터가 나오면 보내 드려요.` : '새 레터가 나오면 메일로 보내 드려요.'}</p>
        </div>
        <button type="button" className="ld-next-btn" onClick={() => { trackEvent('letter_next_cta_click', { letter: letter.slug }); setSubOpen(true); }}>
          받아보기
        </button>
      </section>
      <SubscribeDialog open={subOpen} onClose={() => setSubOpen(false)} source="letter-end" editors={editors}
        title={editors.length > 0 ? `${editors.map((e) => e.name).join(' · ')}의 새 레터를 메일로 받기` : '새 레터를 메일로 받기'} />

      <div className="ld-nav">
        <Link href="/letter" className="ld-btn">
          레터 목록 보기
        </Link>
        {prevSlug && (
          <Link href={`/letter/${encodeURIComponent(prevSlug)}`} className="ld-btn ghost">
            ← 이전 레터
          </Link>
        )}
        {nextSlug && (
          <Link href={`/letter/${encodeURIComponent(nextSlug)}`} className="ld-btn ghost">
            다음 레터 →
          </Link>
        )}
      </div>
      <p className="ld-foot">본 레터는 서울경제신문 AI LENS 기사를 바탕으로 작성됐어요. 투자 판단의 근거로 쓰기 전에 원문 기사를 확인하세요.</p>
    </div>
  );
}
