'use client';
import { LetterShelfStatus } from '../LetterShelfStatus';

import { useEffect, useMemo, useState } from 'react';
import { editorsOfLetter, findEditor } from '../../data/editors';
import type { IssueLetter } from '../../data/letterTypes';
import { useFollowedEditors } from '../../lib/useFollowedEditors';
import { useLetterShelf } from '../../lib/useLetterShelf';
import { trackEvent } from '@/shared/lib/tracking/trackEvent';
import { AllSide } from './AllSide';
import { EditorBar } from './EditorBar';
import { EditorIntro } from './EditorIntro';
import { EditorTabs } from './EditorTabs';
import { LetterRow } from './LetterRow';
import { LETTER_CSS } from '../letterStyles';

/** 제목 중심 레터 목록. 좁은 화면에서는 에디터 소개를 목록 앞에, 전체 안내를 목록 뒤에 둔다. */
export function LetterListView({ letters, initialEditorId = null }: { letters: IssueLetter[]; initialEditorId?: string | null }) {
  const [editorId, setEditorId] = useState<string | null>(initialEditorId && findEditor(initialEditorId) ? initialEditorId : null);
  const [topic, setTopic] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [onlyMine, setOnlyMine] = useState(false);
  const follow = useFollowedEditors();
  const shelf = useLetterShelf();
  const [onlySaved, setOnlySaved] = useState(false);
  const [dismissed, setDismissed] = useState<string[]>([]);

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
  // 최신순을 유지하며 실제 팔로우한 저자의 레터에만 이유를 붙인다.
  const withReason = useMemo(
    () =>
      letters.map((l) => {
        const ed = (l.editors ?? []).flatMap(id => { const editor=findEditor(id); return editor ? [editor] : []; }).find(e => follow.isFollowing(e.id));
        return ed ? { ...l, reason: `팔로우한 ${ed.name} 에디터가 쓴 레터예요` } : l;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [letters, follow.ids],
  );
  const mine = (l: IssueLetter) => (l.editors ?? []).some(id => follow.isFollowing(id));
  const openLetter = (l: IssueLetter, position: number) =>
    trackEvent('letter_card_click', {
      slug: l.slug,
      position,
      reason_type: l.reason?.startsWith('팔로우') ? 'followed_editor' : 'none',
      followed_count: follow.ids.length,
      surface: editor ? 'editor_tab' : 'all',
    });
  const matchCount = withReason.filter(mine).length;
  const shown = withReason.filter(
    (l) =>
      (!editor || editorsOfLetter(l).some((e) => e.id === editor.id)) &&
      (!topic || (l.topics ?? []).includes(topic)) &&
      (!onlyMine || mine(l)) &&
      (!onlySaved || shelf.isSaved(l.slug)) &&
      (!q || [l.title, l.deck, ...(l.topics ?? []), ...l.categories].some((t) => t.toLowerCase().includes(q))),
  );
  // 단계 1 제안: 읽은 레터에서 2편 이상 같은 에디터가 쓴 글이면 그 사실을 알리고 팔로우를 묻는다(추정이 아니라 읽은 횟수만 말한다).
  const suggest = useMemo(() => {
    if (!shelf.ready || !follow.ready) return null;
    const counts = new Map<string, number>();
    for (const l of letters) {
      if (!shelf.isRead(l.slug)) continue;
      const lead = l.editors?.[0] ? findEditor(l.editors[0]) : undefined;
      if (lead) counts.set(lead.id, (counts.get(lead.id) ?? 0) + 1);
    }
    const top = [...counts].filter(([id, n]) => n >= 2 && !follow.isFollowing(id) && !dismissed.includes(id)).sort((a, b) => b[1] - a[1])[0];
    return top ? { editor: findEditor(top[0])!, n: top[1] } : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [letters, shelf.read, shelf.ready, follow.ids, follow.ready, dismissed]);
  useEffect(() => {
    if (suggest) trackEvent('onboarding_suggest_shown', { step: 1, editor: suggest.editor.id });
  }, [suggest?.editor.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const filtering = !!topic || !!q || onlyMine || onlySaved;
  const pickTopic = (name: string) => {
    setTopic(name);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="lt-wrap">
      <style>{LETTER_CSS}</style>
      <header className="lt-hero">
        <h1 className="lt-h1">소식부터 맥락까지, 한 편에.</h1>
      </header>

      <EditorTabs selected={editorId} onSelect={select} />

      <div className="lt-layout">
        {editor && (
          <aside className="lt-aside lt-aside-editor">
            <EditorIntro key={editor.id} editor={editor} following={follow.isFollowing(editor.id)} onToggleFollow={() => { void follow.toggle(editor.id); }} followAvailable={follow.available} followPending={follow.pending} />
          </aside>
        )}
        <main id="main-content" tabIndex={-1} className="lt-main">
          <LetterShelfStatus shelf={shelf} />{follow.error&&<p className="lt-save-note" role="alert">{follow.error} <button type="button" onClick={follow.retry}>팔로우 다시 불러오기</button></p>}<div className="lt-toolbar">
            <h2 className="lt-sec-h lt-sec-inline">{editor ? `${editor.name}의 레터 ${shown.length}편` : `최신 레터 ${shown.length}편`}</h2>
            <div className="lt-toolbar-r">
              {shelf.ready && (
                <button type="button" className="lt-savedtab" aria-describedby="lt-save-note" aria-pressed={onlySaved} onClick={() => setOnlySaved((v) => !v)}>저장한 레터 {shelf.saved.length}</button>
              )}
              <input className="lt-searchbox" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="제목·주제 검색" aria-label="레터 검색" />
            </div>
          </div>
          {shelf.ready && (
            <p id="lt-save-note" className="lt-save-note">
              {shelf.notice}
            </p>
          )}
          {topic && (
            <div className="lt-activefilter">
              주제 <button type="button" className="lt-chip lt-chip-on" onClick={() => setTopic(null)} aria-label={`${topic} 주제 해제`}>{topic} ✕</button>
            </div>
          )}
          {suggest && !editor && !filtering && (
            <div className="lt-suggest">
              <span>{suggest.editor.name} 에디터의 레터를 {suggest.n}편 읽으셨어요. 팔로우하면 새 레터에 표시해 드려요.</span>
              <button type="button" className="lt-suggest-ok" onClick={() => { trackEvent('onboarding_suggest_accepted', { step: 1, editor: suggest.editor.id }); follow.toggle(suggest.editor.id); }}>팔로우</button>
              <button type="button" className="lt-suggest-no" onClick={() => { trackEvent('onboarding_suggest_dismissed', { step: 1, editor: suggest.editor.id }); setDismissed((d) => [...d, suggest.editor.id]); }}>다음에</button>
            </div>
          )}
          {shown.length > 0 ? (
            <div className="lt-rows">
              {shown.map((l, i) => <LetterRow key={l.slug} letter={l} onOpen={() => openLetter(l, i + 1)} latest={!editor && !filtering && i === 0} onTopic={pickTopic} read={shelf.isRead(l.slug)} saved={shelf.isSaved(l.slug)} onToggleSaved={() => { void shelf.toggleSaved(l.slug); }} saveNoticeId={shelf.ready ? 'lt-save-note' : undefined} />)}
            </div>
          ) : (
            <div className="lt-empty" role="status">
              <p>{onlySaved && shelf.saved.length === 0 && !q && !topic && !onlyMine ? '저장한 레터가 아직 없어요.' : editor && !filtering ? `아직 ${editor.name}의 세부 분야와 겹치는 레터가 없어요.` : filtering ? '조건에 맞는 레터가 없어요.' : '레터가 아직 없어요.'}</p>
              {editor && !filtering && <p className="lt-empty-help">에디터를 팔로우하거나 메일로 구독하면 새 레터를 확인할 수 있어요.</p>}
              <div className="lt-empty-actions">
                {filtering && <button type="button" className="lt-eintro-btn" onClick={() => { setQuery(''); setTopic(null); setOnlyMine(false); setOnlySaved(false); }}>조건 지우기</button>}
                {(editor || filtering) && <button type="button" className="lt-eintro-btn" onClick={() => { setQuery(''); setTopic(null); setOnlySaved(false); select(null); }}>전체 레터 보기</button>}
              </div>
            </div>
          )}
        </main>

        {!editor && (
          <aside className="lt-aside lt-aside-all">
            <AllSide />
            {follow.ready && <EditorBar followed={follow.followed} onlyMine={onlyMine} onToggleOnlyMine={() => setOnlyMine((v) => !v)} matchCount={matchCount} onSelect={select} />}
          </aside>
        )}
      </div>
    </div>
  );
}
