import { expect, test } from 'vitest';
import { TORN_AMPLITUDE, TORN_STEP, seededRandom, tornBottomOutline, tornEdge, tornOutline, tornSeed } from './tornPaper';

const box = { x: 96, y: 470, width: 888, height: 980 };

test('같은 시드는 늘 같은 수열을, 다른 시드는 다른 수열을 낸다', () => {
  const first = Array.from({ length: 5 }, seededRandom(19960601));
  expect(Array.from({ length: 5 }, seededRandom(19960601))).toEqual(first);
  expect(Array.from({ length: 5 }, seededRandom(19960602))).not.toEqual(first);
  expect(first.every(value => value >= 0 && value < 1)).toBe(true);
});

test('가장자리 굴곡은 폭 안에 있고 점이 길이를 덮으며 반듯하지 않다', () => {
  const edge = tornEdge(seededRandom(1), 888, 14);
  expect(edge).toHaveLength(Math.ceil(888 / TORN_STEP) + 1);
  expect(Math.max(...edge.map(Math.abs))).toBeLessThanOrEqual(14);
  // 직선이면 모든 값이 같다. 찢긴 모양은 값이 꽤 흔들린다.
  expect(Math.max(...edge) - Math.min(...edge)).toBeGreaterThan(6);
  // 이웃한 점의 차이는 굵은 물결 + 잔 거스러미 수준이라 한 번에 폭 전체를 뛰지 않는다.
  const jumps = edge.slice(1).map((value, index) => Math.abs(value - edge[index]));
  expect(Math.max(...jumps)).toBeLessThan(14);
});

test('찢은 조각의 둘레는 닫힌 도형이고 상자 둘레 가까이에 머문다', () => {
  const outline = tornOutline(box, tornSeed(1996, 6, 1));
  const { top, side, bottom } = TORN_AMPLITUDE;
  for (const [x, y] of outline) {
    expect(x).toBeGreaterThanOrEqual(box.x - side);
    expect(x).toBeLessThanOrEqual(box.x + box.width + side);
    expect(y).toBeGreaterThanOrEqual(box.y - top);
    expect(y).toBeLessThanOrEqual(box.y + box.height + bottom);
  }
  // 네 변을 모두 지난다: 위 가장자리 근처, 아래 가장자리 근처의 점이 모두 있다.
  expect(outline.some(([, y]) => y < box.y + top)).toBe(true);
  expect(outline.some(([, y]) => y > box.y + box.height - bottom)).toBe(true);
  expect(outline.some(([x]) => x < box.x + side)).toBe(true);
  expect(outline.some(([x]) => x > box.x + box.width - side)).toBe(true);
});

test('같은 날짜는 같은 모양, 다른 날짜는 다른 모양이다', () => {
  const june1 = tornOutline(box, tornSeed(1996, 6, 1));
  expect(tornOutline(box, tornSeed(1996, 6, 1))).toEqual(june1);
  expect(tornOutline(box, tornSeed(1996, 6, 2))).not.toEqual(june1);
});

test('grow만큼 키운 뒷장은 같은 시드로 뽑으면 앞장을 사방으로 감싼다', () => {
  const front = tornOutline(box, 7);
  const back = tornOutline(box, 7, TORN_AMPLITUDE, 5);
  expect(back).toHaveLength(front.length);
  // 같은 시드라 같은 굴곡이므로 점마다 바깥쪽으로 정확히 grow만큼 나가 있다(위·왼쪽은 -, 아래·오른쪽은 +).
  const topIndex = 3;
  expect(back[topIndex][1]).toBeCloseTo(front[topIndex][1] - 5, 6);
  const bottomIndex = front.length - Math.ceil(box.height / TORN_STEP) - 1 - 3;
  expect(back[bottomIndex][1]).toBeCloseTo(front[bottomIndex][1] + 5, 6);
});

test('사진은 아래만 찢는다 — 위와 양옆은 반듯하다', () => {
  const photo = { x: 136, y: 502, width: 808, height: 264 };
  const outline = tornBottomOutline(photo, tornSeed(1996, 6, 1), 8);
  expect(outline[0]).toEqual([136, 502]);
  expect(outline[1]).toEqual([944, 502]);
  const bottomEdge = outline.slice(2);
  expect(bottomEdge.every(([x]) => x >= 136 && x <= 944)).toBe(true);
  expect(bottomEdge.every(([, y]) => Math.abs(y - (502 + 264)) <= 8)).toBe(true);
  expect(bottomEdge[0][0]).toBe(944);
  expect(bottomEdge[bottomEdge.length - 1][0]).toBe(136);
});
