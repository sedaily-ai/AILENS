import { describe, expect, it } from 'vitest';
import { applyChoice } from './optimisticVote';

describe('applyChoice', () => {
  it('이미 투표한 상태에서 바꾸면 이전 보기 -1, 새 보기 +1', () => {
    expect(applyChoice({ my_choice: 'o1', counts: { o1: 3, o2: 5 } }, 'o2')).toEqual({ my_choice: 'o2', counts: { o1: 2, o2: 6 } });
  });
  it('같은 보기이거나 집계를 모르는 첫 투표면 그대로', () => {
    const same = { my_choice: 'o1', counts: { o1: 3 } };
    expect(applyChoice(same, 'o1')).toBe(same);
    const first = { my_choice: null, counts: null };
    expect(applyChoice(first, 'o1')).toBe(first);
  });
  it('집계가 0 아래로 내려가지 않는다', () => {
    expect(applyChoice({ my_choice: 'o1', counts: { o1: 0 } }, 'o2').counts).toEqual({ o1: 0, o2: 1 });
  });
});
