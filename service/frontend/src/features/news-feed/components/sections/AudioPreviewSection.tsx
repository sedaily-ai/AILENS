'use client';

import { PodcastSketch } from '@/shared/ui/icons/VideoSketch';
import { HandUnderline } from '@/shared/ui/effects/HandUnderline';
import { useRef, useState } from 'react';
import { displayHeadline } from '@/shared/lib/content/displayHeadline';
import { fetchHomePlayerPosts, type HomePlayerPost } from '@/shared/lib/api/homePlayerApi';
import { kstDateTimeLabel } from '@/shared/lib/date/date';
import { isDirectAudioUrl } from '@/shared/lib/media/videoEmbed';
import { requestPlayHomePlayerItem } from '@/shared/lib/media/audioPlayerBus';
import { useServerSeededList } from '@/shared/hooks/useServerSeededList';

// 카드 인덱스로 /lens 형식 선택 UI의 4개 라인아트(레터/웹툰/팟캐스트/영상)를 순환시켜 카드마다 다른 캐릭터를 쓴다. 아바타·재생 배지 색은 중립 톤을 유지한다.

// 오디오 섹션 — /listen 목록 페이지(ListenListClient.tsx)와 같은 데이터(home_player 채널)와 행 디자인을 쓴다.
// thumbnail이 없는 순수 오디오/짧은 영상 콘텐츠이므로 이미지 카드가 아닌 텍스트 위주 리스트로 구성한다.
interface Props {
  initialItems?: HomePlayerPost[];
}

const PREVIEW_COUNT = 5;

export function AudioPreviewSection({ initialItems }: Props) {
  const items = useServerSeededList<HomePlayerPost[], null>(initialItems, null, fetchHomePlayerPosts);
  const [nowId, setNowId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState({ t: 0, d: 0 });
  const audioRef = useRef<HTMLAudioElement>(null);
  const fmt = (sec: number) => (Number.isFinite(sec) && sec > 0 ? `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}` : '0:00');
  // 그 자리 재생 — 같은 행이면 재생/일시정지, 다른 행이면 그 곡으로 바꿔 재생한다. 하단 고정 플레이어를 멈추는 신호가 없으므로 목록 쪽에서 한 곡만 재생하도록 제한한다.
  const playItem = (it: HomePlayerPost) => {
    const a = audioRef.current;
    if (!a) return;
    setNowId(it.id);
    setProgress({ t: 0, d: 0 });
    a.src = it.mediaEmbedUrl;
    void a.play().catch(() => setPlaying(false));
  };
  const toggleItem = (it: HomePlayerPost) => {
    const a = audioRef.current;
    if (!a) return;
    if (nowId === it.id) {
      if (a.paused) void a.play().catch(() => undefined);
      else a.pause();
    } else playItem(it);
  };

  if (!items || items.length === 0) return null;

  // 홈은 미리보기만 보여 준다(최신 5건). 날짜 필터·더 불러오기·전용 목록 페이지는 없다.
  const shown = items.slice(0, PREVIEW_COUNT);

  return (
    <section>
      <header style={{ marginBottom: 6, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8, fontSize: 'clamp(17px, 3.6vw, 20px)', fontWeight: 800, letterSpacing: '-0.02em', color: '#111827' }}>
          <PodcastSketch className="w-12 h-10 -ml-1" />
          <HandUnderline>오늘의 뉴스를 귀로</HandUnderline>
        </h2>
      </header>

      <style>{`
        .ap-list { border-top: 1px solid #e5e7eb; }
        .ap-row { border-bottom: 1px solid #eceef1; }
        .ap-day { margin: 0; padding: 12px 4px 4px; font-size: 12.5px; font-weight: 800; color: #6b7280; background: #fff; position: sticky; top: 0; z-index: 1; }
        .ap-main { width: 100%; display: flex; align-items: center; gap: 16px; padding: 14px 4px; border: none; background: none; text-align: left; cursor: pointer; }
        .ap-title { transition: color .18s ease; }
        .ap-main:hover .ap-title, .ap-row.is-on .ap-title { color: #3d70de; }
        .ap-play { flex-shrink: 0; width: 44px; height: 44px; border-radius: 50%; background: #1f2937; color: #fff; display: flex; align-items: center; justify-content: center; transition: background .2s ease, transform .2s ease; }
        .ap-main:hover .ap-play { background: #3d70de; transform: scale(1.06); }
        .ap-main:active .ap-play { transform: scale(.94); }
        .ap-row.is-on .ap-play { background: #3d70de; }
        .ap-bar { display: flex; align-items: center; gap: 12px; padding: 0 4px 14px 64px; }
        .ap-time { font-size: 12px; color: #6b7280; font-variant-numeric: tabular-nums; min-width: 34px; }
        .ap-range { flex: 1; -webkit-appearance: none; appearance: none; height: 4px; border-radius: 999px; background: linear-gradient(to right, #3d70de var(--p, 0%), #e5e7eb var(--p, 0%)); outline: none; cursor: pointer; }
        .ap-range::-webkit-slider-thumb { -webkit-appearance: none; width: 14px; height: 14px; border-radius: 50%; background: #3d70de; border: 2px solid #fff; box-shadow: 0 1px 4px rgba(17,24,39,.3); }
        .ap-range::-moz-range-thumb { width: 12px; height: 12px; border-radius: 50%; background: #3d70de; border: 2px solid #fff; }
        .ap-eq { display: flex; align-items: flex-end; gap: 2.5px; height: 16px; }
        .ap-eq i { width: 3px; border-radius: 2px; background: #fff; animation: ap-eq .9s ease-in-out infinite; }
        .ap-eq i:nth-child(2) { animation-delay: .2s; } .ap-eq i:nth-child(3) { animation-delay: .4s; }
        @keyframes ap-eq { 0%, 100% { height: 4px; } 50% { height: 16px; } }
        @media (prefers-reduced-motion: reduce) { .ap-title, .ap-play, .ap-eq i { transition: none; animation: none; } .ap-eq i { height: 10px; } }
      `}</style>
      {/* 플레이리스트 — 세로 한 열 목록을 영역 안에서 스크롤한다. 행을 누르면 그 자리에서 재생되고, 재생 중인 행 아래에 타임라인(진행 막대·현재/전체 시간)이 펼쳐진다. 다시 누르면 일시정지, 이동은 오른쪽 › 로 한다. */}
      <audio
        ref={audioRef}
        preload="none"
        onTimeUpdate={(e) => setProgress({ t: e.currentTarget.currentTime, d: e.currentTarget.duration || 0 })}
        onLoadedMetadata={(e) => setProgress({ t: e.currentTarget.currentTime, d: e.currentTarget.duration || 0 })}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          const i = shown.findIndex((x) => x.id === nowId);
          const next = shown.slice(i + 1).find((x) => isDirectAudioUrl(x.mediaEmbedUrl));
          if (next) playItem(next);
        }}
      />
      <div
        className="ap-list"
      >
        {shown.map((it) => {
          const isAudio = isDirectAudioUrl(it.mediaEmbedUrl);
          const on = nowId === it.id;
          const p = progress.d > 0 ? (progress.t / progress.d) * 100 : 0;
          return (
            <div key={it.id} className={`ap-row${on ? ' is-on' : ''}`}>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <button type="button" className="ap-main" aria-label={`${it.title} ${on && playing ? '일시정지' : '재생'}`} onClick={() => (isAudio ? toggleItem(it) : requestPlayHomePlayerItem(it.id))}>
                  <span className="ap-play" aria-hidden>
                    {on && playing ? (
                      <span className="ap-eq"><i /><i /><i /></span>
                    ) : (
                      <svg width={16} height={16} viewBox="0 0 24 24" fill="#fff" style={{ marginLeft: 2 }}>
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    )}
                  </span>
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span className="ap-title" style={{ display: '-webkit-box', fontSize: 16, fontWeight: 700, lineHeight: 1.4, letterSpacing: '-0.02em', color: '#111827', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', wordBreak: 'keep-all', textWrap: 'pretty' }}>
                      {displayHeadline(it.title)}
                    </span>
                    <span style={{ display: 'block', marginTop: 5, fontSize: 12.5, color: '#9ca3af', fontVariantNumeric: 'tabular-nums' }}>
                      {it.category ?? (isAudio ? '팟캐스트' : '영상')}
                      {it.date && <> · {kstDateTimeLabel(it.publishedAt) ?? it.date.replaceAll('-', '.')}</>}
                    </span>
                  </span>
                </button>
              </div>
              {on && (
                <div className="ap-bar">
                  <span className="ap-time">{fmt(progress.t)}</span>
                  <input
                    type="range"
                    className="ap-range"
                    min={0}
                    max={progress.d || 0}
                    step={0.1}
                    value={Math.min(progress.t, progress.d || 0)}
                    style={{ ['--p' as string]: `${p}%` }}
                    aria-label="재생 위치"
                    onChange={(e) => {
                      const a = audioRef.current;
                      if (a) a.currentTime = Number(e.target.value);
                    }}
                  />
                  <span className="ap-time" style={{ textAlign: 'right' }}>{fmt(progress.d)}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
