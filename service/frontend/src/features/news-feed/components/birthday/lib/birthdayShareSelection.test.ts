import { expect, test } from 'vitest';
import type { AnnualComparison } from '../data/birthdayTypes';
import { selectShareComparisons } from './birthdayShareSelection';

const item = (id: string, change: number): AnnualComparison => ({ id, change, title: id, before: 100, after: 100 + change, unit: '지수', period: '2000년 → 2025년' });

test('공유는 상승률·하락률이 큰 순으로 각각 최대 3개를 담고 원본을 바꾸지 않는다', () => {
  const input = [item('small', 10), item('largest', 90), item('second', 50), item('third', 30), item('drop-small', -1), item('drop-large', -80), item('drop-second', -40), item('drop-third', -20)];
  const original = input.map(value => value.id);
  const selected = selectShareComparisons(input);
  expect(selected.rising.map(value => value.id)).toEqual(['largest', 'second', 'third']);
  expect(selected.falling.map(value => value.id)).toEqual(['drop-large', 'drop-second', 'drop-third']);
  expect(input.map(value => value.id)).toEqual(original);
});

test('0%·비정상 변화율은 상승·하락 목록을 채우지 않으며 부족한 항목은 그대로 둔다', () => {
  expect(selectShareComparisons([item('zero', 0), item('one', 5), item('bad', NaN), item('infinite', Infinity)])).toEqual({ rising: [item('one', 5)], falling: [], unchanged: 1 });
  expect(selectShareComparisons([])).toEqual({ rising: [], falling: [], unchanged: 0 });
});
