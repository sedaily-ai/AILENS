'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Repeat, RotateCcw, RotateCw, Bookmark, ChevronDown, Check } from 'lucide-react';
import { clock, spoken, boldenQuotes, PLAYBACK_RATES, PLAYBACK_RATE_LABELS } from '@/shared/lib/mediaPlayerFormat';

/**
 * 기사 안에 박아 쓰는 오디오 플레이어 — 2026-08-21 신설, 여러 차례 재설계.
 *
 * ── 최신 재설계: 레퍼런스 UI 이식 ──
 * 사용자가 첨부한 다크 모바일 팟캐스트 플레이어(커버 아트 + 배지 + 큰 제목 +
 * 바이라인 + 탭(대본/투표/Q&A) + 대본 패널(하이라이트) + 파형 + 분눈금 +
 * 반복/±5초/재생/북마크 하단 바)의 구조를 그대로 옮긴다. AI LENS는 이
 * 레퍼런스만큼 화려한 다크 UI를 다른 곳에 안 쓰지만, "재생기는 읽기와 다른
 * 모드"라는 목적 자체가 이 방향과 일치해서 카드 하나에 한정해 다크 표면을
 * 유지한다(3차 재설계 때 이미 결정 — 아래 유지).
 *
 * 레퍼런스에서 가져오지 않은 것 3가지(있는 데이터로 못 만들거나, 스티어링
 * §4 "동작하지 않는 기능을 활성화된 것처럼 두지 않는다"에 걸리는 것):
 *  1. "#1 top podcast" 순위 배지 → 실제 순위 데이터가 없다. 대신 형식
 *     이름("팟캐스트")을 배지에 넣는다 — 지어낸 순위가 아니라 사실이다.
 *  2. "Poll" / "Q&A" 탭 → 투표·질문 기능 자체가 이 서비스에 없다. 탭에
 *     넣으면 눌러도 아무 일이 없는 버튼이 된다. "대본" 탭 하나만 만든다
 *     (확장 지점은 남겨둔다 — 아래 TabKey 참조).
 *  3. 좌상단 "< Now playing" 뒤로가기 + 우상단 별표(★, "재생목록에 추가"
 *     추정) → 레퍼런스는 전체화면 재생 화면이고 이 컴포넌트는 기사 안에
 *     인라인으로 박히는 카드다. 뒤로갈 "이전 화면"이 없고, 재생목록 기능도
 *     없다. 대신 카드 헤더에 형식 배지 + 북마크(하단 바에 실존) 조합으로
 *     "이건 별도 모드"라는 신호만 유지한다.
 *
 * ── 이전 이력 ──
 * 1차: 강조색 원형 버튼 + 회색 슬라이더 한 줄 — "생성된 UI" 기본형.
 * 2차: #111827 평평한 다크 사각형 — 재질 없이 "칠해진 사각형".
 * 3차: radial glow + 유리 하이라이트 + 그레인 + 이퀄라이저 3줄 레이아웃.
 * 4차(지금): 3차의 재질 언어(다크 표면, accent 광원, 유리 재생 버튼)를
 * 유지하면서 레퍼런스의 정보 구조(커버 → 배지+제목 → 바이라인 → 탭 →
 * 대본 패널 → 파형 → 하단 컨트롤)로 다시 짰다.
 *
 * ── 파형에 대한 원칙 ──
 * 레퍼런스의 막대 파형은 그대로 가져오되, **오디오 데이터를 디코딩해서
 * 그리지 않는다**(Web Audio API AnalyserNode 도입은 "새 라이브러리 설치
 * 금지"에는 안 걸리지만, 이 파일의 오래된 원칙 — "지어낸 값 금지" — 에
 * 걸린다: 실시간 주파수를 분석 안 하고 그린 막대 높이는 결국 무작위 값이라
 * "그럴듯한 소리 크기"를 지어내는 것과 같다). 대신 seed 기반 **고정 패턴**
 * (같은 src면 항상 같은 모양)을 막대 "위치" 표현에 쓰고, 막대의 **재생/
 * 잔여 구분색**만 실제 재생 위치(cur/dur)를 반영한다 — 시각적으로는
 * 레퍼런스와 동일하게 보이지만, "이 막대 높이가 실제 소리 크기를 의미한다"
 * 는 주장을 하지 않는다(스크린리더에는 이 시각화를 노출하지 않고 별도
 * 텍스트 시간 표기만 읽힌다 — 장식이 사실인 것처럼 전달되지 않게).
 */

const RATES = PLAYBACK_RATES;
const RATE_LABELS = PLAYBACK_RATE_LABELS;
// 파형 막대 개수 — .aap-wave의 grid-template-columns(repeat(WAVE_BAR_COUNT, 1fr))
// 와 반드시 같은 값이어야 grid가 정확히 이 개수만큼 열을 나눈다.
// 42 → 96(2026-08-21, "음성 칸을 더 세분화, 엄청 얇게" 요청) — 레퍼런스
// 사진의 파형은 카드 폭을 훨씬 잘게 쪼갠 얇은 선들이다. gap을 2 → 1px로도
// 줄여 막대 사이 틈보다 막대 자체가 더 얇게 보이게 했다.
const WAVE_BAR_COUNT = 96;

// 하단 팟캐스트 상시 재생 바(TodayNewsPlayer.tsx)와 같은 storage key 프리픽스
// 규칙을 따른다 — 다만 이 컴포넌트는 기사별 오디오라 src를 키로 쓴다.
const BOOKMARK_STORAGE_KEY = 'ailens-audio-bookmarks';

type TabKey = 'script';
// 확장 지점 — 스크립트/챕터 데이터가 실제로 생기면(예: Q&A 세그먼트) 여기에
// 추가한다. 지금은 데이터가 없는 탭(Poll/Q&A)을 만들지 않는다(위 docblock 참조).

/** src 문자열에서 결정적 시드를 뽑는다 — 같은 오디오는 항상 같은 막대 모양. */
function seedFrom(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/**
 * 막대 높이 패턴(고정, 42개) — 시드 기반 의사 난수. 레퍼런스의 파형 리듬을
 * 흉내내되(짧은 막대와 긴 막대가 불규칙하게 섞임), 오디오 데이터를 읽지
 * 않으므로 "소리 크기"라는 주장을 하지 않는다(위 docblock 참조).
 */
function barPattern(seed: number, count: number): number[] {
  let x = seed || 1;
  const next = () => {
    // xorshift32 — 라이브러리 없이 결정적 의사난수.
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return ((x >>> 0) % 1000) / 1000;
  };
  return Array.from({ length: count }, () => 0.28 + next() * 0.72);
}

export interface ArticleAudioChapter {
  /**
   * 이 단락이 시작되는 실제 재생 위치(초) — 있을 때만 클릭 탐색·재생 위치
   * 하이라이트가 켜진다. 지금 lens 데이터엔 오디오와 대본 사이 실측
   * 타임코드가 없다(0단계 보고 참조) — 이 필드가 없는 항목은 "읽는 대본"
   * 으로만 표시하고, 클릭해도 아무 데도 이동하지 않는 버튼을 만들지
   * 않는다(스티어링 §4 — 동작하지 않는 기능을 활성화된 것처럼 두지 않는다).
   */
  time?: number;
  text: string;
}

export function ArticleAudioPlayer({
  src,
  accent = '#7c86ff',
  label = '오디오',
  kicker,
  title,
  coverImage,
  byline,
  bylineHref,
  chapters,
  onDuration,
}: {
  src: string;
  /** 카드 광원·진행 채움·파형 강조에 쓰는 강조색. 지금 화면의 유일한 강조색을 넘긴다. */
  accent?: string;
  /** aria-label 문맥용("팟캐스트" 등). 화면에는 안 나온다. */
  label?: string;
  /** 상단 배지("AI 음성 브리핑" 등). 넘기지 않으면 label을 쓴다. */
  kicker?: string;
  /** 에피소드 제목(레퍼런스의 "Jump into indie music scene"). 없으면 kicker/label로 대체. */
  title?: string;
  /** 커버 아트 — 기사 사진 등. 없으면 커버 자리를 렌더하지 않는다(존재하지 않는 이미지를 자리만 비워두지 않음). */
  coverImage?: string | null;
  /** 바이라인("By Southern Malang" 대응) — 이 서비스에는 화자명이 없어 출처로 대체한다. */
  byline?: string | null;
  /** 바이라인 클릭 시 열 외부 링크(레퍼런스의 외부 링크 아이콘). */
  bylineHref?: string | null;
  /**
   * 대본 단락 — 실측 타임코드가 있으면 그 값을, 없으면 시간 없이(순번만)
   * 렌더한다(스크립트/챕터 데이터 없음 보고 참조 — 이 prop이 비어 있으면
   * 대본 탭 자체를 렌더하지 않는다, 확장 가능한 구조로 남겨둔 지점).
   */
  chapters?: ArticleAudioChapter[];
  /**
   * loadedmetadata에서 읽은 실제 길이(초) — 호출부가 다른 곳에도 길이를
   * 표기할 때 쓴다. 이게 오기 전까지 그 자리는 비어 있고, 추정치를 채우지 않는다.
   */
  onDuration?: (sec: number) => void;
}) {
  const ref = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);
  const [rateIdx, setRateIdx] = useState(1); // 1.0×
  const [failed, setFailed] = useState(false);
  const [looping, setLooping] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);
  // 대본은 접힌 상태로 시작한다(2026-08-24, 사용자 요청) — 팟캐스트는
  // "읽기 대신 듣기" 모드라 대본이 처음부터 펼쳐져 있으면 플레이어보다
  // 텍스트가 더 커 보인다. 필요할 때 탭으로 펼친다.
  const [tab, setTab] = useState<TabKey | null>(null);
  // 배속 메뉴 열림 여부 — 2026-08-21, UIUX 감사 반영. 이전엔 버튼 하나를
  // 반복 클릭해 순환시키는 방식이라(0.75→1→1.25→1.5→2→0.75…) "2배로
  // 가려면 몇 번 눌러야 하나"를 기억해야 했다(회상 요구, 닐슨 휴리스틱
  // "회상보다 인식"). 지금 고를 수 있는 값 5개를 목록으로 펼쳐서 한 번에
  // 보여주고 원하는 값을 바로 찍게 한다.
  const [rateMenuOpen, setRateMenuOpen] = useState(false);
  const rateMenuRef = useRef<HTMLDivElement | null>(null);
  const rateTriggerRef = useRef<HTMLButtonElement | null>(null);
  // 대본 자동 추적 — 사용자가 리스트를 수동 스크롤하면 잠깐 해제한다(요청:
  // "현재 재생 중 단락 하이라이트 + 자동 스크롤(수동 스크롤 시 일시 해제)").
  const [autoTrack, setAutoTrack] = useState(true);
  // 드래그 중에는 timeupdate가 썸을 되돌려놓지 못하게 막는다. ref가 아니라
  // state로 둔다 — 드래그 중 툴팁을 렌더에서 읽어야 해서, ref.current를
  // 렌더 중에 읽으면 안 된다는 규칙(react-hooks/refs)에 걸린다.
  const [scrubbing, setScrubbing] = useState(false);
  const [scrubTime, setScrubTime] = useState<number | null>(null);
  const scriptListRef = useRef<HTMLOListElement | null>(null);
  const autoTrackResumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // onDuration을 ref로 잡는다 — 호출부가 인라인 화살표 함수를 넘기면 매
  // 렌더마다 새 함수가 와서, deps에 넣으면 리스너를 계속 붙였다 뗀다.
  // 대입은 렌더 중이 아니라 effect 안에서 한다(react-hooks/refs 규칙).
  const onDurationRef = useRef(onDuration);
  useEffect(() => {
    onDurationRef.current = onDuration;
  }, [onDuration]);

  // TodayNewsPlayer.tsx의 같은 패턴(로컬 저장 복원)과 동일한 형태다. 다만
  // 그 파일은 deps가 []("마운트 시 1회")라 react-hooks/set-state-in-effect가
  // 안 걸리고, 여기는 deps가 [src]다 — 이 카드는 여러 기사에서 재사용되므로
  // src가 바뀔 때(다른 오디오로 전환) localStorage를 다시 읽어야 한다.
  // localStorage는 React 상태가 아닌 외부 시스템이라 effect로 동기화하는
  // 것이 맞는 용도다(브라우저 API 접근은 렌더 중에 할 수 없다).
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(BOOKMARK_STORAGE_KEY);
      if (raw) {
        const set: string[] = JSON.parse(raw);
        // eslint-disable-next-line react-hooks/set-state-in-effect -- 외부 저장소(localStorage) 동기화, src 변경 시 재확인 필요
        setBookmarked(set.includes(src));
      }
    } catch {
      // localStorage 접근 불가(시크릿 모드 등) — 조용히 무시, 기본값(false) 유지.
    }
  }, [src]);

  const toggleBookmark = useCallback(() => {
    setBookmarked((prev) => {
      const next = !prev;
      try {
        const raw = window.localStorage.getItem(BOOKMARK_STORAGE_KEY);
        const set: string[] = raw ? JSON.parse(raw) : [];
        const updated = next ? [...new Set([...set, src])] : set.filter((s) => s !== src);
        window.localStorage.setItem(BOOKMARK_STORAGE_KEY, JSON.stringify(updated));
      } catch {
        // 저장 실패해도 이번 세션 내 UI 상태는 유지.
      }
      return next;
    });
  }, [src]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onMeta = () => {
      const d = el.duration;
      if (!Number.isFinite(d) || d <= 0) return;
      setDur(d);
      onDurationRef.current?.(d);
    };
    const onTime = () => {
      setCur(el.currentTime);
    };
    const onEnd = () => {
      if (looping) {
        el.currentTime = 0;
        void el.play().catch(() => setFailed(true));
        return;
      }
      setPlaying(false);
      setCur(0);
      el.currentTime = 0;
    };
    // play/pause는 엘리먼트에서 받는다 — 잠금화면·헤드셋 버튼처럼 우리 UI를
    // 거치지 않는 조작이 있어도 버튼 모양이 실제 상태와 안 어긋난다.
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onErr = () => {
      setFailed(true);
      setPlaying(false);
    };
    el.addEventListener('loadedmetadata', onMeta);
    el.addEventListener('timeupdate', onTime);
    el.addEventListener('ended', onEnd);
    el.addEventListener('play', onPlay);
    el.addEventListener('pause', onPause);
    el.addEventListener('error', onErr);
    return () => {
      el.removeEventListener('loadedmetadata', onMeta);
      el.removeEventListener('timeupdate', onTime);
      el.removeEventListener('ended', onEnd);
      el.removeEventListener('play', onPlay);
      el.removeEventListener('pause', onPause);
      el.removeEventListener('error', onErr);
    };
  }, [looping]);

  const toggle = useCallback(() => {
    setFailed(false);
    const el = ref.current;
    if (!el) return;
    if (el.paused) {
      void el.play().catch(() => setFailed(true));
    } else {
      el.pause();
    }
  }, []);

  const seekTo = useCallback((sec: number) => {
    const el = ref.current;
    if (!el || !Number.isFinite(el.duration)) return;
    const next = Math.min(el.duration, Math.max(0, sec));
    el.currentTime = next;
    setCur(next);
  }, []);

  const nudge = useCallback(
    (delta: number) => {
      const el = ref.current;
      if (!el) return;
      seekTo(el.currentTime + delta);
    },
    [seekTo],
  );

  const selectRate = useCallback((idx: number) => {
    const el = ref.current;
    setRateIdx(idx);
    if (el) el.playbackRate = RATES[idx];
    setRateMenuOpen(false);
    rateTriggerRef.current?.focus();
  }, []);

  // 메뉴 바깥 클릭·Escape로 닫는다 — 열려 있는 동안에만 리스너를 붙여
  // 평소엔 비용이 없다.
  useEffect(() => {
    if (!rateMenuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rateMenuRef.current && !rateMenuRef.current.contains(e.target as Node)) {
        setRateMenuOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setRateMenuOpen(false);
        rateTriggerRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [rateMenuOpen]);

  const retry = useCallback(() => {
    setFailed(false);
    const el = ref.current;
    if (!el) return;
    el.load();
    void el.play().catch(() => setFailed(true));
  }, []);

  const pct = dur > 0 ? Math.min(100, (cur / dur) * 100) : 0;
  const tick = dur >= 120 ? (60 / dur) * 100 : 0;

  // 파형 막대 — 결정적 패턴(위 docblock). grid가 폭에 맞게 늘어나므로 개수
  // 자체는 화면 크기와 무관하게 고정(WAVE_BAR_COUNT, CSS와 공유).
  const bars = useMemo(() => barPattern(seedFrom(src), WAVE_BAR_COUNT), [src]);
  const playedBars = dur > 0 ? Math.round((cur / dur) * bars.length) : 0;

  // 대본 자동 하이라이트 — 실측 타임코드가 있는 챕터 중 현재 위치를 지난
  // 마지막 항목.
  // 타임코드가 있는 챕터가 하나도 없으면 자동 하이라이트·자동 스크롤을
  // 아예 켜지 않는다 — 존재하지 않는 시점을 가리키는 "가짜 추적"이 되지
  // 않게 한다.
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

  useEffect(() => {
    if (!hasTimecodes || !autoTrack || activeChapterIdx < 0 || tab !== 'script') return;
    const list = scriptListRef.current;
    if (!list) return;
    const item = list.children[activeChapterIdx] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [activeChapterIdx, autoTrack, tab, hasTimecodes]);

  const onScriptScroll = useCallback(() => {
    setAutoTrack(false);
    if (autoTrackResumeTimer.current) clearTimeout(autoTrackResumeTimer.current);
    // 사용자가 스크롤을 멈추고 4초가 지나면 자동 추적을 되살린다 — "일시
    // 해제"라는 요청 문구대로, 영구 해제가 아니라 다시 붙는다.
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
      {/* ⚠️ 아래 <style>은 CSS 문자열이라 주석이 그대로 HTML 응답에 실려 나간다
          (SSR 페이지라 매 요청마다). 설계 근거는 파일 상단 docblock에 두고
          여기엔 구조·대비 힌트만 남긴다.

          대비(다크 베이스 luminance ≈ 0.01):
           · 흰 유리 재생 버튼 위 아이콘(#111827) — 18:1대.
           · 커버 배지·바이라인: accent를 흰색에 45~60%만 섞어 luminance가
             흰색 쪽으로 치우치므로 다크 배경 대비 8:1 이상 유지.
           · 제목 흰 100%, 바이라인 흰 66%, 시간 흰 100%·58%.
           · 대본 비활성 단락 흰 62% ≈ 8.9:1, 활성 단락 흰 100% + accent 왼쪽 룰.
           · 포커스 링은 흰색, outline-offset로 다크 카드 위에 놓여 18:1. */}
      <style>{`
        .aap { position: relative; overflow: hidden; isolation: isolate;
          border-radius: 20px; padding: clamp(16px, 4vw, 22px);
          background:
            radial-gradient(130% 160% at 8% 0%, color-mix(in srgb, var(--aap-c) 26%, transparent) 0%, transparent 58%),
            radial-gradient(90% 120% at 100% 120%, color-mix(in srgb, var(--aap-c) 12%, transparent) 0%, transparent 60%),
            linear-gradient(165deg, #1c2333 0%, #12141f 52%, #0a0a10 100%);
          box-shadow:
            0 24px 48px -24px rgba(0,0,0,0.6),
            0 1px 0 0 rgba(255,255,255,0.06) inset,
            0 0 0 1px rgba(255,255,255,0.05) inset; }
        .aap::before { content: ''; position: absolute; inset: 0; pointer-events: none;
          background: linear-gradient(122deg, rgba(255,255,255,0.09) 0%, rgba(255,255,255,0) 30%); }
        .aap::after { content: ''; position: absolute; inset: 0; pointer-events: none;
          opacity: 0.4; mix-blend-mode: overlay;
          background-image: radial-gradient(circle at 1px 1px, rgba(255,255,255,0.6) 1px, transparent 0);
          background-size: 3px 3px; }

        .aap-inner { position: relative; z-index: 1; }

        /* ── 헤더: 커버 + 배지/제목/바이라인 ── 레퍼런스의 정사각 커버 +
           우측 텍스트 블록 구조를 그대로 옮긴다. */
        .aap-head { display: flex; gap: 14px; align-items: flex-start; }
        .aap-cover { flex-shrink: 0; width: 68px; height: 68px; border-radius: 14px;
          overflow: hidden; background: rgba(255,255,255,0.06);
          box-shadow: 0 6px 16px -8px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.08) inset; }
        .aap-cover img { width: 100%; height: 100%; object-fit: cover; display: block; }
        @media (max-width: 359px) { .aap-cover { width: 56px; height: 56px; border-radius: 12px; } }

        .aap-headtext { flex: 1; min-width: 0; }
        /* 배지 — 레퍼런스의 초록 필 아웃라인을 accent 색으로. "#1 top podcast"
           같은 지어낸 순위 대신 실제 형식 이름을 담는다. */
        .aap-badge { display: inline-flex; align-items: center; height: 22px; padding: 0 10px;
          border-radius: 999px; border: 1px solid color-mix(in srgb, var(--aap-c) 55%, transparent);
          font-size: 12px; font-weight: 700; letter-spacing: 0.02em;
          color: color-mix(in srgb, var(--aap-c) 60%, #ffffff); margin-bottom: 8px; }
        .aap-title { margin: 0; font-size: clamp(17px, 2.4vw, 19px); font-weight: 700;
          line-height: 1.32; color: #fff; letter-spacing: -0.01em; word-break: keep-all;
          display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        .aap-byline { display: inline-flex; align-items: center; gap: 5px; margin-top: 6px;
          font-size: 13px; font-weight: 600; color: rgba(255,255,255,0.66);
          background: none; border: none; padding: 0; cursor: default;
          font-family: inherit; }
        .aap-byline[data-link='true'] { cursor: pointer; text-decoration: none; }
        .aap-byline[data-link='true']:hover { color: rgba(255,255,255,0.88); }
        .aap-byline[data-link='true']:focus-visible { outline: 2px solid #fff; outline-offset: 2px;
          border-radius: 4px; }

        /* ── 대본 탭 + 배속을 한 줄에 ── 2026-08-21, "대본하고 속도 조절
           기능이 열이 안맞는다" 요청. 이전엔 대본 탭(.aap-tabs, height 36px)
           과 배속(.aap-rate, height 32px)이 서로 다른 줄에, 게다가 높이도
           달라서 나란히 놓아도 어긋났다. 이제 한 행(.aap-toprow)에 두고
           둘 다 36px로 맞춘다 — align-items: flex-start라 높이가 같으면
           위 끝이 그대로 같은 줄이 된다("윗줄 정렬"). 대본 탭이 없는
           기사(chapters 없음)는 이 행에 배속만 오른쪽 정렬로 남는다. */
        .aap-toprow { display: flex; align-items: flex-start; justify-content: space-between;
          gap: 8px; margin-top: 16px; }
        .aap-toprow[data-solo='true'] { justify-content: flex-end; }
        .aap-tabs { display: flex; gap: 8px; }
        .aap-tab { display: inline-flex; align-items: center; gap: 6px; height: 36px; padding: 0 14px 0 16px;
          border-radius: 999px; border: none; cursor: pointer;
          font-size: 14px; font-weight: 700; letter-spacing: -0.01em;
          background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.78);
          transition: background-color .2s cubic-bezier(.2,0,0,1), color .2s cubic-bezier(.2,0,0,1); }
        .aap-tab[aria-expanded='true'] { background: var(--aap-c); color: #fff; }
        .aap-tab:hover { background: rgba(255,255,255,0.14); }
        .aap-tab[aria-expanded='true']:hover { background: var(--aap-c); filter: brightness(1.08); }
        .aap-tab:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }

        /* ── 대본 패널 ── 2026-08-21(재수정) — 번호 붙은 불릿 목록에서
           **흐르는 원고 문단**으로 바꿨다. CMS에 저장된 건 짧은 요약
           문장(bullets)뿐이라 새 문장을 지어 쓸 수는 없지만(있는 사실만
           쓴다는 이 파일의 오랜 원칙), 그 문장들을 번호 칩 목록이 아니라
           연속된 글줄로 이어 붙이면 "읽어주는 원고"처럼 읽힌다 — 사진
           레퍼런스의 대본 패널도 번호 없는 연속 문단이다.
           타임코드가 있는 항목(seekable)만 클릭 가능한 문단으로 두고,
           지금 재생 위치를 지난 문단은 살짝 밝게(활성), 그 앞뒤는 낮은
           대비로 스며들게 한다. 위아래 페이드로 "더 있다"는 신호를 준다. */
        .aap-script { position: relative; margin-top: 14px; max-height: 240px;
          overflow-y: auto; -webkit-overflow-scrolling: touch; overscroll-behavior: contain;
          list-style: none; padding: 0; margin-block: 0; display: flex; flex-direction: column; gap: 14px;
          -webkit-mask-image: linear-gradient(to bottom, transparent 0, black 16px, black calc(100% - 16px), transparent 100%);
          mask-image: linear-gradient(to bottom, transparent 0, black 16px, black calc(100% - 16px), transparent 100%); }
        .aap-script-item { display: block; width: 100%; text-align: left; border: none; cursor: default;
          border-radius: 14px; padding: 10px 14px; background: none; margin: 0;
          font-size: 15px; line-height: 1.7; color: rgba(255,255,255,0.62); word-break: keep-all;
          transition: background-color .2s cubic-bezier(.2,0,0,1), color .2s cubic-bezier(.2,0,0,1); }
        button.aap-script-item { cursor: pointer; }
        button.aap-script-item:hover { background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.9); }
        button.aap-script-item:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
        .aap-script-item[data-active='true'] { background: rgba(255,255,255,0.1); color: #fff;
          box-shadow: inset 3px 0 0 0 var(--aap-c); }
        /* 직접 인용(따옴표로 감싼 발언)만 굵게 — color는 부모를 그대로
           상속해 비활성 단락에서도 대비가 그대로 유지된다(#fff·62% 흰
           둘 다 굵기만 바뀌지 톤은 안 바뀐다). */
        .aap-script-item strong { font-weight: 700; color: inherit; }

        /* ── 파형 + 분눈금 ── 레퍼런스의 좌우 시간 라벨 + 점 눈금 + 재생/잔여
           2색 막대. 재생 위치를 지난 눈금은 accent, 아닌 눈금은 옅게. */
        .aap-wavewrap { margin-top: 8px; }
        /* grid로 바꿨다(2026-08-21) — flex:1 + max-width 조합은 막대들의
           최대 폭 합이 카드 안쪽 폭보다 작아서 남는 공간이 오른쪽에 그대로
           비었다("파형이 중간까지밖에 없다" 원인). grid는 열 개수(고정)가
           1fr씩 나뉘므로 항상 카드 폭을 정확히 끝까지 채운다.
           gap 2 → 1px, radius 2 → 1px(2026-08-21, "더 세분화, 엄청 얇게"
           요청) — 96개 막대가 1px 틈으로 촘촘히 붙어 레퍼런스 사진처럼
           가는 선들의 다발로 보인다. */
        .aap-wave { position: relative; display: grid; grid-template-columns: repeat(${WAVE_BAR_COUNT}, 1fr);
          align-items: center; gap: 1px; height: 40px; padding: 0; cursor: pointer; }
        /* 막대 굵기 — 2026-08-24, "훨씬 더 얇게" 요청. 이전엔 1fr 칸 전체
           폭(width:100%)을 채워 5~6px로 굵었다. 2px 고정 폭 + 칸 안 가운데
           정렬로, 칸 간격은 그대로 두고 막대만 가늘게 만든다. */
        .aap-wave-bar { width: 2px; justify-self: center; border-radius: 999px;
          background: rgba(255,255,255,0.22); transition: background-color .2s ease; }
        .aap-wave-bar[data-played='true'] { background: color-mix(in srgb, var(--aap-c) 85%, #ffffff); }
        /* 재생 중 아주 미세한 진폭만 — 과하면 시선을 뺏는다는 스펙 요청. */
        @media (prefers-reduced-motion: no-preference) {
          .aap-wave[data-playing='true'] .aap-wave-bar { animation: aap-wave-breathe 1.6s ease-in-out infinite; }
        }
        @keyframes aap-wave-breathe { 0%, 100% { transform: scaleY(1); } 50% { transform: scaleY(1.08); } }
        /* 길이를 아직 모를 때(로딩) — 막대를 낮은 대비로 죽이고 셔머를
           흘려 "재생 준비 중"임을 알린다. 재생 중 진폭 애니메이션과 동시에
           걸릴 일은 없다(재생 중이면 이미 dur > 0). */
        .aap-wave[data-loading='true'] .aap-wave-bar {
          background: rgba(255,255,255,0.14);
          animation: aap-wave-shimmer 1.8s ease-in-out infinite; }
        @keyframes aap-wave-shimmer { 0%, 100% { opacity: 0.5; } 50% { opacity: 1; } }
        @media (prefers-reduced-motion: reduce) {
          .aap-wave[data-loading='true'] .aap-wave-bar { animation: none; opacity: 0.7; }
        }
        /* 실제 탐색은 투명 range 인풋을 파형 위에 겹쳐서 처리한다 — 시각은
           막대가, 조작·키보드·스크린리더 시맨틱은 네이티브 slider가 담당한다. */
        .aap-wave-seek { position: absolute; inset: 0; width: 100%; height: 100%;
          margin: 0; opacity: 0; cursor: pointer; -webkit-appearance: none; appearance: none; }
        .aap-wave-seek:disabled { cursor: default; }
        .aap-wave-seek:focus-visible ~ .aap-wave-focus-ring { opacity: 1; }
        .aap-wave-focus-ring { position: absolute; inset: -3px; border-radius: 10px;
          border: 2px solid #fff; opacity: 0; pointer-events: none; }
        /* 드래그 중 시간 툴팁 — 시크바 위 커서 근처. */
        .aap-scrub-tip { position: absolute; bottom: calc(100% + 8px); transform: translateX(-50%);
          padding: 4px 8px; border-radius: 8px; background: #fff; color: #111827;
          font-size: 12px; font-weight: 700; font-variant-numeric: tabular-nums;
          white-space: nowrap; pointer-events: none; box-shadow: 0 4px 10px rgba(0,0,0,0.3); }

        /* 유일한 시간 표기 줄 — 좌측 현재 위치, 우측 잔여시간(-mm:ss).
           스펙 그대로: "좌측 현재 위치, 우측 잔여시간" 한 줄만 남긴다. */
        .aap-time-row { display: flex; align-items: center; justify-content: space-between;
          margin-top: 8px; font-size: 13px; font-weight: 700; font-variant-numeric: tabular-nums;
          color: #fff; }
        .aap-time-row span:last-child { color: rgba(255,255,255,0.58); font-weight: 600; }

        /* ── 하단 컨트롤 바 ── 반복 / -5초 / 재생(56px, 유일한 primary) /
           +5초 / 북마크. 배속은 컨트롤 바 위 별도 줄 우측(모바일 탭 순환,
           데스크톱도 동일 — 이 컴포넌트에 볼륨 대상 자체가 없어 데스크톱
           전용 볼륨 슬라이더는 만들지 않는다, 아래 산출물 보고에 기록). */
        .aap-transport { display: flex; align-items: center; justify-content: center;
          gap: clamp(14px, 5vw, 22px); margin-top: 18px; }
        .aap-icon-btn { display: flex; align-items: center; justify-content: center;
          width: 44px; height: 44px; border-radius: 999px; border: none; background: none;
          color: rgba(255,255,255,0.7); cursor: pointer;
          transition: background-color .2s cubic-bezier(.2,0,0,1), color .2s cubic-bezier(.2,0,0,1); }
        .aap-icon-btn:hover { background: rgba(255,255,255,0.1); color: #fff; }
        .aap-icon-btn:active { background: rgba(255,255,255,0.16); }
        .aap-icon-btn:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
        .aap-icon-btn[aria-pressed='true'] { color: var(--aap-c); }

        .aap-play { flex-shrink: 0; position: relative; display: flex; align-items: center;
          justify-content: center; width: 56px; height: 56px; border-radius: 999px;
          border: none; cursor: pointer; color: #111827;
          background: linear-gradient(160deg, #ffffff 0%, #f1f2f6 55%, #dfe2ea 100%);
          box-shadow:
            0 8px 18px -6px rgba(0,0,0,0.5),
            0 0 0 1px rgba(255,255,255,0.5) inset,
            0 -3px 6px rgba(0,0,0,0.1) inset,
            0 0 26px 2px color-mix(in srgb, var(--aap-c) 55%, transparent);
          transition: transform .2s cubic-bezier(.2,0,0,1), box-shadow .2s cubic-bezier(.2,0,0,1); }
        .aap-play:hover { box-shadow:
            0 8px 18px -6px rgba(0,0,0,0.5),
            0 0 0 1px rgba(255,255,255,0.5) inset,
            0 -3px 6px rgba(0,0,0,0.1) inset,
            0 0 32px 4px color-mix(in srgb, var(--aap-c) 70%, transparent); }
        .aap-play:active { transform: scale(.95); }
        .aap-play:focus-visible { outline: 2px solid #fff; outline-offset: 3px; }
        @media (max-width: 359px) { .aap-play { width: 50px; height: 50px; } }

        @media (prefers-reduced-motion: no-preference) {
          .aap-play[data-playing='true'] { animation: aap-breathe 2.6s ease-in-out infinite; }
        }
        @keyframes aap-breathe {
          0%, 100% { box-shadow:
            0 8px 18px -6px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.5) inset,
            0 -3px 6px rgba(0,0,0,0.1) inset, 0 0 22px 2px color-mix(in srgb, var(--aap-c) 50%, transparent); }
          50% { box-shadow:
            0 8px 18px -6px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.5) inset,
            0 -3px 6px rgba(0,0,0,0.1) inset, 0 0 34px 5px color-mix(in srgb, var(--aap-c) 65%, transparent); }
        }

        /* 배속 — 대본 탭과 같은 .aap-toprow에 놓인다(위 .aap-toprow 주석
           참조). 모바일도 데스크톱도 탭 순환 — 이 카드 폭에서 드롭다운을
           새로 놓을 자리가 없어 배속 자체를 탭 순환 버튼 하나로 통일했다
           (스펙의 "모바일만 탭 순환" 요구보다 더 단순하게 맞췄다).
           height 32 → 36px(2026-08-21) — .aap-tab과 정확히 같은 높이로
           맞춰야 "윗줄 정렬"이 실제로 같은 줄이 된다. */
        .aap-rate-wrap { position: relative; flex-shrink: 0; }
        .aap-rate { display: inline-flex; align-items: center; gap: 5px; height: 36px; padding: 0 12px 0 14px;
          border-radius: 999px; border: 1px solid rgba(255,255,255,0.14); background: rgba(255,255,255,0.05);
          font-size: 13px; font-weight: 700; color: rgba(255,255,255,0.85); cursor: pointer;
          font-variant-numeric: tabular-nums;
          transition: background-color .2s cubic-bezier(.2,0,0,1); }
        .aap-rate:hover { background: rgba(255,255,255,0.12); }
        .aap-rate[aria-expanded='true'] { background: rgba(255,255,255,0.14); }
        .aap-rate:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }

        /* 배속 목록 — 트리거 바로 아래 오른쪽 정렬로 뜬다. 다크 카드보다
           한 단계 밝은 표면(#20263a)을 써서 카드 배경과 구별되는 "떠 있는
           패널"로 보이게 한다. */
        .aap-rate-menu { position: absolute; top: calc(100% + 6px); right: 0; z-index: 5;
          min-width: 96px; margin: 0; padding: 6px; list-style: none;
          border-radius: 14px; background: #20263a; border: 1px solid rgba(255,255,255,0.1);
          box-shadow: 0 12px 28px -10px rgba(0,0,0,0.55); }
        @media (prefers-reduced-motion: no-preference) {
          .aap-rate-menu { animation: aap-menu-in .16s cubic-bezier(.2,0,0,1); }
          @keyframes aap-menu-in { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }
        }
        .aap-rate-opt { display: flex; align-items: center; justify-content: space-between; gap: 10px;
          width: 100%; height: 38px; padding: 0 10px; border: none; border-radius: 9px;
          background: none; cursor: pointer; font-size: 14px; font-weight: 600;
          color: rgba(255,255,255,0.82); font-variant-numeric: tabular-nums;
          transition: background-color .14s ease; }
        .aap-rate-opt:hover { background: rgba(255,255,255,0.08); }
        .aap-rate-opt:focus-visible { outline: 2px solid #fff; outline-offset: -2px; }
        .aap-rate-opt[aria-selected='true'] { color: #fff; font-weight: 700; }
        .aap-rate-opt[aria-selected='true'] svg { color: var(--aap-c); }

        .aap-fail { display: flex; align-items: center; justify-content: space-between; gap: 12px;
          flex-wrap: wrap; font-size: 15px; line-height: 1.6; color: rgba(255,255,255,0.9); word-break: keep-all; }
        .aap-retry { flex-shrink: 0; height: 36px; padding: 0 16px; border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.2); background: rgba(255,255,255,0.08); color: #fff;
          font-size: 13px; font-weight: 700; cursor: pointer; }
        .aap-retry:hover { background: rgba(255,255,255,0.16); }
        .aap-retry:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }

        @media (prefers-reduced-motion: reduce) {
          .aap-play, .aap-icon-btn, .aap-tab, .aap-script-item, .aap-wave-bar, .aap-rate-opt { transition: none; }
          .aap-play:active { transform: none; }
          .aap-tab svg, .aap-rate svg { transition: none; }
        }
      `}</style>

      <div className="aap-inner">
        {/* controls 없이 둔다 — 위 컨트롤이 전부 이 엘리먼트를 직접 조작한다.
            preload="metadata"는 재생 전에 길이를 표시하기 위해 필요하다. */}
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

            {/* 대본 탭 + 배속 — 한 행, 윗줄 정렬(2026-08-21). 이전엔 대본
                탭이 헤더 바로 아래, 배속이 파형 바로 위에 각각 따로 있어서
                "열이 안 맞았다". 이제 하나의 .aap-toprow에 나란히 두고,
                둘 다 height 36px로 맞춰 위 끝이 같은 줄에 놓인다.
                chapters가 없는 기사는 대본 탭 자체가 없으므로 배속만
                data-solo로 오른쪽 정렬 유지. */}
            <div className="aap-toprow" data-solo={!(chapters && chapters.length > 0)}>
              {chapters && chapters.length > 0 && (
                <div className="aap-tabs">
                  {/* role="tab" 대신 토글 버튼으로 뒀다 — 진짜 tablist는
                      "패널 중 하나가 항상 열려 있다"를 전제하는데, 이 탭은
                      눌러서 열고 다시 눌러서 닫는 디스클로저다. aria-expanded
                      +aria-controls 조합이 실제 동작(펼침/접힘)과 맞는
                      시맨틱이다. */}
                  {/* 화살표 추가(2026-08-21, UIUX 감사) — 배경색 변화만으로는
                      이게 접었다 펴는 컨트롤인지 필터 칩인지 구분이 안 됐다.
                      방향이 바뀌는 화살표는 아코디언·디스클로저의 표준
                      신호라 학습 없이도 "펼침/닫힘"이 전달된다. */}
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
              {/* 순환 버튼 → 드롭다운 메뉴(2026-08-21, UIUX 감사). 지금 값 +
                  펼침 화살표를 같이 보여줘서 "누르면 목록이 열린다"는 기대를
                  준다(닐슨: 시스템 상태 가시성). */}
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
                      {/* 타임코드가 없는 단락은 seek 대상이 없다 — 눌러도
                          아무 데도 안 움직이는 포커스 가능한 버튼을 만들지
                          않고, 그냥 읽는 텍스트로 둔다(스티어링 §4). 번호
                          칩 없이 문단 그대로 — 원고를 읽는 느낌을 준다. */}
                      {seekable ? (
                        <button
                          type="button"
                          className="aap-script-item"
                          data-active={i === activeChapterIdx}
                          onClick={() => seekTo(c.time as number)}
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
            )}

            <div className="aap-wavewrap">
              {/* 로딩 상태 가시성(2026-08-21, UIUX 감사) — 길이를 아직 모르면
                  (loadedmetadata 전) 파형은 색이 다 채워져 있는데 슬라이더는
                  잠겨 있고 시간 칸은 빈 채라 "고장났나?"로 오해하기 쉬웠다
                  (닐슨: 시스템 상태 가시성). data-loading이면 파형 채도를
                  낮추고 아주 느린 좌우 셔머(shimmer)를 흘려 "지금 준비
                  중"이라는 신호를 명확히 준다 — 스피너 대신 콘텐츠 모양
                  그대로 로딩을 표시하는 스켈레톤 관례. */}
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
                {/* 실제 탐색·키보드·스크린리더는 이 네이티브 slider가 전담한다.
                    ±5초는 화살표, Home/End는 처음·끝 — range 인풋 기본 동작을
                    step/aria로 맞춘다. */}
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
                    // 키보드 조작(화살표·Home/End)은 드래그가 아니라 즉시
                    // seek한다 — 툴팁은 포인터 드래그에서만 보여준다.
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
              {/* title 추가(2026-08-21, UIUX 감사) — aria-label만 있으면
                  스크린리더는 알지만 마우스 사용자는 호버해도 설명이 안
                  뜬다. 네이티브 title이 가장 가벼운 해결(별도 컴포넌트 없이
                  브라우저 기본 툴팁). */}
              <button
                type="button"
                className="aap-icon-btn"
                aria-pressed={looping}
                aria-label={looping ? '반복 재생 끄기' : '반복 재생 켜기'}
                title={looping ? '반복 재생 끄기' : '반복 재생 켜기'}
                onClick={() => setLooping((v) => !v)}
              >
                <Repeat size={19} aria-hidden />
              </button>
              <button type="button" className="aap-icon-btn" onClick={() => nudge(-5)} aria-label="5초 뒤로" title="5초 뒤로">
                <RotateCcw size={20} aria-hidden />
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
                <RotateCw size={20} aria-hidden />
              </button>
              <button
                type="button"
                className="aap-icon-btn"
                aria-pressed={bookmarked}
                aria-label={bookmarked ? '북마크 해제' : '북마크에 저장'}
                title={bookmarked ? '북마크 해제' : '북마크에 저장'}
                onClick={toggleBookmark}
              >
                <Bookmark size={19} aria-hidden fill={bookmarked ? 'currentColor' : 'none'} />
              </button>
            </div>

          </>
        )}
      </div>
    </div>
  );
}
