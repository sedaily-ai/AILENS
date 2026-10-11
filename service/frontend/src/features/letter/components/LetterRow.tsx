import Link from 'next/link';
import { editorsOfLetter } from '../data/editors';
import type { IssueLetter } from '../data/letterTypes';
import { EditorAvatar } from './EditorAvatar';
import { formatLetterDate } from './LetterCard';

/** 목록의 한 줄. 카드 대신 구분선으로 나눈 읽기 쉬운 행 — 메타(분류·에디터·날짜) → 제목 → 요약 → 3축·주제·기사 수. */
export function LetterRow({ letter, latest = false, onTopic, read = false, saved = false, onToggleSaved }: { letter: IssueLetter; latest?: boolean; onTopic?: (name: string) => void; read?: boolean; saved?: boolean; onToggleSaved?: () => void }) {
  const lead = editorsOfLetter(letter)[0];
  return (
    <article className={`lt-row${read ? ' lt-row-read' : ''}`}>
      {lead && (
        <Link href={`/letter/editors/${lead.id}`} className="lt-row-thumb" aria-label={`${lead.name} 에디터`} title={`${lead.name} · ${lead.role}`}>
          <EditorAvatar editor={lead} size={84} rounded />
        </Link>
      )}
      <div className="lt-row-main">
      <Link href={`/letter/${encodeURIComponent(letter.slug)}`} className="lt-row-link">
        <div className="lt-row-meta">
          {latest && <span className="lt-row-new">NEW</span>}
          <span>{letter.categories.join(' · ')}</span>
          {editorsOfLetter(letter).slice(0, 2).map((ed) => (
            <span key={ed.id} className="lt-card-ed lt-card-ed-badge"><EditorAvatar editor={ed} size={20} />{ed.name}</span>
          ))}
          {read && <span className="lt-row-readmark">읽음</span>}
          <span className="lt-row-dim">{formatLetterDate(letter.publishedAt)} · 기사 {letter.sourceCount ?? letter.sources.length}건 · 약 {letter.readMinutes}분</span>
        </div>
        <h3 className="lt-row-title">{letter.title}</h3>
        {letter.reason && <p className="lt-reason">{letter.reason}</p>}
        <p className="lt-row-deck">{letter.deck}</p>
      </Link>
      <div className="lt-row-foot">
        {(letter.topics ?? []).slice(0, 4).map((name) => (
          <button key={name} type="button" className="lt-row-topic" onClick={() => onTopic?.(name)}>{name}</button>
        ))}
        {onToggleSaved && (
          <button type="button" className="lt-row-save" aria-pressed={saved} aria-label={saved ? '저장 해제' : '나중에 읽기 저장'} onClick={onToggleSaved}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill={saved ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden><path d="M6 3.5h12v17l-6-4.2-6 4.2z" /></svg>
            {saved ? '저장됨' : '저장'}
          </button>
        )}
      </div>
      </div>
    </article>
  );
}
