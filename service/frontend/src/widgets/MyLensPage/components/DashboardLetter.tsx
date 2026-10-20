import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { editorsOfLetter, LetterBookmarkIcon, type IssueLetter } from '@/features/letter';

export function DashboardLetter({ letter, featured = false, saved, onSave }: { letter: IssueLetter; featured?: boolean; saved: boolean; onSave: () => void }) {
  const editors = letter.editors?.length ? editorsOfLetter(letter) : [];
  return (
    <article className={`ml-letter${featured ? ' ml-featured' : ''}`} data-testid={`letter-${letter.slug}`}>
      <div className="ml-letter-top"><span>{letter.categories.join(' · ') || '레터'}</span><button type="button" className="ml-bookmark" onClick={onSave} aria-label={`${letter.title} ${saved ? '저장 해제' : '저장'}`} aria-pressed={saved}><LetterBookmarkIcon saved={saved} /></button></div>
      <Link href={`/letter/${encodeURIComponent(letter.slug)}`} className="ml-letter-link" prefetch={false}>
        <h3>{letter.title}</h3><p className="ml-deck">{letter.deck}</p>
      </Link>
      {letter.reason && <p className="ml-reason">{letter.reason}</p>}
      <div className="ml-letter-foot"><span>{editors.slice(0, 2).map((editor) => editor.name).join(' · ') || 'AI LENS'} <span className="ml-dim">에디터</span></span></div>
      {featured && <Link href={`/letter/${encodeURIComponent(letter.slug)}`} className="ml-read-link" prefetch={false}>레터 읽기 <ArrowUpRight size={17} /></Link>}
    </article>
  );
}
