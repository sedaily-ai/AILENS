import { expect, test } from 'vitest';
import { ASSET_DATA, type AssetData, type StockSeries } from '../data/birthdayAssets';
import { apartmentScenario, bitcoinScenario, goldScenario, onOrBefore, purchasingPower, stockScenario, topAsset } from './birthdayAssets';

const stock = (overrides: Partial<StockSeries> = {}): StockSeries => ({
  id: 'samsung', name: '삼성전자', source: '테스트',
  prices: [{ date: '2000-03-16', value: 300_000 }, { date: '2000-03-17', value: 310_000 }, { date: '2026-10-16', value: 217_000 }],
  capitalEvents: [{ date: '2018-05-04', ratio: 50, label: '2018년 50대1 액면분할' }],
  capitalEventsVerified: true,
  ...overrides,
});

test('지금 저장소의 자산 자료는 비어 있어 모든 카드가 준비 중이다(A안)', () => {
  expect(ASSET_DATA.stocks.map(item => stockScenario(item, '2000-03-18').state)).toEqual(['pending', 'pending']);
  expect(apartmentScenario(ASSET_DATA.apartment, '2000-03-18').state).toBe('pending');
  expect(bitcoinScenario(ASSET_DATA.bitcoin, '2020-03-18', 'coffee').state).toBe('pending');
  expect(goldScenario(ASSET_DATA.gold, '2000-03-18').state).toBe('pending');
});

test('휴장일은 직전 거래일, 오름차순 이진 탐색', () => {
  const points = [{ date: '2000-01-03', value: 1 }, { date: '2000-01-05', value: 2 }];
  expect(onOrBefore(points, '2000-01-04', point => point.date)?.value).toBe(1);
  expect(onOrBefore(points, '2000-01-02', point => point.date)).toBeNull();
  expect(onOrBefore(points, '2001-01-01', point => point.date)?.value).toBe(2);
});

test('주식: 토요일 생일은 직전 거래일, 분할 후 보유 주식 수로 평가한다(기획안 v3 예시)', () => {
  const result = stockScenario(stock(), '2000-03-18');
  expect(result.state).toBe('ready');
  expect(result.start).toEqual({ date: '2000-03-17', amount: 310_000, label: '1주' });
  expect(result.now).toEqual({ date: '2026-10-16', amount: 50 * 217_000, label: '50주' });
  expect(result.multiple).toBeCloseTo(10_850_000 / 310_000);
  expect(result.notes[0]).toContain('직전 거래일');
});

test('주식: 상장 전 생일은 상장일, 이력 미검증이면 계산하지 않는다', () => {
  const before = stockScenario(stock(), '1990-01-01');
  expect(before.start!.date).toBe('2000-03-16');
  expect(before.notes[0]).toContain('상장일');
  expect(stockScenario(stock({ capitalEventsVerified: false }), '2000-03-18').state).toBe('pending');
  expect(stockScenario(stock(), '2026-10-18').state).toBe('unavailable');
});

test('집: 지수 비율로 그때 평균가를 역산하고 시작 전이면 시작월(추정)', () => {
  const apartment: AssetData['apartment'] = { source: '테스트', anchor: { period: '2026-08', price: 1_607_390_000 }, index: [{ period: '2003-01', value: 40 }, { period: '2026-08', value: 160 }] };
  const result = apartmentScenario(apartment, '2010-05-01');
  expect(result.multiple).toBe(4);
  expect(result.start!.amount).toBeCloseTo(1_607_390_000 / 4);
  expect(apartmentScenario(apartment, '2000-03-18').notes.join(' ')).toContain('2003.01');
});

test('코인: 7일마다 그해 품목 가격만큼 사고, 이후 해 가격을 과거에 쓰지 않는다', () => {
  const bitcoin: AssetData['bitcoin'] = {
    source: '테스트',
    prices: [{ date: '2020-01-01', value: 10_000_000 }, { date: '2020-01-15', value: 20_000_000 }],
    items: { coffee: [{ year: 2020, price: 5_000 }], lunch: [{ year: 2021, price: 9_000 }], chicken: [] },
  };
  const result = bitcoinScenario(bitcoin, '2020-01-01', 'coffee');
  // 1/1(1천만)·1/8(1천만, 직전값)·1/15(2천만) 세 번 5천 원씩
  expect(result.start!.amount).toBe(15_000);
  expect(result.now!.amount).toBeCloseTo((5_000 / 10_000_000 * 2 + 5_000 / 20_000_000) * 20_000_000);
  expect(bitcoinScenario(bitcoin, '2020-01-01', 'lunch').state).toBe('unavailable');
  expect(bitcoinScenario(bitcoin, '2030-01-01', 'coffee').state).toBe('unavailable');
  expect(bitcoinScenario(bitcoin, '2019-06-01', 'coffee').notes[0]).toContain('2020.01.01');
});

test('금: KRX 개장 후는 1g×3.75, 개장 전은 국제 금값 환산(추정)', () => {
  const gold: AssetData['gold'] = {
    source: '테스트',
    krx: [{ date: '2014-03-24', value: 43_000 }, { date: '2026-10-16', value: 200_000 }],
    international: [{ date: '2000-03-17', value: 290 }],
    usdkrw: [{ date: '2000-03-17', value: 1_110 }],
  };
  const after = goldScenario(gold, '2020-01-01');
  expect(after.start!.amount).toBe(43_000 * 3.75);
  expect(after.now!.amount).toBe(200_000 * 3.75);
  const before = goldScenario(gold, '2000-03-18');
  expect(before.start!.amount).toBeCloseTo(290 / 31.1034768 * 3.75 * 1_110);
  expect(before.notes.join(' ')).toContain('추정');
  expect(goldScenario({ ...gold, international: [] }, '2000-03-18').state).toBe('pending');
});

test('구매력과 1등 자산', () => {
  expect(purchasingPower(1_000_000, 60, 120)).toBe(500_000);
  expect(purchasingPower(1_000_000, null, 120)).toBeNull();
  const ready = stockScenario(stock(), '2000-03-18');
  expect(topAsset([ready, stockScenario(stock({ prices: [] }), '2000-03-18')])?.id).toBe('samsung');
  expect(topAsset([])).toBeNull();
});
