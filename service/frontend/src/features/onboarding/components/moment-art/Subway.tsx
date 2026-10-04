'use client';

import { BLUE, D2R, Draw, Hand, Head, INK, Limb, PANTS_FAR, PANTS_NEAR, Shoe, TOP, TorsoShape, ik2, rot, useRig } from "./rig";
import { useId } from "react";



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

export function Subway({ animate }: { animate: boolean }) {
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
