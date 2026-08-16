'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { fetchFollowingLetters, type TodayLetterCardLike } from '@/shared/lib/todayLettersApi';
import { letterHref } from '@/shared/lib/letterHref';
import { synthesizeSpeech, sanitizeForTTS } from '@/shared/lib/voiceChat';

// 사이트 하단 고정 오디오 플레이어 — "오늘의 핵심 뉴스"를 벅스뮤직 재생바처럼
// 상시 도킹해 듣는다(2026-08-14, 사용자 레퍼런스: 벅스뮤직 앱 하단 미니플레이어).
// 오늘 발행된 레터 상위 N편을 재생목록으로 삼고, 트랙을 재생할 때 그 자리에서
// TTS(Polly, /api/voice/tts)를 호출해 음성을 만든다 — 별도 팟캐스트 생성
// 파이프라인을 새로 짓지 않고 이미 배포된 챗봇 음성 TTS를 재사용한다(챗봇
// 음성통화용으로 만들어졌지만 임의 텍스트를 다 받는다). 한 번 만든 음성은
// 트랙별로 캐시해 다시 재생할 때 재합성하지 않는다.
const PLAYLIST_SIZE = 5;
const ACCENT = '#3b82f6';

// 2026-08-16 — admin이 레터마다 유튜브 링크(media_embed_url)를 붙이면 TTS 합성
// 대신 유튜브 IFrame Player API로 그 영상을 재생한다(화면엔 안 보이게 1x1로
// 깔고 소리만 낸다). 링크가 없는 레터는 기존 TTS 흐름 그대로. 네이버TV는 IFrame
// 재생 제어 API가 유튜브만큼 안정적으로 문서화돼 있지 않아 이번엔 유튜브만
// 지원 — admin 필드 안내 문구에도 명시.
function extractYoutubeVideoId(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.hostname === 'youtu.be') {
      return u.pathname.slice(1).split('/')[0] || null;
    }
    if (!u.hostname.endsWith('youtube.com')) return null;
    if (u.pathname === '/watch') return u.searchParams.get('v');
    const m = u.pathname.match(/^\/(embed|shorts)\/([^/]+)/);
    return m ? m[2] : null;
  } catch {
    return null;
  }
}

declare global {
  interface Window {
    YT?: {
      Player: new (
        el: HTMLElement,
        opts: {
          videoId: string;
          playerVars?: Record<string, number>;
          events?: {
            onReady?: () => void;
            onStateChange?: (e: { data: number }) => void;
          };
        },
      ) => YTPlayer;
      PlayerState: { ENDED: number; PLAYING: number };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

interface YTPlayer {
  playVideo(): void;
  pauseVideo(): void;
  loadVideoById(videoId: string): void;
  getCurrentTime(): number;
  getDuration(): number;
  destroy(): void;
}

let youtubeApiPromise: Promise<void> | null = null;
function loadYouTubeIframeApi(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.YT) return Promise.resolve();
  if (youtubeApiPromise) return youtubeApiPromise;
  youtubeApiPromise = new Promise((resolve) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve();
    };
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(script);
  });
  return youtubeApiPromise;
}

export function TodayNewsPlayer() {
  const [items, setItems] = useState<TodayLetterCardLike[] | null>(null);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState(0); // 0~1
  const [closed, setClosed] = useState(false);
  const [error, setError] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const cacheRef = useRef<Map<string, string>>(new Map()); // letterId -> blob URL
  const ytContainerRef = useRef<HTMLDivElement | null>(null);
  const ytPlayerRef = useRef<YTPlayer | null>(null);
  const ytLoadedVideoIdRef = useRef<string | null>(null);
  const ytProgressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchFollowingLetters(PLAYLIST_SIZE).then((data) => {
      if (!cancelled) setItems(data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // 언마운트 시 캐시해둔 blob URL 정리 — 메모리 누수 방지.
  useEffect(() => {
    return () => {
      cacheRef.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  const current = items && items.length > 0 ? items[Math.min(index, items.length - 1)] : null;

  const ensureAudio = () => {
    if (!audioRef.current) {
      const el = new Audio();
      el.addEventListener('timeupdate', () => {
        if (el.duration) setProgress(el.currentTime / el.duration);
      });
      el.addEventListener('ended', () => {
        setPlaying(false);
        setProgress(0);
        setIndex((i) => (items && i + 1 < items.length ? i + 1 : 0));
      });
      audioRef.current = el;
    }
    return audioRef.current;
  };

  function stopYtProgressPolling() {
    if (ytProgressTimerRef.current) {
      clearInterval(ytProgressTimerRef.current);
      ytProgressTimerRef.current = null;
    }
  }

  async function playYoutube(videoId: string) {
    setError(false);
    await loadYouTubeIframeApi();
    if (!window.YT || !ytContainerRef.current) {
      setError(true);
      return;
    }
    if (!ytPlayerRef.current) {
      await new Promise<void>((resolve) => {
        ytPlayerRef.current = new window.YT!.Player(ytContainerRef.current!, {
          videoId,
          playerVars: { autoplay: 0, controls: 0 },
          events: {
            onReady: () => resolve(),
            onStateChange: (e) => {
              if (e.data === window.YT!.PlayerState.ENDED) {
                stopYtProgressPolling();
                setPlaying(false);
                setProgress(0);
                setIndex((i) => (items && i + 1 < items.length ? i + 1 : 0));
              }
            },
          },
        });
      });
      ytLoadedVideoIdRef.current = videoId;
    } else if (ytLoadedVideoIdRef.current !== videoId) {
      ytPlayerRef.current.loadVideoById(videoId);
      ytLoadedVideoIdRef.current = videoId;
    }
    ytPlayerRef.current?.playVideo();
    setPlaying(true);
    setProgress(0);
    stopYtProgressPolling();
    ytProgressTimerRef.current = setInterval(() => {
      const p = ytPlayerRef.current;
      const duration = p?.getDuration();
      if (p && duration) setProgress(p.getCurrentTime() / duration);
    }, 250);
  }

  async function play() {
    if (!current) return;
    const videoId = extractYoutubeVideoId(current.mediaEmbedUrl);
    if (videoId) return playYoutube(videoId);

    setError(false);
    const el = ensureAudio();

    let url = cacheRef.current.get(current.letterId);
    if (!url) {
      setGenerating(true);
      try {
        const text = sanitizeForTTS(`${current.title}. ${current.excerpt}`);
        url = await synthesizeSpeech(text);
        cacheRef.current.set(current.letterId, url);
      } catch (e) {
        console.warn('오늘의 핵심 뉴스 TTS 실패', e);
        setError(true);
        setGenerating(false);
        return;
      }
      setGenerating(false);
    }

    if (el.src !== url) {
      el.src = url;
      setProgress(0);
    }
    try {
      await el.play();
      setPlaying(true);
    } catch (e) {
      console.warn('오디오 재생 실패', e);
      setError(true);
    }
  }

  function pause() {
    audioRef.current?.pause();
    ytPlayerRef.current?.pauseVideo();
    stopYtProgressPolling();
    setPlaying(false);
  }

  // 언마운트 시 유튜브 플레이어·폴링 정리.
  useEffect(() => {
    return () => {
      stopYtProgressPolling();
      ytPlayerRef.current?.destroy();
    };
  }, []);

  // 트랙이 바뀌면 재생 중이던 오디오는 멈춘다 — 다음 트랙은 버튼을 다시
  // 눌러야 재생(자동 넘어감은 ended 이벤트에서만, 사용자가 prev/next를
  // 누른 경우는 명시적으로 다시 재생해야 자연스럽다).
  useEffect(() => {
    if (audioRef.current && !audioRef.current.paused) {
      audioRef.current.pause();
    }
    ytPlayerRef.current?.pauseVideo();
    stopYtProgressPolling();
    setPlaying(false);
    setProgress(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- index 변경 시에만
  }, [index]);

  if (!items || items.length === 0 || closed || !current) return null;

  const total = items.length;

  return (
    <div
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 70,
        background: '#fff',
        borderTop: '1px solid rgba(0,0,0,0.08)',
        boxShadow: '0 -2px 16px rgba(17,24,39,0.08)',
      }}
    >
      {/* 유튜브 플레이어 컨테이너 — media_embed_url이 있는 레터를 처음 재생할 때
          여기에 IFrame이 생긴다. 화면엔 안 보이지만 IFrame API가 실제 엘리먼트를
          요구해서 1x1로 깔아둔다(display:none은 유튜브가 재생을 멈추게 할 수 있어
          크기로만 숨김). 어떤 트랙에 링크가 있을지 몰라 항상 마운트해둔다. */}
      <div ref={ytContainerRef} style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden' }} />

      {/* 진행바 — 상단 얇은 줄 */}
      <div style={{ height: 3, background: '#f0f0ef' }}>
        <div
          style={{
            height: '100%',
            width: `${Math.min(100, progress * 100)}%`,
            background: ACCENT,
            transition: playing ? 'width 0.2s linear' : 'none',
          }}
        />
      </div>

      <div
        className="mx-auto flex items-center"
        style={{ maxWidth: 1080, height: 60, padding: '0 clamp(12px, 3vw, 24px)', gap: 12 }}
      >
        {/* 아이콘 배지 */}
        <div
          className="flex items-center justify-center flex-shrink-0"
          style={{ width: 36, height: 36, borderRadius: 10, background: '#eff6ff' }}
          aria-hidden
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={ACCENT} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 18V5l12-2v13" />
            <circle cx="6" cy="18" r="3" />
            <circle cx="18" cy="16" r="3" />
          </svg>
        </div>

        {/* 트랙 정보 */}
        <Link
          href={letterHref(current.letterId)}
          className="min-w-0 flex-1 hover:opacity-70 transition-opacity"
          style={{ textDecoration: 'none' }}
        >
          <p style={{ fontSize: 10.5, fontWeight: 700, color: ACCENT, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 1 }}>
            오늘의 핵심 뉴스 {total > 1 ? `· ${index + 1}/${total}` : ''}
          </p>
          <p
            className="text-gray-900"
            style={{
              fontSize: 13.5,
              fontWeight: 600,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {error ? '음성을 만들지 못했어요 — 다시 시도해주세요' : current.title}
          </p>
        </Link>

        {/* 컨트롤 */}
        <div className="flex items-center flex-shrink-0" style={{ gap: 4 }}>
          {total > 1 && (
            <button
              type="button"
              aria-label="이전 뉴스"
              onClick={() => setIndex((i) => (i - 1 + total) % total)}
              className="hidden sm:flex items-center justify-center"
              style={{ width: 30, height: 30, borderRadius: '50%', border: 'none', background: 'transparent', color: '#6b7280', cursor: 'pointer' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" /></svg>
            </button>
          )}

          <button
            type="button"
            aria-label={playing ? '일시정지' : '재생'}
            onClick={() => (playing ? pause() : play())}
            disabled={generating}
            className="flex items-center justify-center"
            style={{
              width: 38,
              height: 38,
              borderRadius: '50%',
              border: 'none',
              background: '#111827',
              color: '#fff',
              cursor: generating ? 'default' : 'pointer',
              opacity: generating ? 0.6 : 1,
            }}
          >
            {generating ? (
              <span
                aria-hidden
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  border: '2px solid rgba(255,255,255,0.35)',
                  borderTopColor: '#fff',
                  animation: 'tnp-spin 0.7s linear infinite',
                }}
              />
            ) : playing ? (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h4v14H6zm8 0h4v14h-4z" /></svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: 2 }}><path d="M8 5v14l11-7z" /></svg>
            )}
          </button>

          {total > 1 && (
            <button
              type="button"
              aria-label="다음 뉴스"
              onClick={() => setIndex((i) => (i + 1) % total)}
              className="hidden sm:flex items-center justify-center"
              style={{ width: 30, height: 30, borderRadius: '50%', border: 'none', background: 'transparent', color: '#6b7280', cursor: 'pointer' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M16 6h2v12h-2zM6 6l8.5 6L6 18z" /></svg>
            </button>
          )}

          <div style={{ width: 1, height: 20, background: 'rgba(0,0,0,0.08)', margin: '0 4px' }} />

          <button
            type="button"
            aria-label="닫기"
            onClick={() => {
              pause();
              setClosed(true);
            }}
            className="flex items-center justify-center"
            style={{ width: 28, height: 28, borderRadius: '50%', border: 'none', background: 'transparent', color: '#9ca3af', cursor: 'pointer' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
      </div>
      <style>{`@keyframes tnp-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
