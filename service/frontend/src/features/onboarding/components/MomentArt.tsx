'use client';

import { useEffect, useId, useMemo, useRef, useSyncExternalStore, type ReactNode } from 'react';
import type { Moment } from '../lib/moments';

// 장면 일러스트 4종 — 관절(뼈대)을 가진 인물을 시간 함수로 움직인다(2026-10-04 재제작).
//
// 왜 이 방식인가: 선 몇 개를 SMIL로 흔드는 것으로는 "사람이 걷는다"가 읽히지 않았다. 걷기는 접촉·낮아짐·교차·올라감 네 포즈에
// 엉덩이 상하 흔들림, 무릎 굽힘, 팔의 엇박자(겹치는 동작)가 있어야 자연스럽다. Lottie/Rive는 AE·Rive 에디터가 필요해서
// 코드만으로 만들 수 없으므로, 중첩된 <g transform>으로 순기구학(FK)을 구성하고 매 프레임 각도만 갱신한다.
// 손이 손잡이·폰에 닿는 동작은 2관절 역기구학(ik2)으로 푼다.
// 얼굴 없는 면 채색 인물 + 얇은 외곽선, 파란색(#5b8def)은 "움직임·빛·소리"에만 쓴다.
// 움직임 줄이기 설정이면 한 프레임(STILL_T)만 그려 정지 그림이 된다.
export const INK = '#1f2937';
export const BLUE = '#5b8def';
const SKIN = '#f2d3b6';
const HAIR = '#2b2f3a';
const TOP = '#3b5189';
const PANTS_NEAR = '#8d97a8';
const PANTS_FAR = '#aab2c0';
const STILL_T = 0.3;
const D2R = Math.PI / 180;

export type SetFn = (key: string, value: string, attr?: string) => void;
type Draw = (t: number, set: SetFn) => void;

function subscribe(cb: () => void) {
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
}
const prefersReduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const smooth = (x: number) => {
  const c = clamp(x, 0, 1);
  return c * c * (3 - 2 * c);
};
/** 주기 안에서 [from, to] 구간에만 0→1→0로 부드럽게 솟는 펄스. */
export const pulse = (u: number, from: number, to: number) => (u > from && u < to ? Math.sin((Math.PI * (u - from)) / (to - from)) ** 2 : 0);

/** 2관절 역기구학 — 어깨 원점 기준 목표(tx,ty)에 손이 닿는 (어깨각, 팔꿈치각)[도]. 각도 0 = 팔이 아래로 늘어진 상태, 양수 = 시계 방향. */
function ik2(l1: number, l2: number, tx: number, ty: number, bend: 1 | -1) {
  const d = clamp(Math.hypot(tx, ty), Math.abs(l1 - l2) + 0.05, l1 + l2 - 0.05);
  const a0 = Math.atan2(-tx, ty);
  const A = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
  const B = Math.acos(clamp((l1 * l1 + l2 * l2 - d * d) / (2 * l1 * l2), -1, 1));
  return { a1: (a0 + bend * A) / D2R, a2: (-bend * (Math.PI - B)) / D2R };
}

const rot = (deg: number, cx = 0, cy = 0) => `rotate(${deg.toFixed(2)} ${cx} ${cy})`;

/** 관절 그룹에 ref + 초기 transform(SSR·정지 그림용)을 붙이는 훅. draw는 모듈 수준의 안정된 함수여야 한다. */
export function useRig(draw: Draw, animate: boolean) {
  const els = useRef<Record<string, SVGElement | null>>({});
  const init = useMemo(() => {
    const m: Record<string, string> = {};
    draw(STILL_T, (k, v, attr = 'transform') => {
      m[`${k}|${attr}`] = v;
    });
    return m;
  }, [draw]);
  useEffect(() => {
    if (!animate) return;
    const set: SetFn = (k, v, attr = 'transform') => els.current[`${k}|${attr}`]?.setAttribute(attr, v);
    const t0 = performance.now();
    let raf = requestAnimationFrame(function frame(now) {
      draw((now - t0) / 1000 + STILL_T, set);
      raf = requestAnimationFrame(frame);
    });
    return () => cancelAnimationFrame(raf);
  }, [animate, draw]);
  /** transform 조인트 */
  const J = (k: string) => ({
    ref: (el: SVGGElement | null) => {
      els.current[`${k}|transform`] = el;
    },
    transform: init[`${k}|transform`],
  });
  /** opacity 조인트 */
  const O = (k: string) => ({
    ref: (el: SVGGElement | null) => {
      els.current[`${k}|opacity`] = el;
    },
    opacity: init[`${k}|opacity`] as unknown as number,
  });
  /** 임의 속성 조인트 — 예: A('arc', 'stroke-dashoffset', 'strokeDashoffset')로 선 그리기를 움직인다. */
  const A = (k: string, attr: string, prop: string) => ({
    ref: (el: SVGElement | null) => {
      els.current[`${k}|${attr}`] = el;
    },
    [prop]: init[`${k}|${attr}`],
  });
  return { J, O, A };
}

type JFn = ReturnType<typeof useRig>['J'];

function Seg({ len, w, fill }: { len: number; w: number; fill: string }) {
  return (
    <>
      <line x1={0} y1={0} x2={0} y2={len} stroke={INK} strokeWidth={w + 1.5} strokeLinecap="round" />
      <line x1={0} y1={0} x2={0} y2={len} stroke={fill} strokeWidth={w} strokeLinecap="round" />
    </>
  );
}

/** 두 마디 팔다리. end가 있으면 끝(손·발)에 붙는다. 관절 키: `${id}1`(어깨/고관절), `${id}2`(팔꿈치/무릎), `${id}3`(손목/발목). */
function Limb({ id, J, l1, l2, w, fill, end }: { id: string; J: JFn; l1: number; l2: number; w: number; fill: string; end?: ReactNode }) {
  return (
    <g {...J(`${id}1`)}>
      <Seg len={l1} w={w} fill={fill} />
      <g transform={`translate(0 ${l1})`}>
        <g {...J(`${id}2`)}>
          <Seg len={l2} w={w * 0.92} fill={fill} />
          <g transform={`translate(0 ${l2})`}>
            <g {...J(`${id}3`)}>{end}</g>
          </g>
        </g>
      </g>
    </g>
  );
}

const Shoe = () => <path d="M-2.4 -0.8 H3 L6.8 1.4 Q7.8 2.6 6.5 2.6 H-2.4 Z" fill={INK} stroke={INK} strokeWidth={0.6} strokeLinejoin="round" />;
const Hand = () => <circle cx={0} cy={0.6} r={1.9} fill={SKIN} stroke={INK} strokeWidth={0.9} />;

function Head({ J, id = 'head' }: { J: JFn; id?: string }) {
  return (
    <g transform="translate(0 -17)">
      <g {...J(id)}>
        <rect x={-1.6} y={-3.4} width={3.2} height={4} fill={SKIN} stroke={INK} strokeWidth={0.9} />
        <circle cx={0.8} cy={-8.4} r={5.2} fill={SKIN} stroke={INK} strokeWidth={1} />
        <path d="M-4.4 -9.4 C-4.8 -14.2 1.8 -15.4 5 -12.6 C2.2 -12.6 0.6 -11 0.2 -8.4 C-0.4 -6.6 -2.8 -6.2 -4.3 -7 Z" fill={HAIR} stroke={INK} strokeWidth={0.8} strokeLinejoin="round" />
      </g>
    </g>
  );
}

const TorsoShape = ({ fill = TOP }: { fill?: string }) => (
  <>
    <path d="M-4.4 -17 Q0 -18.8 4.4 -17 L5.2 -1.6 Q0 0.9 -5.2 -1.6 Z" fill={fill} stroke={INK} strokeWidth={1} strokeLinejoin="round" />
    <path d="M-5.4 -2.4 H5.4 L5.8 2 H-5.8 Z" fill={PANTS_NEAR} stroke={INK} strokeWidth={1} strokeLinejoin="round" />
  </>
);

/* ───────────────────────── 걷기 ───────────────────────── */
const WALK_T = 1.05;
const WALK_HIP_Y = 41.4;
const walkDraw: Draw = (t, set) => {
  const f = (2 * Math.PI * t) / WALK_T;
  const v = 52.6 / WALK_T; // 발이 미끄러지지 않도록 보폭에서 역산한 지면 속도
  set('root', `translate(60 ${(WALK_HIP_Y + 1.2 * Math.cos(2 * f)).toFixed(2)})`);
  const legs = (id: string, ph: number) => {
    const th = -28 * Math.sin(ph);
    const kn = 6 + 42 * Math.max(0, Math.cos(ph)) ** 1.6;
    set(`${id}1`, rot(th));
    set(`${id}2`, rot(kn));
    set(`${id}3`, rot(-(th + kn) - 10 * Math.sin(ph)));
  };
  legs('la', f);
  legs('lb', f + Math.PI);
  const arms = (id: string, ph: number) => {
    set(`${id}1`, rot(24 * Math.sin(ph)));
    set(`${id}2`, rot(-(14 + 12 * (1 + Math.sin(ph + 0.8)) * 0.5)));
    set(`${id}3`, rot(0));
  };
  arms('aa', f);
  arms('ab', f + Math.PI);
  const lean = 4 + 1.5 * Math.cos(2 * f);
  set('torso', rot(lean));
  set('head', rot(-lean * 0.7 + 1.6 * Math.sin(2 * f + 0.5)));
  set('ground', `translate(${(-((v * t) % 24)).toFixed(2)} 0)`);
  set('bg1', `translate(${(-((v * 0.28 * t) % 80)).toFixed(2)} 0)`);
  set('bg2', `translate(${(160 - ((v * 0.8 * t) % 220)).toFixed(2)} 0)`);
  const s1 = Math.sin((2 * Math.PI * t) / 1.2);
  set('wave1', String(0.15 + 0.85 * smooth((s1 + 1) / 2)), 'opacity');
  set('wave2', String(0.15 + 0.85 * smooth((Math.sin((2 * Math.PI * (t - 0.2)) / 1.2) + 1) / 2)), 'opacity');
};

function Walk({ animate }: { animate: boolean }) {
  const { J, O } = useRig(walkDraw, animate);
  return (
    <>
      <g stroke="#c9d3e6" strokeWidth={1} fill="none">
        <g {...J('bg1')}>
          <rect x={6} y={30} width={22} height={42} />
          <path d="M11 38 H23 M11 46 H23 M11 54 H23" />
          <rect x={44} y={42} width={18} height={30} />
          <rect x={86} y={34} width={20} height={38} />
          <path d="M91 42 H101 M91 50 H101" />
        </g>
      </g>
      <g {...J('bg2')} stroke={INK} strokeWidth={1.3}>
        <path d="M0 72 V20 Q0 14 6 14 H10" fill="none" />
        <circle cx={11} cy={14} r={2} fill="#fff6d9" stroke={INK} />
      </g>
      <path d="M0 72 H120" stroke={INK} strokeWidth={1.3} />
      <g {...J('ground')} stroke="#9aa5b8" strokeWidth={1.2} strokeLinecap="round">
        {Array.from({ length: 8 }, (_, k) => (
          <path key={k} d={`M${k * 24 + 6} 76 h7`} />
        ))}
      </g>
      <g {...J('root')}>
        {/* 먼 쪽 다리·팔 → 몸통 → 가까운 쪽 다리·팔 순서로 겹친다 */}
        <Limb id="lb" J={J} l1={14} l2={14} w={4.6} fill={PANTS_FAR} end={<Shoe />} />
        <g {...J('torso')}>
          <g transform="translate(0 -17)">
            <Limb id="ab" J={J} l1={9} l2={9} w={3.6} fill="#2e4072" end={<Hand />} />
          </g>
          <path d="M-8 -15 H-4 V-6 H-8 Q-9.5 -6 -9.5 -7.5 V-13.5 Q-9.5 -15 -8 -15 Z" fill={BLUE} stroke={INK} strokeWidth={1} />
          <TorsoShape />
          <Head J={J} />
          <g transform="translate(0 -17)" stroke={BLUE} strokeWidth={1.4} strokeLinecap="round" fill="none">
            <g {...O('wave1')}>
              <path d="M8 -10 C10.5 -8 10.5 -4.5 8 -2.5" />
            </g>
            <g {...O('wave2')}>
              <path d="M11.5 -13 C16 -9 16 -3.5 11.5 0" />
            </g>
          </g>
          <g transform="translate(0 -17)">
            <Limb id="aa" J={J} l1={9} l2={9} w={3.8} fill={TOP} end={<Hand />} />
          </g>
        </g>
        <Limb id="la" J={J} l1={14} l2={14} w={4.8} fill={PANTS_NEAR} end={<Shoe />} />
      </g>
    </>
  );
}

/* ───────────────────────── 지하철 ───────────────────────── */
const SUB_HX = 44;
const SUB_HY = 45.4;
const SUB_PIVOT = { x: 52, y: 4 };
const SUB_STRAP = 10;
const subSway = (t: number) => 2.2 * Math.sin((2 * Math.PI * t) / 2.6) + 0.7 * Math.sin((2 * Math.PI * t) / 0.95 + 1);
const subDraw: Draw = (t, set) => {
  const sway = subSway(t);
  const dx = sway * 0.9;
  const hy = SUB_HY + 0.25 * Math.sin(2 * Math.PI * 9 * t);
  const lean = 3 + sway * 0.8;
  set('root', `translate(${(SUB_HX + dx).toFixed(2)} ${hy.toFixed(2)})`);
  const plant = (id: string, base: number) => {
    const th = base + (dx / 30) / D2R;
    const kn = 3;
    set(`${id}1`, rot(th));
    set(`${id}2`, rot(kn));
    set(`${id}3`, rot(-(th + kn)));
  };
  plant('la', 5);
  plant('lb', -7);
  set('torso', rot(lean));
  set('head', rot(7 + 1.5 * Math.sin((2 * Math.PI * t) / 3.4)));
  // 손잡이는 차체보다 늦게 따라 흔들린다(겹치는 동작)
  const sa = -subSway(t - 0.35) * 2.4;
  set('strap', rot(sa, SUB_PIVOT.x, SUB_PIVOT.y));
  const ring = { x: SUB_PIVOT.x - (SUB_STRAP + 1) * Math.sin(sa * D2R), y: SUB_PIVOT.y + (SUB_STRAP + 1) * Math.cos(sa * D2R) };
  // 월드 → 몸통 로컬 → 어깨 기준
  const px = ring.x - (SUB_HX + dx);
  const py = ring.y - hy;
  const c = Math.cos(lean * D2R);
  const s = Math.sin(lean * D2R);
  const lx = px * c + py * s;
  const ly = -px * s + py * c;
  const up = ik2(10, 10, lx - 0, ly + 17, 1);
  set('aa1', rot(up.a1));
  set('aa2', rot(up.a2));
  set('aa3', rot(0));
  // 폰을 든 팔
  const ph = ik2(9, 9, 9.5, 4.5 + 0.5 * Math.sin((2 * Math.PI * t) / 1.7), -1);
  set('ab1', rot(ph.a1));
  set('ab2', rot(ph.a2));
  set('ab3', rot(-(ph.a1 + ph.a2) - lean));
  set('streak', `translate(${(-((t * 34) % 30)).toFixed(2)} 0)`);
};

function Subway({ animate }: { animate: boolean }) {
  const { J } = useRig(subDraw, animate);
  const clip = `${useId()}-win`;
  return (
    <>
      <defs>
        <clipPath id={clip}>
          <rect x={88} y={12} width={26} height={34} rx={3} />
        </clipPath>
      </defs>
      <rect x={88} y={12} width={26} height={34} rx={3} fill="#eaf0fc" stroke={INK} strokeWidth={1.3} />
      <g clipPath={`url(#${clip})`} stroke={BLUE} strokeWidth={1.3} strokeLinecap="round">
        <g {...J('streak')}>
          <path d="M92 16 V42 M122 16 V42 M152 16 V42" />
          <path d="M100 22 V36 M130 22 V36 M160 22 V36" opacity={0.5} />
        </g>
      </g>
      <path d="M4 4 H84" stroke={INK} strokeWidth={1.4} />
      <path d="M80 4 V76" stroke="#b7c0d0" strokeWidth={2.2} strokeLinecap="round" />
      <path d="M4 76 H116" stroke={INK} strokeWidth={1.3} />
      <g {...J('strap')} stroke={INK} strokeWidth={1.2} fill="none">
        <line x1={SUB_PIVOT.x} y1={SUB_PIVOT.y} x2={SUB_PIVOT.x} y2={SUB_PIVOT.y + SUB_STRAP - 1} />
        <ellipse cx={SUB_PIVOT.x} cy={SUB_PIVOT.y + SUB_STRAP + 1} rx={2.6} ry={3.4} stroke={BLUE} strokeWidth={1.5} />
      </g>
      <g {...J('root')}>
        <Limb id="lb" J={J} l1={14} l2={14} w={4.6} fill={PANTS_FAR} end={<Shoe />} />
        <g {...J('torso')}>
          <g transform="translate(0 -17)">
            <Limb id="ab" J={J} l1={9} l2={9} w={3.6} fill="#2e4072" end={<><Hand /><rect x={-1.6} y={-3.6} width={4.2} height={7.6} rx={1.1} fill="#e5e9f2" stroke={INK} strokeWidth={0.9} /></>} />
          </g>
          <TorsoShape />
          <Head J={J} />
          <g transform="translate(0 -17)">
            <Limb id="aa" J={J} l1={10} l2={10} w={3.8} fill={TOP} end={<Hand />} />
          </g>
        </g>
        <Limb id="la" J={J} l1={14} l2={14} w={4.8} fill={PANTS_NEAR} end={<Shoe />} />
      </g>
    </>
  );
}

/* ───────────────────────── 점심 10분 ───────────────────────── */
const LUNCH_HIP = { x: 34, y: 55 };
const lunchDraw: Draw = (t, set) => {
  const breathe = Math.sin((2 * Math.PI * t) / 3.8);
  const lean = 11 + 0.5 * breathe;
  set('root', `translate(${LUNCH_HIP.x} ${LUNCH_HIP.y})`);
  set('torso', `${rot(lean)} scale(1 ${(1 + 0.014 * breathe).toFixed(4)})`);
  // 가끔 고개를 들어 주위를 본다
  const u = t % 6.5;
  set('head', rot(15 - 17 * pulse(u, 4.1, 5.7) + 0.9 * Math.sin((2 * Math.PI * t) / 3.1)));
  // 다리: 의자에 앉은 자세(허벅지는 앞으로 수평, 정강이는 아래로)
  set('la1', rot(-92));
  set('la2', rot(92));
  set('la3', rot(0));
  set('lb1', rot(-90));
  set('lb2', rot(90));
  set('lb3', rot(0));
  // 손가락이 폰 화면을 쓸어 올린다
  const f = (t % 1.7) / 1.7;
  const flick = f < 0.3 ? smooth(f / 0.3) : 1 - smooth((f - 0.3) / 0.7);
  const reach = (wx: number, wy: number) => {
    const c = Math.cos(lean * D2R);
    const s = Math.sin(lean * D2R);
    const px = wx - LUNCH_HIP.x;
    const py = wy - LUNCH_HIP.y;
    return { x: px * c + py * s, y: -px * s + py * c + 17 };
  };
  const near = reach(58.5, 46.2 - 2.2 * flick);
  const k = ik2(11, 11, near.x, near.y, 1);
  set('aa1', rot(k.a1));
  set('aa2', rot(k.a2));
  set('aa3', rot(-(k.a1 + k.a2) - lean + 80));
  const far = reach(49, 46.4);
  const k2 = ik2(11, 11, far.x, far.y, 1);
  set('ab1', rot(k2.a1));
  set('ab2', rot(k2.a2));
  set('ab3', rot(0));
  set('swipe', `translate(0 ${(flick * 3 - 1.5).toFixed(2)})`);
  set('steam1', `translate(0 ${(-((t * 5) % 9)).toFixed(2)})`);
  set('steam2', `translate(0 ${(-(((t + 1.1) * 5) % 9)).toFixed(2)})`);
  set('s1', String(smooth(1 - ((t * 5) % 9) / 9)), 'opacity');
  set('s2', String(smooth(1 - (((t + 1.1) * 5) % 9) / 9)), 'opacity');
  set('clockMin', rot(t * 18, 100, 22));
};

function Lunch({ animate }: { animate: boolean }) {
  const { J, O } = useRig(lunchDraw, animate);
  return (
    <>
      <path d="M4 75 H116" stroke={INK} strokeWidth={1.3} />
      {/* 벽시계 */}
      <circle cx={100} cy={22} r={8} fill="#fff" stroke={INK} strokeWidth={1.3} />
      <path d="M100 22 V17" stroke={INK} strokeWidth={1.3} strokeLinecap="round" />
      <g {...J('clockMin')}>
        <path d="M100 22 V15.6" stroke={BLUE} strokeWidth={1.2} strokeLinecap="round" />
      </g>
      {/* 책상·의자 */}
      <path d="M46 48 H116" stroke={INK} strokeWidth={1.6} strokeLinecap="round" />
      <rect x={46} y={48} width={70} height={3} fill="#e3e9f5" stroke={INK} strokeWidth={1} />
      <path d="M112 51 V75" stroke={INK} strokeWidth={1.3} />
      <path d="M24 56 V42 M24 58 H42" stroke={INK} strokeWidth={1.6} strokeLinecap="round" />
      <path d="M33 58 V75 M26 75 H40" stroke={INK} strokeWidth={1.3} strokeLinecap="round" />
      {/* 컵과 김 */}
      <g>
        <path d="M82 48 V40.5 H92 V48" fill="#fff" stroke={INK} strokeWidth={1.2} strokeLinejoin="round" />
        <path d="M92 42 C96.5 42 96.5 47 92 47" fill="none" stroke={INK} strokeWidth={1.2} />
        <g stroke={BLUE} strokeWidth={1.3} strokeLinecap="round" fill="none">
          <g {...O('s1')}>
            <g {...J('steam1')}>
              <path d="M85.5 38 C83.5 35 88 33 86 29.5" />
            </g>
          </g>
          <g {...O('s2')}>
            <g {...J('steam2')}>
              <path d="M89.5 38 C87.5 35 92 33 90 29.5" />
            </g>
          </g>
        </g>
      </g>
      {/* 폰(책상 위) */}
      <g>
        <rect x={54} y={45.2} width={11} height={2.8} rx={1} fill="#e5e9f2" stroke={INK} strokeWidth={1} />
        <g {...J('swipe')} stroke={BLUE} strokeWidth={0.9} strokeLinecap="round">
          <path d="M56 46.6 H62" />
        </g>
      </g>
      <g {...J('root')}>
        <Limb id="lb" J={J} l1={14} l2={16} w={4.6} fill={PANTS_FAR} end={<Shoe />} />
        <g {...J('torso')}>
          <g transform="translate(0 -17)">
            <Limb id="ab" J={J} l1={11} l2={11} w={3.6} fill="#2e4072" end={<Hand />} />
          </g>
          <TorsoShape />
          <Head J={J} />
          <g transform="translate(0 -17)">
            <Limb id="aa" J={J} l1={11} l2={11} w={3.8} fill={TOP} end={<Hand />} />
          </g>
        </g>
        <Limb id="la" J={J} l1={14} l2={16} w={4.8} fill={PANTS_NEAR} end={<Shoe />} />
      </g>
    </>
  );
}

/* ───────────────────────── 자기 전 침대 ───────────────────────── */
const BED_SH = { x: 45, y: 52.5 };
// 유성 7개: 창(x 68~114, y 5~37) 오른쪽 위에서 왼쪽 아래로. 주기를 서로소에 가깝게 잡아 규칙이 보이지 않게 한다.
const METEORS = [
  { period: 2.3, off: 0.0, dur: 0.8, x: 112, y: 6, dx: 38, dy: 25 },
  { period: 3.1, off: 1.1, dur: 0.9, x: 120, y: 12, dx: 44, dy: 26 },
  { period: 2.7, off: 2.0, dur: 0.7, x: 100, y: 4, dx: 30, dy: 22 },
  { period: 3.7, off: 0.6, dur: 1.0, x: 124, y: 4, dx: 46, dy: 24 },
  { period: 2.9, off: 1.7, dur: 0.75, x: 108, y: 14, dx: 34, dy: 20 },
  { period: 4.3, off: 3.0, dur: 0.85, x: 116, y: 2, dx: 42, dy: 28 },
  { period: 3.3, off: 2.4, dur: 0.7, x: 92, y: 2, dx: 28, dy: 20 },
];
const bedDraw: Draw = (t, set) => {
  const b = Math.sin((2 * Math.PI * t) / 4.2);
  set('chest', `translate(0 58) scale(1 ${(1 + 0.03 * b).toFixed(4)}) translate(0 -58)`);
  set('blanket', `translate(0 ${(-0.6 * b).toFixed(2)})`);
  // 팔이 지치면 폰이 얼굴 쪽으로 내려왔다가 다시 올라간다
  const u = t % 9;
  const dip = 5.5 * pulse(u, 5.2, 8.2);
  const ptx = 37.5 + 0.5 * Math.sin((2 * Math.PI * t) / 3.3);
  const pty = 33.5 + dip + 0.5 * b;
  set('phone', `translate(${ptx.toFixed(2)} ${pty.toFixed(2)}) rotate(-14)`);
  const reach = (dx: number, dy: number, bend: 1 | -1) => ik2(11, 11, ptx + dx - BED_SH.x, pty + 4 + dy - BED_SH.y, bend);
  const a = reach(0, 0, -1);
  set('aa1', rot(a.a1));
  set('aa2', rot(a.a2));
  set('aa3', rot(0));
  const c = reach(1.8, 0.4, -1);
  set('ab1', rot(c.a1));
  set('ab2', rot(c.a2));
  set('ab3', rot(0));
  // 뒤척임: 주기마다 한 번 무릎이 펴졌다 접히고, 머리가 베개에서 살짝 돌아갔다 온다
  const toss = pulse(t % 7, 1.2, 3.4);
  set('knees', `translate(0 58) scale(${(1 + 0.12 * toss).toFixed(3)} ${(1 - 0.5 * toss).toFixed(3)}) translate(0 -58)`);
  set('head', rot(2 * b - 6 + 9 * toss));
  // 별똥별 비: 주기·시작점·각도·길이가 제각각인 유성 여러 개가 어긋나게 쏟아진다
  METEORS.forEach((m, i) => {
    const mu = (t + m.off) % m.period;
    const mp = mu < m.dur ? mu / m.dur : 0;
    set(`m${i}`, `translate(${(m.x - m.dx * mp).toFixed(2)} ${(m.y + m.dy * mp).toFixed(2)})`);
    set(`mo${i}`, String(mp > 0 ? Math.sin(Math.PI * mp) ** 0.7 : 0), 'opacity');
  });
  set('star3', String(0.3 + 0.7 * smooth((Math.sin((2 * Math.PI * (t + 0.4)) / 2.8) + 1) / 2)), 'opacity');
  set('star4', String(0.3 + 0.7 * smooth((Math.sin((2 * Math.PI * (t + 1.7)) / 3.6) + 1) / 2)), 'opacity');
  set('thumb', `translate(0 ${(-(((t * 1.6) % 1) * 2.4)).toFixed(2)})`);
  set('glow', String(0.2 + 0.1 * Math.sin((2 * Math.PI * t) / 2.4) + 0.04 * pulse(u, 5.2, 8.2) * 4), 'opacity');
  set('star1', String(0.35 + 0.65 * smooth((Math.sin((2 * Math.PI * t) / 2.4) + 1) / 2)), 'opacity');
  set('star2', String(0.35 + 0.65 * smooth((Math.sin((2 * Math.PI * (t + 0.9)) / 3.1) + 1) / 2)), 'opacity');
};

function Bed({ animate }: { animate: boolean }) {
  const { J, O } = useRig(bedDraw, animate);
  const gid = `${useId()}-g`;
  return (
    <>
      <defs>
        <radialGradient id={gid}>
          <stop offset="0" stopColor={BLUE} stopOpacity={0.9} />
          <stop offset="1" stopColor={BLUE} stopOpacity={0} />
        </radialGradient>
      </defs>
      {/* 큰 창: 밤하늘, 달, 반짝이는 별, 가끔 지나가는 별똥별 */}
      <defs>
        <clipPath id={`${gid}-win`}>
          <rect x={68} y={5} width={46} height={32} rx={3} />
        </clipPath>
      </defs>
      <rect x={68} y={5} width={46} height={32} rx={3} fill="#e9eefb" stroke={INK} strokeWidth={1.3} />
      <path d="M91 5 V37 M68 21 H114" stroke="#c3cde6" strokeWidth={1} />
      <g clipPath={`url(#${gid}-win)`}>
        <path d="M82 12 C77.4 13 76.4 19.6 80.8 22.2 C76.4 22.6 72.6 17.6 75 13.4 C76.4 11 79.8 10.4 82 12 Z" fill="#ffe9a8" stroke={INK} strokeWidth={0.9} />
        <g stroke={BLUE} strokeWidth={1} strokeLinecap="round">
          <g {...O('star1')}>
            <path d="M104 12 V16 M102 14 H106" />
          </g>
          <g {...O('star2')}>
            <path d="M96 27 V30 M94.5 28.5 H97.5" />
          </g>
          <g {...O('star3')}>
            <path d="M74 30 V33 M72.5 31.5 H75.5" />
          </g>
          <g {...O('star4')}>
            <path d="M108 30 V32.4 M106.8 31.2 H109.2" />
          </g>
        </g>
        {METEORS.map((_, i) => (
          <g key={i} {...O(`mo${i}`)}>
            <g {...J(`m${i}`)}>
              <path d="M0 0 L9 -6.5" stroke="#ffd86b" strokeWidth={1.5} strokeLinecap="round" />
              <path d="M0 0 L19 -13.8" stroke="#ffd86b" strokeWidth={0.7} strokeLinecap="round" opacity={0.55} />
              <circle cx={0} cy={0} r={1.5} fill="#fff7d6" stroke="#ffd86b" strokeWidth={0.6} />
            </g>
          </g>
        ))}
      </g>
      {/* 침대 */}
      <path d="M8 38 V68" stroke={INK} strokeWidth={1.6} strokeLinecap="round" />
      <rect x={8} y={58} width={108} height={6} rx={2} fill="#e3e9f5" stroke={INK} strokeWidth={1.2} />
      <path d="M12 64 V70 M112 64 V70" stroke={INK} strokeWidth={1.3} strokeLinecap="round" />
      <rect x={13} y={51.5} width={24} height={7} rx={3.2} fill="#fff" stroke={INK} strokeWidth={1.2} />
      {/* 화면 빛(얼굴·가슴에 번진다) */}
      <circle cx={37} cy={44} r={20} fill={`url(#${gid})`} {...O('glow')} />
      {/* 누운 몸 */}
      <g {...J('chest')}>
        <path d="M34 52 Q34 49.5 38 49.5 H60 V58 H38 Q34 58 34 55 Z" fill={TOP} stroke={INK} strokeWidth={1.1} strokeLinejoin="round" />
      </g>
      <g transform="translate(28.5 49.4)">
        <g {...J('head')}>
          <circle cx={0} cy={0} r={5.3} fill={SKIN} stroke={INK} strokeWidth={1} />
          <path d="M-5.2 0.6 C-6.2 -4.6 -0.4 -6.4 3 -4.6 C0.6 -3.8 -1.4 -2.2 -1.6 0.2 C-2.6 2.8 -4.4 3.2 -5.2 0.6 Z" fill={HAIR} stroke={INK} strokeWidth={0.8} strokeLinejoin="round" />
        </g>
      </g>
      {/* 이불 */}
      <g {...J('blanket')}>
        {/* 무릎이 솟은 부분은 따로 움직인다 — 가끔 뒤척이면 무릎이 펴지며 낮아졌다가 다시 접힌다 */}
        <g {...J('knees')}>
          <path d="M70 52 Q76 38.6 87 40.6 Q96.6 42.6 100 54 Z" fill="#dfe8fb" stroke={INK} strokeWidth={1.2} strokeLinejoin="round" />
        </g>
        <path d="M54 58 V51 Q56 47 62 47.6 L74 49 Q86 50 100 53 L108 54 Q112.6 55.4 112.6 58 Z" fill="#dfe8fb" stroke={INK} strokeWidth={1.2} strokeLinejoin="round" />
        <path d="M60 53.6 Q70 52 80 55" fill="none" stroke="#b8c8ec" strokeWidth={1.1} strokeLinecap="round" />
      </g>
      {/* 팔(먼 쪽 → 폰 → 가까운 쪽) */}
      <g transform={`translate(${BED_SH.x} ${BED_SH.y})`}>
        <Limb id="ab" J={J} l1={11} l2={11} w={3.4} fill="#2e4072" end={<Hand />} />
      </g>
      <g {...J('phone')}>
        <rect x={-2.8} y={-5} width={5.6} height={9.6} rx={1.3} fill="#e5e9f2" stroke={INK} strokeWidth={1} />
        <g {...J('thumb')} stroke={BLUE} strokeWidth={0.9} strokeLinecap="round">
          <path d="M-1.4 -1.4 H1.4 M-1.4 1 H0.8" />
        </g>
      </g>
      <g transform={`translate(${BED_SH.x} ${BED_SH.y})`}>
        <Limb id="aa" J={J} l1={11} l2={11} w={3.6} fill={TOP} end={<Hand />} />
      </g>
    </>
  );
}

export function MomentArt({ id, size = 112 }: { id: Moment['id']; size?: number }) {
  const reduced = useSyncExternalStore(subscribe, prefersReduced, () => true);
  const animate = !reduced;
  return (
    <svg viewBox="0 0 120 80" width={size} height={(size * 80) / 120} fill="none" aria-hidden style={{ flexShrink: 0, display: 'block', overflow: 'hidden' }}>
      {id === 'lunch' && <Lunch animate={animate} />}
      {id === 'commute-home' && <Subway animate={animate} />}
      {id === 'walk' && <Walk animate={animate} />}
      {id === 'bed' && <Bed animate={animate} />}
    </svg>
  );
}

/** 움직임 줄이기 설정이 아니면 true — 다른 장면 그림(GlanceArt)도 같은 규칙을 쓴다. */
export function useAnimate() {
  return !useSyncExternalStore(subscribe, prefersReduced, () => true);
}
