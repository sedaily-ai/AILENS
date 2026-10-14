import Link from 'next/link';
import { LetterBookmarkIcon } from '../LetterBookmarkIcon';
import { editorsOfLetter } from '../../data/editors';
import type { IssueLetter } from '../../data/letterTypes';
import { EditorAvatar } from '../EditorAvatar';
import { formatLetterDate } from './LetterCard';

/** 날짜 줄 오른쪽에 저장을 두고 제목·작성자·주제를 차례로 읽는 목록 행. */
export function LetterRow({ letter, latest = false, onTopic, read = false, saved = false, onToggleSaved, onOpen, saveNoticeId }: { onOpen?: () => void; letter: IssueLetter; latest?: boolean; onTopic?: (name: string) => void; read?: boolean; saved?: boolean; onToggleSaved?: () => void; saveNoticeId?: string }) {
  return (
    <article className={`lt-row${read ? ' lt-row-read' : ''}`}>
      <div className="lt-row-top">
        <div className="lt-row-meta">
          {latest && <span className="lt-row-new">최신</span>}
          <span>{letter.categories.join(' · ')}</span>
          <span className="lt-row-dim">{formatLetterDate(letter.publishedAt)}</span>
          {read && <span className="lt-row-readmark">읽음</span>}
        </div>
        {onToggleSaved && (
          <button type="button" className="lt-row-save" aria-describedby={saveNoticeId} aria-pressed={saved} aria-label={saved ? '저장 해제' : '나중에 읽기 저장'} onClick={onToggleSaved}>
            <LetterBookmarkIcon saved={saved} />
          </button>
        )}
      </div>
      <Link href={`/letter/${encodeURIComponent(letter.slug)}`} className="lt-row-link" onClick={onOpen}>
        <h3 className="lt-row-title">{letter.title}</h3>
        {letter.reason && <p className="lt-reason">{letter.reason}</p>}
        <p className="lt-row-deck">{letter.deck}</p>
      </Link>
      <div className="lt-row-byline">
        <div className="lt-row-authors">
          {editorsOfLetter(letter).slice(0, 2).map((ed) => (
            <Link key={ed.id} href={`/letter/editors/${ed.id}`} className="lt-row-author" title={`${ed.name} · ${ed.role}`}>
              <EditorAvatar editor={ed} size={22} />{ed.name}
            </Link>
          ))}
          <span className="lt-row-time">기사 {letter.sourceCount ?? letter.sources.length}건 · 약 {letter.readMinutes}분</span>
        </div>
      </div>
      <div className="lt-row-foot">
        {(letter.topics ?? []).slice(0, 4).map((name) => (
          <button key={name} type="button" className="lt-row-topic" onClick={() => onTopic?.(name)}><span className="lt-topic">{name}</span></button>
        ))}
      </div>
    </article>
  );
}
