'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { Repeat, RotateCcw, RotateCw, Bookmark, ChevronDown, Check, Volume2, VolumeX, Maximize, Captions } from 'lucide-react';
import { clock, spoken, PLAYBACK_RATES, PLAYBACK_RATE_LABELS } from '@/shared/lib/mediaPlayerFormat';
import { useMediaBookmark, usePlaybackRateMenu, useMediaTransport } from '@/shared/lib/useMediaPlayerControls';

/**
 * 기사 안에 박아 쓰는 영상 플레이어 — 2026-08-21 신설.
 *
 * ArticleAudioPlayer(팟캐스트 카드)와 같은 톤앤매너 요청("영상 페이지도
 * 팟캐스트 페이지와 비슷한 톤앤매너로")으로 만들었다 — 다크 표면·배지+제목
 * 헤더·대본 패널·하단 컨트롤 바까지 같은 문법을 그대로 옮긴다.
 *
 * ── 버튼을 지어내지 않는다 ──
 * 이 화면(LensViewClient.tsx)은 가짜 재생 버튼·가짜 진행바·가짜 재생시간을
 * 이미 세 번 걷어낸 전례가 있다("눌러도 아무 일이 없다. 한 번 눌러본
 * 사용자는 그 다음부터 이 페이지의 다른 버튼도 믿지 않는다"). "기능 없어도
 * 버튼을 만들어두자"는 같은 실수를 반복하는 요청이라 그대로 따르지 않았다.
 * 대신:
 *  - 브라우저 네이티브 <video> 하나로 완결 가능한 조작(재생/일시정지·탐색·
 *    ±5초·반복·배속·전체화면·음소거·북마크·실제 buffered 진행률)은 전부
 *    진짜로 연결한다 — 백엔드가 필요 없다.
 *  - 자막(캡션) 데이터는 지금 파이프라인에 아예 없다(CmsLensItem에
 *    caption_url/subtitle 류 필드 자체가 없음, service/backend/handlers/
 *    cms_posts_public.py의 _shape_lens 참조). 버튼은 그대로 두되
 *    disabled + title/aria-label로 "왜 안 되는지"를 밝힌다(스티어링 §4 —
 *    "비활성 처리 + 이유 명시, 또는 노출하지 않는다"). 백엔드가 자막을
 *    연결하면 disabled만 풀면 되는 자리로 남겨둔다.
 *
 * ── 팟캐스트와 다른 점 ──
 *  - 커버 아트가 없다 — 영상 자체가 시각 콘텐츠라 currentTime=0 프레임이
 *    이미 "커버"다. poster 속성으로 대신한다(레이어 하나 줄임).
 *  - 파형 대신 슬림 진행바 — 소리가 아니라 화면이 콘텐츠라 파형 시각화가
 *    맞지 않는다. 대신 실제 buffered 구간(TimeRanges)을 표시한다 — 오디오
 *    플레이어의 "지어낸 값 금지" 원칙과 반대로, 이건 브라우저가 실제로
 *    아는 값이라 그린다.
 *  - 음소거·전체화면 버튼 — 영상엔 자연스럽고 오디오엔 없던 조작.
 *  - 자막 버튼 — 유일하게 실제로 비활성인 버튼(위 참조).
 *
 * ── 대본 탭을 넣지 않았다(2026-08-21) ──
 * 팟캐스트 카드는 화면을 안 보는 상황(이동 중)을 전제하기 때문에 대본이
 * "읽는 대체 수단"으로 의미가 있다. 영상은 이미 화면을 보고 있는 상태라
 * 같은 화면에 또 다른 텍스트 패널을 얹으면 정보가 두 번 나온다는 지적
 * (사용자 요청 — "대본 기능은 빼줘")으로 뺐다. 자막(캡션)은 여전히 영상
 * 위에 직접 얹는 자리로 남겨(위 disabled 버튼), 텍스트가 필요한 순간엔
 * 그 경로로 채워질 수 있게 구조는 남겼다.
 */

const BOOKMARK_STORAGE_KEY = 'ailens-video-bookmarks';

export function ArticleVideoPlayer({
  src,
  poster,
  accent = '#7c86ff',
  label = '영상',
  kicker,
  title,
  byline,
  bylineHref,
  onDuration,
}: {
  src: string;
  /** 정지 프레임 썸네일 — 실측 영상 프레임(thumbnail_url). 없으면 브라우저가 첫 프레임을 그린다. */
  poster?: string | null;
  accent?: string;
  /** aria-label 문맥용("영상" 등). 화면에는 안 나온다. */
  label?: string;
  /** 상단 배지("AI 영상 브리핑" 등). 넘기지 않으면 label을 쓴다. */
  kicker?: string;
  title?: string;
  byline?: string | null;
  bylineHref?: string | null;
  onDuration?: (sec: number) => void;
}) {
  const ref = useRef<HTMLVideoElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [buffered, setBuffered] = useState(0);
  const [looping, setLooping] = useState(false);
  const [muted, setMuted] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [scrubbing, setScrubbing] = useState(false);
  const [scrubTime, setScrubTime] = useState<number | null>(null);

  // 북마크·배속 메뉴·재생 전송(재생/일시정지/탐색/±5초/재시도) 상태 로직은
  // ArticleAudioPlayer.tsx와 바이트 단위로 같아서 shared/lib/
  // useMediaPlayerControls.ts로 추출돼 있다(2026-09-04). buffered 진행률·
  // 음소거·전체화면은 영상 전용이라 그대로 이 파일에 남는다.
  const { bookmarked, toggleBookmark } = useMediaBookmark(src, BOOKMARK_STORAGE_KEY);
  const { rateIdx, rateMenuOpen, setRateMenuOpen, selectRate, rateMenuRef, rateTriggerRef } =
    usePlaybackRateMenu(ref, PLAYBACK_RATES);
  const { playing, cur, dur, failed, toggle, seekTo, nudge, retry } = useMediaTransport(ref, {
    looping,
    onDuration,
  });

  // buffered 진행률·음소거 추적 — useMediaTransport가 배선하는 6개 공용
  // 이벤트와 별개로 이 엘리먼트에 추가로 얹는다(같은 엘리먼트에 여러
  // effect가 addEventListener 해도 서로 무관하게 공존한다). looping에
  // 의존하지 않으므로 마운트 시 1회만 배선한다.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onProgress = () => {
      // 실제 buffered 구간(TimeRanges) — 마지막 구간의 끝 값만 쓴다.
      // 스트리밍 중 여러 구간이 생길 수 있지만, 진행바에는 "지금까지
      // 이어서 재생 가능한 지점"만 의미가 있다.
      if (el.buffered.length > 0) {
        setBuffered(el.buffered.end(el.buffered.length - 1));
      }
    };
    const onVolume = () => setMuted(el.muted);
    el.addEventListener('timeupdate', onProgress);
    el.addEventListener('progress', onProgress);
    el.addEventListener('volumechange', onVolume);
    return () => {
      el.removeEventListener('timeupdate', onProgress);
      el.removeEventListener('progress', onProgress);
      el.removeEventListener('volumechange', onVolume);
    };
  }, []);

  // 전체화면 상태는 document 이벤트로 추적한다 — Esc 등 우리 버튼을
  // 거치지 않는 종료 경로가 있어도 아이콘이 실제 상태와 어긋나지 않는다.
  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === wrapRef.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggleMute = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.muted = !el.muted;
  }, []);

  const toggleFullscreen = useCallback(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void wrap.requestFullscreen().catch(() => {
        // 일부 브라우저(iOS Safari)는 컨테이너 fullscreen API 자체를 막는다 —
        // 조용히 무시한다, 다른 컨트롤은 여전히 동작한다.
      });
    }
  }, []);

  const pct = dur > 0 ? Math.min(100, (cur / dur) * 100) : 0;
  const bufferedPct = dur > 0 ? Math.min(100, (buffered / dur) * 100) : 0;

  const displayCur = scrubTime ?? cur;
  const remaining = dur > 0 ? Math.max(0, dur - displayCur) : null;

  return (
    <div
      className="avp"
      ref={wrapRef}
      style={
        {
          ['--avp-c' as string]: accent,
        } as CSSProperties
      }
    >
      {/* CSS는 ArticleAudioPlayer.tsx(.aap-*)와 최대한 같은 값을 쓴다 —
          같은 표면 재질(다크 그라디언트 + 유리 하이라이트 + 그레인), 같은
          간격 리듬, 같은 컨트롤 크기. 클래스 프리픽스만 avp로 분리해
          두 컴포넌트가 서로의 스타일에 영향을 주지 않게 했다. */}
      <style>{`
        .avp { position: relative; overflow: hidden; isolation: isolate;
          border-radius: 20px; padding: clamp(16px, 4vw, 22px);
          background:
            radial-gradient(130% 160% at 8% 0%, color-mix(in srgb, var(--avp-c) 26%, transparent) 0%, transparent 58%),
            radial-gradient(90% 120% at 100% 120%, color-mix(in srgb, var(--avp-c) 12%, transparent) 0%, transparent 60%),
            linear-gradient(165deg, #1c2333 0%, #12141f 52%, #0a0a10 100%);
          box-shadow:
            0 24px 48px -24px rgba(0,0,0,0.6),
            0 1px 0 0 rgba(255,255,255,0.06) inset,
            0 0 0 1px rgba(255,255,255,0.05) inset; }
        .avp::before { content: ''; position: absolute; inset: 0; pointer-events: none;
          background: linear-gradient(122deg, rgba(255,255,255,0.09) 0%, rgba(255,255,255,0) 30%); }
        .avp::after { content: ''; position: absolute; inset: 0; pointer-events: none;
          opacity: 0.4; mix-blend-mode: overlay;
          background-image: radial-gradient(circle at 1px 1px, rgba(255,255,255,0.6) 1px, transparent 0);
          background-size: 3px 3px; }
        .avp:fullscreen { border-radius: 0; display: flex; align-items: center; justify-content: center; }

        .avp-inner { position: relative; z-index: 1; }

        .avp-badge { display: inline-flex; align-items: center; height: 22px; padding: 0 10px;
          border-radius: 999px; border: 1px solid color-mix(in srgb, var(--avp-c) 55%, transparent);
          font-size: 12px; font-weight: 700; letter-spacing: 0.02em;
          color: color-mix(in srgb, var(--avp-c) 60%, #ffffff); margin-bottom: 8px; }
        .avp-title { margin: 0; font-size: clamp(17px, 2.4vw, 19px); font-weight: 700;
          line-height: 1.32; color: #fff; letter-spacing: -0.01em; word-break: keep-all;
          display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        .avp-byline { display: inline-flex; align-items: center; gap: 5px; margin-top: 6px;
          font-size: 13px; font-weight: 600; color: rgba(255,255,255,0.66);
          background: none; border: none; padding: 0; cursor: default; font-family: inherit; }
        .avp-byline[data-link='true'] { cursor: pointer; text-decoration: none; }
        .avp-byline[data-link='true']:hover { color: rgba(255,255,255,0.88); }
        .avp-byline[data-link='true']:focus-visible { outline: 2px solid #fff; outline-offset: 2px; border-radius: 4px; }

        /* ── 영상 프레임 ── 팟캐스트의 정사각 커버 대신, 영상 자체가
           16:9 프레임으로 헤더 아래 온다. object-fit: contain — 크롭으로
           프레임 일부를 잘라내지 않는다(레터박스가 생겨도 원본 그대로). */
        .avp-frame { position: relative; margin-top: 14px; border-radius: 14px; overflow: hidden;
          background: #000; aspect-ratio: 16 / 9; }
        .avp video { width: 100%; height: 100%; object-fit: contain; display: block; }
        :fullscreen .avp-frame { max-height: 100vh; }

        /* 배속 — 대본 탭을 뺀 뒤(2026-08-21, "대본 기능은 빼줘") 이 줄에는
           배속만 남아 오른쪽 정렬로 고정한다. */
        .avp-toprow { display: flex; align-items: flex-start; justify-content: flex-end;
          margin-top: 14px; }

        /* ── 슬림 진행바 ── 파형 대신. 재생/버퍼/잔여 3단계(스펙 요구와
           동일한 3단계 구분 — 재생 위치, 버퍼링된 지점까지, 그 뒤 잔여).
           hover 시 4px → 6px, 시크 중엔 항상 6px로 넓어져 손가락으로도
           정확히 짚기 쉽게 한다. */
        .avp-progwrap { margin-top: 12px; }
        .avp-prog { position: relative; height: 4px; border-radius: 999px; cursor: pointer;
          background: rgba(255,255,255,0.16); transition: height .15s cubic-bezier(.2,0,0,1); }
        .avp-prog:hover, .avp-prog[data-scrubbing='true'] { height: 6px; }
        .avp-prog-buffered { position: absolute; inset: 0; border-radius: 999px;
          width: ${bufferedPct}%; background: rgba(255,255,255,0.32); }
        .avp-prog-played { position: absolute; inset: 0; border-radius: 999px;
          width: ${pct}%; background: var(--avp-c); }
        .avp-prog-thumb { position: absolute; top: 50%; width: 12px; height: 12px; border-radius: 999px;
          background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,0.4); transform: translate(-50%, -50%);
          left: ${pct}%; opacity: 0; transition: opacity .15s ease; }
        .avp-prog:hover .avp-prog-thumb, .avp-prog[data-scrubbing='true'] .avp-prog-thumb { opacity: 1; }
        .avp-prog-seek { position: absolute; inset: -10px 0; width: 100%; height: 24px;
          margin: 0; opacity: 0; cursor: pointer; -webkit-appearance: none; appearance: none; }
        .avp-prog-seek:disabled { cursor: default; }
        .avp-prog-seek:focus-visible ~ .avp-prog-focus-ring { opacity: 1; }
        .avp-prog-focus-ring { position: absolute; inset: -4px 0; border-radius: 10px;
          border: 2px solid #fff; opacity: 0; pointer-events: none; }
        .avp-scrub-tip { position: absolute; bottom: calc(100% + 8px); transform: translateX(-50%);
          padding: 4px 8px; border-radius: 8px; background: #fff; color: #111827;
          font-size: 12px; font-weight: 700; font-variant-numeric: tabular-nums;
          white-space: nowrap; pointer-events: none; box-shadow: 0 4px 10px rgba(0,0,0,0.3); }

        .avp-time-row { display: flex; align-items: center; justify-content: space-between;
          margin-top: 8px; font-size: 13px; font-weight: 700; font-variant-numeric: tabular-nums;
          color: #fff; }
        .avp-time-row span:last-child { color: rgba(255,255,255,0.58); font-weight: 600; }

        /* ── 하단 컨트롤 바 ── 오디오와 같은 반복/±5초/재생(56px)/북마크
           + 영상 전용 음소거·자막·전체화면을 오른쪽에 추가한다.
           2026-08-21 — "가운데 정렬로 해달라" 요청에 맞춰 3열 grid로
           바꿨다. flex + space-between이면 오른쪽 aux 그룹의 너비만큼
           가운데 전송부가 왼쪽으로 밀린다(aux가 있어서 중앙이 아니게
           보였던 원인). 왼쪽 칸을 비워 aux와 같은 너비로 맞추면 전송부가
           항상 카드 정중앙에 온다. 375px처럼 폭이 좁아 두 그룹이 겹칠 때만
           1열로 줄바꿈해 전송부를 먼저, aux를 그 아래 중앙에 둔다. */
        .avp-controls { display: grid; grid-template-columns: 1fr auto 1fr;
          align-items: center; gap: 10px; margin-top: 18px; }
        .avp-transport { grid-column: 2; display: flex; align-items: center; justify-content: center;
          gap: clamp(12px, 4vw, 20px); }
        .avp-aux { grid-column: 3; justify-self: end; display: flex; align-items: center; gap: 4px; }
        @media (max-width: 359px) {
          .avp-controls { grid-template-columns: 1fr; justify-items: center; }
          .avp-transport { grid-column: 1; }
          .avp-aux { grid-column: 1; justify-self: center; }
        }
        .avp-icon-btn { display: flex; align-items: center; justify-content: center;
          width: 44px; height: 44px; border-radius: 999px; border: none; background: none;
          color: rgba(255,255,255,0.7); cursor: pointer;
          transition: background-color .2s cubic-bezier(.2,0,0,1), color .2s cubic-bezier(.2,0,0,1); }
        .avp-icon-btn:hover:not(:disabled) { background: rgba(255,255,255,0.1); color: #fff; }
        .avp-icon-btn:active:not(:disabled) { background: rgba(255,255,255,0.16); }
        .avp-icon-btn:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
        .avp-icon-btn[aria-pressed='true'] { color: var(--avp-c); }
        .avp-icon-btn:disabled { color: rgba(255,255,255,0.28); cursor: not-allowed; }

        .avp-play { flex-shrink: 0; position: relative; display: flex; align-items: center;
          justify-content: center; width: 56px; height: 56px; border-radius: 999px;
          border: none; cursor: pointer; color: #111827;
          background: linear-gradient(160deg, #ffffff 0%, #f1f2f6 55%, #dfe2ea 100%);
          box-shadow:
            0 8px 18px -6px rgba(0,0,0,0.5),
            0 0 0 1px rgba(255,255,255,0.5) inset,
            0 -3px 6px rgba(0,0,0,0.1) inset,
            0 0 26px 2px color-mix(in srgb, var(--avp-c) 55%, transparent);
          transition: transform .2s cubic-bezier(.2,0,0,1), box-shadow .2s cubic-bezier(.2,0,0,1); }
        .avp-play:hover { box-shadow:
            0 8px 18px -6px rgba(0,0,0,0.5),
            0 0 0 1px rgba(255,255,255,0.5) inset,
            0 -3px 6px rgba(0,0,0,0.1) inset,
            0 0 32px 4px color-mix(in srgb, var(--avp-c) 70%, transparent); }
        .avp-play:active { transform: scale(.95); }
        .avp-play:focus-visible { outline: 2px solid #fff; outline-offset: 3px; }
        @media (max-width: 359px) { .avp-play { width: 50px; height: 50px; } }

        .avp-rate-wrap { position: relative; flex-shrink: 0; }
        .avp-rate { display: inline-flex; align-items: center; gap: 5px; height: 36px; padding: 0 12px 0 14px;
          border-radius: 999px; border: 1px solid rgba(255,255,255,0.14); background: rgba(255,255,255,0.05);
          font-size: 13px; font-weight: 700; color: rgba(255,255,255,0.85); cursor: pointer;
          font-variant-numeric: tabular-nums;
          transition: background-color .2s cubic-bezier(.2,0,0,1); }
        .avp-rate:hover { background: rgba(255,255,255,0.12); }
        .avp-rate[aria-expanded='true'] { background: rgba(255,255,255,0.14); }
        .avp-rate:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }

        .avp-rate-menu { position: absolute; top: calc(100% + 6px); right: 0; z-index: 5;
          min-width: 96px; margin: 0; padding: 6px; list-style: none;
          border-radius: 14px; background: #20263a; border: 1px solid rgba(255,255,255,0.1);
          box-shadow: 0 12px 28px -10px rgba(0,0,0,0.55); }
        @media (prefers-reduced-motion: no-preference) {
          .avp-rate-menu { animation: avp-menu-in .16s cubic-bezier(.2,0,0,1); }
          @keyframes avp-menu-in { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }
        }
        .avp-rate-opt { display: flex; align-items: center; justify-content: space-between; gap: 10px;
          width: 100%; height: 38px; padding: 0 10px; border: none; border-radius: 9px;
          background: none; cursor: pointer; font-size: 14px; font-weight: 600;
          color: rgba(255,255,255,0.82); font-variant-numeric: tabular-nums;
          transition: background-color .14s ease; }
        .avp-rate-opt:hover { background: rgba(255,255,255,0.08); }
        .avp-rate-opt:focus-visible { outline: 2px solid #fff; outline-offset: -2px; }
        .avp-rate-opt[aria-selected='true'] { color: #fff; font-weight: 700; }
        .avp-rate-opt[aria-selected='true'] svg { color: var(--avp-c); }

        .avp-fail { display: flex; align-items: center; justify-content: space-between; gap: 12px;
          flex-wrap: wrap; font-size: 15px; line-height: 1.6; color: rgba(255,255,255,0.9); word-break: keep-all; }
        .avp-retry { flex-shrink: 0; height: 36px; padding: 0 16px; border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.2); background: rgba(255,255,255,0.08); color: #fff;
          font-size: 13px; font-weight: 700; cursor: pointer; }
        .avp-retry:hover { background: rgba(255,255,255,0.16); }
        .avp-retry:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }

        @media (prefers-reduced-motion: reduce) {
          .avp-play, .avp-icon-btn, .avp-prog, .avp-prog-thumb, .avp-rate-opt { transition: none; }
          .avp-play:active { transform: none; }
        }
      `}</style>

      <div className="avp-inner">
        {failed ? (
          <div className="avp-fail">
            <span>영상을 재생할 수 없어요. 네트워크를 확인해 주세요.</span>
            <button type="button" className="avp-retry" onClick={retry}>
              다시 시도
            </button>
          </div>
        ) : (
          <>
            <span className="avp-badge">{kicker ?? label}</span>
            <p className="avp-title">{title ?? kicker ?? label}</p>
            {byline &&
              (bylineHref ? (
                <a href={bylineHref} target="_blank" rel="noopener noreferrer" className="avp-byline" data-link="true">
                  {byline}
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M7 17 17 7" />
                    <path d="M8 7h9v9" />
                  </svg>
                  <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
                    (새 창으로 열립니다)
                  </span>
                </a>
              ) : (
                <span className="avp-byline">{byline}</span>
              ))}

            <div className="avp-frame">
              <video
                ref={ref}
                src={src}
                poster={poster ?? undefined}
                preload="metadata"
                playsInline
                muted={muted}
              />
            </div>

            <div className="avp-toprow">
              <div className="avp-rate-wrap" ref={rateMenuRef}>
                <button
                  type="button"
                  ref={rateTriggerRef}
                  className="avp-rate"
                  aria-haspopup="listbox"
                  aria-expanded={rateMenuOpen}
                  title="재생 속도"
                  onClick={() => setRateMenuOpen((v) => !v)}
                >
                  {PLAYBACK_RATE_LABELS[rateIdx]}×
                  <ChevronDown size={13} aria-hidden style={{ transform: rateMenuOpen ? 'rotate(180deg)' : 'none', transition: 'transform .2s cubic-bezier(.2,0,0,1)' }} />
                </button>
                {rateMenuOpen && (
                  <ul className="avp-rate-menu" role="listbox" aria-label="재생 속도 선택" aria-activedescendant={`avp-rate-opt-${rateIdx}`}>
                    {PLAYBACK_RATE_LABELS.map((rateLabel, idx) => (
                      <li key={rateLabel} role="presentation">
                        <button
                          type="button"
                          id={`avp-rate-opt-${idx}`}
                          role="option"
                          aria-selected={idx === rateIdx}
                          className="avp-rate-opt"
                          onClick={() => selectRate(idx)}
                        >
                          <span>{rateLabel}×</span>
                          {idx === rateIdx && <Check size={14} aria-hidden />}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="avp-progwrap">
              <div className="avp-prog" data-scrubbing={scrubbing} style={{ position: 'relative' }}>
                <span className="avp-prog-buffered" aria-hidden />
                <span className="avp-prog-played" aria-hidden />
                <span className="avp-prog-thumb" aria-hidden />
                <input
                  type="range"
                  className="avp-prog-seek"
                  role="slider"
                  min={0}
                  max={dur > 0 ? Math.floor(dur) : 0}
                  step={5}
                  value={Math.floor(displayCur)}
                  disabled={dur === 0}
                  aria-label={`${label} 재생 위치`}
                  aria-valuemin={0}
                  aria-valuemax={dur > 0 ? Math.floor(dur) : 0}
                  aria-valuenow={Math.floor(displayCur)}
                  aria-valuetext={dur > 0 ? `${spoken(displayCur)} · 전체 ${spoken(dur)}` : '길이 확인 중'}
                  onPointerDown={() => setScrubbing(true)}
                  onPointerUp={() => {
                    setScrubbing(false);
                    if (scrubTime !== null) seekTo(scrubTime);
                    setScrubTime(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Home' || e.key === 'End') {
                      setScrubbing(false);
                    }
                  }}
                  onChange={(e) => {
                    const next = Number(e.currentTarget.value);
                    if (scrubbing) {
                      setScrubTime(next);
                    } else {
                      seekTo(next);
                    }
                  }}
                />
                <span className="avp-prog-focus-ring" aria-hidden />
                {scrubbing && scrubTime !== null && dur > 0 && (
                  <span className="avp-scrub-tip" style={{ left: `${(scrubTime / dur) * 100}%` }}>
                    {clock(scrubTime)}
                  </span>
                )}
              </div>
              <div className="avp-time-row">
                <span>{clock(displayCur)}</span>
                <span>{remaining !== null ? `-${clock(remaining)}` : ''}</span>
              </div>
            </div>

            <div className="avp-controls">
              <div className="avp-transport">
                <button
                  type="button"
                  className="avp-icon-btn"
                  aria-pressed={looping}
                  aria-label={looping ? '반복 재생 끄기' : '반복 재생 켜기'}
                  title={looping ? '반복 재생 끄기' : '반복 재생 켜기'}
                  onClick={() => setLooping((v) => !v)}
                >
                  <Repeat size={19} aria-hidden />
                </button>
                <button type="button" className="avp-icon-btn" onClick={() => nudge(-5)} aria-label="5초 뒤로" title="5초 뒤로">
                  <RotateCcw size={20} aria-hidden />
                </button>
                <button
                  type="button"
                  className="avp-play"
                  data-playing={playing}
                  onClick={toggle}
                  aria-label={playing ? `${label} 일시정지` : `${label} 재생`}
                  title={playing ? '일시정지' : '재생'}
                >
                  {playing ? (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                      <rect x="6" y="5" width="4" height="14" rx="1.4" />
                      <rect x="14" y="5" width="4" height="14" rx="1.4" />
                    </svg>
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden style={{ marginLeft: 3 }}>
                      <path d="M8 5.6c0-.8.9-1.3 1.6-.9l9 6.1c.6.4.6 1.3 0 1.7l-9 6.1c-.7.4-1.6-.1-1.6-.9z" />
                    </svg>
                  )}
                </button>
                <button type="button" className="avp-icon-btn" onClick={() => nudge(5)} aria-label="5초 앞으로" title="5초 앞으로">
                  <RotateCw size={20} aria-hidden />
                </button>
                <button
                  type="button"
                  className="avp-icon-btn"
                  aria-pressed={bookmarked}
                  aria-label={bookmarked ? '북마크 해제' : '북마크에 저장'}
                  title={bookmarked ? '북마크 해제' : '북마크에 저장'}
                  onClick={toggleBookmark}
                >
                  <Bookmark size={19} aria-hidden fill={bookmarked ? 'currentColor' : 'none'} />
                </button>
              </div>
              <div className="avp-aux">
                <button
                  type="button"
                  className="avp-icon-btn"
                  aria-pressed={muted}
                  aria-label={muted ? '음소거 해제' : '음소거'}
                  title={muted ? '음소거 해제' : '음소거'}
                  onClick={toggleMute}
                >
                  {muted ? <VolumeX size={19} aria-hidden /> : <Volume2 size={19} aria-hidden />}
                </button>
                {/*
                  자막 버튼 — 실제로 비활성인 유일한 버튼(위 docblock 참조).
                  지금 lens 영상 파이프라인은 자막 파일(vtt/srt)이나 자막
                  텍스트를 만들지도, 저장하지도 않는다(CmsLensItem에 해당
                  필드가 없음). 버튼을 없애는 대신 남겨두고 disabled +
                  이유를 밝힌다 — 스티어링 §4 "동작하지 않는 기능을
                  활성화된 것처럼 두지 않는다: 비활성 처리 + 이유 명시,
                  또는 노출하지 않는다"의 첫 번째 선택지. 백엔드가 자막을
                  연결하면 이 disabled와 title만 걷어내면 되는 자리다.
                */}
                <button
                  type="button"
                  className="avp-icon-btn"
                  disabled
                  aria-disabled="true"
                  aria-label="자막 준비 중"
                  title="자막 준비 중 — 아직 지원하지 않아요"
                >
                  <Captions size={19} aria-hidden />
                </button>
                <button
                  type="button"
                  className="avp-icon-btn"
                  aria-pressed={fullscreen}
                  aria-label={fullscreen ? '전체화면 종료' : '전체화면'}
                  title={fullscreen ? '전체화면 종료' : '전체화면'}
                  onClick={toggleFullscreen}
                >
                  <Maximize size={19} aria-hidden />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
