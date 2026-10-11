'use client';

import { useMemo, useState } from 'react';
import { EDITORS, editorsOfLetter } from '../data/editors';
import type { IssueLetter } from '../data/letterTypes';
import { useFollowedEditors } from '../lib/useFollowedEditors';
import { useInterests } from '../lib/useInterests';
import { EditorBar } from './EditorBar';
import { EditorCard } from './EditorCard';
import { LetterCard } from './LetterCard';
import { LETTER_CSS } from './letterStyles';

export function LetterListView({ letters }: { letters: IssueLetter[] }) {
  const [topic, setTopic] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [onlyMine, setOnlyMine] = useState(false);
  const interests = useInterests();
  const follow = useFollowedEditors(interests.save);

  const q = query.trim().toLowerCase();
  // 순서는 늘 최신순. 팔로우한 에디터의 세부 분야와 겹치는 레터는 같은 자리에서 이유만 덧붙여 보여 준다.
  const withReason = useMemo(() => letters.map((l) => (interests.reasons[l.slug] ? { ...l, reason: interests.reasons[l.slug] } : l)), [letters, interests.reasons]);
  const mine = (l: IssueLetter) => editorsOfLetter(l).some((e) => follow.isFollowing(e.id));
  const matchCount = withReason.filter(mine).length;
  const shown = withReason.filter(
    (l) =>
      (!topic || (l.topics ?? []).includes(topic)) &&
      (!onlyMine || mine(l)) &&
      (!q || [l.title, l.deck, ...(l.topics ?? []), ...l.categories].some((t) => t.toLowerCase().includes(q))),
  );
  const filtering = !!topic || !!q || onlyMine;
  const featured = shown.find((l) => l.featured) ?? shown[0];
  const rest = shown.filter((l) => l !== featured);
  const pickTopic = (name: string) => {
    setTopic(name);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="lt-wrap">
      <style>{LETTER_CSS}</style>
      <header className="lt-hero">
        <div className="lt-eyebrow">AI LENS 레터</div>
        <h1 className="lt-h1">기사 하나가 아니에요. 하나의 이슈, 여러 관점</h1>
        <p className="lt-sub">소식, 실체, 다른 시각으로 읽는 모아쓰기. 같은 이슈를 다룬 서울경제 기사를 하나의 흐름으로 엮었어요.</p>
      </header>

      <section aria-label="에디터" className="lt-editors">
        <div className="lt-ed-row">
          {EDITORS.map((e) => (
            <EditorCard key={e.id} editor={e} count={letters.filter((l) => editorsOfLetter(l).some((x) => x.id === e.id)).length} following={follow.isFollowing(e.id)} onToggle={() => follow.toggle(e.id)} />
          ))}
        </div>
      </section>

      {follow.ready && <EditorBar followed={follow.followed} onlyMine={onlyMine} onToggleOnlyMine={() => setOnlyMine((v) => !v)} matchCount={matchCount} />}

      <div className="lt-toolbar">
        <h2 className="lt-sec-h lt-sec-inline">최신 레터</h2>
        <input className="lt-searchbox" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="제목·주제 검색" aria-label="레터 검색" />
      </div>
      {topic && (
        <div className="lt-activefilter">
          주제 <button type="button" className="lt-chip lt-chip-on" onClick={() => setTopic(null)} aria-label={`${topic} 주제 해제`}>{topic} ✕</button>
        </div>
      )}

      {featured ? (
        <>
          <LetterCard letter={featured} featured onTopic={pickTopic} />
          {rest.length > 0 && (
            <>
              <h2 className="lt-sec-h">{filtering ? `레터 ${shown.length}편` : '지난 레터'}</h2>
              <div className="lt-grid">
                {rest.map((l) => (
                  <LetterCard key={l.slug} letter={l} onTopic={pickTopic} />
                ))}
              </div>
            </>
          )}
        </>
      ) : (
        <p className="lt-empty">{filtering ? '조건에 맞는 레터가 아직 없어요.' : '레터가 아직 없어요.'}</p>
      )}
    </div>
  );
}
