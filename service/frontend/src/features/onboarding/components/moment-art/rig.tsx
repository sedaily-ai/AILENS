'use client';

import { useRef, useMemo, useEffect, ReactNode } from "react";

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
export const SKIN = '#f2d3b6';
export const HAIR = '#2b2f3a';
export const TOP = '#3b5189';
export const PANTS_NEAR = '#8d97a8';
export const PANTS_FAR = '#aab2c0';
export const STILL_T = 0.3;
export const D2R = Math.PI / 180;

export type SetFn = (key: string, value: string, attr?: string) => void;
export type Draw = (t: number, set: SetFn) => void;

export function subscribe(cb: () => void) {
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
}
export const prefersReduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const smooth = (x: number) => {
  const c = clamp(x, 0, 1);
  return c * c * (3 - 2 * c);
};
/** 주기 안에서 [from, to] 구간에만 0→1→0로 부드럽게 솟는 펄스. */
export const pulse = (u: number, from: number, to: number) => (u > from && u < to ? Math.sin((Math.PI * (u - from)) / (to - from)) ** 2 : 0);

/** 2관절 역기구학 — 어깨 원점 기준 목표(tx,ty)에 손이 닿는 (어깨각, 팔꿈치각)[도]. 각도 0 = 팔이 아래로 늘어진 상태, 양수 = 시계 방향. */
export function ik2(l1: number, l2: number, tx: number, ty: number, bend: 1 | -1) {
  const d = clamp(Math.hypot(tx, ty), Math.abs(l1 - l2) + 0.05, l1 + l2 - 0.05);
  const a0 = Math.atan2(-tx, ty);
  const A = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
  const B = Math.acos(clamp((l1 * l1 + l2 * l2 - d * d) / (2 * l1 * l2), -1, 1));
  return { a1: (a0 + bend * A) / D2R, a2: (-bend * (Math.PI - B)) / D2R };
}

export const rot = (deg: number, cx = 0, cy = 0) => `rotate(${deg.toFixed(2)} ${cx} ${cy})`;

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

export type JFn = ReturnType<typeof useRig>['J'];

export function Seg({ len, w, fill }: { len: number; w: number; fill: string }) {
  return (
    <>
      <line x1={0} y1={0} x2={0} y2={len} stroke={INK} strokeWidth={w + 1.5} strokeLinecap="round" />
      <line x1={0} y1={0} x2={0} y2={len} stroke={fill} strokeWidth={w} strokeLinecap="round" />
    </>
  );
}

/** 두 마디 팔다리. end가 있으면 끝(손·발)에 붙는다. 관절 키: `${id}1`(어깨/고관절), `${id}2`(팔꿈치/무릎), `${id}3`(손목/발목). */
export function Limb({ id, J, l1, l2, w, fill, end }: { id: string; J: JFn; l1: number; l2: number; w: number; fill: string; end?: ReactNode }) {
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

export const Shoe = () => <path d="M-2.4 -0.8 H3 L6.8 1.4 Q7.8 2.6 6.5 2.6 H-2.4 Z" fill={INK} stroke={INK} strokeWidth={0.6} strokeLinejoin="round" />;
export const Hand = () => <circle cx={0} cy={0.6} r={1.9} fill={SKIN} stroke={INK} strokeWidth={0.9} />;

export function Head({ J, id = 'head' }: { J: JFn; id?: string }) {
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

export const TorsoShape = ({ fill = TOP }: { fill?: string }) => (
  <>
    <path d="M-4.4 -17 Q0 -18.8 4.4 -17 L5.2 -1.6 Q0 0.9 -5.2 -1.6 Z" fill={fill} stroke={INK} strokeWidth={1} strokeLinejoin="round" />
    <path d="M-5.4 -2.4 H5.4 L5.8 2 H-5.8 Z" fill={PANTS_NEAR} stroke={INK} strokeWidth={1} strokeLinejoin="round" />
  </>
);
