import Link from 'next/link';
import { AxisBadge } from './AxisBadge';
import type { IssueLetter } from '../data/letterTypes';

export function formatLetterDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${y}.${m}.${d}`;
}

/** 목록 카드. featured면 "오늘의 레터" 큰 카드, 아니면 그리드용 카드. 카드에서 3축 배지와 기사 N건이 바로 보인다. */
export function LetterCard({ letter, featured = false }: { letter: IssueLetter; featured?: boolean }) {
  return (
    <Link href={`/letter/${encodeURIComponent(letter.slug)}`} className={`lt-card${featured ? ' lt-card-feat' : ''}`}>
      <div className="lt-card-cat">
        {featured && <span className="lt-today">오늘의 레터</span>}
        <span>{letter.categories.join(' · ')}</span>
        <span className="lt-no">제 {letter.issueNumber}호</span>
      </div>
      <h3 className="lt-card-title">{letter.title}</h3>
      <p className="lt-card-deck">{letter.deck}</p>
      <div className="lt-axes">
        {[...new Set(letter.axisLabels.map((a) => a.axis))].map((axis) => (
          <AxisBadge key={axis} axis={axis} />
        ))}
        <span className="lt-count">기사 {letter.sources.length}건</span>
      </div>
      <div className="lt-card-meta">
        {formatLetterDate(letter.publishedAt)} · 약 {letter.readMinutes}분
        <span className="lt-more">읽기 →</span>
      </div>
    </Link>
  );
}
