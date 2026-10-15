import { describe, expect, it } from 'vitest';
import { toShares } from './distribution';

const row = (text: number, comic: number, sound: number, video: number) => ({ text, comic, sound, video });

describe('toShares', () => {
  it('표본 부족·실패면 null', () => {
    expect(toShares(null)).toBeNull();
    expect(toShares({ total: 3, ready: false, min_sample: 50, counts: null })).toBeNull();
  });

  it('상황·보는 방식 비중을 각각 합 100으로 만든다', () => {
    const s = toShares({
      total: 60,
      ready: true,
      min_sample: 50,
      counts: { lunch: row(10, 5, 0, 5), 'commute-home': row(5, 10, 0, 5), walk: row(0, 0, 10, 0), bed: row(0, 0, 0, 10) },
    });
    expect(s).not.toBeNull();
    expect(s!.situation).toEqual({ lunch: 33, 'commute-home': 33, walk: 17, bed: 17 });
    expect(Object.values(s!.situation).reduce((a, b) => a + b, 0)).toBe(100);
    expect(s!.glance).toEqual({ text: 25, comic: 25, sound: 17, video: 33 });
  });
});
