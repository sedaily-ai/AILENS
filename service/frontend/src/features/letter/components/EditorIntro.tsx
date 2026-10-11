'use client';

import { useEffect, useRef, useState } from 'react';
import { editorInterests, type LetterEditor } from '../data/editors';
import { EditorAvatar } from './EditorAvatar';
import { SubscribeForm } from './SubscribeForm';

/** 선택한 에디터의 자기소개: 이미지, 역할, 소개 문구, 세부 분야, 소개 음성(미리 만든 mp3), 팔로우, 메일 구독. */
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
    <section className="lt-eintro" aria-label={`${editor.name} 에디터 소개`}>
      <div className="lt-ed-head">
        <EditorAvatar editor={editor} size={96} />
        <div className="lt-ed-headtext">
          <h2 className="lt-ed-h1">{editor.name} <span className="lt-ed-badge">AI 에디터</span> <span className="lt-ed-badge lt-ed-mbti">{editor.mbti ?? editor.group}</span></h2>
          <p className="lt-ed-sub">{editor.role} · {editor.nickname} · {editor.forWhom}</p>
          <p className="lt-ed-bio">{editor.intro}</p>
          <ul className="lt-ed-topics" aria-label="세부 분야">
            {editor.topics.map((t) => <li key={t.slug} className="lt-topic">{t.name}</li>)}
          </ul>
          <div className="lt-eintro-actions">
            {editor.voice && <button type="button" className="lt-eintro-voice" aria-pressed={playing} onClick={toggleVoice}>{playing ? '소개 멈추기' : '소개 듣기'}</button>}
            <button type="button" className="lt-ed-follow lt-ed-follow-lg" aria-pressed={following} onClick={onToggleFollow}>{following ? '팔로우 중' : '팔로우'}</button>
            <button type="button" className="lt-int-btn" aria-expanded={subOpen} onClick={() => setSubOpen((v) => !v)}>{subOpen ? '닫기' : '메일로 구독'}</button>
          </div>
        </div>
      </div>
      <p className="lt-ed-note">모든 레터는 같은 중립 편집 원칙을 따라요. 에디터는 맡은 관심 영역만 달라요. 한 레터는 여러 에디터에 함께 나올 수 있어요.</p>
      {subOpen && <SubscribeForm interests={editorInterests(editor)} onClose={() => setSubOpen(false)} heading={`${editor.name} 에디터의 새 레터를 메일로 받기`} />}
    </section>
  );
}
