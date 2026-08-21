// "그날로 떠나는" 전환 연출 — 원래 features/timeline/components/
// NewsTimeMachine.tsx(/timeline 입력 페이지) 안에만 있었는데, 홈 "그날로
// 떠나요"(features/news-feed/components/NewsTimeMachineSection.tsx)에서도
// 재생되도록 다시 연결하면서(2026-08-17, 사용자 리포트: "종이 애니메이션이
// 사라졌네요") 두 feature가 같이 쓸 수 있게 shared/ui로 승격했다 —
// features 간 직접 import는 이 프로젝트의 FSD 규칙 위반이라(HandDrawnIcons를
// shared/ui/icons로 승격했던 것과 같은 이유).
//
// ══ 2026-08-21 — 연도 레일이 흐르는 구조로 ══
//
// 이전 구조는 연도를 축에 고정해두고 네모칸만 라벨 사이를 뛰어다녔다. 문제가
// 겹겹이 있었고, 하나씩 실측해서 고쳤다.
//
// (A) 눈금이 하나로 붕괴했다.
//     연도 축을 "여행 구간"으로 계산해서, 목적지가 올해면 구간이 0 이 되고
//     눈금이 `2026` 하나만 남았다. 게다가 비행기는 목적지와 무관하게 박스를
//     완주하니, 눈금은 오른쪽 끝에 하나 있는데 비행기는 왼쪽 끝에 가 있는
//     상태가 됐다. 지금은 축이 **왼쪽 끝 = 고른 연도, 오른쪽 끝 = 오늘** 이다.
//
// (B) 연도가 움직이지 않았다.
//     라벨 간격을 "컨테이너 폭 / 여행 구간"으로 잡으면 비행기가 왼쪽으로 가는
//     픽셀 수와 연도가 줄어드는 픽셀 수가 정확히 상쇄된다.
//       Δ라벨x = Δ비행기x - Δ연도 x 픽셀당연 = -inner + span x (inner/span) = 0
//     즉 레일이 **기하학적으로 움직일 수 없는** 설정이었다. 지금은 레일을
//     따로 흘리고(railTx) 지금 연도를 가운데로 끌어온다.
//
// (C) 튕겼다.
//     레일을 비행기의 **경로 x** 에 묶어놨더니, 루프를 도는 동안 x 가
//     되돌아와서 레일이 같이 흔들렸다(사용자 리포트: "지금은 왜 튕겨?").
//     지금은 레일·네모칸이 경로가 아니라 **진행도**로만 움직인다.
//
// (D) 가운데 정렬.
//     시안 두 프레임 모두 네모칸이 정확히 가운데다 — 시작 프레임엔 오늘이,
//     끝 프레임엔 도착 연도가 그 안에 들어 있다. 레일이 "지금 연도"를 가운데로
//     끌어오므로 양 끝에서 자동으로 가운데가 된다.
//
// (E) 네모칸이 깜빡였다.
//     활성 칸 자체에 테두리를 그렸는데 칸들이 절대 위치라 테두리가 다른 칸으로
//     **점프**했다. 데스크톱은 칸이 12개라 2.3초에 11번(약 207ms 마다) 튀었고,
//     그 속도면 눈이 따라가지 못해 움직임이 아니라 플리커로 읽힌다.
//     지금은 네모칸이 **레일 안의 독립 요소 하나**이고 transform + transition
//     으로 칸에서 칸으로 미끄러진다. 레일 안에 있으니 연도와 함께 흐른다.
//
// (F) 출발 화면을 볼 수 없었다.
//     100ms 안에 이미 연도가 한 칸 넘어가서 활성칸이 2026 이 아니라 2024 였다.
//     LEADIN_MS 만큼 멈춰 "오늘에서 떠난다"를 읽을 시간을 준다.
//
// (G) 등속.
//     ease-out 이라 앞부분이 훨씬 빨랐다 — 처음 20% 시간에 절반을 지나가서
//     "연도가 확 바뀐다"로 보였고 뒤에서는 기어갔다. 지금은 선형이다.
//
// 프레임마다 바뀌는 값(비행기 위치·레일 위치·날짜 숫자)은 setState 를 쓰지
// 않고 ref 로 DOM 을 직접 만진다 — 2초 x 60fps 면 120회 이상 리렌더가 되고,
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
/**
 * 비행 영역 높이. 루프가 순항 고도 위로 2r 올라가고, 착지한 비행기(30px)가
 * 아래 연도 줄을 덮지 않아야 해서 96 -> 108 로 올렸다(실측 캡처에서 발견).
 */
const FLIGHT_H = 108;
/** 순항 고도(출발점 y). 루프가 위 문구에 닿지 않게 내려놨다. */
const Y_CRUISE = 34;
/**
 * 경로가 좌우 끝에서 남기는 여백. 30 이었는데 비행기(폭 44)가 착지하면 왼쪽에
 * 8px 만 남아 잘린 것처럼 보였다(실측).
 */
const PAD_X = 40;
const TICK_H = 34; // 연도 줄 높이
/**
 * 라벨 하나가 차지하는 최소 폭(네모칸 폭 + 최소 숨구멍). 68 이었는데 그러면
 * 656px 카드에서 피치가 92px 이 되어 반쪽에 4개밖에 안 들어갔다.
 */
const LABEL_SLOT = 52;
/** 네모칸 크기. 13px tabular 4자리(약 31px) + 좌우 패딩 + 테두리. */
const FRAME_W = 44;
const FRAME_H = 26;
/**
 * 레일 양끝 페이드 폭(px). 비율(%)로 주면 좁은 화면에서 페이드가 도착 연도까지
 * 삼켰다(사용자 리포트: "도착연도가 그라데이션에 가려져서 잘 안보여").
 */
const RAIL_FADE = 20;

/* ── 루프 ── */
/**
 * 반지름 = 이동 거리 x LOOP_RATIO.
 * 참고 시안 실측(이동 950px, 루프 지름 65px)에서 **지름/이동 = 6.8%** 였다.
 * 0.17 을 쓰다가 상한에 걸려 시안의 1.7배로 커져 있었다.
 */
const LOOP_RATIO = 0.034;
/** 좁은 화면에서 비율만 따르면 지름이 20px 아래로 내려가 루프로 안 읽힌다. */
const LOOP_R_MAX = 26;
const LOOP_R_MIN = 12;
const LOOP_MIN_TRAVEL = 90;
/** 루프가 놓이는 위치(출발에서 도착까지의 비율). 시안 실측 49%. */
const LOOP_AT = 0.5;

/* ── 재생 시간 ── */
/** 출발 전 정지 시간 — "오늘에서 떠난다"를 읽을 시간을 준다((F) 참조). */
const LEADIN_MS = 320;
/**
 * 재생 시간 = BASE + 여행 연수 x PER_YEAR, 양쪽으로 clamp.
 * 900 + 60/년(최대 2600) 이었는데 비행기가 느리다는 피드백으로 줄였다 —
 * 23년 여행이 2280ms -> 1735ms 로 약 24% 빨라진다. 레일도 같은 진행도를
 * 쓰므로 둘의 속도 매칭(1.02배)은 그대로다.
 */
const DUR_BASE = 700;
const DUR_PER_YEAR = 45;
const DUR_MIN = 1000;
const DUR_MAX = 2000;
const ARRIVAL_MS = 480;
/** 비행으로 볼 수 있는 최소 이동 거리(px). 이보다 짧으면 날지 않고 바로 앉는다. */
const MIN_FLIGHT_PX = 28;

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function kdate(s: string): string {
  const [y, m, d] = s.split('-');
  return `${y}년 ${parseInt(m, 10)}월 ${parseInt(d, 10)}일`;
}

/**
 * 연 단위 소수 위치(2026-08-16 → 2026.62).
 * 정수 연도로 축 끝을 잡으면 오늘이 2026.62 라서 출발점이 축 바깥으로
 * 튀어나간다(자체 검증에서 잡음).
 */
export function yearFloat(s: string): number {
  const d = new Date(s);
  const y = d.getFullYear();
  const start = new Date(y, 0, 1).getTime();
  const end = new Date(y + 1, 0, 1).getTime();
  return y + (d.getTime() - start) / (end - start);
}

export interface RailSpec {
  /** 표시할 라벨. x 는 레일 로컬 좌표(오늘 = 0, 과거는 음수). */
  labels: { year: number; x: number }[];
  /** 연 1년당 픽셀 — 지금 연도를 가운데로 끌어오는 계산에 쓴다. */
  pxPerYear: number;
}

/**
 * 레일에 깔 연도와 간격을 정한다.
 *
 * 픽셀당연을 inner/span 으로 잡으면 레일 총 이동이 span x (inner/span) = inner
 * 라서, 같은 시간 동안 비행기가 가는 수평 거리와 정확히 같아진다. 이전에는
 * 라벨 간격을 먼저 고정해 레일 이동이 416px 뿐이었고(비행기는 576px) 레일이
 * 72% 속도로 뒤처져 보였다(사용자 리포트: "속도가 얼추 맞았으면").
 *
 * 라벨은 **픽셀 등간격**으로 깔고 연도를 거기에 맞춰 반올림한다. 연도를
 * 등간격(N년)으로 깔면 마지막에 오늘이 안 맞아떨어져서, 오늘을 억지로 끼우면
 * 그 한 칸만 간격이 5배로 벌어졌다(실측 43px vs 8px). 픽셀을 먼저 고정하면
 * 간격이 완전히 균일하고 양 끝(오늘·도착 연도)이 정확히 맞는다. 대가로 연도
 * 간격이 3년/4년으로 섞이는데, 시안이 바로 그 모양이다
 * (2003 2006 2010 2013 2016 2019 2023 2026 — 3,4,3,3,3,4,3).
 */
export function buildRail(fromYear: number, toYear: number, width: number): RailSpec {
  const span = Math.max(1, fromYear - toYear);
  const inner = Math.max(1, width - PAD_X * 2);
  const pxPerYear = inner / span;

  // 라벨 개수 — 간격이 LABEL_SLOT 이상이어야 하고, 한 해에 하나가 최대다
  // (그보다 촘촘하면 반올림 결과가 같은 연도로 겹친다).
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

  /** 네모칸은 가운데 — 레일이 지금 연도를 여기로 끌어온다((D) 참조). */
  const frameCenter = width > 0 ? width / 2 : 0;
  /**
   * 레일 x — 오른쪽으로 흐른다. 가운데 칸에 들어오는 연도가 곧 지금 연도다.
   *   railTx(0) = 가운데 - xLocal(오늘)     = 가운데        (xLocal(오늘)=0)
   *   railTx(1) = 가운데 - xLocal(도착연도) = 가운데 + span x 픽셀당연
   */
  const railTx = (t: number) => frameCenter - xLocal(fromYear + (toYear - fromYear) * t);

  /* ── 비행 경로 ── */
  // 하강 폭은 이동 거리에 비례시킨다 — 짧은 비행에서 크게 떨어지면 급강하로 보인다.
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
      // 한 바퀴 — 위로 올라가 뒤집히고 제자리로.
      // 전체 원은 호 하나로 못 그린다(시작점=끝점이면 렌더가 안 된다).
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

    // 목적지가 최근이라 이동 거리가 눈에 안 보이면 비행을 생략한다. 억지로
    // 2초를 채우면 "멈춰 있는 비행기"로 읽히고, 가까운 날짜인 것도 사실이다.
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
      // (G) 등속. 리드인 동안은 0 으로 고정된다.
      const p = Math.min(1, Math.max(0, (now - t0) / duration));

      // 비행기를 경로 위에 태우고, 접선으로 기수를 돌린다.
      if (route && planeRef.current && total > 0) {
        const at = p * total;
        const pt = route.getPointAtLength(at);
        const ahead = route.getPointAtLength(Math.min(total, at + 2));
        const angle = (Math.atan2(ahead.y - pt.y, ahead.x - pt.x) * 180) / Math.PI;
        planeRef.current.style.transform = `translate(${pt.x}px, ${pt.y}px) translate(-50%, -50%) rotate(${angle}deg)`;
      }
      // (C) 레일은 진행도로만 움직인다 — 경로 x 를 쓰면 루프에서 같이 튕긴다.
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

            {/*
              연도 레일 — 오른쪽으로 흐른다. 컨테이너로 잘라내서 양끝 연도가
              화면 밖으로 빠져나가고, 마스크로 경계를 흐린다.
            */}
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
                {/*
                  (E) 네모칸은 레일 안의 독립 요소 하나다. 지금 연도 칸으로
                  transform 을 옮기고 transition 을 걸어 **미끄러진다.**
                  레일 안에 있으니 연도와 함께 오른쪽으로 흐르고, 동시에 칸에서
                  칸으로 미끄러진다 — 두 요구를 같이 만족한다.
                */}
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
          // 연도 레일과 다른 덩어리다 — 16px 이면 레일에 붙어 읽혔다.
          marginTop: 24,
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
          // 4px 이면 큰 날짜에 딱 붙어 한 덩어리로 읽혔다. 날짜는 정보,
          // 이건 액션이라 분리해야 한다.
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
