'use client';

import { useState } from 'react';
import Link from 'next/link';
import { editorInterests, type LetterEditor } from '../data/editors';
import type { IssueLetter } from '../data/letterTypes';
import { useFollowedEditors } from '../lib/useFollowedEditors';
import { useInterests } from '../lib/useInterests';
import { EditorAvatar } from './EditorAvatar';
import { LetterCard } from './LetterCard';
import { SubscribeForm } from './SubscribeForm';
import { LETTER_CSS } from './letterStyles';

/** 에디터 프로필: 소개·세부 분야·겹치는 레터 목록, 팔로우(이 기기), 메일 구독(이메일 입력 → 확인 메일 → 새 레터 수신). */
export function EditorProfileView({ editor, letters }: { editor: LetterEditor; letters: IssueLetter[] }) {
  const [subOpen, setSubOpen] = useState(false);
  const interests = useInterests();
  const follow = useFollowedEditors(interests.save);
  const following = follow.isFollowing(editor.id);
  return (
    <div className="lt-wrap">
      <style>{LETTER_CSS}</style>
      <Link href="/letter" className="ld-back">← 레터 목록으로</Link>
      <header className="lt-ed-head">
        <EditorAvatar editor={editor} size={72} />
        <div className="lt-ed-headtext">
          <h1 className="lt-ed-h1">{editor.name} <span className="lt-ed-badge">AI 에디터</span></h1>
          <p className="lt-ed-sub">{editor.role} · {editor.forWhom}</p>
          <p className="lt-ed-bio">{editor.bio}</p>
          <ul className="lt-ed-topics" aria-label="세부 분야">
            {editor.topics.map((t) => <li key={t.slug} className="lt-topic" data-soon={t.soon ? 'true' : undefined}>{t.name}</li>)}
          </ul>
        </div>
        <div className="lt-ed-actions">
          <button type="button" className="lt-ed-follow lt-ed-follow-lg" aria-pressed={following} onClick={() => follow.toggle(editor.id)} disabled={!follow.ready}>{following ? '팔로우 중' : '팔로우'}</button>
          <button type="button" className="lt-int-btn" aria-expanded={subOpen} onClick={() => setSubOpen((v) => !v)}>{subOpen ? '닫기' : '메일로 구독'}</button>
        </div>
      </header>
      <p className="lt-ed-note">모든 레터는 같은 중립 편집 원칙을 따라요. 에디터는 맡은 관심 영역만 달라요. 한 레터는 여러 에디터에 함께 나올 수 있어요.</p>

      {subOpen && <SubscribeForm interests={editorInterests(editor)} onClose={() => setSubOpen(false)} heading={`${editor.name} 에디터의 새 레터를 메일로 받기`} />}

      <h2 className="lt-sec-h">세부 분야와 겹치는 레터 {letters.length}편</h2>
      {letters.length > 0 ? (
        <div className="lt-grid">{letters.map((l) => <LetterCard key={l.slug} letter={l} />)}</div>
      ) : (
        <p className="lt-empty">아직 겹치는 레터가 없어요. 팔로우하거나 구독하면 나오는 대로 알려 드려요.</p>
      )}
    </div>
  );
}
