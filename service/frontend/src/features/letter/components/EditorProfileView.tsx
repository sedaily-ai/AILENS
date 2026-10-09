'use client';

import { useState } from 'react';
import Link from 'next/link';
import { editorInterests, type LetterEditor } from '../data/editors';
import type { IssueLetter } from '../data/letterTypes';
import { EditorAvatar } from './EditorAvatar';
import { LetterCard } from './LetterCard';
import { SubscribeForm } from './SubscribeForm';
import { LETTER_CSS } from './letterStyles';

/** 에디터 프로필: 소개·담당 주제·쓴 레터 목록, 그리고 "구독하기"(이메일 입력 → 확인 메일 → 새 레터 수신). */
export function EditorProfileView({ editor, letters }: { editor: LetterEditor; letters: IssueLetter[] }) {
  const [subOpen, setSubOpen] = useState(false);
  return (
    <div className="lt-wrap">
      <style>{LETTER_CSS}</style>
      <Link href="/letter" className="ld-back">← 레터 목록으로</Link>
      <header className="lt-ed-head">
        <EditorAvatar editor={editor} size={72} />
        <div className="lt-ed-headtext">
          <h1 className="lt-ed-h1">{editor.name} <span className="lt-ed-badge">AI 에디터</span></h1>
          <p className="lt-ed-sub">{editor.title}</p>
          <p className="lt-ed-bio">{editor.bio}</p>
          <ul className="lt-ed-topics" aria-label="담당 분야와 대표 주제">
            {editor.categories.map((c) => <li key={c} className="lt-ed-cat">{c}</li>)}
            {editor.topics.map((t) => <li key={t.slug} className="lt-topic">{t.name}</li>)}
          </ul>
        </div>
        <button type="button" className="lt-int-btn lt-ed-sub-btn" aria-expanded={subOpen} onClick={() => setSubOpen((v) => !v)}>
          {subOpen ? '닫기' : '구독하기'}
        </button>
      </header>
      <p className="lt-ed-note">모든 레터는 같은 중립 편집 원칙을 따라요. 에디터는 담당 분야만 달라요.</p>

      {subOpen && <SubscribeForm interests={editorInterests(editor)} onClose={() => setSubOpen(false)} heading={`${editor.name} 에디터 구독`} />}

      <h2 className="lt-sec-h">{editor.name}의 레터 {letters.length}편</h2>
      {letters.length > 0 ? (
        <div className="lt-grid">{letters.map((l) => <LetterCard key={l.slug} letter={l} />)}</div>
      ) : (
        <p className="lt-empty">아직 발행한 레터가 없어요. 구독하면 첫 레터가 나올 때 메일로 알려 드려요.</p>
      )}
    </div>
  );
}
