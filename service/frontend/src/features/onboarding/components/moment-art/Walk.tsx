'use client';

import { BLUE, Draw, Hand, Head, INK, Limb, PANTS_FAR, PANTS_NEAR, Shoe, TOP, TorsoShape, rot, smooth, useRig } from "./rig";



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

export function Walk({ animate }: { animate: boolean }) {
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
