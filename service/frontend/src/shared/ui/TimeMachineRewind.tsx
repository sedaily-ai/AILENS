'use client';

// "그날로 떠나는" 전환 연출 — 원래 features/timeline/components/
// NewsTimeMachine.tsx(/timeline 입력 페이지) 안에만 있었는데, 홈 "그날로
// 떠나요"(features/news-feed/components/NewsTimeMachineSection.tsx)에서도
// 재생되도록 다시 연결하면서(2026-08-17, 사용자 리포트: "종이 애니메이션이
// 사라졌네요") 두 feature가 같이 쓸 수 있게 shared/ui로 승격했다 —
// features 간 직접 import는 이 프로젝트의 FSD 규칙 위반이라(HandDrawnIcons를
// shared/ui/icons로 승격했던 것과 같은 이유).
//
// ══ 2026-08-18 (2차) — 비행기가 실제 경로를 끝에서 끝까지 난다 ══
//
// 1차 시도에서 비행기를 가운데 고정하고 연도 레일을 흐르게 했는데 세 가지가
// 어긋났다(사용자 지적: "박스 끝에서 끝까지 가는 것도 아니고 점선도 이상하고
// 종이 비행기도 미완성 상태여보여").
//
//  (1) 비행기가 안 움직였다. 사이드스크롤 게임의 "주인공 고정 + 배경 이동"
//      방식이었는데, 2초짜리 짧은 전환에서는 이동이 아니라 "멈춰 있음"으로
//      읽힌다. 눈이 따라갈 대상이 실제로 지나가야 여행으로 보인다.
//  (2) 점선이 경로가 아니었다. 비행기 오른쪽에 고정 오프셋으로 붙은 96px
//      토막이라 아무데도 연결돼 있지 않았고, 자체 배경 애니메이션까지 겹쳐
//      노이즈만 됐다.
//  (3) 비행기 도형이 미완성이었다. 삼각형 두 개가 접합부 없이 겹쳐 있었고,
//      날개에 넣은 활자선이 이 크기에서는 얼룩으로 보였다.
//
// 이제:
//  · **실제 SVG path 로 비행 경로를 깔고**(오른쪽 끝 → 왼쪽 끝, 완만한 활강
//    곡선) `getPointAtLength` 로 비행기를 그 위에 태운다. 접선을 계산해
//    기수 방향까지 경로를 따라 돈다.
//  · 지나온 구간은 **실선(파랑)**, 남은 구간은 **점선(연회색)** — 항공 노선도
//    관례 그대로라 진행도가 한눈에 읽힌다.
//  · 종이비행기는 접힌 면 두 개가 실제로 맞물리는 다트 실루엣으로 다시 그렸다.
//  · 연도 눈금은 흐르지 않고 **경로 아래 고정**되어, 비행기가 그 위를 지나며
//    하나씩 켜진다.
//
// 거리감은 눈금 밀도와 재생 시간이 담당한다(30년이면 눈금이 촘촘하고 2.6초,
// 2년이면 눈금 셋에 1.2초). 비행기는 어느 경우든 박스를 완주한다 — 짧은
// 여행이 "덜 간 것"처럼 중간에 멈추면 미완성으로 보이기 때문이다.
//
// 프레임마다 바뀌는 값(비행기 위치·경로 진행·날짜 숫자)은 setState 를 쓰지
// 않고 ref 로 DOM 을 직접 만진다 — 2.6초 × 60fps 면 150회 이상 리렌더가 되고,
// 그만큼 프레임이 흔들린다. 상태는 "도착했다"와 "지금 지나는 연도"만 바뀔 때
// 한 번씩 올린다.
import { useCallback, useEffect, useRef, useState } from 'react';

/* ── 홈 톤 토큰 (NewsTimeMachineSection 과 동일) ─────────────────── */
const INK = '#111827'; // 17.74:1 on #fff
const BODY = '#374151'; // 10.31:1 on #fff
const MUTED = '#6b7280'; // 4.83:1 on #fff
const BLUE = '#1d4ed8'; // 6.70:1 on #fff
const LINE = 'rgba(17,24,39,0.16)';

/* ── 치수 ── */
const FLIGHT_H = 96; // 비행 영역 높이
const PAD_X = 30; // 경로가 좌우 끝에서 남기는 여백
const TICK_H = 34; // 연도 눈금 줄 높이
// 라벨 하나가 차지하는 최소 폭(14px 네 글자 ≈ 36px + 여유).
const LABEL_SLOT = 68;

/* ── 재생 시간: 거리에 비례 ── */
const DUR_MIN = 1200;
const DUR_MAX = 2600;
const DUR_PER_YEAR = 60;
const ARRIVAL_MS = 480;

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function kdate(s: string): string {
  const [y, m, d] = s.split('-');
  return `${y}년 ${parseInt(m, 10)}월 ${parseInt(d, 10)}일`;
}

/** 1,2,5,10,20 중에서 n 이상인 가장 작은 "달력에서 자연스러운" 간격. */
function niceStep(n: number): number {
  for (const c of [1, 2, 5, 10, 20]) if (c >= n) return c;
  return 50;
}

/**
 * 화면 폭에 맞춰 연도 라벨을 고른다. 폭이 좁으면 라벨 수를 줄여 겹침을 막고,
 * 출발·도착 연도는 언제나 넣는다(여행의 양 끝이라 빠지면 안 된다).
 */
export function pickYearLabels(fromYear: number, toYear: number, width: number): number[] {
  const lo = Math.min(fromYear, toYear);
  const hi = Math.max(fromYear, toYear);
  const span = hi - lo;
  if (span === 0) return [lo];

  const usable = Math.max(0, width - PAD_X * 2);
  // 폭이 허용하는 개수와 별개로 7개에서 끊는다 — 760px 에서 10년 여행이
  // 매 해마다 라벨을 달아 11개가 되면서 눈금이 과밀해졌다(실측). 거리감은
  // 눈금 밀도와 재생 시간이 이미 담당하므로 더 촘촘할 필요가 없다.
  const maxLabels = Math.min(7, Math.max(2, Math.floor(usable / LABEL_SLOT) + 1));
  const step = niceStep(span / (maxLabels - 1));

  const mids: number[] = [];
  for (let y = Math.ceil(lo / step) * step; y <= hi; y += step) {
    if (y === lo || y === hi) continue;
    // 양 끝 라벨과 겹치면 버린다(2025 와 2026 처럼).
    const frac = (y - lo) / span;
    if (frac * usable < LABEL_SLOT * 0.8) continue;
    if ((1 - frac) * usable < LABEL_SLOT * 0.8) continue;
    mids.push(y);
  }
  return [lo, ...mids, hi];
}

/**
 * 종이비행기 — 접힌 면 두 개가 코에서 맞물리는 다트 실루엣. **기수는 오른쪽**
 * 이고, 실제 방향은 경로 접선으로 회전시켜 맞춘다(왼쪽으로 날 때 180°).
 *
 * 1차 도형은 삼각형 둘이 접합부 없이 겹쳐 있어 미완성으로 보였다. 이제 코
 * (41,15) → 위 꼬리(3,3) → 접힘점(18,15) → 아래 꼬리(11,27) 가 한 점에서
 * 만나고, 가운데 접힌 선을 넣어 종이를 접은 것으로 읽히게 했다.
 * 날개에 넣었던 활자선은 뺐다 — 44px 에서는 얼룩으로 보였다.
 */
function PaperPlane() {
  return (
    <svg width="44" height="30" viewBox="0 0 44 30" fill="none" aria-hidden focusable="false">
      {/* 위 날개 — 빛을 받는 면 */}
      <path d="M41 15 L3 3 L18 15 Z" fill="#fff" stroke={BLUE} strokeWidth="1.7" strokeLinejoin="round" />
      {/* 아래 날개 — 그늘진 면 */}
      <path d="M41 15 L18 15 L11 27 Z" fill="#c7d7fb" stroke={BLUE} strokeWidth="1.7" strokeLinejoin="round" />
      {/* 가운데 접힌 선 */}
      <path d="M41 15 L18 15" stroke={BLUE} strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

export function TimeMachineRewind({
  fromDate,
  toDate,
  onComplete,
}: {
  fromDate: string;
  toDate: string;
  onComplete: () => void;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const routeRef = useRef<SVGPathElement | null>(null);
  const trailRef = useRef<SVGPathElement | null>(null);
  const planeRef = useRef<HTMLSpanElement | null>(null);
  const dateRef = useRef<HTMLParagraphElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const doneRef = useRef(false);
  const startedRef = useRef(false);

  const [width, setWidth] = useState(0);
  const [activeYear, setActiveYear] = useState<number>(parseInt(fromDate.slice(0, 4), 10));
  const [arrived, setArrived] = useState(false);

  const fromYear = parseInt(fromDate.slice(0, 4), 10);
  const toYear = parseInt(toDate.slice(0, 4), 10);
  const span = Math.abs(fromYear - toYear);
  const labels = pickYearLabels(fromYear, toYear, width || 320);

  // 연도 → 여행 진행도(0=출발, 1=도착). 눈금의 x 좌표를 이걸로 잡는다.
  const progressOfYear = (year: number) => (span === 0 ? 0 : (fromYear - year) / (fromYear - toYear));
  const xOfProgress = (p: number) => (width - PAD_X) + (PAD_X - (width - PAD_X)) * p;

  // 오른쪽 끝에서 왼쪽 끝으로 내려앉는 활강 곡선. 좌우 끝을 모두 쓰기 때문에
  // 어떤 거리든 비행기가 박스를 완주한다.
  const routeD =
    width > 0
      ? `M ${width - PAD_X} 26 C ${width * 0.66} 6, ${width * 0.34} 46, ${PAD_X} 70`
      : '';

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    onComplete();
  }, [onComplete]);

  const skip = useCallback(() => {
    if (doneRef.current) return;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (dateRef.current) dateRef.current.textContent = kdate(toDate);
    setActiveYear(toYear);
    setArrived(true);
    window.setTimeout(finish, 160);
  }, [toDate, toYear, finish]);

  // 폭 측정 — 경로를 픽셀로 그려야 점선 간격과 비행기 각도가 왜곡되지 않는다.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    // 움직임을 줄이라는 설정이면 연출을 생략하고 바로 넘어간다(스티어링 §2).
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      finish();
      return;
    }
    // 폭을 재기 전에는 경로가 없다. 측정되면 한 번만 시작한다.
    if (width <= 0 || startedRef.current) return;
    startedRef.current = true;

    const route = routeRef.current;
    const total = route?.getTotalLength() ?? 0;
    const from = new Date(fromDate).getTime();
    const to = new Date(toDate).getTime();
    const duration = Math.min(DUR_MAX, Math.max(DUR_MIN, 900 + span * DUR_PER_YEAR));
    const t0 = performance.now();
    let arrivalTimer: ReturnType<typeof setTimeout> | undefined;
    let lastYear = fromYear;

    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);

      // 비행기를 경로 위에 태우고, 접선으로 기수를 돌린다.
      if (route && planeRef.current && total > 0) {
        const at = eased * total;
        const pt = route.getPointAtLength(at);
        const ahead = route.getPointAtLength(Math.min(total, at + 2));
        const angle = (Math.atan2(ahead.y - pt.y, ahead.x - pt.x) * 180) / Math.PI;
        planeRef.current.style.transform = `translate(${pt.x}px, ${pt.y}px) translate(-50%, -50%) rotate(${angle}deg)`;
      }
      // 지나온 구간만 실선으로 드러낸다.
      if (trailRef.current && total > 0) {
        trailRef.current.style.strokeDasharray = `${eased * total} ${total}`;
      }
      // 날짜는 textContent 로 — 프레임마다 리렌더하지 않는다.
      if (dateRef.current) {
        dateRef.current.textContent = kdate(ymd(new Date(from + (to - from) * eased)));
      }
      // 지나는 연도가 바뀔 때만 상태를 올린다.
      const y = Math.round(fromYear + (toYear - fromYear) * eased);
      if (y !== lastYear) {
        lastYear = y;
        setActiveYear(y);
      }

      if (p < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        // 도착의 순간 — 도장이 찍히고 나서 이동한다.
        setActiveYear(toYear);
        setArrived(true);
        arrivalTimer = setTimeout(finish, ARRIVAL_MS);
      }
    };
    rafRef.current = requestAnimationFrame(step);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (arrivalTimer) clearTimeout(arrivalTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- width 가 처음 측정될 때 1회만 시작(startedRef 로 가드). fromDate/toDate 는 이 인스턴스 생애주기 동안 고정 취급.
  }, [width]);

  // Esc 로 건너뛰기.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') skip();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [skip]);

  // 비행기가 지금 지나는 연도와 가장 가까운 라벨(같은 해가 라벨에 없을 수 있다).
  const nearestLabel = labels.reduce(
    (best, y) => (Math.abs(y - activeYear) < Math.abs(best - activeYear) ? y : best),
    labels[0],
  );

  return (
    <div onClick={skip} style={{ textAlign: 'center', cursor: 'pointer' }}>
      <style>{`
        @keyframes tmStamp {
          0%   { transform: scale(1.16) rotate(-2.5deg); opacity: 0; }
          60%  { transform: scale(0.99) rotate(0.6deg); opacity: 1; }
          100% { transform: scale(1) rotate(0deg); opacity: 1; }
        }
        .tm-stamp { animation: tmStamp 380ms cubic-bezier(.2,.9,.3,1) both; }
        @media (prefers-reduced-motion: reduce) { .tm-stamp { animation: none; } }
      `}</style>

      {/* 스크린리더에는 프레임마다 바뀌는 숫자를 읽히지 않고 목적지만 한 번 알린다. */}
      <p role="status" style={SR_ONLY}>
        {kdate(toDate)}로 이동하는 중입니다
      </p>

      <p style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.14em', color: MUTED, marginBottom: 12 }}>
        그날로 떠나는 중
      </p>

      {/* ── 비행 경로 ── 오른쪽 끝(출발) → 왼쪽 끝(도착). */}
      <div
        ref={wrapRef}
        aria-hidden
        style={{ position: 'relative', height: FLIGHT_H + TICK_H, width: '100%' }}
      >
        {width > 0 && (
          <>
            <svg
              width={width}
              height={FLIGHT_H}
              style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }}
            >
              {/* 남은 구간 — 점선. 어디로 갈지 미리 보여준다. */}
              <path
                ref={routeRef}
                d={routeD}
                fill="none"
                stroke={LINE}
                strokeWidth="2"
                strokeLinecap="round"
                strokeDasharray="2 8"
              />
              {/* 지나온 구간 — 실선. 항공 노선도 관례대로 진행도를 나타낸다. */}
              <path
                ref={trailRef}
                d={routeD}
                fill="none"
                stroke={BLUE}
                strokeWidth="2"
                strokeLinecap="round"
                strokeDasharray="0 99999"
                opacity="0.75"
              />
              {/* 출발·도착 지점 표시 */}
              <circle cx={width - PAD_X} cy={26} r="3.5" fill="#fff" stroke={BLUE} strokeWidth="2" />
              <circle cx={PAD_X} cy={70} r="3.5" fill={arrived ? BLUE : '#fff'} stroke={BLUE} strokeWidth="2" />
            </svg>

            {/* 경로를 타는 비행기 */}
            <span
              ref={planeRef}
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                lineHeight: 0,
                transform: `translate(${width - PAD_X}px, 26px) translate(-50%, -50%)`,
                willChange: 'transform',
              }}
            >
              <PaperPlane />
            </span>

            {/* 연도 눈금 — 흐르지 않고 고정. 비행기가 지나며 하나씩 켜진다. */}
            {labels.map((year) => {
              const on = year === nearestLabel;
              return (
                <span
                  key={year}
                  style={{
                    position: 'absolute',
                    left: xOfProgress(progressOfYear(year)),
                    top: FLIGHT_H - 2,
                    transform: 'translateX(-50%)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                  }}
                >
                  <span
                    style={{
                      width: on ? 2 : 1,
                      height: on ? 12 : 7,
                      background: on ? BLUE : LINE,
                      borderRadius: 1,
                      transition: 'height .2s ease, background .2s ease',
                    }}
                  />
                  <span
                    style={{
                      marginTop: 6,
                      fontSize: 13,
                      fontWeight: on ? 800 : 600,
                      color: on ? BLUE : MUTED,
                      fontVariantNumeric: 'tabular-nums',
                      letterSpacing: '-0.01em',
                      transition: 'color .2s ease',
                    }}
                  >
                    {year}
                  </span>
                </span>
              );
            })}
          </>
        )}
      </div>

      {/* ── 날짜 카운터 / 도착 도장 ── */}
      <p
        ref={dateRef}
        key={arrived ? 'arrived' : 'moving'}
        className={arrived ? 'tm-stamp' : undefined}
        style={{
          fontSize: 'clamp(24px, 5vw, 32px)',
          fontWeight: 800,
          color: INK,
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: '-0.02em',
          marginTop: 16,
        }}
      >
        {kdate(arrived ? toDate : fromDate)}
      </p>

      {/* 건너뛰기 — 홈에서 반복해서 쓰는 기능이라 재방문자가 매번 기다리지
          않게 한다. 컨테이너 클릭·Esc 도 같은 동작. */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          skip();
        }}
        style={{
          minHeight: 44,
          marginTop: 4,
          padding: '0 12px',
          background: 'none',
          border: 'none',
          fontSize: 14,
          fontWeight: 700,
          color: BODY,
          textDecoration: 'underline',
          textUnderlineOffset: 3,
          cursor: 'pointer',
        }}
      >
        바로 보기
      </button>
    </div>
  );
}

const SR_ONLY: React.CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
};
