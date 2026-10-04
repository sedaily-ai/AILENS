'use client';

import { useId } from 'react';
import type { GlanceId } from '../lib/moments';
import { BLUE, INK, pulse, smooth, useAnimate, useRig, type SetFn } from './MomentArt';

// 질문 2 선택지 그림 — "화면에서 눈이 먼저 가는 곳"을 보여 준다(2026-10-04).
// 뉴스 화면 하나에 그 요소만 파랗게 살아 움직이게 한다: 글은 읽는 형광펜이 줄을 따라가고,
// 그림·영상은 재생 버튼에서 물결이 퍼지고, 소리는 이퀄라이저가 뛴다. 움직임 엔진은 MomentArt와 같다(useRig).
// 움직임 줄이기 설정이면 한 프레임(정지 그림)만 그린다.
const FRAME = { x: 10, y: 6, w: 100, h: 68 };
const GRAY = '#b4bdcc';

const Frame = () => <rect x={FRAME.x} y={FRAME.y} width={FRAME.w} height={FRAME.h} rx={6} fill="#ffffff" stroke={INK} strokeWidth={1.4} />;

/* ───── 제목과 글 ───── */
const LINE_Y = [28, 36, 44, 52, 60];
const LINE_W = [76, 70, 76, 58, 68];
const textDraw = (t: number, set: SetFn) => {
  const T = 6;
  const pos = ((t % T) / T) * 5;
  const k = Math.min(4, Math.floor(pos));
  const frac = pos - k;
  set('hl', `translate(18 ${LINE_Y[k]}) scale(${(frac * LINE_W[k] / 76).toFixed(3)} 1)`);
  LINE_Y.forEach((_, i) => set(`l${i}`, String(i < k ? 1 : i === k ? 0.85 : 0.45), 'opacity'));
  set('title', String(1), 'opacity');
};
function Text() {
  const { J, O } = useRig(textDraw, useAnimate());
  return (
    <>
      <Frame />
      <path d="M18 14 H66" stroke={INK} strokeWidth={3} strokeLinecap="round" />
      <path d="M18 20 H44" stroke={INK} strokeWidth={2} strokeLinecap="round" />
      <g {...J('hl')}>
        <rect x={0} y={-3} width={76} height={6} rx={2} fill={BLUE} opacity={0.3} />
      </g>
      {LINE_Y.map((y, i) => (
        <g key={i} {...O(`l${i}`)}>
          <path d={`M18 ${y} H${18 + LINE_W[i]}`} stroke={INK} strokeWidth={1.8} strokeLinecap="round" />
        </g>
      ))}
    </>
  );
}

/* ───── 그림과 사진(웹툰 컷) ───── */
// 실제 AI LENS 웹툰처럼: 일러스트 컷 아래에 검은 자막 띠, 컷 사이는 흰 여백. 사진 컷에는 뷰파인더 모서리와 셔터 플래시가 나온다.
// 컷이 한 칸씩 위로 넘어가고, 마지막은 첫 컷의 복사본이라 끊김 없이 이어진다.
const PANEL_H = 28;
const PANEL_STEP = 31;
const IMG_H = 21;
const comicDraw = (t: number, set: SetFn) => {
  const pos = (t / 2.6) % 3;
  const k = Math.floor(pos);
  const frac = pos - k;
  set('strip', `translate(0 ${(-PANEL_STEP * (k + smooth(frac / 0.3))).toFixed(2)})`);
  // 사진 컷(2번째)이 올라온 직후 셔터 플래시
  const flash = k === 0 ? pulse(frac, 0.34, 0.58) : 0;
  set('flash', String(0.85 * flash), 'opacity');
};
const Caption = ({ w = [40, 24] }: { w?: number[] }) => (
  <>
    <rect x={0} y={IMG_H} width={84} height={PANEL_H - IMG_H} fill="#111827" />
    <path d={`M5 ${IMG_H + 2.4} H${5 + w[0]}`} stroke="#fff" strokeWidth={1.4} strokeLinecap="round" />
    <path d={`M5 ${IMG_H + 5} H${5 + w[1]}`} stroke="#fff" strokeWidth={1.4} strokeLinecap="round" opacity={0.7} />
    <path d={`M${5 + w[1] - 9} ${IMG_H + 5} h${9}`} stroke={BLUE} strokeWidth={1.4} strokeLinecap="round" />
  </>
);
const Person = ({ x, y, s = 1, shirt = '#3b5189' }: { x: number; y: number; s?: number; shirt?: string }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`}>
    <path d="M-9 14 C-9 7 -4.5 4.6 0 4.6 C4.5 4.6 9 7 9 14 Z" fill={shirt} stroke={INK} strokeWidth={1.1} strokeLinejoin="round" />
    <circle cx={0} cy={-1.4} r={5.6} fill="#f2d3b6" stroke={INK} strokeWidth={1.1} />
    <path d="M-5.6 -2.4 C-6.4 -8 1.4 -9.4 5.4 -5.6 C2.6 -5.6 0.2 -4.8 -0.8 -2 C-1.8 0.2 -4.4 0.2 -5.6 -2.4 Z" fill="#2b2f3a" stroke={INK} strokeWidth={0.8} strokeLinejoin="round" />
  </g>
);
const Bubble = ({ x, y }: { x: number; y: number }) => (
  <g>
    <ellipse cx={x} cy={y} rx={19} ry={7.4} fill="#fff" stroke={INK} strokeWidth={1.1} />
    <path d={`M${x - 14} ${y + 4.4} L${x - 20} ${y + 9.4} L${x - 8} ${y + 6.8} Z`} fill="#fff" stroke={INK} strokeWidth={1.1} strokeLinejoin="round" />
    <path d={`M${x - 10} ${y - 2.4} H${x + 11} M${x - 8} ${y + 2} H${x + 5}`} stroke={GRAY} strokeWidth={1.4} strokeLinecap="round" />
  </g>
);
function IllustPanel({ y }: { y: number }) {
  return (
    <g transform={`translate(18 ${y})`}>
      <rect x={0} y={0} width={84} height={IMG_H} fill="#fff1cf" />
      <Person x={24} y={6} s={1.05} />
      <Bubble x={58} y={9} />
      <Caption />
    </g>
  );
}
function PhotoPanel({ y, flash }: { y: number; flash?: object }) {
  return (
    <g transform={`translate(18 ${y})`}>
      <rect x={0} y={0} width={84} height={IMG_H} fill="#c9dcff" />
      <circle cx={68} cy={7} r={4} fill="#ffe08a" stroke={INK} strokeWidth={0.9} />
      <rect x={0} y={15} width={84} height={6} fill="#9fb4d9" />
      {[5, 15, 27, 40, 53, 66].map((x, i) => (
        <rect key={x} x={x} y={8 - (i % 3) * 2.4} width={9} height={13 + (i % 3) * 2.4} fill={i % 2 ? '#6f86b3' : '#8097c2'} stroke={INK} strokeWidth={0.8} />
      ))}
      {/* 뷰파인더 모서리 */}
      <path d="M4 8 V4 H8 M76 4 H80 V8 M80 14 V18 H76 M8 18 H4 V14" stroke="#fff" strokeWidth={1.3} strokeLinecap="round" fill="none" />
      <circle cx={79} cy={4.2} r={1.3} fill="#ef4444" />
      {flash ? (
        <g {...flash}>
          <rect x={0} y={0} width={84} height={IMG_H} fill="#ffffff" />
        </g>
      ) : null}
      <Caption w={[34, 28]} />
    </g>
  );
}
function BoardPanel({ y }: { y: number }) {
  return (
    <g transform={`translate(18 ${y})`}>
      <rect x={0} y={0} width={84} height={IMG_H} fill="#e6efff" />
      <rect x={42} y={3} width={34} height={15} rx={2} fill="#fff" stroke={INK} strokeWidth={1.1} />
      {[47, 54, 61, 68].map((x, i) => (
        <rect key={x} x={x} y={15 - [5, 8, 6, 11][i]} width={4} height={[5, 8, 6, 11][i]} fill={i === 3 ? BLUE : '#cfdcf7'} stroke={INK} strokeWidth={0.8} />
      ))}
      <Person x={20} y={5} s={0.95} shirt="#2e7d6b" />
      <path d="M28 12 L40 9" stroke={INK} strokeWidth={2.2} strokeLinecap="round" />
      <Caption w={[44, 18]} />
    </g>
  );
}
function Comic() {
  const { J, O } = useRig(comicDraw, useAnimate());
  const clip = `${useId()}-cm`;
  return (
    <>
      <defs>
        <clipPath id={clip}>
          <rect x={FRAME.x + 4} y={FRAME.y + 3} width={FRAME.w - 8} height={FRAME.h - 6} rx={3} />
        </clipPath>
      </defs>
      <Frame />
      <g clipPath={`url(#${clip})`}>
        <g {...J('strip')}>
          {[0, 1, 2, 3, 4].map((n) => {
            const y = 9 + n * PANEL_STEP;
            const kind = n % 3;
            return (
              <g key={n}>
                {kind === 0 ? <IllustPanel y={y} /> : kind === 1 ? <PhotoPanel y={y} flash={n === 1 ? O('flash') : undefined} /> : <BoardPanel y={y} />}
                <rect x={18} y={y} width={84} height={PANEL_H} fill="none" stroke={INK} strokeWidth={1.3} />
              </g>
            );
          })}
        </g>
      </g>
    </>
  );
}

/* ───── 영상 ───── */
// 실제 AI LENS 영상처럼 짙은 네이비 화면에서 컷이 넘어간다: 큰 숫자 → 막대그래프 → 도넛, 아래엔 말하는 자막.
const NAVY = '#0f1a2e';
const CUT_T = 2.4;
const videoDraw = (t: number, set: SetFn) => {
  const pos = (t / CUT_T) % 3;
  const c = Math.floor(pos);
  const f = pos - c;
  const fade = smooth(f / 0.12) * (1 - smooth((f - 0.86) / 0.14));
  [0, 1, 2].forEach((i) => set(`cut${i}`, String(i === c ? fade : 0), 'opacity'));
  // 컷 0: 큰 숫자 아래 밑줄이 그어진다
  set('ul', `translate(40 0) scale(${smooth(f / 0.5).toFixed(3)} 1)`);
  // 컷 1: 막대가 차례로 자란다
  [0, 1, 2, 3].forEach((i) => set(`vb${i}`, `translate(0 46) scale(1 ${Math.max(0.001, smooth((f - i * 0.1) / 0.45)).toFixed(3)}) translate(0 -46)`));
  // 컷 2: 도넛이 시계 방향으로 채워진다
  set('arc', String(100 - 72 * smooth(f / 0.7)), 'stroke-dashoffset');
  // 말하는 듯한 자막 길이
  set('cap1', `translate(24 0) scale(${(0.7 + 0.3 * Math.abs(Math.sin(t * 5.1))).toFixed(3)} 1)`);
  set('cap2', `translate(24 0) scale(${(0.45 + 0.35 * Math.abs(Math.sin(t * 3.7 + 1))).toFixed(3)} 1)`);
  set('prog', `translate(18 0) scale(${((t / 7.2) % 1).toFixed(3)} 1)`);
};
function Video() {
  const { J, O, A } = useRig(videoDraw, useAnimate());
  const clip = `${useId()}-vd`;
  return (
    <>
      <defs>
        <clipPath id={clip}>
          <rect x={18} y={13} width={84} height={44} rx={3} />
        </clipPath>
      </defs>
      <Frame />
      <rect x={18} y={13} width={84} height={44} rx={3} fill={NAVY} />
      <g clipPath={`url(#${clip})`}>
        <g {...O('cut0')}>
          <text x={60} y={37} textAnchor="middle" fontSize={19} fontWeight={800} fill="#ffffff" style={{ fontFamily: 'system-ui, sans-serif' }}>
            184<tspan fontSize={9} fill={BLUE}>개사</tspan>
          </text>
          <g {...J('ul')}>
            <rect x={0} y={40} width={40} height={2} rx={1} fill={BLUE} />
          </g>
        </g>
        <g {...O('cut1')}>
          <path d="M30 46 H90" stroke="#3a4a6b" strokeWidth={1} />
          {[34, 46, 58, 70].map((x, i) => (
            <g key={x} {...J(`vb${i}`)}>
              <rect x={x} y={46 - [10, 17, 13, 24][i]} width={8} height={[10, 17, 13, 24][i]} rx={1.2} fill={i === 3 ? BLUE : '#cfdcf7'} />
            </g>
          ))}
        </g>
        <g {...O('cut2')}>
          <circle cx={60} cy={30} r={11} fill="none" stroke="#2a3a5c" strokeWidth={5} />
          <circle cx={60} cy={30} r={11} fill="none" stroke={BLUE} strokeWidth={5} strokeLinecap="round" pathLength={100} strokeDasharray="100" transform="rotate(-90 60 30)" {...A('arc', 'stroke-dashoffset', 'strokeDashoffset')} />
        </g>
        {/* 자막 띠 */}
        <rect x={18} y={46} width={84} height={11} fill="#000000" opacity={0.45} />
        <g {...J('cap1')}>
          <rect x={0} y={48.2} width={52} height={2} rx={1} fill="#ffffff" />
        </g>
        <g {...J('cap2')}>
          <rect x={0} y={52.2} width={40} height={2} rx={1} fill="#ffffff" opacity={0.7} />
        </g>
      </g>
      <path d="M18 63 H102" stroke="#dde3ee" strokeWidth={2} strokeLinecap="round" />
      <g {...J('prog')}>
        <rect x={0} y={61.8} width={84} height={2.4} rx={1.2} fill={BLUE} />
      </g>
      <path d="M18 69 H44" stroke={GRAY} strokeWidth={1.6} strokeLinecap="round" />
    </>
  );
}

/* ───── 소리 ───── */
const BARS = 9;
const soundDraw = (t: number, set: SetFn) => {
  for (let i = 0; i < BARS; i += 1) {
    const h = 0.25 + 0.75 * Math.abs(Math.sin(2 * Math.PI * (t * 0.85 + i * 0.37) + Math.sin(t * 1.3 + i)));
    set(`e${i}`, `translate(0 33) scale(1 ${h.toFixed(3)}) translate(0 -33)`);
  }
  const p = (t % 9) / 9;
  set('prog', `translate(18 0) scale(${p.toFixed(3)} 1)`);
  set('knob', `translate(${(18 + 84 * p).toFixed(2)} 0)`);
  set('disc', `translate(33 31) rotate(${((t * 40) % 360).toFixed(1)})`);
};
function Sound() {
  const { J } = useRig(soundDraw, useAnimate());
  return (
    <>
      <Frame />
      <g {...J('disc')}>
        <circle cx={0} cy={0} r={15} fill="#dbe5fb" stroke={INK} strokeWidth={1.3} />
        <circle cx={0} cy={0} r={5} fill="#ffffff" stroke={INK} strokeWidth={1.1} />
        <path d="M-10 -4 A11 11 0 0 1 -2 -10" fill="none" stroke={BLUE} strokeWidth={1.6} strokeLinecap="round" />
      </g>
      {Array.from({ length: BARS }, (_, i) => (
        <g key={i} {...J(`e${i}`)}>
          <rect x={56 + i * 5.2} y={21} width={3.2} height={24} rx={1.6} fill={i % 3 === 1 ? BLUE : '#9db8f2'} />
        </g>
      ))}
      <path d="M18 56 H102" stroke="#dde3ee" strokeWidth={2} strokeLinecap="round" />
      <g {...J('prog')}>
        <rect x={0} y={54.8} width={84} height={2.4} rx={1.2} fill={BLUE} />
      </g>
      <g {...J('knob')}>
        <circle cx={0} cy={56} r={3} fill="#fff" stroke={BLUE} strokeWidth={1.4} />
      </g>
      <path d="M18 66 H36 M84 66 H102" stroke={GRAY} strokeWidth={1.6} strokeLinecap="round" />
    </>
  );
}

export function GlanceArt({ id, size = 112 }: { id: GlanceId; size?: number }) {
  return (
    <svg viewBox="0 0 120 80" width={size} height={(size * 80) / 120} fill="none" aria-hidden style={{ flexShrink: 0, display: 'block', overflow: 'hidden' }}>
      {id === 'text' && <Text />}
      {id === 'comic' && <Comic />}
      {id === 'video' && <Video />}
      {id === 'sound' && <Sound />}
    </svg>
  );
}
