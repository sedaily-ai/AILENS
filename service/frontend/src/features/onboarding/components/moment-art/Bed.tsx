'use client';

import { BLUE, Draw, HAIR, Hand, INK, Limb, SKIN, TOP, ik2, pulse, rot, smooth, useRig } from "./rig";
import { useId } from "react";



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

export function Bed({ animate }: { animate: boolean }) {
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
