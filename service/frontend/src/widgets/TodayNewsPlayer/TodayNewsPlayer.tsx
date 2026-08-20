'use client';

import { useEffect, useRef, useState } from 'react';
import { fetchHomePlayerPlaylist, type HomePlayerItem } from '@/shared/lib/api/homePlayerApi';
import { useAuth } from '@/features/auth';
import { ListeningHeadphoneIllustration } from '@/shared/ui/icons/HandDrawnIcons';

// 북마크는 로그인한 사람만 쓸 수 있다(2026-08-21, 사용자 요청 — "로그인하면
// 북마크 가능하게"). 지금은 클라이언트 localStorage에만 저장한다 — 이
// 재생목록 항목에 대한 "즐겨찾기"를 서버에 영구 저장하는 API/테이블이 아직
// 없어서, 기기 바꾸면 안 남는다는 한계가 있다(다음에 서버 저장까지 가고
// 싶으면 personal_db_client.py 쪽에 새 테이블/필드가 필요 — 지금 있는
// ArchivedSentence는 레터 문장 저장용이라 이 항목과는 다른 도메인).
const BOOKMARK_STORAGE_KEY = 'ailens-player-bookmarks';

// 사이트 하단 고정 오디오 플레이어 — 벅스뮤직 재생바처럼 상시 도킹해 듣는다
// (2026-08-14, 사용자 레퍼런스: 벅스뮤직 앱 하단 미니플레이어).
//
// 2026-08-16: 처음엔 "오늘의 핵심 뉴스"(발행된 레터)를 그 자리에서 TTS로
// 읽어주는 방식이었는데, admin이 기사와 무관하게 직접 만드는 "제목+유튜브
// 링크" 재생목록(홈 플레이어 관리 화면)으로 완전히 대체했다 — TTS 합성
// 로직은 그래서 제거. 유튜브 IFrame Player API를 화면엔 안 보이는 1x1
// 컨테이너로 띄워서 재생/일시정지/진행률을 제어한다.
//
// 2026-08-21: mp3 등 직접 파일 URL 재생 추가(사용자 요청 — "기존 오디오
// 파일 있는거 플레이북쪽에 넣어주시죠"). lens 팟캐스트 서브포맷이 S3에
// mp3를 올려두는데, 여태 이 플레이어는 YouTube만 재생 가능해서 목록에
// 못 넣고 있었다. <audio> 엘리먼트를 하나 더 두고 URL 패턴으로 유튜브
// vs 직접 파일을 갈라 재생 — VideoLightbox의 "직접 파일" 분기와 같은
// 원리.
const ACCENT = '#3b82f6';
const DIRECT_AUDIO_RE = /\.(mp3|wav|m4a|aac|ogg)(\?|$)/i;

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
  const { isAuthenticated } = useAuth();
  const [items, setItems] = useState<HomePlayerItem[] | null>(null);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0); // 0~1
  const [closed, setClosed] = useState(false);
  const [error, setError] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [bookmarked, setBookmarked] = useState<Set<string>>(new Set());

  // 북마크 localStorage 복원 — 로그인 여부와 무관하게 저장은 항상 기기에
  // 남지만, 버튼 자체를 로그인 상태에서만 노출한다(요청 그대로).
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(BOOKMARK_STORAGE_KEY);
      if (raw) setBookmarked(new Set(JSON.parse(raw)));
    } catch {
      // localStorage 접근 불가(시크릿 모드 등) — 조용히 무시, 북마크 없이 시작.
    }
  }, []);

  function toggleBookmark(id: string) {
    setBookmarked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        window.localStorage.setItem(BOOKMARK_STORAGE_KEY, JSON.stringify([...next]));
      } catch {
        // 저장 실패해도 이번 세션 내 UI 상태는 유지.
      }
      return next;
    });
  }

  const ytContainerRef = useRef<HTMLDivElement | null>(null);
  const ytPlayerRef = useRef<YTPlayer | null>(null);
  const ytLoadedVideoIdRef = useRef<string | null>(null);
  const ytProgressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchHomePlayerPlaylist().then((data) => {
      if (!cancelled) setItems(data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const current = items && items.length > 0 ? items[Math.min(index, items.length - 1)] : null;

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

  async function playDirectAudio(url: string) {
    setError(false);
    const audio = audioRef.current;
    if (!audio) {
      setError(true);
      return;
    }
    if (audio.src !== url) audio.src = url;
    try {
      await audio.play();
      setPlaying(true);
    } catch {
      setError(true);
    }
  }

  function play() {
    if (!current) return;
    if (DIRECT_AUDIO_RE.test(current.mediaEmbedUrl)) {
      void playDirectAudio(current.mediaEmbedUrl);
      return;
    }
    const videoId = extractYoutubeVideoId(current.mediaEmbedUrl);
    if (!videoId) {
      setError(true);
      return;
    }
    void playYoutube(videoId);
  }

  function pause() {
    ytPlayerRef.current?.pauseVideo();
    audioRef.current?.pause();
    stopYtProgressPolling();
    setPlaying(false);
  }

  // <audio> 진행률·종료 이벤트 — 유튜브처럼 폴링 대신 네이티브 이벤트로.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTimeUpdate = () => {
      if (audio.duration) setProgress(audio.currentTime / audio.duration);
    };
    const onEnded = () => {
      setPlaying(false);
      setProgress(0);
      setIndex((i) => (items && i + 1 < items.length ? i + 1 : 0));
    };
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('ended', onEnded);
    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('ended', onEnded);
    };
  }, [items]);

  // 언마운트 시 유튜브 플레이어·폴링 정리.
  useEffect(() => {
    return () => {
      stopYtProgressPolling();
      ytPlayerRef.current?.destroy();
    };
  }, []);

  // 트랙이 바뀌면 재생 중이던 영상은 멈춘다 — 다음 트랙은 버튼을 다시
  // 눌러야 재생(자동 넘어감은 ended 이벤트에서만, 사용자가 prev/next를
  // 누른 경우는 명시적으로 다시 재생해야 자연스럽다).
  useEffect(() => {
    ytPlayerRef.current?.pauseVideo();
    audioRef.current?.pause();
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
      {/* 재생목록 패널(2026-08-21, 사용자 요청 — "플레이리스트처럼 누르면
          쭉 나오고, 우측에 일러스트로"). 별도 fixed 레이어 대신 이 미니바와
          같은 컨테이너(bottom:0 고정) 안에 위쪽 형제로 넣는다 — 컨테이너
          높이가 늘어나면 위로 펼쳐지는 모양이 자연스럽게 나오고, 헤더·
          하단바 z-index 계산을 새로 안 해도 된다. */}
      {expanded && (
        <div
          className="mx-auto flex"
          style={{
            maxWidth: 1080,
            maxHeight: 320,
            borderBottom: '1px solid rgba(0,0,0,0.06)',
          }}
        >
          <div className="flex-1 min-w-0" style={{ overflowY: 'auto', padding: '10px clamp(12px, 3vw, 24px)' }}>
            {/* 패널 라벨(2026-08-21, 디자인 개선 — "패널에 제목이 없어서
                불친절하다") — 목록 위에 뭘 보고 있는지 한 줄로 안내. */}
            <p
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: '#9ca3af',
                letterSpacing: '0.04em',
                padding: '4px 6px 8px',
              }}
            >
              재생목록 · {total}개
            </p>
            {items.map((it, i) => {
              const isCurrent = i === index;
              const isBookmarked = bookmarked.has(it.id);
              const isAudio = DIRECT_AUDIO_RE.test(it.mediaEmbedUrl);
              return (
                <div
                  key={it.id}
                  className="flex items-center hover:bg-gray-50"
                  style={{ gap: 10, padding: '8px 6px', borderRadius: 8 }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setIndex(i);
                      setExpanded(false);
                    }}
                    className="flex items-center min-w-0 flex-1 text-left"
                    style={{ gap: 10, background: 'none', border: 'none', cursor: 'pointer' }}
                  >
                    <span
                      className="flex items-center justify-center flex-shrink-0"
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: '50%',
                        fontSize: 11,
                        fontWeight: 700,
                        color: isCurrent ? '#fff' : '#9ca3af',
                        background: isCurrent ? ACCENT : '#f3f4f6',
                      }}
                    >
                      {isCurrent && playing ? (
                        <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h4v14H6zm8 0h4v14h-4z" /></svg>
                      ) : (
                        i + 1
                      )}
                    </span>

                    {/* 포맷 아이콘(2026-08-21, 디자인 개선) — 영상·팟캐스트가
                        섞이는데 지금까지는 눌러보기 전엔 구분이 안 갔다. */}
                    <span
                      className="flex items-center justify-center flex-shrink-0"
                      aria-hidden
                      style={{ color: isCurrent ? ACCENT : '#c0c5cc' }}
                      title={isAudio ? '팟캐스트' : '영상'}
                    >
                      {isAudio ? (
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                          <path d="M4 13a8 8 0 0 1 16 0" />
                          <rect x="2.5" y="13" width="4" height="6" rx="1.5" />
                          <rect x="17.5" y="13" width="4" height="6" rx="1.5" />
                        </svg>
                      ) : (
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                          <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
                          <path d="M10 9.5 15 12l-5 2.5z" fill="currentColor" stroke="none" />
                        </svg>
                      )}
                    </span>

                    <span
                      className="min-w-0 flex-1"
                      style={{
                        fontSize: 13.5,
                        fontWeight: isCurrent ? 700 : 500,
                        color: isCurrent ? '#111827' : '#374151',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {it.title}
                    </span>
                  </button>

                  {/* 북마크 — 로그인한 사람만(2026-08-21 요청). 비로그인
                      상태에선 자리 자체를 안 차지하게 숨긴다(그레이아웃
                      대신 — 어차피 못 누르는 버튼을 계속 보여줄 필요 없음). */}
                  {isAuthenticated && (
                    <button
                      type="button"
                      onClick={() => toggleBookmark(it.id)}
                      aria-label={isBookmarked ? '북마크 해제' : '북마크'}
                      aria-pressed={isBookmarked}
                      className="flex items-center justify-center flex-shrink-0"
                      style={{ width: 28, height: 28, borderRadius: '50%', border: 'none', background: 'none', cursor: 'pointer' }}
                    >
                      <svg
                        width="15"
                        height="15"
                        viewBox="0 0 24 24"
                        fill={isBookmarked ? ACCENT : 'none'}
                        stroke={isBookmarked ? ACCENT : '#9ca3af'}
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M6 4h12v17l-6-4-6 4z" />
                      </svg>
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* 우측 일러스트 — 좁은 화면에선 숨김(리스트 폭 확보 우선). */}
          <div
            className="hidden sm:flex flex-col items-center justify-center flex-shrink-0"
            style={{ width: 140, borderLeft: '1px solid rgba(0,0,0,0.06)', padding: 16, background: '#fafbfc' }}
          >
            <ListeningHeadphoneIllustration accent={ACCENT} className="w-16 h-16" />
            <p style={{ marginTop: 8, fontSize: 11.5, color: '#9ca3af', fontWeight: 600, textAlign: 'center', lineHeight: 1.5 }}>
              오늘의 뉴스를
              <br />
              귀로 들어보세요
            </p>
          </div>
        </div>
      )}

      {/* 유튜브 플레이어 컨테이너 — 화면엔 안 보이지만 IFrame API가 실제
          엘리먼트를 요구해서 1x1로 깔아둔다(display:none은 유튜브가 재생을
          멈추게 할 수 있어 크기로만 숨김). */}
      <div ref={ytContainerRef} style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden' }} />
      {/* mp3 등 직접 파일용 — 화면엔 안 보임, controls도 안 붙임(재생은
          이 컴포넌트의 커스텀 컨트롤 버튼으로만). */}
      <audio ref={audioRef} style={{ display: 'none' }} />

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
        <div className="min-w-0 flex-1">
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
            {error ? '재생할 수 없어요 — 다시 시도해주세요' : current.title}
          </p>
        </div>

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
            className="flex items-center justify-center"
            style={{
              width: 38,
              height: 38,
              borderRadius: '50%',
              border: 'none',
              // 검정→블루로(2026-08-21, 디자인 개선) — 이 컴포넌트의 나머지
              // 요소(트랙 배지, 진행바, 재생목록 토글 활성 상태)가 전부
              // ACCENT 파란색인데 정작 가장 눈에 띄는 재생 버튼만 검정이라
              // 톤이 어긋났다.
              background: ACCENT,
              color: '#fff',
              cursor: 'pointer',
            }}
          >
            {playing ? (
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

          {total > 1 && (
            <button
              type="button"
              aria-label={expanded ? '재생목록 닫기' : '재생목록 열기'}
              aria-pressed={expanded}
              onClick={() => setExpanded((e) => !e)}
              className="flex items-center justify-center"
              style={{
                width: 30,
                height: 30,
                borderRadius: '50%',
                border: 'none',
                background: expanded ? '#eff6ff' : 'transparent',
                color: expanded ? ACCENT : '#6b7280',
                cursor: 'pointer',
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                <path d="M4 6h12M4 12h12M4 18h7" />
                <path d="M18 15v6M15 18h6" />
              </svg>
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
    </div>
  );
}
