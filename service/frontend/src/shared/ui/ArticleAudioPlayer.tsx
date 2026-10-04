'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Repeat, RotateCcw, RotateCw, Bookmark, ChevronDown, Check } from 'lucide-react';
import { clock, spoken, boldenQuotes, PLAYBACK_RATES, PLAYBACK_RATE_LABELS } from '@/shared/lib/mediaPlayerFormat';
import { useMediaBookmark, usePlaybackRateMenu, useMediaTransport } from '@/shared/lib/useMediaPlayerControls';
import { aapCss } from './articleAudioPlayerStyles';

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
 * 4차: 3차의 재질 언어(다크 표면, accent 광원, 유리 재생 버튼)를
 * 유지하면서 레퍼런스의 정보 구조(커버 → 배지+제목 → 바이라인 → 탭 →
 * 대본 패널 → 파형 → 하단 컨트롤)로 다시 짰다.
 * 5차(2026-10-03, 사용자 요청 "팟캐스트 리디자인"): 다크 유리 카드를 걷고
 * 밝은 앱 카드로 바꿨다 → "깔끔하지만 흔하다"는 피드백으로 같은 날 6차로 재설계.
 * 6차("전시 도록·쇼룸": 종이색·세리프·드롭캡)는 "AI 티가 너무 난다"는 피드백으로
 * 같은 날 폐기. 7차("요즘 팟캐스트 앱 재생 화면"): 큰 커버, 고딕 제목,
 * 얇은 진행 바(가짜 파형은 화면에서 숨김), 파랑 채움 재생 버튼. 커버 색이 번지는
 * 그라데이션 배경은 "단색이 더 안정감 있다"는 피드백으로 걷어내고 단색 회색 카드로 정했다.
 * 구조·동작은 4차 그대로이고 스타일은 articleAudioPlayerStyles.ts에 있다.
 * (위 4차까지의 "다크 표면 유지" 판단은 폐기.)
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
  const [looping, setLooping] = useState(false);
  // 대본은 펼친 상태로 시작한다(2026-10-03, 사용자 요청 — 플레이어 안의 대본이 기준이고 아래 중복 대본은 없앴다).
  // 2026-08-24에는 "듣기 모드라 텍스트가 더 커 보인다"며 접힌 채 시작했으나, 이제 대본이 이 패널 하나뿐이고
  // 재생 위치를 따라가며 읽는 용도(접근성 포함)라 펼쳐 둔다. 패널 높이는 제한돼 있어(스크롤) 플레이어를 가리지 않는다.
  const [tab, setTab] = useState<TabKey | null>(chaptersProp && chaptersProp.length > 0 ? 'script' : null);
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

  // 북마크·배속 메뉴·재생 전송(재생/일시정지/탐색/±5초/재시도) 상태 로직은
  // ArticleVideoPlayer.tsx와 바이트 단위로 같아서 shared/lib/
  // useMediaPlayerControls.ts로 추출돼 있다(2026-09-04).
  const { bookmarked, toggleBookmark } = useMediaBookmark(src, BOOKMARK_STORAGE_KEY);
  const { rateIdx, rateMenuOpen, setRateMenuOpen, selectRate, rateMenuRef, rateTriggerRef } =
    usePlaybackRateMenu(ref, RATES);
  const { playing, cur, dur, failed, toggle, seekTo, nudge, retry } = useMediaTransport(ref, {
    looping,
    onDuration,
  });

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
  // 실측 타임코드가 없으면, 길이를 안 뒤에 "글자 수 비율"로 각 문단의 시작 시각을 어림한다(2026-10-03, 사용자 요청 — 말하는 부분 표시).
  // 실제 음성의 문단별 시각은 아니므로 화면에 "대략"이라고 밝힌다(estimatedTrack). 실측 값이 들어오면 그것을 그대로 쓴다.
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

  // 대본 문단을 누르면 그 위치로 옮기고 바로 재생한다 — 멈춰 있어도 소리가 나야 "이동했다"고 느낀다.
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
    // 패널 안에서만 스크롤한다(2026-10-03) — scrollIntoView는 페이지 전체도 같이 움직여 재생 중 화면이 튀었다.
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
      {/* 스타일은 articleAudioPlayerStyles.ts(2026-10-03 밝은 톤 재설계) — 이 CSS 문자열은 SSR HTML에 그대로 실리므로 주석을 두지 않는다. */}
      <style>{aapCss(WAVE_BAR_COUNT)}</style>

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
                      {/* 타임코드가 없는 단락은 seek 대상이 없다 — 눌러도
                          아무 데도 안 움직이는 포커스 가능한 버튼을 만들지
                          않고, 그냥 읽는 텍스트로 둔다(스티어링 §4). 번호
                          칩 없이 문단 그대로 — 원고를 읽는 느낌을 준다. */}
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
