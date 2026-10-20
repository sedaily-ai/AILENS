import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { EditorAvatar, editorsOfLetter, formatLetterDate, LetterBookmarkIcon, type IssueLetter } from '@/features/letter';

export function DashboardLetter({ letter, featured = false, expanded = false, saved, onSave }: { letter: IssueLetter; featured?: boolean; expanded?: boolean; saved: boolean; onSave: () => void }) {
  const editors = letter.editors?.length ? editorsOfLetter(letter) : [];
  const sourceCount = letter.sourceCount ?? (letter.sources.length || undefined);
  return (
    <article className={`ml-letter${featured ? ' ml-featured' : ''}${expanded ? ' ml-letter-expanded' : ''}`} data-testid={`letter-${letter.slug}`}>
      <div className="ml-letter-top">
        <div className="ml-letter-meta">
          <span>{letter.categories.join(' · ') || '레터'}</span>
          {letter.publishedAt && <time dateTime={letter.publishedAt}>{formatLetterDate(letter.publishedAt)}</time>}
        </div>
        <button type="button" className="ml-bookmark" onClick={onSave} aria-label={`${letter.title} ${saved ? '저장 해제' : '저장'}`} aria-pressed={saved}><LetterBookmarkIcon saved={saved} /></button>
      </div>
      <Link href={`/letter/${encodeURIComponent(letter.slug)}`} className="ml-letter-link" prefetch={false}>
        <h3>{letter.title}</h3><p className="ml-deck">{letter.deck}</p>
      </Link>
      <div className="ml-letter-authors">
        {editors.slice(0, 2).map((editor) => <Link key={editor.id} href={`/letter/editors/${editor.id}`} className="ml-letter-author" prefetch={false}>
          <EditorAvatar editor={editor} size={24} /><span>{editor.name}</span>
        </Link>)}
        {!editors.length && <span className="ml-letter-publisher">AI LENS</span>}
        {sourceCount !== undefined && <span className="ml-letter-source-count">기사 {sourceCount}건</span>}
      </div>
      {expanded && !!letter.topics?.length && <ul className="ml-letter-topics" aria-label="레터 주제">
        {letter.topics.slice(0, 4).map((topic) => <li key={topic}>{topic}</li>)}
      </ul>}
      {!expanded && (letter.reason || featured) && <div className="ml-letter-actions">
        {letter.reason && <p className="ml-letter-reason">{letter.reason}</p>}
        {featured && <Link href={`/letter/${encodeURIComponent(letter.slug)}`} className="ml-read-link" prefetch={false}>레터 읽기 <ArrowUpRight size={17} aria-hidden /></Link>}
      </div>}
    </article>
  );
}
