import Link from 'next/link';
import { AxisBadge } from './AxisBadge';
import type { IssueLetter } from '../data/letterTypes';

export function formatLetterDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${y}.${m}.${d}`;
}

/** 목록 카드. featured면 "오늘의 레터" 큰 카드, 아니면 그리드용 카드. 카드에서 "모아쓰기" 표시·3축(또는 키워드) 배지·기사 N건이 바로 보인다. */
export function LetterCard({ letter, featured = false }: { letter: IssueLetter; featured?: boolean }) {
  // 오늘의 레터는 3축 이름을 고정으로, 지난 레터는 섹션 키워드(방법론·젠트리피케이션 등)가 있으면 그것을 보여 준다.
  const tags = featured || !letter.cardTags ? [...new Set(letter.axisLabels.map((a) => a.axis))].map((axis) => ({ axis, label: undefined as string | undefined })) : letter.cardTags;
  return (
    <Link href={`/letter/${encodeURIComponent(letter.slug)}`} className={`lt-card${featured ? ' lt-card-feat' : ''}`}>
      <div className="lt-card-cat">
        {featured && <span className="lt-today">오늘의 레터</span>}
        <span className="lt-moa">모아쓰기</span>
        <span>{letter.categories.join(' · ')}</span>
        <span className="lt-no">제 {letter.issueNumber}호</span>
      </div>
      <h3 className="lt-card-title">{letter.title}</h3>
      <p className="lt-card-deck">{letter.deck}</p>
      <div className="lt-axes">
        {tags.map((t, i) => (
          <AxisBadge key={`${t.axis}-${t.label ?? i}`} axis={t.axis} label={t.label} />
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
