'use client';

import { useEffect, useRef, useState } from 'react';
import { displayHeadline } from '@/shared/lib/content/displayHeadline';
import { createPortal } from 'react-dom';
import { fetchHomePlayerPlaylist, type HomePlayerItem } from '@/shared/lib/api/homePlayerApi';
import { useAuth } from '@/features/auth';
import { PodcastSketch } from '@/shared/ui/icons/VideoSketch';
import { onPlayHomePlayerItemRequest } from '@/shared/lib/media/audioPlayerBus';
import { extractYoutubeVideoId, loadYouTubeIframeApi, type YTPlayer } from './youtube';

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
const ACCENT = '#3d70de'; // 오디오 섹션(AudioPreviewSection)·신문 카드와 같은 블루
const PAPER = '#f8f8f6'; // 신문 지면 배경
const RULE = '#e4e4df';
const INK = '#1f2937';
const SERIF = "'Noto Serif KR', Georgia, serif";
const DIRECT_AUDIO_RE = /\.(mp3|wav|m4a|aac|ogg)(\?|$)/i;

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

  // 외부(AudioPreviewSection의 카드 재생 버튼)에서 특정 항목을 바로 재생
  // 요청할 때 쓴다(2026-08-21). setIndex()는 비동기 배치라 바로 이어서
  // play()를 부르면 아직 갱신 안 된 `current`(이전 index 기준)를 읽는
  // 경쟁 상태가 생긴다 — autoPlayOnIndexRef에 "이 index로 바뀌면 자동
  // 재생해라" 표시만 남기고, 아래 트랙 전환 effect가 실제 재생을 맡는다.
  const autoPlayOnIndexRef = useRef(false);
  // TodayNewsPlayer(여기)와 AudioPreviewSection이 같은 home_player API를
  // 각자 따로 fetch한다(별도 useEffect, 서버 프리페치 vs 클라이언트
  // fetch) — 카드 재생 버튼을 누른 시점에 이쪽 fetch가 아직 안 끝났으면
  // items가 null이라 재생 요청이 조용히 무시되던 경쟁 상태가 있었다
  // (2026-08-21 발견, 드물지만 느린 네트워크에서 재현 가능). items가
  // null인 동안 들어온 요청은 여기 담아뒀다가, 아래 effect가 items 로드
  // 완료 시점에 이어서 처리한다.
  const pendingPlayIdRef = useRef<string | null>(null);

  function playItemById(id: string) {
    if (!items) {
      pendingPlayIdRef.current = id;
      return;
    }
    const i = items.findIndex((it) => it.id === id);
    if (i < 0) return;
    setClosed(false);
    setError(false);
    if (i === index) {
      // 이미 선택돼 있던 트랙 — index effect가 안 도니 바로 재생.
      play();
      return;
    }
    autoPlayOnIndexRef.current = true;
    setIndex(i);
  }

  // playItemById는 매 렌더 재생성되지만 클로저가 담는 items/index는 이미
  // deps에 있다 — 그 값이 바뀔 때마다 재구독되므로 함수 자체를 deps에
  // 넣을 필요가 없다(넣으면 매 렌더 재구독만 늘어난다).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => onPlayHomePlayerItemRequest(playItemById), [items, index]);

  // items가 막 로드됐는데 그 사이 재생 요청이 대기 중이었으면 이어서
  // 처리 — 위와 같은 이유로 playItemById를 deps에 안 넣는다(items가
  // 바뀔 때 재구독되는 함수라, 이 시점의 playItemById는 이미 새
  // items를 담고 있다).
  useEffect(() => {
    if (items && pendingPlayIdRef.current) {
      const id = pendingPlayIdRef.current;
      pendingPlayIdRef.current = null;
      playItemById(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

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
  // 누른 경우는 명시적으로 다시 재생해야 자연스럽다). 다만
  // autoPlayOnIndexRef가 서 있으면(playItemById 경유) 멈춘 직후 바로
  // 새 트랙을 재생한다 — 홈 오디오 카드 재생 버튼용.
  useEffect(() => {
    ytPlayerRef.current?.pauseVideo();
    audioRef.current?.pause();
    stopYtProgressPolling();
    setPlaying(false);
    setProgress(0);
    if (autoPlayOnIndexRef.current) {
      autoPlayOnIndexRef.current = false;
      const target = items && items.length > 0 ? items[Math.min(index, items.length - 1)] : null;
      if (target) {
        if (DIRECT_AUDIO_RE.test(target.mediaEmbedUrl)) {
          void playDirectAudio(target.mediaEmbedUrl);
        } else {
          const videoId = extractYoutubeVideoId(target.mediaEmbedUrl);
          if (videoId) void playYoutube(videoId);
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- index 변경 시에만
  }, [index]);

  if (!items || items.length === 0 || closed || !current) return null;

  const total = items.length;

  return (
    <>
      {/* 유튜브 플레이어 컨테이너 — 별도 포털로 body에 직접 붙인다
          (2026-08-21, 실사용 버그 — 재생 시작 후 재생목록 패널을 열고
          닫으면 "insertBefore ... not a child of this node"로 페이지가
          죽는 걸 사용자가 재현해서 발견). 원인: 유튜브 IFrame API가
          `new YT.Player(el, ...)`를 부르면 대상 엘리먼트를 실제 <iframe>
          으로 통째로 바꿔치기한다(innerHTML만 채우는 게 아니라 엘리먼트
          자체를 교체) — 그런데 이 컨테이너 div가 재생목록 패널
          (`{expanded && (...)}`)의 바로 다음 형제 노드로 같은 부모 밑에
          있었다. 재생을 시작해 div가 이미 iframe으로 바뀐 상태에서
          `expanded`를 토글하면, React는 여전히 "원래 그 div가 거기
          있다"고 믿고 그 앞뒤로 패널 노드를 끼워넣거나 빼려다가 실제로는
          사라진 노드를 참조해 크래시. VideoLightbox.tsx와 같은 이유로
          같은 해법(createPortal → document.body) — 포털로 완전히
          분리하면 패널을 여닫아도 이 컨테이너의 형제 관계 자체가 없어져
          React가 그 주변을 reconcile할 일이 없다. */}
      {typeof document !== 'undefined' &&
        createPortal(
          <div ref={ytContainerRef} style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden' }} />,
          document.body,
        )}

      <div
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 70,
          background: PAPER,
          borderTop: '1px solid #c4c7cd',
          boxShadow: '0 -6px 24px -12px rgba(60,55,45,0.22)',
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
            borderBottom: `1px solid ${RULE}`,
          }}
        >
          <div className="flex-1 min-w-0" style={{ overflowY: 'auto', padding: '10px clamp(12px, 3vw, 24px)' }}>
            {/* 패널 라벨(2026-08-21, 디자인 개선 — "패널에 제목이 없어서
                불친절하다") — 목록 위에 뭘 보고 있는지 한 줄로 안내. */}
            <p
              style={{
                fontFamily: SERIF,
                fontSize: 12,
                fontWeight: 700,
                color: '#6b7280',
                letterSpacing: '0.02em',
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
                  className="flex items-center hover:bg-black/[0.025]"
                  style={{ gap: 12, padding: '9px 6px', borderRadius: 6, borderBottom: `1px solid ${RULE}` }}
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
                        fontFamily: SERIF,
                        fontSize: 12,
                        fontWeight: 700,
                        color: isCurrent ? '#fff' : '#8b8f98',
                        background: isCurrent ? INK : 'transparent',
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
                      style={{ color: isCurrent ? ACCENT : '#b8bcc4' }}
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
                        fontFamily: SERIF,
                        fontSize: 14,
                        fontWeight: isCurrent ? 700 : 500,
                        letterSpacing: '-0.01em',
                        color: isCurrent ? INK : '#4b5563',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {displayHeadline(it.title)}
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
            style={{ width: 150, borderLeft: `1px solid ${RULE}`, padding: 16 }}
          >
            <PodcastSketch className="w-20 h-16" />
            <p style={{ marginTop: 8, fontFamily: SERIF, fontSize: 12, color: '#8b8f98', fontWeight: 600, textAlign: 'center', lineHeight: 1.6 }}>
              오늘의 뉴스를
              <br />
              귀로 들어보세요
            </p>
          </div>
        </div>
      )}

      {/* mp3 등 직접 파일용 — 화면엔 안 보임, controls도 안 붙임(재생은
          이 컴포넌트의 커스텀 컨트롤 버튼으로만). */}
      <audio ref={audioRef} style={{ display: 'none' }} />

      {/* 진행바 — 상단 얇은 줄 */}
      <div style={{ height: 3, background: RULE }}>
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
        <div className="flex items-center justify-center flex-shrink-0" aria-hidden>
          <PodcastSketch className="w-12 h-10 -ml-1" />
        </div>

        {/* 트랙 정보 */}
        <div className="min-w-0 flex-1">
          <p style={{ fontSize: 11, fontWeight: 700, color: ACCENT, letterSpacing: '0.04em', marginBottom: 1 }}>
            오늘의 뉴스를 귀로 {total > 1 ? `· ${index + 1}/${total}` : ''}
          </p>
          <p
            style={{
              fontFamily: SERIF,
              fontSize: 14.5,
              fontWeight: 700,
              letterSpacing: '-0.015em',
              color: INK,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {error ? '재생할 수 없어요 — 다시 시도해주세요' : displayHeadline(current.title)}
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
              background: playing ? ACCENT : INK,
              color: '#fff',
              cursor: 'pointer',
              transition: 'background .2s ease',
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
                background: expanded ? 'rgba(61,112,222,0.12)' : 'transparent',
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

          <div style={{ width: 1, height: 20, background: RULE, margin: '0 4px' }} />

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
    </>
  );
}
