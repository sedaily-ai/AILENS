'use client';

import { useSyncExternalStore } from 'react';
import type { Moment } from '../lib/moments';
import { subscribe, prefersReduced } from "./moment-art/rig";
import { Walk } from "./moment-art/Walk";
import { Subway } from "./moment-art/Subway";
import { Lunch } from "./moment-art/Lunch";
import { Bed } from "./moment-art/Bed";

// 장면 일러스트 4종 — 관절(뼈대)을 가진 인물을 시간 함수로 움직인다.
// 걷기는 접촉·낮아짐·교차·올라감 네 포즈에 엉덩이 상하 흔들림, 무릎 굽힘, 팔의 엇박자가 있어야 자연스러우므로, 중첩된 <g transform>으로 순기구학(FK)을 구성하고 매 프레임 각도만 갱신한다(Lottie/Rive는 에디터가 필요해 코드만으로 만들 수 없다).
// 손이 손잡이·폰에 닿는 동작은 2관절 역기구학(ik2)으로 푼다.
// 얼굴 없는 면 채색 인물 + 얇은 외곽선이며, 파란색(#5b8def)은 "움직임·빛·소리"에만 쓴다. 움직임 줄이기 설정이면 한 프레임(STILL_T)만 그려 정지 그림이 된다.
/* ───────────────────────── 걷기 ───────────────────────── */
/* ───────────────────────── 지하철 ───────────────────────── */
/* ───────────────────────── 점심 10분 ───────────────────────── */
/* ───────────────────────── 자기 전 침대 ───────────────────────── */
// 유성 7개: 창(x 68~114, y 5~37) 오른쪽 위에서 왼쪽 아래로. 주기를 서로소에 가깝게 잡아 규칙이 보이지 않게 한다.

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

export { INK, BLUE, pulse, smooth, useRig } from "./moment-art/rig";
export type { SetFn } from "./moment-art/rig";
