// "그날로 떠나는" 전환 연출. 홈과 /timeline 두 feature가 공유하므로 shared/ui에 둔다
// (features 간 직접 import는 FSD 규칙 위반).
//
// 구조: 연도 레일이 오른쪽으로 흐르고, 가운데 고정된 네모칸이 지금 지나는 연도로 미끄러진다.
// - 축: 왼쪽 끝 = 선택 연도, 오른쪽 끝 = 오늘. 비행기는 박스를 완주한다.
// - 픽셀당연 = inner/span 이므로 레일 총 이동량이 비행기의 수평 이동량과 같다.
// - 레일·네모칸은 경로 x가 아니라 진행도로만 움직인다(루프 구간에서 x가 되돌아와 흔들리는 것을 방지).
// - 네모칸은 레일 안의 독립 요소이며 transform + transition으로 이동한다
//   (칸마다 테두리를 옮기면 고속 점프가 플리커로 읽힌다).
// - 진행도는 선형이다(ease-out은 초반이 지나치게 빨라 연도가 확 바뀌어 보인다).
// - LEADIN_MS 동안 정지해 출발 연도(오늘)를 읽을 시간을 준다.
//
// 프레임마다 바뀌는 값(비행기 위치·레일 위치·날짜 숫자)은 setState 대신 ref로 DOM을 직접 갱신한다
// (2초 x 60fps = 120회 이상 리렌더 방지). 상태는 도착 여부와 지금 지나는 연도가 바뀔 때만 올린다.
import { useCallback, useEffect, useRef, useState } from 'react';
import { kdate, ymd } from '@/shared/lib/date/timelineDates';

/* ── 홈 톤 토큰 (NewsTimeMachineSection 과 동일) ── */
const INK = '#111827'; // 17.74:1 on #fff
const BODY = '#374151'; // 10.31:1 on #fff
const MUTED = '#6b7280'; // 4.83:1 on #fff
const BLUE = '#1d4ed8'; // 6.70:1 on #fff
const LINE = 'rgba(17,24,39,0.16)';

/* ── 치수 ── */
/** 비행 영역 높이. 루프가 순항 고도 위로 2r 올라가고, 착지한 비행기(30px)가 아래 연도 줄을 덮지 않아야 한다. */
const FLIGHT_H = 108;
/** 순항 고도(출발점 y). 루프가 위 문구에 닿지 않게 낮춰 둔다. */
const Y_CRUISE = 34;
/** 경로가 좌우 끝에서 남기는 여백. 착지한 비행기(폭 44)가 잘려 보이지 않을 만큼 확보한다. */
const PAD_X = 40;
const TICK_H = 34; // 연도 줄 높이
/** 라벨 하나가 차지하는 최소 폭(네모칸 폭 + 최소 숨구멍). */
const LABEL_SLOT = 52;
/** 네모칸 크기. 13px tabular 4자리(약 31px) + 좌우 패딩 + 테두리. */
const FRAME_W = 44;
const FRAME_H = 26;
/** 레일 양끝 페이드 폭(px). 비율(%)로 지정하면 좁은 화면에서 도착 연도까지 가려진다. */
const RAIL_FADE = 20;

/* ── 루프 ── */
/** 반지름 = 이동 거리 x LOOP_RATIO. 참고 시안 실측(지름/이동 = 6.8%)에 맞춘 값이다. */
const LOOP_RATIO = 0.034;
/** 좁은 화면에서 비율만 따르면 지름이 20px 아래로 내려가 루프로 안 읽힌다. */
const LOOP_R_MAX = 26;
const LOOP_R_MIN = 12;
const LOOP_MIN_TRAVEL = 90;
/** 루프가 놓이는 위치(출발에서 도착까지의 비율). 시안 실측 49%. */
const LOOP_AT = 0.5;

/* ── 재생 시간 ── */
/** 출발 전 정지 시간. 출발 연도를 읽을 시간을 준다. */
const LEADIN_MS = 320;
/** 재생 시간 = BASE + 여행 연수 x PER_YEAR, 양쪽으로 clamp. 레일도 같은 진행도를 쓰므로 속도가 일치한다. */
const DUR_BASE = 700;
const DUR_PER_YEAR = 45;
const DUR_MIN = 1000;
const DUR_MAX = 2000;
const ARRIVAL_MS = 480;
/** 비행으로 볼 수 있는 최소 이동 거리(px). 이보다 짧으면 날지 않고 바로 앉는다. */
const MIN_FLIGHT_PX = 28;

export interface RailSpec {
  /** 표시할 라벨. x 는 레일 로컬 좌표(오늘 = 0, 과거는 음수). */
  labels: { year: number; x: number }[];
  /** 연 1년당 픽셀 — 지금 연도를 가운데로 끌어오는 계산에 쓴다. */
  pxPerYear: number;
}

/**
 * 레일에 깔 연도와 간격을 정한다.
 *
 * 픽셀당연을 inner/span 으로 잡아 레일 총 이동량이 비행기의 수평 이동량과 같도록 한다.
 * 라벨은 픽셀 등간격으로 배치하고 연도를 거기에 맞춰 반올림한다. 연도를 등간격으로 깔면
 * 끝에서 오늘을 억지로 끼워야 해 한 칸만 간격이 벌어진다. 대가로 연도 간격이 3년/4년으로 섞인다.
 */
function buildRail(fromYear: number, toYear: number, width: number): RailSpec {
  const span = Math.max(1, fromYear - toYear);
  const inner = Math.max(1, width - PAD_X * 2);
  const pxPerYear = inner / span;

  // 라벨 개수: 간격이 LABEL_SLOT 이상이어야 하고, 한 해에 하나가 최대다(더 촘촘하면 같은 연도로 겹친다).
  const count = Math.max(2, Math.min(span + 1, Math.floor(inner / LABEL_SLOT) + 1, 14));
  const pitch = inner / Math.max(1, count - 1);

  const labels: { year: number; x: number }[] = [];
  for (let i = 0; i < count; i++) {
    labels.push({ year: Math.round(fromYear - (span * i) / (count - 1)), x: -i * pitch });
  }
  labels.reverse(); // 오래된 것 → 최근
  return { labels, pxPerYear };
}

/**
 * 종이비행기. 접힌 면 두 개가 코에서 맞물리는 다트 실루엣이며 기수는 오른쪽이다.
 * 실제 방향은 경로 접선으로 회전시킨다(왼쪽으로 날 때 180°).
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
  const railRef = useRef<HTMLDivElement | null>(null);
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

  const rail = buildRail(fromYear, toYear, width || 320);
  const labels = rail.labels;
  /** 레일 안에서의 로컬 x — 오늘이 0, 과거는 음수. */
  const xLocal = (y: number) => (y - fromYear) * rail.pxPerYear;

  const xStart = width > 0 ? width - PAD_X : 0;
  const xEnd = width > 0 ? PAD_X : 0;
  const travel = Math.abs(xStart - xEnd);
  /** 이동이 눈에 안 보일 만큼 짧으면(최근 날짜) 날지 않고 바로 앉는다. */
  const tooClose = width > 0 && travel < MIN_FLIGHT_PX;

  /** 네모칸은 가운데에 둔다. 레일이 지금 연도를 여기로 끌어온다. */
  const frameCenter = width > 0 ? width / 2 : 0;
  /**
   * 레일 x. 오른쪽으로 흐르며 가운데 칸에 들어오는 연도가 지금 연도다.
   *   railTx(0) = 가운데 - xLocal(오늘)
   *   railTx(1) = 가운데 - xLocal(도착연도)
   */
  const railTx = (t: number) => frameCenter - xLocal(fromYear + (toYear - fromYear) * t);

  /* ── 비행 경로 ── */
  // 하강 폭은 이동 거리에 비례시킨다(짧은 비행에서 크게 떨어지면 급강하로 보인다).
  const dropRatio = Math.min(1, travel / 200);
  const yEnd = Y_CRUISE + 30 * dropRatio;
  const loops = !tooClose && travel >= LOOP_MIN_TRAVEL;
  const loopR = Math.round(Math.min(LOOP_R_MAX, Math.max(LOOP_R_MIN, travel * LOOP_RATIO)));
  const loopX = xStart + (xEnd - xStart) * LOOP_AT;
  const loopY = Y_CRUISE + (yEnd - Y_CRUISE) * LOOP_AT;

  const routeD = (() => {
    if (width <= 0 || tooClose) return '';
    const head = `M ${xStart} ${Y_CRUISE}`;
    if (!loops) {
      return `${head} C ${xStart - travel * 0.34} ${Y_CRUISE - 12 * dropRatio}, ${xEnd + travel * 0.34} ${yEnd + 14 * dropRatio}, ${xEnd} ${yEnd}`;
    }
    const inLen = Math.abs(loopX - xStart);
    const outLen = Math.abs(loopX - xEnd);
    return [
      head,
      // 루프 진입까지 완만하게
      `C ${xStart - inLen * 0.5} ${Y_CRUISE - 8}, ${loopX + inLen * 0.4} ${loopY - 4}, ${loopX} ${loopY}`,
      // 한 바퀴. 전체 원은 호 하나로 그릴 수 없다(시작점 = 끝점이면 렌더되지 않는다).
      `a ${loopR} ${loopR} 0 0 1 0 ${-loopR * 2}`,
      `a ${loopR} ${loopR} 0 0 1 0 ${loopR * 2}`,
      // 루프를 빠져나와 도착까지
      `C ${loopX - outLen * 0.4} ${loopY + 6}, ${xEnd + outLen * 0.5} ${yEnd - 6}, ${xEnd} ${yEnd}`,
    ].join(' ');
  })();

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

  // 폭 측정: 경로를 픽셀 단위로 그려야 점선 간격과 비행기 각도가 왜곡되지 않는다.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    // 모션 감소 설정이면 연출을 생략하고 바로 넘어간다.
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      finish();
      return;
    }
    // 폭을 재기 전에는 경로가 없다. 측정되면 한 번만 시작한다.
    if (width <= 0 || startedRef.current) return;
    startedRef.current = true;

    // 목적지가 최근이라 이동 거리가 눈에 안 보이면 비행을 생략한다.
    if (tooClose) {
      if (dateRef.current) dateRef.current.textContent = kdate(toDate);
      setActiveYear(toYear);
      setArrived(true);
      const t = setTimeout(finish, ARRIVAL_MS + 200);
      return () => clearTimeout(t);
    }

    const route = routeRef.current;
    const total = route?.getTotalLength() ?? 0;
    const from = new Date(fromDate).getTime();
    const to = new Date(toDate).getTime();
    const duration = Math.min(DUR_MAX, Math.max(DUR_MIN, DUR_BASE + span * DUR_PER_YEAR));
    const t0 = performance.now() + LEADIN_MS;
    let arrivalTimer: ReturnType<typeof setTimeout> | undefined;
    let lastYear = fromYear;

    const step = (now: number) => {
      // 선형 진행도. 리드인 동안은 0으로 고정된다.
      const p = Math.min(1, Math.max(0, (now - t0) / duration));

      // 비행기를 경로 위에 태우고, 접선으로 기수를 돌린다.
      if (route && planeRef.current && total > 0) {
        const at = p * total;
        const pt = route.getPointAtLength(at);
        const ahead = route.getPointAtLength(Math.min(total, at + 2));
        const angle = (Math.atan2(ahead.y - pt.y, ahead.x - pt.x) * 180) / Math.PI;
        planeRef.current.style.transform = `translate(${pt.x}px, ${pt.y}px) translate(-50%, -50%) rotate(${angle}deg)`;
      }
      // 레일은 진행도로만 움직인다(경로 x를 쓰면 루프에서 같이 흔들린다).
      if (railRef.current) railRef.current.style.transform = `translateX(${railTx(p)}px)`;
      // 지나온 구간만 실선으로 드러낸다.
      if (trailRef.current && total > 0) {
        trailRef.current.style.strokeDasharray = `${p * total} ${total}`;
      }
      // 날짜는 textContent 로 — 프레임마다 리렌더하지 않는다.
      if (dateRef.current) {
        dateRef.current.textContent = kdate(ymd(new Date(from + (to - from) * p)));
      }
      // 지나는 연도가 바뀔 때만 상태를 올린다.
      const y = Math.round(fromYear + (toYear - fromYear) * p);
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

  // 지금 지나는 연도와 가장 가까운 라벨(그 해가 라벨에 없을 수 있다).
  // 네모칸이 이 라벨로 미끄러진다.
  const nearestLabel = labels.reduce(
    (best, l) => (Math.abs(l.year - activeYear) < Math.abs(best.year - activeYear) ? l : best),
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
        @media (prefers-reduced-motion: reduce) {
          .tm-stamp { animation: none; }
          .tm-frame { transition: none; }
        }
      `}</style>

      {/* 스크린리더에는 프레임마다 바뀌는 숫자 대신 목적지만 한 번 알린다. */}
      <p role="status" style={SR_ONLY}>
        {kdate(toDate)}로 이동하는 중입니다
      </p>

      <p style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.14em', color: MUTED, marginBottom: 12 }}>
        그날로 떠나는 중
      </p>

      {/* ── 비행 경로 ── 오른쪽 끝(출발) → 왼쪽 끝(도착) */}
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
              {/* 출발(오늘)·도착(그날) 지점 */}
              <circle cx={xStart} cy={Y_CRUISE} r="3.5" fill="#fff" stroke={BLUE} strokeWidth="2" />
              <circle cx={xEnd} cy={yEnd} r="3.5" fill={arrived ? BLUE : '#fff'} stroke={BLUE} strokeWidth="2" />
            </svg>

            {/* 경로를 타는 비행기 */}
            <span
              ref={planeRef}
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                lineHeight: 0,
                transform: `translate(${tooClose ? xEnd : xStart}px, ${tooClose ? yEnd : Y_CRUISE}px) translate(-50%, -50%) rotate(180deg)`,
                willChange: 'transform',
              }}
            >
              <PaperPlane />
            </span>

            {/* 연도 레일. 오른쪽으로 흐르며, 컨테이너로 잘라 양끝 연도를 화면 밖으로 빼고 마스크로 경계를 흐린다. */}
            <div
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: FLIGHT_H - 2,
                height: TICK_H,
                overflow: 'hidden',
                maskImage: `linear-gradient(to right, transparent 0, #000 ${RAIL_FADE}px, #000 calc(100% - ${RAIL_FADE}px), transparent 100%)`,
                WebkitMaskImage: `linear-gradient(to right, transparent 0, #000 ${RAIL_FADE}px, #000 calc(100% - ${RAIL_FADE}px), transparent 100%)`,
              }}
            >
              <div
                ref={railRef}
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  height: '100%',
                  willChange: 'transform',
                  transform: `translateX(${railTx(tooClose ? 1 : 0)}px)`,
                }}
              >
                {/* 네모칸은 레일 안의 독립 요소이며 transform + transition으로 칸에서 칸으로 미끄러진다. */}
                <div
                  className="tm-frame"
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    width: FRAME_W,
                    height: FRAME_H,
                    marginLeft: -FRAME_W / 2,
                    borderRadius: 6,
                    border: `2px solid ${BLUE}`,
                    background: 'rgba(255,255,255,0.72)',
                    transform: `translateX(${nearestLabel.x}px)`,
                    transition: 'transform .2s ease-out',
                    willChange: 'transform',
                  }}
                />
                {labels.map(({ year, x }) => {
                  const on = year === nearestLabel.year;
                  return (
                    <span
                      key={`${year}-${x}`}
                      style={{
                        position: 'absolute',
                        left: x,
                        top: 0,
                        transform: 'translateX(-50%)',
                        boxSizing: 'border-box',
                        minWidth: FRAME_W,
                        height: FRAME_H,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 13,
                        fontWeight: on ? 800 : 600,
                        color: on ? BLUE : MUTED,
                        fontVariantNumeric: 'tabular-nums',
                        letterSpacing: '-0.01em',
                        lineHeight: 1.2,
                        whiteSpace: 'nowrap',
                        transition: 'color .2s ease',
                      }}
                    >
                      {year}
                    </span>
                  );
                })}
              </div>
            </div>
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
          // 연도 레일과 다른 덩어리로 읽히도록 간격을 둔다.
          marginTop: 24,
        }}
      >
        {kdate(arrived ? toDate : fromDate)}
      </p>

      {/* 건너뛰기. 재방문자가 매번 기다리지 않게 한다. 컨테이너 클릭·Esc도 같은 동작. */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          skip();
        }}
        style={{
          minHeight: 44,
          // 날짜는 정보, 이 버튼은 액션이므로 간격을 분리한다.
          marginTop: 16,
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
