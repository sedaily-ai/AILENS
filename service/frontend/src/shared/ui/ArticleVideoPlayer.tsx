'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Repeat, Bookmark, Check, Volume2, VolumeX, Maximize, ChevronDown } from 'lucide-react';
import { clock, spoken, PLAYBACK_RATES, PLAYBACK_RATE_LABELS } from '@/shared/lib/mediaPlayerFormat';
import { useMediaBookmark, usePlaybackRateMenu, useMediaTransport } from '@/shared/lib/useMediaPlayerControls';

/**
 * 기사 안에 박아 쓰는 영상 플레이어 — 2026-08-21 신설, 2026-10-03 "극장" 콘셉트로 재설계.
 *
 * 집중이 목적이다. 카드·배지·그라디언트·발광을 걷어내고, 영상 프레임만 무대로 둔다.
 *  - 컨트롤은 프레임 위 하단 막대로 얹고, 재생 중 2.6초 동안 입력이 없으면 숨는다(얇은 진행선만 남는다).
 *  - 재생을 시작하면 프레임 바깥이 어두워진다(조명이 꺼지는 극장). 어두운 바탕을 누르면 일시정지한다.
 *  - 제목·출처는 영상 아래 캡션으로 내렸다 — 영상 위에서 시선을 빼앗지 않는다.
 *  - 없는 기능을 지어내지 않는다: 자막 데이터가 파이프라인에 없어 자막 버튼은 노출하지 않는다(생기면 추가).
 * 북마크·배속·반복·재생/탐색 로직은 useMediaPlayerControls에서 팟캐스트 플레이어와 공유한다.
 */

const BOOKMARK_STORAGE_KEY = 'ailens-video-bookmarks';

export function ArticleVideoPlayer({
  src,
  poster,
  accent = '#5b8def',
  label = '영상',
  kicker,
  title,
  byline,
  bylineHref,
  onDuration,
  chapters,
}: {
  src: string;
  /** 정지 프레임 썸네일 — 실측 영상 프레임(thumbnail_url). 없으면 브라우저가 첫 프레임을 그린다. */
  poster?: string | null;
  accent?: string;
  /** aria-label 문맥용("영상" 등). */
  label?: string;
  /** 캡션 위 작은 글씨("15초 영상 브리핑" 등). 넘기지 않으면 label을 쓴다. */
  kicker?: string;
  title?: string;
  byline?: string | null;
  bylineHref?: string | null;
  onDuration?: (sec: number) => void;
  /** 대본 문단(2026-10-03 팟캐스트 대본과 같은 디자인). 문단별 실제 시각이 없어 글자 수 비율로 어림해 따라간다. */
  chapters?: { text: string }[];
}) {
  const ref = useRef<HTMLVideoElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [ratio, setRatio] = useState(16 / 9); // 영상 실제 가로/세로 비율 — 세로(9:16) 영상은 가운데에 좁게 세운다(2026-10-03)
  const [buffered, setBuffered] = useState(0);
  const [looping, setLooping] = useState(false);
  const [muted, setMuted] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [scrubbing, setScrubbing] = useState(false);
  const [scrubTime, setScrubTime] = useState<number | null>(null);
  const [awake, setAwake] = useState(true); // 컨트롤 표시 여부(재생 중에만 의미)
  const [scriptOpen, setScriptOpen] = useState(true);
  const scriptRef = useRef<HTMLOListElement | null>(null);
  const sleepTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { bookmarked, toggleBookmark } = useMediaBookmark(src, BOOKMARK_STORAGE_KEY);
  const { rateIdx, rateMenuOpen, setRateMenuOpen, selectRate, rateMenuRef, rateTriggerRef } =
    usePlaybackRateMenu(ref, PLAYBACK_RATES);
  const { playing, cur, dur, failed, toggle, seekTo, retry } = useMediaTransport(ref, {
    looping,
    onDuration,
  });

  // 입력이 있으면 컨트롤을 보이고, 재생 중이면 2.6초 뒤 다시 숨긴다.
  const wake = useCallback(() => {
    setAwake(true);
    if (sleepTimer.current) clearTimeout(sleepTimer.current);
    sleepTimer.current = setTimeout(() => setAwake(false), 2600);
  }, []);
  useEffect(
    () => () => {
      if (sleepTimer.current) clearTimeout(sleepTimer.current);
    },
    [],
  );

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onProgress = () => {
      if (el.buffered.length > 0) setBuffered(el.buffered.end(el.buffered.length - 1));
    };
    const onVolume = () => setMuted(el.muted);
    const onMeta = () => {
      if (el.videoWidth > 0 && el.videoHeight > 0) setRatio(el.videoWidth / el.videoHeight);
    };
    onMeta();
    el.addEventListener('loadedmetadata', onMeta);
    el.addEventListener('timeupdate', onProgress);
    el.addEventListener('progress', onProgress);
    el.addEventListener('volumechange', onVolume);
    return () => {
      el.removeEventListener('timeupdate', onProgress);
      el.removeEventListener('progress', onProgress);
      el.removeEventListener('volumechange', onVolume);
      el.removeEventListener('loadedmetadata', onMeta);
    };
  }, []);

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === wrapRef.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggleMute = useCallback(() => {
    const el = ref.current;
    if (el) el.muted = !el.muted;
  }, []);

  const toggleFullscreen = useCallback(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void wrap.requestFullscreen().catch(() => {});
  }, []);

  const pct = dur > 0 ? Math.min(100, (cur / dur) * 100) : 0;
  const bufferedPct = dur > 0 ? Math.min(100, (buffered / dur) * 100) : 0;
  const displayCur = scrubTime ?? cur;
  // 대본 문단별 시작 시각 — 글자 수 비율로 어림(실제 음성 시각이 아님. 화면에 "대략"이라고 밝힌다).
  const starts = useMemo(() => {
    if (!chapters || chapters.length === 0 || dur <= 0) return null;
    const total = chapters.reduce((n, c) => n + c.text.length, 0) || 1;
    let acc = 0;
    return chapters.map((c) => {
      const t = (acc / total) * dur;
      acc += c.text.length;
      return t;
    });
  }, [chapters, dur]);
  const activeIdx = useMemo(() => {
    if (!starts) return -1;
    let idx = -1;
    for (let i = 0; i < starts.length; i += 1) if (starts[i] <= cur) idx = i;
    return idx;
  }, [starts, cur]);
  useEffect(() => {
    const list = scriptRef.current;
    if (!list || activeIdx < 0 || !playing) return;
    const item = list.children[activeIdx] as HTMLElement | undefined;
    if (item) list.scrollTo({ top: Math.max(0, item.offsetTop - list.clientHeight / 3), behavior: 'smooth' });
  }, [activeIdx, playing]);
  const showUi = !playing || awake || scrubbing || rateMenuOpen;

  const onStageTap = () => {
    toggle();
    wake();
  };

  return (
    <div
      className="avp"
      ref={wrapRef}
      data-ui={showUi}
      onMouseMove={playing ? wake : undefined}
      onKeyDown={playing ? wake : undefined}
      style={{ ['--avp-c' as string]: accent } as CSSProperties}
    >
      <style>{`
        .avp { position: relative; z-index: 1; }
        .avp:fullscreen { background: #000; display: flex; align-items: center; justify-content: center; }
        .avp:fullscreen .avp-cap { display: none; }

        .avp-frame { position: relative; border-radius: 10px; overflow: hidden; background: #0b0c10; width: 100%;
          box-shadow: 0 30px 60px -30px rgba(0,0,0,.55); }
        .avp-frame[data-portrait='true'] { width: min(100%, 400px, calc(78vh * 9 / 16)); margin: 0 auto; border-radius: 14px; }
        :fullscreen .avp-frame { border-radius: 0; box-shadow: none; max-height: 100vh; }
        :fullscreen .avp-frame[data-portrait='true'] { width: min(100vw, calc(100vh * 9 / 16)); }
        .avp video { width: 100%; height: 100%; object-fit: contain; display: block; cursor: pointer; }

        .avp-center { position: absolute; inset: 0; display: grid; place-items: center; border: none; padding: 0; cursor: pointer; background: none;
          transition: opacity .25s cubic-bezier(.2,0,0,1); }
        .avp-center[data-playing='true'] { opacity: 0; pointer-events: none; }
        .avp-center span { width: 72px; height: 72px; border-radius: 999px; display: grid; place-items: center; color: #fff; border: none;
          background: rgba(15,23,42,.62); backdrop-filter: blur(4px); transition: transform .25s cubic-bezier(.2,0,0,1), background-color .25s; }
        .avp-center:hover span { transform: scale(1.06); background: rgba(15,23,42,.8); }
        .avp-center:focus-visible { outline: 2px solid #fff; outline-offset: -6px; }

        /* 하단 막대 — 진행선은 항상 보이고, 나머지는 재생 중 입력이 없으면 사라진다. */
        .avp-bar { position: absolute; left: 0; right: 0; bottom: 0; padding: 28px 14px 0; background: linear-gradient(to top, rgba(0,0,0,.62), rgba(0,0,0,0)); color: #fff;
          transition: opacity .25s cubic-bezier(.2,0,0,1); }
        .avp-bar-ui { display: flex; align-items: center; gap: 4px; padding-bottom: 10px; transition: opacity .25s cubic-bezier(.2,0,0,1), transform .25s cubic-bezier(.2,0,0,1); }
        .avp[data-ui='false'] .avp-bar-ui { opacity: 0; transform: translateY(6px); pointer-events: none; }
        .avp[data-ui='false'] .avp-bar { background: none; }
        .avp-time { margin-left: 4px; font-size: 13px; font-weight: 600; font-variant-numeric: tabular-nums; color: rgba(255,255,255,.9); }
        .avp-time i { font-style: normal; color: rgba(255,255,255,.55); }
        .avp-spacer { flex: 1; }
        .avp-ib { width: 38px; height: 38px; border: none; border-radius: 999px; background: none; color: rgba(255,255,255,.86); display: grid; place-items: center; cursor: pointer; transition: background-color .2s; }
        .avp-ib:hover { background: rgba(255,255,255,.14); }
        .avp-ib[aria-pressed='true'] { color: #fff; background: rgba(255,255,255,.2); }
        .avp-ib:focus-visible { outline: 2px solid #fff; outline-offset: -2px; }
        @media (max-width: 479px) { .avp-ib-opt { display: none; } }

        .avp-prog { position: relative; height: 3px; margin: 0 -14px; background: rgba(255,255,255,.28); transition: height .15s cubic-bezier(.2,0,0,1); }
        .avp:hover .avp-prog, .avp-prog[data-scrubbing='true'] { height: 5px; }
        .avp-prog-buffered { position: absolute; inset: 0; width: ${bufferedPct}%; background: rgba(255,255,255,.28); }
        .avp-prog-played { position: absolute; inset: 0; width: ${pct}%; background: var(--avp-c); }
        .avp-prog-seek { position: absolute; inset: -12px 0; width: 100%; height: 28px; margin: 0; opacity: 0; cursor: pointer; -webkit-appearance: none; appearance: none; }
        .avp-prog-seek:disabled { cursor: default; }
        .avp-prog-seek:focus-visible ~ .avp-prog-focus { opacity: 1; }
        .avp-prog-focus { position: absolute; inset: -3px 0; border: 2px solid #fff; opacity: 0; pointer-events: none; }
        .avp-tip { position: absolute; bottom: 14px; transform: translateX(-50%); padding: 3px 8px; border-radius: 6px; background: #fff; color: #0f172a; font-size: 12px; font-weight: 700; font-variant-numeric: tabular-nums; pointer-events: none; }

        .avp-rate-wrap { position: relative; }
        .avp-rate { height: 32px; padding: 0 10px; border: none; border-radius: 999px; background: rgba(255,255,255,.14); color: #fff; font-size: 12.5px; font-weight: 700; font-family: inherit; cursor: pointer; font-variant-numeric: tabular-nums; }
        .avp-rate:hover { background: rgba(255,255,255,.24); }
        .avp-rate:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
        .avp-rate-menu { position: absolute; bottom: calc(100% + 8px); right: 0; min-width: 84px; margin: 0; padding: 5px; list-style: none; border-radius: 12px; background: rgba(15,17,24,.96); border: 1px solid rgba(255,255,255,.1); }
        .avp-rate-opt { display: flex; align-items: center; justify-content: space-between; gap: 10px; width: 100%; height: 34px; padding: 0 10px; border: none; border-radius: 8px; background: none; color: rgba(255,255,255,.8);
          font-size: 13.5px; font-weight: 600; font-family: inherit; cursor: pointer; font-variant-numeric: tabular-nums; }
        .avp-rate-opt:hover { background: rgba(255,255,255,.1); }
        .avp-rate-opt:focus-visible { outline: 2px solid #fff; outline-offset: -2px; }
        .avp-rate-opt[aria-selected='true'] { color: #fff; }

        /* 캡션 — 영상 아래, 잡지 사진 캡션처럼. 조명이 꺼진 동안엔 밝은 글씨로 바뀐다. */
        .avp-cap { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; margin-top: 14px; color: #0f172a; transition: color .35s; }
        .avp-cap-main { min-width: 0; }
        .avp-kicker { display: block; font-size: 12px; font-weight: 700; letter-spacing: .04em; color: #64748b; margin-bottom: 4px; transition: color .35s; }
        .avp-title { margin: 0; font-size: clamp(16px, 2.3vw, 18px); font-weight: 700; line-height: 1.4; letter-spacing: -0.01em; word-break: keep-all; }
        .avp-byline { flex: none; display: inline-flex; align-items: center; gap: 4px; font-size: 13px; color: #64748b; text-decoration: none; background: none; border: none; padding: 0; font-family: inherit; transition: color .35s; }
        .avp-byline[data-link='true']:hover { color: #0f172a; }
        .avp-byline[data-link='true']:focus-visible { outline: 2px solid var(--avp-c); outline-offset: 2px; border-radius: 4px; }
        @media (max-width: 520px) { .avp-cap { flex-direction: column; gap: 8px; } }

        /* 대본(팟캐스트 대본과 같은 디자인) — 회색 문단, 지금 읽는 문단만 파랑·굵게, 얇은 스크롤바. */
        .avp-tab { display: inline-flex; align-items: center; gap: 5px; height: 34px; padding: 0 13px 0 15px; margin-top: 18px; border: none; border-radius: 999px; background: #f4f5f7; color: #0f172a; font-size: 13.5px; font-weight: 600; font-family: inherit; cursor: pointer; }
        .avp-tab:focus-visible { outline: 2px solid var(--avp-c); outline-offset: 2px; }
        .avp-script { list-style: none; margin: 10px 0 0; padding: 0 8px 0 0; max-height: min(360px, 46vh); overflow-y: auto; overscroll-behavior: contain; display: flex; flex-direction: column; gap: 4px; scrollbar-width: thin; scrollbar-color: #c3c9d3 transparent;
          -webkit-mask-image: linear-gradient(to bottom, transparent 0, black 14px, black calc(100% - 18px), transparent 100%); mask-image: linear-gradient(to bottom, transparent 0, black 14px, black calc(100% - 18px), transparent 100%); }
        .avp-script::-webkit-scrollbar { width: 6px; } .avp-script::-webkit-scrollbar-track { background: transparent; margin: 12px 0; } .avp-script::-webkit-scrollbar-thumb { background: #cdd2db; border-radius: 999px; }
        .avp-script-item { display: block; width: 100%; text-align: left; border: none; background: none; padding: 6px 14px; margin: 0; font: inherit; font-size: 15.5px; line-height: 1.75; color: #7b8798; word-break: keep-all; cursor: pointer; border-radius: 14px; transition: color .2s cubic-bezier(.2,0,0,1); }
        .avp-script-item:hover { color: #475569; } .avp-script-item:focus { outline: none; } .avp-script-item:focus-visible { background: rgba(15,23,42,.05); }
        .avp-script-item[data-active='true'] { color: #2f5fc4; font-weight: 700; }
        .avp-script-note { margin: 8px 14px 0; font-size: 12px; color: #94a3b8; }
        .avp-fail { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; font-size: 15px; line-height: 1.6; color: #0f172a; word-break: keep-all; }
        .avp-retry { height: 36px; padding: 0 16px; border-radius: 999px; border: none; background: #f1f3f6; color: #0f172a; font-size: 13px; font-weight: 700; cursor: pointer; font-family: inherit; }

        @media (prefers-reduced-motion: reduce) {
          .avp-center, .avp-center span, .avp-bar, .avp-bar-ui, .avp-prog, .avp-cap, .avp-kicker, .avp-byline { transition: none; }
        }
      `}</style>

      {failed ? (
        <div className="avp-fail">
          <span>영상을 재생할 수 없어요. 네트워크를 확인해 주세요.</span>
          <button type="button" className="avp-retry" onClick={retry}>
            다시 시도
          </button>
        </div>
      ) : (
        <>
          <div className="avp-frame" data-portrait={ratio < 1} style={{ aspectRatio: String(ratio) }}>
            <video ref={ref} src={src} poster={poster ?? undefined} preload="metadata" playsInline muted={muted} onClick={onStageTap} />
            <button type="button" className="avp-center" data-playing={playing} onClick={onStageTap} aria-label={`${label} 재생`} tabIndex={playing ? -1 : 0}>
              <span>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden style={{ marginLeft: 4 }}>
                  <path d="M8 5.6c0-.8.9-1.3 1.6-.9l9 6.1c.6.4.6 1.3 0 1.7l-9 6.1c-.7.4-1.6-.1-1.6-.9z" />
                </svg>
              </span>
            </button>

            <div className="avp-bar">
              <div className="avp-bar-ui">
                <button type="button" className="avp-ib" onClick={onStageTap} aria-label={playing ? `${label} 일시정지` : `${label} 재생`} title={playing ? '일시정지' : '재생'}>
                  {playing ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                      <rect x="6" y="5" width="4" height="14" rx="1.2" />
                      <rect x="14" y="5" width="4" height="14" rx="1.2" />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                      <path d="M8 5.6c0-.8.9-1.3 1.6-.9l9 6.1c.6.4.6 1.3 0 1.7l-9 6.1c-.7.4-1.6-.1-1.6-.9z" />
                    </svg>
                  )}
                </button>
                <span className="avp-time">
                  {clock(displayCur)} <i>/ {dur > 0 ? clock(dur) : '--:--'}</i>
                </span>
                <span className="avp-spacer" />
                <div className="avp-rate-wrap" ref={rateMenuRef}>
                  <button type="button" ref={rateTriggerRef} className="avp-rate" aria-haspopup="listbox" aria-expanded={rateMenuOpen} title="재생 속도" onClick={() => setRateMenuOpen((v) => !v)}>
                    {PLAYBACK_RATE_LABELS[rateIdx]}×
                  </button>
                  {rateMenuOpen && (
                    <ul className="avp-rate-menu" role="listbox" aria-label="재생 속도 선택" aria-activedescendant={`avp-rate-opt-${rateIdx}`}>
                      {PLAYBACK_RATE_LABELS.map((rateLabel, idx) => (
                        <li key={rateLabel} role="presentation">
                          <button type="button" id={`avp-rate-opt-${idx}`} role="option" aria-selected={idx === rateIdx} className="avp-rate-opt" onClick={() => selectRate(idx)}>
                            <span>{rateLabel}×</span>
                            {idx === rateIdx && <Check size={14} aria-hidden />}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <button type="button" className="avp-ib avp-ib-opt" aria-pressed={looping} aria-label={looping ? '반복 재생 끄기' : '반복 재생 켜기'} title={looping ? '반복 재생 끄기' : '반복 재생 켜기'} onClick={() => setLooping((v) => !v)}>
                  <Repeat size={17} aria-hidden />
                </button>
                <button type="button" className="avp-ib avp-ib-opt" aria-pressed={bookmarked} aria-label={bookmarked ? '북마크 해제' : '북마크에 저장'} title={bookmarked ? '북마크 해제' : '북마크에 저장'} onClick={toggleBookmark}>
                  <Bookmark size={17} aria-hidden fill={bookmarked ? 'currentColor' : 'none'} />
                </button>
                <button type="button" className="avp-ib" aria-pressed={muted} aria-label={muted ? '음소거 해제' : '음소거'} title={muted ? '음소거 해제' : '음소거'} onClick={toggleMute}>
                  {muted ? <VolumeX size={18} aria-hidden /> : <Volume2 size={18} aria-hidden />}
                </button>
                <button type="button" className="avp-ib" aria-pressed={fullscreen} aria-label={fullscreen ? '전체화면 종료' : '전체화면'} title={fullscreen ? '전체화면 종료' : '전체화면'} onClick={toggleFullscreen}>
                  <Maximize size={17} aria-hidden />
                </button>
              </div>
              <div className="avp-prog" data-scrubbing={scrubbing}>
                <span className="avp-prog-buffered" aria-hidden />
                <span className="avp-prog-played" aria-hidden />
                <input
                  type="range"
                  className="avp-prog-seek"
                  role="slider"
                  min={0}
                  max={dur > 0 ? Math.floor(dur) : 0}
                  step={1}
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
                    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Home' || e.key === 'End') setScrubbing(false);
                  }}
                  onChange={(e) => {
                    const next = Number(e.currentTarget.value);
                    if (scrubbing) setScrubTime(next);
                    else seekTo(next);
                  }}
                />
                <span className="avp-prog-focus" aria-hidden />
                {scrubbing && scrubTime !== null && dur > 0 && (
                  <span className="avp-tip" style={{ left: `${(scrubTime / dur) * 100}%` }}>
                    {clock(scrubTime)}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="avp-cap">
            <div className="avp-cap-main">
              <span className="avp-kicker">{kicker ?? label}</span>
              <p className="avp-title">{title ?? kicker ?? label}</p>
            </div>
            {byline &&
              (bylineHref ? (
                <a href={bylineHref} target="_blank" rel="noopener noreferrer" className="avp-byline" data-link="true">
                  {byline}
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M7 17 17 7" />
                    <path d="M8 7h9v9" />
                  </svg>
                  <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>(새 창으로 열립니다)</span>
                </a>
              ) : (
                <span className="avp-byline">{byline}</span>
              ))}
          </div>

          {chapters && chapters.length > 0 && (
            <>
              <button type="button" className="avp-tab" aria-expanded={scriptOpen} aria-controls="avp-script-panel" onClick={() => setScriptOpen((v) => !v)}>
                대본
                <ChevronDown size={14} aria-hidden style={{ transform: scriptOpen ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
              </button>
              {scriptOpen && (
                <>
                  <ol className="avp-script" id="avp-script-panel" ref={scriptRef} aria-label="영상 대본">
                    {chapters.map((c, i) => (
                      <li key={i}>
                        <button
                          type="button"
                          className="avp-script-item"
                          data-active={i === activeIdx}
                          aria-current={i === activeIdx ? 'true' : undefined}
                          disabled={!starts}
                          onClick={() => {
                            if (!starts) return;
                            seekTo(starts[i]);
                            void ref.current?.play().catch(() => {});
                          }}
                        >
                          {c.text}
                        </button>
                      </li>
                    ))}
                  </ol>
                  {starts && <p className="avp-script-note">재생 위치에 맞춰 대략 따라가요. 문단을 누르면 그 근처로 이동해요.</p>}
                </>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
