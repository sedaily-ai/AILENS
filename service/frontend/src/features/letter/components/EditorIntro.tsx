'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { editorInterests, type LetterEditor } from '../data/editors';
import { EditorAvatar } from './EditorAvatar';
import { SubscribeDialog } from './SubscribeDialog';

/** 선택한 에디터의 자기소개: 이미지, 역할, 소개 문구(인용), 담당 분야, 소개 음성(미리 만든 mp3), 팔로우, 메일 구독. */
export function EditorIntro({ editor, following, onToggleFollow }: { editor: LetterEditor; following: boolean; onToggleFollow: () => void }) {
  const [playing, setPlaying] = useState(false);
  const [subOpen, setSubOpen] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);

  useEffect(() => () => { audio.current?.pause(); audio.current = null; }, [editor.id]);

  const stop = () => {
    audio.current?.pause();
    audio.current = null;
    setPlaying(false);
  };
  const toggleVoice = () => {
    if (!editor.voice) return;
    if (playing) return stop();
    const el = new Audio(editor.voice);
    el.addEventListener('ended', () => setPlaying(false));
    el.addEventListener('error', () => setPlaying(false));
    audio.current = el;
    setPlaying(true);
    void el.play().catch(() => setPlaying(false));
  };

  return (
    <section className="lt-eintro" aria-label={`${editor.name} 에디터 소개`} style={{ '--tone-bg': editor.tone.bg, '--tone-fg': editor.tone.fg } as CSSProperties}>
      <div className="lt-eintro-photo"><EditorAvatar editor={editor} size={168} rounded /></div>
      <div className="lt-eintro-body">
        <div className="lt-eintro-name">
          <h2>{editor.name}</h2>
          <span className="lt-ed-badge">AI 에디터</span>
          <span className="lt-ed-badge lt-ed-mbti">{editor.mbti ?? editor.group}</span>
        </div>
        <p className="lt-eintro-role">{editor.role}</p>
        <blockquote className="lt-eintro-quote">{editor.intro}</blockquote>
        <p className="lt-eintro-scope"><span>담당 분야</span>{editor.topics.map((t) => t.name).join(' · ')}</p>
        <div className="lt-eintro-actions">
          <button type="button" className="lt-eintro-sub" aria-expanded={subOpen} onClick={() => setSubOpen(true)}>메일로 구독</button>
          <button type="button" className="lt-eintro-btn" aria-pressed={following} onClick={onToggleFollow}>{following ? '팔로우 중' : '팔로우'}</button>
          {editor.voice && <button type="button" className="lt-eintro-btn" aria-pressed={playing} onClick={toggleVoice}>{playing ? '소개 멈추기' : '소개 듣기'}</button>}
        </div>
      </div>
      <SubscribeDialog open={subOpen} onClose={() => setSubOpen(false)} interests={editorInterests(editor)} source={`editor:${editor.id}`} editors={[editor]}
        title={`${editor.name} 에디터의 새 레터를 메일로 받기`}
        lead={<>{editor.topics.slice(0, 4).map((t) => t.name).join(' · ')} 등 {editor.name}의 담당 분야와 겹치는 레터를 보내요.</>} />
    </section>
  );
}
