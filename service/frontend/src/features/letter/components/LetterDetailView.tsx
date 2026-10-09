'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AXIS_META, type IssueLetter, type LetterSegment } from '../data/letterTypes';
import { AxisBadge } from './AxisBadge';
import { formatLetterDate } from './LetterCard';
import { LetterVote } from './LetterVote';
import { SourcesPanel } from './SourcesPanel';
import { LETTER_CSS } from './letterStyles';

function Segments({ parts }: { parts: LetterSegment[] }) {
  return (
    <>
      {parts.map((p, i) =>
        typeof p === 'string' ? (
          <span key={i}>{p}</span>
        ) : (
          <a key={i} href={p.href} {...(p.href.startsWith('http') && !p.href.includes('ailens.sedaily.ai') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
            {p.text}
          </a>
        ),
      )}
    </>
  );
}

export function LetterDetailView({ letter, prevSlug, nextSlug }: { letter: IssueLetter; prevSlug?: string; nextSlug?: string }) {
  const [summaryOpen, setSummaryOpen] = useState(true);

  return (
    <div className="ld-wrap">
      <style>{LETTER_CSS}</style>
      <Link href="/letter" className="ld-back">
        ← 레터 목록으로
      </Link>

      <header className="ld-head">
        <div className="ld-cat">
          <span>{letter.categories.join(' · ')}</span>
          <span style={{ color: '#9ca3af', fontWeight: 500 }}>제 {letter.issueNumber}호</span>
        </div>
        <h1 className="ld-title">{letter.title}</h1>
        <p className="ld-deck">{letter.deck}</p>
        <ul className="ld-axlist" aria-label="이 레터의 3가지 관점">
          {letter.axisLabels.map((a) => (
            <li key={a.axis + a.label}>
              <AxisBadge axis={a.axis} />
              <span>{a.label}</span>
            </li>
          ))}
        </ul>
        <div className="ld-meta">
          {formatLetterDate(letter.publishedAt)} · 약 {letter.readMinutes}분 · AI LENS 편집팀
        </div>
        {letter.mock && <p className="ld-mock">목업 화면입니다. 기획서 예시 문구만으로 구성한 레터라 내용이 실제와 다를 수 있어요.</p>}
      </header>

      <SourcesPanel sources={letter.sources} />

      <section className="ld-sum" aria-label="1분 요약">
        <div className="ld-sum-h">
          <strong>1분 요약</strong>
          <button type="button" className="ld-sum-btn" onClick={() => setSummaryOpen((v) => !v)} aria-expanded={summaryOpen}>
            {summaryOpen ? '접기' : '펼치기'}
          </button>
        </div>
        {summaryOpen && (
          <ol>
            {letter.summary.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        )}
      </section>

      {letter.sections.map((sec, i) => (
        <section key={i} className="ld-sec" style={{ ['--ax' as string]: AXIS_META[sec.axis].tone }}>
          <div className="ld-sec-top">
            <AxisBadge axis={sec.axis} />
          </div>
          <h2 className="ld-sec-h">{sec.heading}</h2>
          <p className="ld-key">핵심: {sec.keyLine}</p>
          {sec.paragraphs.map((para, j) => (
            <p key={j} className="ld-p">
              <Segments parts={para} />
            </p>
          ))}
        </section>
      ))}

      <section className="ld-note" aria-label="에디터 한마디">
        <h2>에디터 한마디</h2>
        <p>{letter.editorNote}</p>
      </section>

      <LetterVote slug={letter.slug} vote={letter.vote} />

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
