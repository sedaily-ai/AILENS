import Link from 'next/link';
import { editorsOfLetter } from '../../data/editors';
import type { IssueLetter } from '../../data/letterTypes';
import { EditorAvatar } from '../EditorAvatar';
import { formatLetterDate } from '../list/LetterCard';

/** 같은 주제를 가진 다른 레터(겹치는 주제 수가 많은 순, 같으면 최신순). 겹치는 주제가 없으면 아무것도 그리지 않는다. 이유는 겹친 주제 이름만 말한다. */
export function relatedOf(current: IssueLetter, all: IssueLetter[], limit = 3): { letter: IssueLetter; shared: string[] }[] {
  const mine = new Set(current.topics ?? []);
  return all
    .filter((l) => l.slug !== current.slug)
    .map((l) => ({ letter: l, shared: (l.topics ?? []).filter((t) => mine.has(t)) }))
    .filter((x) => x.shared.length > 0)
    .sort((a, b) => b.shared.length - a.shared.length || b.letter.publishedAt.localeCompare(a.letter.publishedAt))
    .slice(0, limit);
}

export function RelatedLetters({ items }: { items: { letter: IssueLetter; shared: string[] }[] }) {
  if (items.length === 0) return null;
  return (
    <section className="ld-related" aria-label="같은 주제의 다른 레터">
      <h2 className="ld-related-h">같은 주제의 다른 레터</h2>
      <ul>
        {items.map(({ letter, shared }) => {
          const ed = editorsOfLetter(letter)[0];
          return (
            <li key={letter.slug}>
              <Link href={`/letter/${encodeURIComponent(letter.slug)}`} className="ld-related-item">
                {ed && <span className="ld-related-ava"><EditorAvatar editor={ed} size={44} rounded /></span>}
                <span className="ld-related-body">
                  <span className="ld-related-why">{shared.slice(0, 3).join(' · ')}</span>
                  <span className="ld-related-title">{letter.title}</span>
                  <span className="ld-related-meta">{formatLetterDate(letter.publishedAt)}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
