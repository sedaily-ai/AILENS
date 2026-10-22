import { expect, test } from 'vitest';
import raw from '../data/birthdaySnapshot.json';
import { EVENTS } from '@/shared/data/timelineEvents';
import { CPI_LATEST, CPI_MONTHLY } from '../data/birthdayCatalog';
import { calculate } from './birthdayModel';
import { ITEM_PRICES, itemMultiples, itemValue, type ItemPriceFile } from './birthdayItemPrices';

const snapshot = { ...raw, events: EVENTS };
const shown = (date: string) => itemMultiples(date).map(item => `${item.name} ${itemValue(item.multiple).text}`);

test('품목 자료는 1억 원 장면과 같은 지금 달·월값 달을 쓰고, 승인된 다섯 품목만 화면 순서로 있다', () => {
  // 지금 달이 CPI_LATEST와 다르면 한 장면에 기준이 둘이 된다 — 자료를 다시 받을 때 둘을 함께 바꾼다.
  expect(ITEM_PRICES.now).toBe(CPI_LATEST.period);
  expect(ITEM_PRICES.source).toBe('국가데이터처 소비자물가지수 품목별(서울), KOSIS');
  expect(ITEM_PRICES.items.map(item => [item.name, item.code, item.from])).toEqual([
    ['짜장면', 'K01119', '1975-01'], ['냉면', 'K01114', '1975-01'], ['시내버스', 'G03201', '1975-01'],
    ['지하철', 'G03102', '1980-01'], ['김치찌개백반', 'K01101', '1985-01'],
  ]);
  for (const item of ITEM_PRICES.items) {
    expect(Object.keys(item.monthly)).toEqual(Object.keys(CPI_MONTHLY));
    expect(Object.keys(item.annual).at(-1)).toBe('2025'); // 2026은 아직 12달이 없다
  }
});

test('태어난 해 연평균 → 2026년 9월, 자료가 없는 품목·해는 줄을 뺀다', () => {
  expect(shown('1990-05-15')).toEqual(['짜장면 5.7배', '냉면 3.8배', '시내버스 9.9배', '지하철 8배', '김치찌개백반 4.3배']);
  // 연도 공유(1월 1일)도 같은 해 연평균이라 같은 값이다.
  expect(shown('1990-01-01')).toEqual(shown('1990-05-15'));
  expect(itemMultiples('1983-03-01').map(item => item.id)).toEqual(['jajangmyeon', 'naengmyeon', 'bus', 'subway']);
  expect(itemMultiples('1978-06-10').map(item => item.id)).toEqual(['jajangmyeon', 'naengmyeon', 'bus']);
  expect(itemMultiples('1977-12-24').map(item => item.id)).toEqual(['jajangmyeon', 'naengmyeon', 'bus']);
  expect(itemMultiples('2010-08-20')).toHaveLength(5);
  expect(itemMultiples('1970-01-01')).toEqual([]);
  expect(itemMultiples('1974-12-31')).toEqual([]);
  expect(itemMultiples('2026-03-01')).toEqual([]);
  const zza = ITEM_PRICES.items[0];
  expect(itemMultiples('1990-05-15')[0].multiple).toBe(zza.latest / zza.annual['1990']!);
});

test('1억 원 장면이 월값을 쓰는 달(CPI_MONTHLY)은 품목도 그달 값이다', () => {
  const result = calculate('1988-02-03', snapshot);
  expect(result.cpiPeriod).toBe('1988년 2월');
  const zza = ITEM_PRICES.items[0];
  expect(itemMultiples('1988-02-03')[0].multiple).toBe(zza.latest / zza.monthly['1988-02']!);
  expect(itemMultiples('1988-03-03')[0].multiple).toBe(zza.latest / zza.annual['1988']!);
  expect(calculate('1988-03-03', snapshot).cpiPeriod).toBe('1988년 연평균');
});

test('자료의 지금 달이 CPI_LATEST와 다르면 목록을 만들지 않는다', () => {
  const stale: ItemPriceFile = { ...ITEM_PRICES, now: '2026-08' };
  expect(itemMultiples('1990-05-15', stale)).toEqual([]);
});

test('배수 표기 — 1배 이하·1배 반올림은 화살표와 부호를 함께', () => {
  expect(itemValue(5.6895)).toEqual({ arrow: '', text: '5.7배' });
  expect(itemValue(1.2)).toEqual({ arrow: '', text: '1.2배' });
  expect(itemValue(1.03)).toEqual({ arrow: '▲', text: '1배(+3%)' });
  expect(itemValue(0.92)).toEqual({ arrow: '▼', text: '0.9배(\u22128%)' });
  expect(itemValue(1)).toEqual({ arrow: '', text: '1배(0%)' });
});
