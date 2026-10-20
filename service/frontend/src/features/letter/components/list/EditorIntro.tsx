'use client';

import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/entities/user';
import { clock, spoken } from '@/shared/lib/media/mediaPlayerFormat';
import { type LetterEditor } from '../../data/editors';
import { EditorAvatar } from '../EditorAvatar';
import { LoginPromptDialog } from '../dialog/LoginPromptDialog';
import { SubscribeDialog } from '../dialog/SubscribeDialog';

/** 소개 음성(6~12초 mp3) 재생 막대. 막대 전체가 재생·멈춤 버튼이고, 진행 막대와 시간은 보기 전용이다(짧은 음성이라 탐색은 두지 않는다). */
function EditorVoiceBar({ name, src }: { name: string; src: string }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState({ t: 0, d: 0 });
  const [failed, setFailed] = useState(false);

  const sync = (el: HTMLAudioElement) => setTime({ t: el.currentTime, d: Number.isFinite(el.duration) ? el.duration : 0 });

  useEffect(() => {
    const el = audio.current;
    // 서버 렌더 화면(/letter/editors/{id})에서는 하이드레이션 전에 길이 정보가 먼저 도착해 이벤트를 놓칠 수 있어 한 번 직접 읽는다.
    if (el && el.readyState >= HTMLMediaElement.HAVE_METADATA) sync(el);
    // 에디터를 바꾸거나 화면을 벗어나면 재생을 멈춘다.
    return () => el?.pause();
  }, []);
  const toggle = () => {
    const el = audio.current;
    if (!el) return;
    if (!el.paused) return el.pause();
    setFailed(false);
    void el.play().catch(() => { setPlaying(false); setFailed(true); });
  };
  const ratio = time.d > 0 ? Math.min(1, time.t / time.d) : 0;
  const started = playing || time.t > 0;

  return (
    <>
      <button type="button" className="lt-voice" data-playing={playing || undefined} onClick={toggle}>
        <span className="lt-voice-icon" aria-hidden>
          {playing ? (
            <svg width={16} height={16} viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
          ) : (
            <svg width={16} height={16} viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: 2 }}><path d="M8 5v14l11-7z" /></svg>
          )}
        </span>
        <span className="lt-voice-body">
          <span className="lt-voice-top">
            {/* 버튼 이름은 보이는 글자에서 나온다. 화면에 안 보이는 보충 설명(길이·멈춤 안내)은 sr-only로 붙인다. */}
            <span className="lt-voice-label">
              {playing ? <>듣는 중<span className="sr-only">, 누르면 멈춰요</span></> : <>{name} 소개 듣기{time.d > 0 && <span className="sr-only">, {spoken(time.d)}</span>}</>}
              {playing && <span className="lt-voice-eq" aria-hidden><i /><i /><i /></span>}
            </span>
            {time.d > 0 && <span className="lt-voice-time" aria-hidden>{started ? `${clock(time.t)} / ${clock(time.d)}` : clock(time.d)}</span>}
          </span>
          <span className="lt-voice-track" aria-hidden><span className="lt-voice-fill" style={{ transform: `scaleX(${ratio})` }} /></span>
        </span>
      </button>
      <audio
        ref={audio}
        src={src}
        preload="metadata"
        onLoadedMetadata={(e) => sync(e.currentTarget)}
        onTimeUpdate={(e) => sync(e.currentTarget)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={(e) => { e.currentTarget.currentTime = 0; sync(e.currentTarget); }}
        onError={() => { setPlaying(false); setFailed(true); }}
      />
      {failed && <p className="lt-voice-error" role="alert">소개 음성을 재생하지 못했어요. 잠시 뒤 다시 눌러 주세요.</p>}
    </>
  );
}

/** 선택한 에디터의 자기소개: 이미지, 역할, 소개 문구(인용), 담당 분야, 소개 음성(미리 만든 mp3), 팔로우, 메일 구독. */
export function EditorIntro({ editor, following, onToggleFollow, followAvailable=true, followPending=false }: { followAvailable?:boolean; followPending?:boolean; editor: LetterEditor; following: boolean; onToggleFollow: () => void }) {
  const [subOpen, setSubOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const { isAuthenticated, isLoading } = useAuth();

  // 팔로우·해제는 로그인한 계정으로만 처리한다. 비로그인은 안내 대화상자를 띄운다.
  const clickFollow = () => {
    if (isAuthenticated) return onToggleFollow();
    if (!isLoading) setLoginOpen(true);
  };

  return (
    <section className="lt-eintro" aria-label={`${editor.name} 에디터 소개`}>
      <div className="lt-eintro-head">
        <div className="lt-eintro-photo"><EditorAvatar editor={editor} size={72} /></div>
        <div>
          <div className="lt-eintro-name">
            <h2>{editor.name}</h2>
            <span className="lt-ed-badge">{editor.mbti ?? editor.group}</span>
          </div>
          <p className="lt-eintro-role">{editor.role}</p>
        </div>
      </div>
      <p className="lt-eintro-summary">{editor.forWhom}</p>
      <div className="lt-eintro-actions">
        <button type="button" className="lt-eintro-sub" aria-expanded={subOpen} onClick={() => setSubOpen(true)}>메일로 구독</button>
        <button type="button" className="lt-eintro-btn" aria-pressed={following} disabled={isLoading||followPending||isAuthenticated&&!followAvailable} onClick={clickFollow}>{following ? '팔로우 중' : '팔로우'}</button>
      </div>
      <div className="lt-eintro-details">
        <p className="lt-eintro-quote">{editor.intro}</p>
        <p className="lt-eintro-pitch"><b>{editor.when}에 읽기 좋아요</b>{editor.pitch}</p>
        <p className="lt-eintro-scope"><span>담당 분야</span>{editor.topics.map((t) => t.name).join(' · ')}</p>
        {editor.voice && <EditorVoiceBar key={editor.voice} name={editor.name} src={editor.voice} />}
        <p className="lt-eintro-ai">모든 레터는 같은 중립 편집 원칙을 따라요</p>
      </div>
      <LoginPromptDialog open={loginOpen} onClose={() => setLoginOpen(false)} editorName={editor.name} />
      <SubscribeDialog open={subOpen} onClose={() => setSubOpen(false)} source={`editor:${editor.id}`} editors={[editor]}
        title={`${editor.name} 에디터의 새 레터를 메일로 받기`}
        lead={<>{editor.topics.slice(0, 4).map((t) => t.name).join(' · ')} 등 {editor.name}의 담당 분야와 겹치는 레터를 보내요.</>} />
    </section>
  );
}
