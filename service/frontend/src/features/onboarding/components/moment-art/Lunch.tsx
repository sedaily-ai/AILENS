'use client';

import { BLUE, D2R, Draw, Hand, Head, INK, Limb, PANTS_FAR, PANTS_NEAR, Shoe, TOP, TorsoShape, ik2, pulse, rot, smooth, useRig } from "./rig";



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

export function Lunch({ animate }: { animate: boolean }) {
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
