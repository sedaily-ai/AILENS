'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Repeat, RotateCcw, RotateCw, Bookmark, ChevronDown, Check } from 'lucide-react';
import { clock, spoken, boldenQuotes, PLAYBACK_RATES, PLAYBACK_RATE_LABELS } from '@/shared/lib/media/mediaPlayerFormat';
import { useMediaBookmark, usePlaybackRateMenu, useMediaTransport } from '@/shared/lib/media/useMediaPlayerControls';
import { aapCss } from './articleAudioPlayerStyles';

/**
 * 기사 안에 인라인으로 박히는 오디오 플레이어 카드.
 *
 * 구조: 커버 아트 → 배지+제목 → 바이라인 → 대본 탭 → 대본 패널(재생 위치 하이라이트) → 파형 → 하단 컨트롤
 * (반복/±5초/재생/북마크). 스타일은 articleAudioPlayerStyles.ts에 있다.
 *
 * 동작하지 않는 기능을 활성화된 것처럼 두지 않는다.
 * - 순위 배지는 없다(실제 순위 데이터가 없다). 형식 이름("팟캐스트")을 배지로 쓴다.
 * - 투표·Q&A 탭은 없다(기능 자체가 없다). "대본" 탭 하나만 두며 확장 지점은 TabKey에 남긴다.
 * - 전체화면 재생 화면용 뒤로가기·재생목록 버튼은 없다(인라인 카드이므로 이동할 이전 화면이 없다).
 *
 * 파형 원칙: 오디오 데이터를 디코딩해 그리지 않는다(분석 없이 그린 막대 높이는 지어낸 소리 크기가 된다).
 * seed 기반 고정 패턴(같은 src면 같은 모양)을 막대 모양에 쓰고, 재생/잔여 구분색만 실제 재생 위치(cur/dur)를
 * 반영한다. 스크린리더에는 파형을 노출하지 않고 텍스트 시간 표기만 읽힌다.
 */

const RATES = PLAYBACK_RATES;
const RATE_LABELS = PLAYBACK_RATE_LABELS;
// 파형 막대 개수. .aap-wave의 grid-template-columns(repeat(WAVE_BAR_COUNT, 1fr))와 반드시 같은 값이어야 한다.
const WAVE_BAR_COUNT = 96;

// 하단 팟캐스트 상시 재생 바(TodayNewsPlayer.tsx)와 같은 storage key 프리픽스 규칙을 따르되, 기사별 오디오이므로 src를 키로 쓴다.
const BOOKMARK_STORAGE_KEY = 'ailens-audio-bookmarks';

type TabKey = 'script';
// 확장 지점: 스크립트/챕터 데이터가 생기면(예: Q&A 세그먼트) 여기에 추가한다. 데이터 없는 탭은 만들지 않는다.

/** src 문자열에서 결정적 시드를 뽑는다. 같은 오디오는 항상 같은 막대 모양이 된다. */
function seedFrom(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/**
 * 막대 높이 패턴(고정) — 시드 기반 의사 난수. 오디오 데이터를 읽지 않으므로 소리 크기를 의미하지 않는다.
 */
function barPattern(seed: number, count: number): number[] {
  let x = seed || 1;
  const next = () => {
    // xorshift32: 라이브러리 없이 만드는 결정적 의사난수.
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return ((x >>> 0) % 1000) / 1000;
  };
  return Array.from({ length: count }, () => 0.28 + next() * 0.72);
}

export interface ArticleAudioChapter {
  /**
   * 이 단락이 시작되는 실제 재생 위치(초). 있을 때만 클릭 탐색·재생 위치 하이라이트가 켜진다.
   * 없는 항목은 읽는 대본으로만 표시하며, 동작하지 않는 버튼을 만들지 않는다.
   */
  time?: number;
  text: string;
}

export function ArticleAudioPlayer({
  src,
  accent = '#5b8def',
  label = '오디오',
  kicker,
  title,
  coverImage,
  byline,
  bylineHref,
  chapters: chaptersProp,
  onDuration,
}: {
  src: string;
  /** 카드 광원·진행 채움·파형 강조에 쓰는 강조색. 지금 화면의 유일한 강조색을 넘긴다. */
  accent?: string;
  /** aria-label 문맥용("팟캐스트" 등). 화면에는 안 나온다. */
  label?: string;
  /** 상단 배지("AI 음성 브리핑" 등). 넘기지 않으면 label을 쓴다. */
  kicker?: string;
  /** 에피소드 제목. 없으면 kicker/label로 대체. */
  title?: string;
  /** 커버 아트(기사 사진 등). 없으면 커버 자리를 렌더하지 않는다. */
  coverImage?: string | null;
  /** 바이라인. 이 서비스에는 화자명이 없어 출처로 대체한다. */
  byline?: string | null;
  /** 바이라인 클릭 시 열 외부 링크. */
  bylineHref?: string | null;
  /**
   * 대본 단락. 실측 타임코드가 있으면 그 값을, 없으면 시간 없이(순번만) 렌더한다.
   * 비어 있으면 대본 탭 자체를 렌더하지 않는다.
   */
  chapters?: ArticleAudioChapter[];
  /** loadedmetadata에서 읽은 실제 길이(초). 호출부가 길이를 따로 표기할 때 쓰며, 도착 전에는 추정치를 채우지 않는다. */
  onDuration?: (sec: number) => void;
}) {
  const ref = useRef<HTMLAudioElement | null>(null);
  const [looping, setLooping] = useState(false);
  // 대본은 펼친 상태로 시작한다. 대본이 이 패널 하나뿐이고 재생 위치를 따라가며 읽는 용도(접근성 포함)이며,
  // 패널 높이가 제한(스크롤)되어 플레이어를 가리지 않는다.
  const [tab, setTab] = useState<TabKey | null>(chaptersProp && chaptersProp.length > 0 ? 'script' : null);
  // 대본 자동 추적. 사용자가 리스트를 수동 스크롤하면 잠깐 해제한다.
  const [autoTrack, setAutoTrack] = useState(true);
  // 드래그 중에는 timeupdate가 썸을 되돌리지 못하게 막는다. 렌더에서 읽어야 하므로(react-hooks/refs) ref 대신 state로 둔다.
  const [scrubbing, setScrubbing] = useState(false);
  const [scrubTime, setScrubTime] = useState<number | null>(null);
  const scriptListRef = useRef<HTMLOListElement | null>(null);
  const autoTrackResumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 북마크·배속 메뉴·재생 전송(재생/일시정지/탐색/±5초/재시도) 상태 로직은
  // ArticleVideoPlayer.tsx와 같아서 shared/lib/media/useMediaPlayerControls.ts로 추출했다.
  const { bookmarked, toggleBookmark } = useMediaBookmark(src, BOOKMARK_STORAGE_KEY);
  const { rateIdx, rateMenuOpen, setRateMenuOpen, selectRate, rateMenuRef, rateTriggerRef } =
    usePlaybackRateMenu(ref, RATES);
  const { playing, cur, dur, failed, toggle, seekTo, nudge, retry } = useMediaTransport(ref, {
    looping,
    onDuration,
  });

  const pct = dur > 0 ? Math.min(100, (cur / dur) * 100) : 0;
  const tick = dur >= 120 ? (60 / dur) * 100 : 0;

  // 파형 막대: 결정적 패턴. grid가 폭에 맞게 늘어나므로 개수는 화면 크기와 무관하게 고정(WAVE_BAR_COUNT, CSS와 공유).
  const bars = useMemo(() => barPattern(seedFrom(src), WAVE_BAR_COUNT), [src]);
  const playedBars = dur > 0 ? Math.round((cur / dur) * bars.length) : 0;

  // 대본 자동 하이라이트: 실측 타임코드가 있는 챕터 중 현재 위치를 지난 마지막 항목.
  // 타임코드가 있는 챕터가 없으면 자동 하이라이트·자동 스크롤을 켜지 않는다(존재하지 않는 시점을 가리키는 가짜 추적 방지).
  // 실측 타임코드가 없으면 길이를 안 뒤에 글자 수 비율로 각 문단의 시작 시각을 어림하며, 화면에 "대략"이라고 밝힌다(estimatedTrack).
  // 실측 값이 들어오면 그것을 그대로 쓴다.
  const rawHasTimecodes = !!chaptersProp?.some((c) => typeof c.time === 'number');
  const estimatedTrack = !rawHasTimecodes && dur > 0 && !!chaptersProp && chaptersProp.length > 1;
  const chapters = useMemo(() => {
    if (!chaptersProp || !estimatedTrack) return chaptersProp;
    const total = chaptersProp.reduce((s, c) => s + c.text.length, 0) || 1;
    let acc = 0;
    return chaptersProp.map((c) => {
      const time = (acc / total) * dur;
      acc += c.text.length;
      return { ...c, time };
    });
  }, [chaptersProp, estimatedTrack, dur]);

  const hasTimecodes = useMemo(() => !!chapters?.some((c) => typeof c.time === 'number'), [chapters]);

  const activeChapterIdx = useMemo(() => {
    if (!hasTimecodes || !chapters) return -1;
    let idx = -1;
    for (let i = 0; i < chapters.length; i += 1) {
      const t = chapters[i].time;
      if (typeof t === 'number' && t <= cur) idx = i;
      else if (typeof t === 'number') break;
    }
    return idx;
  }, [chapters, cur, hasTimecodes]);

  // 대본 문단을 누르면 그 위치로 옮기고 바로 재생한다(멈춰 있어도 소리가 나야 이동이 인지된다).
  const playFrom = (sec: number) => {
    seekTo(sec);
    void ref.current?.play().catch(() => {});
    setAutoTrack(true);
  };

  useEffect(() => {
    if (!hasTimecodes || !autoTrack || activeChapterIdx < 0 || tab !== 'script') return;
    const list = scriptListRef.current;
    if (!list) return;
    const item = list.children[activeChapterIdx] as HTMLElement | undefined;
    // 패널 안에서만 스크롤한다(scrollIntoView는 페이지 전체도 움직여 재생 중 화면이 튄다).
    if (item) list.scrollTo({ top: Math.max(0, item.offsetTop - list.clientHeight / 3), behavior: 'smooth' });
  }, [activeChapterIdx, autoTrack, tab, hasTimecodes]);

  const jumpToActive = useCallback(() => {
    setAutoTrack(true);
    if (autoTrackResumeTimer.current) clearTimeout(autoTrackResumeTimer.current);
    const list = scriptListRef.current;
    const item = list?.children[activeChapterIdx] as HTMLElement | undefined;
    if (list && item) list.scrollTo({ top: Math.max(0, item.offsetTop - list.clientHeight / 3), behavior: 'smooth' });
  }, [activeChapterIdx]);

  const onScriptScroll = useCallback(() => {
    setAutoTrack(false);
    if (autoTrackResumeTimer.current) clearTimeout(autoTrackResumeTimer.current);
    // 사용자가 스크롤을 멈추고 4초가 지나면 자동 추적을 다시 켠다(영구 해제가 아니다).
    autoTrackResumeTimer.current = setTimeout(() => setAutoTrack(true), 4000);
  }, []);

  useEffect(
    () => () => {
      if (autoTrackResumeTimer.current) clearTimeout(autoTrackResumeTimer.current);
    },
    [],
  );

  const displayCur = scrubTime ?? cur;
  const remaining = dur > 0 ? Math.max(0, dur - displayCur) : null;

  return (
    <div
      className="aap"
      style={
        {
          ['--aap-c' as string]: accent,
          ['--aap-p' as string]: `${pct}%`,
          ['--aap-tick' as string]: tick > 0 ? `${tick}%` : '200%',
        } as CSSProperties
      }
    >
      {/* 스타일은 articleAudioPlayerStyles.ts에 있다. 이 CSS 문자열은 SSR HTML에 그대로 실리므로 주석을 두지 않는다. */}
      <style>{aapCss(WAVE_BAR_COUNT)}</style>

      <div className="aap-inner">
        {/* controls 없이 둔다. 컨트롤이 이 엘리먼트를 직접 조작한다. preload="metadata"는 재생 전에 길이를 표시하기 위해 필요하다. */}
        <audio ref={ref} src={src} preload="metadata" style={{ display: 'none' }} />

        {failed ? (
          <div className="aap-fail">
            <span>오디오를 재생할 수 없어요. 네트워크를 확인해 주세요.</span>
            <button type="button" className="aap-retry" onClick={retry}>
              다시 시도
            </button>
          </div>
        ) : (
          <>
            <div className="aap-head">
              {coverImage && (
                <span className="aap-cover">
                  {/* eslint-disable-next-line @next/next/no-img-element -- 임의 원격 CMS 이미지, next/image 도메인 등록 없이도 안전하게 */}
                  <img src={coverImage} alt="" />
                </span>
              )}
              <div className="aap-headtext">
                <span className="aap-badge">{kicker ?? label}</span>
                <p className="aap-title">{title ?? kicker ?? label}</p>
                {byline &&
                  (bylineHref ? (
                    <a
                      href={bylineHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="aap-byline"
                      data-link="true"
                    >
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
                    <span className="aap-byline">{byline}</span>
                  ))}
              </div>
            </div>

            {/* 대본 탭 + 배속을 한 행(.aap-toprow)에 두고 높이를 36px로 맞춘다. 대본 탭이 없는 기사는 배속만 data-solo로 오른쪽 정렬한다. */}
            <div className="aap-toprow" data-solo={!(chapters && chapters.length > 0)}>
              {chapters && chapters.length > 0 && (
                <div className="aap-tabs">
                  {/* role="tab" 대신 토글 버튼이다. tablist는 패널 중 하나가 항상 열려 있음을 전제하지만 이 탭은 여닫는 디스클로저이므로
                      aria-expanded + aria-controls 조합이 실제 동작과 맞는 시맨틱이다. */}
                  {/* 방향이 바뀌는 화살표는 디스클로저의 표준 신호로, 필터 칩과 구분되게 펼침/닫힘을 전달한다. */}
                  <button
                    type="button"
                    aria-expanded={tab === 'script'}
                    aria-controls="aap-script-panel"
                    className="aap-tab"
                    title={tab === 'script' ? '대본 접기' : '대본 펼치기'}
                    onClick={() => setTab((t) => (t === 'script' ? null : 'script'))}
                  >
                    대본
                    <ChevronDown
                      size={14}
                      aria-hidden
                      style={{ transform: tab === 'script' ? 'rotate(180deg)' : 'none', transition: 'transform .2s cubic-bezier(.2,0,0,1)' }}
                    />
                  </button>
                </div>
              )}
              {/* 순환 버튼 대신 드롭다운 메뉴. 지금 값과 펼침 화살표를 함께 보여 목록이 열린다는 기대를 준다. */}
              <div className="aap-rate-wrap" ref={rateMenuRef}>
                <button
                  type="button"
                  ref={rateTriggerRef}
                  className="aap-rate"
                  aria-haspopup="listbox"
                  aria-expanded={rateMenuOpen}
                  title="재생 속도"
                  onClick={() => setRateMenuOpen((v) => !v)}
                >
                  {RATE_LABELS[rateIdx]}×
                  <ChevronDown size={13} aria-hidden style={{ transform: rateMenuOpen ? 'rotate(180deg)' : 'none', transition: 'transform .2s cubic-bezier(.2,0,0,1)' }} />
                </button>
                {rateMenuOpen && (
                  <ul className="aap-rate-menu" role="listbox" aria-label="재생 속도 선택" aria-activedescendant={`aap-rate-opt-${rateIdx}`}>
                    {RATE_LABELS.map((label, i) => (
                      <li key={label} role="presentation">
                        <button
                          type="button"
                          id={`aap-rate-opt-${i}`}
                          role="option"
                          aria-selected={i === rateIdx}
                          className="aap-rate-opt"
                          onClick={() => selectRate(i)}
                        >
                          <span>{label}×</span>
                          {i === rateIdx && <Check size={14} aria-hidden />}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {chapters && chapters.length > 0 && tab === 'script' && (
              <>
              <div className="aap-scriptwrap">
              <ol
                ref={scriptListRef}
                id="aap-script-panel"
                className="aap-script"
                onScroll={onScriptScroll}
                aria-label="팟캐스트 대본"
              >
                {chapters.map((c, i) => {
                  const seekable = typeof c.time === 'number';
                  return (
                    <li key={i}>
                      {/* 타임코드가 없는 단락은 seek 대상이 없으므로 포커스 가능한 버튼 대신 읽는 텍스트로 둔다. */}
                      {seekable ? (
                        <button
                          type="button"
                          className="aap-script-item"
                          data-active={i === activeChapterIdx}
                          onClick={() => playFrom(c.time as number)}
                          aria-current={i === activeChapterIdx ? 'true' : undefined}
                          aria-label={`${spoken(c.time as number)}로 이동: ${c.text}`}
                        >
                          {boldenQuotes(c.text)}
                        </button>
                      ) : (
                        <p className="aap-script-item" data-active={i === activeChapterIdx}>
                          {boldenQuotes(c.text)}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ol>
              {/* 직접 스크롤해서 읽던 위치를 벗어났을 때만 나온다 — 누르면 지금 재생 중인 문단으로 돌아가 다시 따라간다. */}
              {!autoTrack && cur > 0 && activeChapterIdx >= 0 && (
                <button type="button" className="aap-script-jump" onClick={jumpToActive}>
                  지금 재생 위치로
                  <ChevronDown size={14} aria-hidden />
                </button>
              )}
              </div>
              {/* 시각을 글자 수 비율로 어림했을 때만 밝힌다 — 실제 문단별 시각으로 오해하지 않게(estimatedTrack). */}
              {estimatedTrack && <p className="aap-script-note">재생 위치에 맞춰 대략 따라가요. 문단을 누르면 그 근처로 이동해요.</p>}
              </>
            )}

            <div className="aap-wavewrap">
              {/* 길이를 아직 모르면(loadedmetadata 전) data-loading으로 파형 채도를 낮추고 느린 셔머를 흘려 준비 중임을 알린다(스켈레톤 관례). */}
              <div className="aap-wave" data-playing={playing} data-loading={dur === 0} style={{ position: 'relative' }}>
                {bars.map((h, i) => (
                  <span
                    key={i}
                    className="aap-wave-bar"
                    data-played={i < playedBars}
                    style={{ height: `${Math.round(h * 40)}px` }}
                    aria-hidden
                  />
                ))}
                {/* 탐색·키보드·스크린리더는 이 네이티브 slider가 전담한다. ±5초는 화살표, Home/End는 처음·끝이다. */}
                <input
                  type="range"
                  className="aap-wave-seek"
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
                    // 키보드 조작(화살표·Home/End)은 드래그가 아니라 즉시 seek하며, 툴팁은 포인터 드래그에서만 보여준다.
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
                <span className="aap-wave-focus-ring" aria-hidden />
                {scrubbing && scrubTime !== null && dur > 0 && (
                  <span className="aap-scrub-tip" style={{ left: `${(scrubTime / dur) * 100}%` }}>
                    {clock(scrubTime)}
                  </span>
                )}
              </div>

              <div className="aap-time-row">
                <span>{clock(displayCur)}</span>
                <span>{remaining !== null ? `-${clock(remaining)}` : ''}</span>
              </div>
            </div>

            <div className="aap-transport">
              {/* 마우스 사용자에게도 설명이 보이도록 네이티브 title을 둔다. */}
              <button
                type="button"
                className="aap-icon-btn"
                aria-pressed={looping}
                aria-label={looping ? '반복 재생 끄기' : '반복 재생 켜기'}
                title={looping ? '반복 재생 끄기' : '반복 재생 켜기'}
                onClick={() => setLooping((v) => !v)}
              >
                <Repeat size={19} strokeWidth={1.5} aria-hidden />
              </button>
              <button type="button" className="aap-icon-btn" onClick={() => nudge(-5)} aria-label="5초 뒤로" title="5초 뒤로">
                <RotateCcw size={20} strokeWidth={1.5} aria-hidden />
              </button>
              <button
                type="button"
                className="aap-play"
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
              <button type="button" className="aap-icon-btn" onClick={() => nudge(5)} aria-label="5초 앞으로" title="5초 앞으로">
                <RotateCw size={20} strokeWidth={1.5} aria-hidden />
              </button>
              <button
                type="button"
                className="aap-icon-btn"
                aria-pressed={bookmarked}
                aria-label={bookmarked ? '북마크 해제' : '북마크에 저장'}
                title={bookmarked ? '북마크 해제' : '북마크에 저장'}
                onClick={toggleBookmark}
              >
                <Bookmark size={19} strokeWidth={1.5} aria-hidden fill={bookmarked ? 'currentColor' : 'none'} />
              </button>
            </div>

          </>
        )}
      </div>
    </div>
  );
}
