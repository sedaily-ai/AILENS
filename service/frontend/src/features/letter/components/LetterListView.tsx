'use client';

import { useEffect, useMemo, useState } from 'react';
import { editorsOfLetter, findEditor } from '../data/editors';
import type { IssueLetter } from '../data/letterTypes';
import { useFollowedEditors } from '../lib/useFollowedEditors';
import { useInterests } from '../lib/useInterests';
import { EditorBar } from './EditorBar';
import { EditorIntro } from './EditorIntro';
import { EditorTabs } from './EditorTabs';
import { LetterCard } from './LetterCard';
import { LETTER_CSS } from './letterStyles';

export function LetterListView({ letters, initialEditorId = null }: { letters: IssueLetter[]; initialEditorId?: string | null }) {
  const [editorId, setEditorId] = useState<string | null>(initialEditorId && findEditor(initialEditorId) ? initialEditorId : null);
  const [topic, setTopic] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [onlyMine, setOnlyMine] = useState(false);
  const interests = useInterests();
  const follow = useFollowedEditors(interests.save);

  useEffect(() => {
    // 주소의 ?editor= 로 들어온 경우 해당 에디터를 고른다(마운트 뒤 한 번).
    const fromUrl = new URLSearchParams(window.location.search).get('editor');
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (fromUrl && findEditor(fromUrl)) setEditorId(fromUrl);
  }, []);

  const select = (id: string | null) => {
    setEditorId(id);
    setOnlyMine(false);
    const url = new URL(window.location.href);
    url.pathname = '/letter';
    if (id) url.searchParams.set('editor', id);
    else url.searchParams.delete('editor');
    window.history.replaceState(null, '', url.toString());
  };

  const editor = editorId ? findEditor(editorId) : undefined;
  const q = query.trim().toLowerCase();
  // 순서는 늘 최신순. 팔로우한 에디터의 세부 분야와 겹치는 레터는 같은 자리에서 이유만 덧붙여 보여 준다.
  const withReason = useMemo(() => letters.map((l) => (interests.reasons[l.slug] ? { ...l, reason: interests.reasons[l.slug] } : l)), [letters, interests.reasons]);
  const mine = (l: IssueLetter) => editorsOfLetter(l).some((e) => follow.isFollowing(e.id));
  const matchCount = withReason.filter(mine).length;
  const shown = withReason.filter(
    (l) =>
      (!editor || editorsOfLetter(l).some((e) => e.id === editor.id)) &&
      (!topic || (l.topics ?? []).includes(topic)) &&
      (!onlyMine || mine(l)) &&
      (!q || [l.title, l.deck, ...(l.topics ?? []), ...l.categories].some((t) => t.toLowerCase().includes(q))),
  );
  const filtering = !!topic || !!q || onlyMine;
  // 전체 보기에서만 최신 레터를 크게 보여 주고, 에디터를 고르면 그 에디터의 레터를 같은 크기로 나열한다.
  const featured = editor ? undefined : shown.find((l) => l.featured) ?? shown[0];
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

      <EditorTabs selected={editorId} onSelect={select} />

      {editor ? (
        <EditorIntro key={editor.id} editor={editor} following={follow.isFollowing(editor.id)} onToggleFollow={() => follow.toggle(editor.id)} />
      ) : (
        follow.ready && <EditorBar followed={follow.followed} onlyMine={onlyMine} onToggleOnlyMine={() => setOnlyMine((v) => !v)} matchCount={matchCount} onSelect={select} />
      )}

      <div className="lt-toolbar">
        <h2 className="lt-sec-h lt-sec-inline">{editor ? `${editor.name}의 레터 ${shown.length}편` : '최신 레터'}</h2>
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
      ) : shown.length > 0 ? (
        <div className="lt-grid">{shown.map((l) => <LetterCard key={l.slug} letter={l} onTopic={pickTopic} />)}</div>
      ) : (
        <p className="lt-empty">{editor && !filtering ? `아직 ${editor.name}의 세부 분야와 겹치는 레터가 없어요. 팔로우하거나 구독하면 나오는 대로 알려 드려요.` : filtering ? '조건에 맞는 레터가 아직 없어요.' : '레터가 아직 없어요.'}</p>
      )}
    </div>
  );
}
