import { expect, test } from 'vitest';
import type { AssetLatest, AssetYearFile } from '../data/birthdayAssets';
import {
  apartmentCell, assetBase, assetCells, assetsAvailable, assetSourceLine, cashCell, changeOf, depositCell, ecosOrgs,
  onOrBefore, periodLabel, usdCell, type AssetBase,
} from './birthdayAssets';
import { parseDate } from './birthdayModel';
import { nb } from './keepTogether';

test('휴장일은 직전 거래일, 오름차순 이진 탐색', () => {
  const points = [{ date: '2000-01-03', value: 1 }, { date: '2000-01-05', value: 2 }];
  expect(onOrBefore(points, '2000-01-04', point => point.date)?.value).toBe(1);
  expect(onOrBefore(points, '2000-01-02', point => point.date)).toBeNull();
  expect(onOrBefore(points, '2001-01-01', point => point.date)?.value).toBe(2);
});

// ── 스무 살의 내가 100만 원을 어디에 뒀다면 ──
const TODAY = '2026-10-21';
const birth = (iso: string) => parseDate(iso, TODAY)!;
const base = (date: string): AssetBase => ({ date, kind: 'twentieth' });
const latest = (over: Partial<AssetLatest> = {}): AssetLatest => ({
  generatedAt: '2026-10-21T13:40:20+09:00', until: '2026-10-20', sources: {},
  last: { cpi: '2026-09', deposit_rate: '2026-08', usdkrw_daily: '2026-10-20', usdkrw_monthly: '2026-09', apartment: '2026-07' },
  cpi: ['2026-09', 100], deposit: ['2026-09', 3],
  usdkrw: { daily: ['2026-10-20', 3000], monthly: ['2026-09', 1400] }, apartment: ['2026-07', 120],
  ...over,
});
const file2010: AssetYearFile = {
  year: 2010, cpi: [['2010-05', 50], ['2010-06', 51]], deposit: [['2010-05', 2]],
  usdkrw: { daily: [['2010-05-14', 1000], ['2010-05-17', 1010]], monthly: [['2010-05', 1005]] }, apartment: [['2010-05', 40]],
};

test('기준일: 스무 살 생일이 지났으면(당일 포함) 그날, 아직이면 태어난 날', () => {
  expect(assetBase(birth('1990-05-15'), TODAY)).toEqual({ date: '2010-05-15', kind: 'twentieth' });
  expect(assetBase(birth('2010-08-20'), TODAY)).toEqual({ date: '2010-08-20', kind: 'birthday' });
  expect(assetBase(birth('2006-10-21'), TODAY)).toEqual({ date: '2026-10-21', kind: 'twentieth' });
  expect(assetBase(birth('2006-10-22'), TODAY)).toEqual({ date: '2006-10-22', kind: 'birthday' });
  // 연도 공유는 YYYY-01-01이 들어온다.
  expect(assetBase(birth('1990-01-01'), TODAY)).toEqual({ date: '2010-01-01', kind: 'twentieth' });
  expect(assetBase(birth('2004-02-29'), TODAY)).toEqual({ date: '2024-02-29', kind: 'twentieth' });
});

test('기준일이 1964-05-04보다 앞서면 칸이 없다', () => {
  const early = assetBase(birth('1944-05-03'), TODAY);
  expect(early.date).toBe('1964-05-03');
  expect(assetsAvailable(early)).toBe(false);
  const file1964: AssetYearFile = { year: 1964, cpi: [], deposit: [], usdkrw: { daily: [], monthly: [['1964-05', 255.77]] }, apartment: [] };
  expect(assetCells(early, file1964, latest())).toEqual([]);
  const first = assetBase(birth('1944-05-04'), TODAY);
  expect(assetsAvailable(first)).toBe(true);
  expect(assetCells(first, file1964, latest()).map(cell => cell.id)).toEqual(['usd']);
});

test('칸은 배수와 상관없이 현금 → 정기예금 → 달러 → 서울 아파트 고정 순서', () => {
  const cells = assetCells(base('2010-05-15'), file2010, latest());
  expect(cells.map(cell => cell.id)).toEqual(['cash', 'deposit', 'usd', 'apartment']);
  expect(cells.map(cell => cell.name)).toEqual(['현금', '정기예금', '달러', '서울 아파트']);
  // 달러(3배)가 예금(1.5배)보다 커도 순서는 그대로다.
  expect(cells[2].multiple).toBe(3);
  expect(cells[1].multiple).toBe(1.5);
});

test('현금: 명목 그대로, 그때 100만 원어치를 지금 사려면 물가 비율만큼', () => {
  const cell = cashCell(base('2010-05-15'), file2010, latest())!;
  expect(cell).toMatchObject({ multiple: 1, nowAmount: 1_000_000, purchase: 2_000_000, then: { period: '2010-05', monthlyAverage: false } });
  expect(cell.now).toEqual({ period: '2026-09', label: '2026년 9월 물가' });
  expect(cashCell(base('2010-07-01'), file2010, latest())).toBeNull();
});

test('정기예금: 기준월 지수 → 다음 달 지수, 금리가 없는 달은 칸이 없다', () => {
  const cell = depositCell(base('2010-05-15'), file2010, latest())!;
  expect(cell.nowAmount).toBe(1_500_000);
  expect(cell.now).toEqual({ period: '2026-09', label: '2026년 8월 금리까지' });
  expect(cell.notes[0]).toContain('세전');
  expect(depositCell(base('2010-06-15'), file2010, latest())).toBeNull();
  expect(depositCell(base('1995-12-01'), { year: 1995, deposit: [] }, latest())).toBeNull();
  // 마지막 금리 달(2026-08) 뒤의 달은 금리가 아직 없다.
  expect(depositCell(base('2026-09-10'), { year: 2026, deposit: [['2026-09', 3]] }, latest())).toBeNull();
});

test('달러: 1990-03-02부터는 그날(또는 직전 영업일) 종가, 그 전은 그달 월평균', () => {
  const file1990: AssetYearFile = { year: 1990, usdkrw: { daily: [['1990-03-02', 693], ['1990-03-03', 700]], monthly: [['1990-03', 700]] } };
  const monthly = usdCell(base('1990-03-01'), file1990, latest())!;
  expect(monthly.then).toEqual({ period: '1990-03', monthlyAverage: true });
  expect(monthly.unit).toEqual({ label: '1달러', then: 700, now: 3000 });
  expect(monthly.notes).toEqual(['그때 값은 1990년 3월 월평균이에요.']);
  const daily = usdCell(base('1990-03-02'), file1990, latest())!;
  expect(daily.then).toEqual({ period: '1990-03-02', monthlyAverage: false });
  expect(daily.notes).toEqual([]);
  expect(daily.nowAmount).toBeCloseTo(1_000_000 * 3000 / 693, 6);
  // 2010-05-15 토요일 → 금요일 종가
  const saturday = usdCell(base('2010-05-15'), file2010, latest())!;
  expect(saturday.then.period).toBe('2010-05-14');
  expect(saturday.notes).toEqual(['휴일이라 직전 영업일 종가로 계산했어요.']);
  expect(saturday.now).toEqual({ period: '2026-10-20', label: '2026년 10월 20일 종가' });
  // 1월 1일은 연도 파일의 전년 꼬리에서 찾는다.
  const file2011: AssetYearFile = { year: 2011, usdkrw: { daily: [['2010-12-30', 1134.8], ['2011-01-03', 1120]], monthly: [] } };
  expect(usdCell(base('2011-01-01'), file2011, latest())!.then.period).toBe('2010-12-30');
});

test('서울 아파트: 지수 비율만(원 금액 없음), 2005-12·미발표 달은 칸이 없다', () => {
  const cell = apartmentCell(base('2010-05-15'), file2010, latest())!;
  expect(cell.multiple).toBe(3);
  expect(cell.nowAmount).toBeNull();
  expect(cell.now.label).toBe('2026년 7월 지수');
  expect(apartmentCell(base('2005-12-01'), { year: 2005, apartment: [] }, latest())).toBeNull();
  expect(apartmentCell(base('2026-08-10'), { year: 2026, apartment: [['2026-07', 101.9]] }, latest())).toBeNull();
});

test('금 한 돈: latest에 금이 있을 때만 다섯째 칸, 국제 금값 × 그달 평균 환율', () => {
  const file = { ...file2010, gold: [['2010-05', 1200]] } satisfies AssetYearFile;
  const withGold = latest({ gold: { usd: ['2026-09', 4000], usdkrw: ['2026-09', 1400] } });
  const cells = assetCells(base('2010-05-15'), file, withGold);
  expect(cells.map(cell => cell.id)).toEqual(['cash', 'deposit', 'usd', 'apartment', 'gold']);
  const gold = cells[4];
  const don = (usd: number, krw: number) => usd / 31.1034768 * 3.75 * krw;
  expect(gold.unit!.label).toBe('1돈');
  expect(gold.unit!.then).toBeCloseTo(don(1200, 1005), 6);
  expect(gold.unit!.now).toBeCloseTo(don(4000, 1400), 6);
  expect(gold.multiple).toBeCloseTo(don(4000, 1400) / don(1200, 1005), 9);
  expect(gold.then.monthlyAverage).toBe(true);
  expect(assetCells(base('2010-05-15'), file, latest()).map(cell => cell.id)).toEqual(['cash', 'deposit', 'usd', 'apartment']);
});

test('증감은 화살표와 부호로 — 감소는 U+2212', () => {
  expect(changeOf(3.5617)).toEqual({ arrow: '▲', signed: '+256%' });
  expect(changeOf(12.5)).toEqual({ arrow: '▲', signed: '+1,150%' });
  expect(changeOf(0.68)).toEqual({ arrow: '▼', signed: '\u221232%' });
  expect(changeOf(1.004)).toEqual({ arrow: '', signed: '0%' });
  expect(changeOf(0.996)).toEqual({ arrow: '', signed: '0%' });
});

test('출처 문장: ECOS 제공, 보이는 칸의 작성기관·통계, 칸별 지금 시점', () => {
  const cells = assetCells(base('2010-05-15'), file2010, latest());
  const line = assetSourceLine(cells, latest());
  expect(line.startsWith(`${nb('한국은행 ECOS')}에서 받은 `)).toBe(true);
  for (const text of ['국가데이터처 소비자물가지수', '한국은행 예금은행 정기예금 신규취급액 가중평균 금리', '한국은행 원/달러 환율', '한국부동산원 서울 아파트 실거래가격지수로 계산했어요.']) expect(line).toContain(text);
  for (const cell of cells) expect(line).toContain(nb(cell.now.label));
  expect(line).not.toContain('세계은행');
  const gold = assetCells(base('2010-05-15'), { ...file2010, gold: [['2010-05', 1200]] }, latest({ gold: { usd: ['2026-09', 4000], usdkrw: ['2026-09', 1400] } }));
  expect(assetSourceLine(gold, latest())).toContain('실거래가격지수와 세계은행 Pink Sheet 국제 금값 월평균으로 계산했어요.');
  expect(assetSourceLine([], latest())).toBe('');
  expect(periodLabel('2026-09')).toBe('2026년 9월');
  expect(periodLabel('2026-10-20')).toBe('2026년 10월 20일');
});

test('하단 출처 작성기관: 한국부동산원은 아파트 칸이 있을 때만', () => {
  expect(ecosOrgs(assetCells(base('2010-05-15'), file2010, latest()))).toEqual(['한국은행', '국가데이터처', '한국부동산원']);
  expect(ecosOrgs(assetCells(base('2000-03-01'), { year: 2000, cpi: [['2000-03', 62.962]] }, latest()))).toEqual(['한국은행', '국가데이터처']);
});
