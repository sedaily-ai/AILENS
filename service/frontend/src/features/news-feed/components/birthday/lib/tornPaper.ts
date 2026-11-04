// 그날 신문 카드의 '찢어 낸 신문 조각' 가장자리. 화면 요소를 모르는 순수 함수라 시험으로 확인한다.
// 같은 시드(생일 날짜)는 늘 같은 모양이다 — 카드를 다시 그려도(글꼴·사진이 도착해 다시 그릴 때) 가장자리가 바뀌지 않는다.

/** 작은 난수 생성기(mulberry32). 시드가 같으면 같은 수열을 낸다. */
export function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 가장자리를 이루는 점 사이 간격(px). 이보다 촘촘하면 톱니처럼, 성기면 둥글게 보인다. */
export const TORN_STEP = 12;

/**
 * 가장자리 하나의 굴곡 — 천천히 변하는 굵은 물결(찢긴 방향이 휘는 느낌)에 잔 거스러미를 더한다. 값은 모두 -amp ~ amp 안이다.
 * 점은 TORN_STEP 간격으로 length를 덮는다(양 끝 포함).
 */
export function tornEdge(random: () => number, length: number, amp: number): number[] {
  const count = Math.max(1, Math.ceil(length / TORN_STEP)) + 1;
  const anchorEvery = 7;
  const anchors = Array.from({ length: Math.ceil(count / anchorEvery) + 2 }, () => (random() * 2 - 1) * amp * 0.75);
  return Array.from({ length: count }, (_, index) => {
    const position = index / anchorEvery;
    const base = Math.floor(position);
    const fraction = position - base;
    const eased = fraction * fraction * (3 - 2 * fraction);
    const coarse = anchors[base] * (1 - eased) + anchors[base + 1] * eased;
    const fine = (random() * 2 - 1) * amp * 0.25;
    return coarse + fine;
  });
}

export interface TornBox { x: number; y: number; width: number; height: number }
/** 변마다 흔들리는 폭(px). 아래가 가장 크다 — 위에서 아래로 찢어 내린 느낌. */
export interface TornAmplitude { top: number; side: number; bottom: number }
export const TORN_AMPLITUDE: TornAmplitude = { top: 8, side: 6, bottom: 14 };

/**
 * 네 변을 모두 찢은 조각의 둘레 점들(시계 방향, 닫힌 도형). grow는 바깥으로 밀어내는 폭이다 —
 * 같은 상자를 다른 시드로 grow만큼 크게 한 번 더 뽑아 뒤에 깔면 종이 속살이 삐져나온 가장자리가 된다.
 */
export function tornOutline(box: TornBox, seed: number, amplitude: TornAmplitude = TORN_AMPLITUDE, grow = 0): Array<[number, number]> {
  const random = seededRandom(seed);
  const top = tornEdge(random, box.width, amplitude.top);
  const right = tornEdge(random, box.height, amplitude.side);
  const bottom = tornEdge(random, box.width, amplitude.bottom);
  const left = tornEdge(random, box.height, amplitude.side);
  const { x, y, width, height } = box;
  const points: Array<[number, number]> = [];
  top.forEach((offset, index) => points.push([Math.min(x + index * TORN_STEP, x + width), y - grow + offset]));
  right.forEach((offset, index) => points.push([x + width + grow + offset, Math.min(y + index * TORN_STEP, y + height)]));
  bottom.forEach((offset, index) => points.push([Math.max(x + width - index * TORN_STEP, x), y + height + grow + offset]));
  left.forEach((offset, index) => points.push([x - grow + offset, Math.max(y + height - index * TORN_STEP, y)]));
  return points;
}

/** 위·양옆은 반듯하고 아래만 찢은 둘레(사진을 신문 한 면에서 찢어 낸 모양). */
export function tornBottomOutline(box: TornBox, seed: number, amp: number): Array<[number, number]> {
  const bottom = tornEdge(seededRandom(seed), box.width, amp);
  const { x, y, width, height } = box;
  const points: Array<[number, number]> = [[x, y], [x + width, y]];
  bottom.forEach((offset, index) => points.push([Math.max(x + width - index * TORN_STEP, x), y + height + offset]));
  return points;
}

/** 날짜(YYYY-MM-DD)에서 시드를 만든다 — 날짜가 같으면 카드 모양도 같다. */
export const tornSeed = (year: number, month: number, day: number) => year * 10000 + month * 100 + day;
