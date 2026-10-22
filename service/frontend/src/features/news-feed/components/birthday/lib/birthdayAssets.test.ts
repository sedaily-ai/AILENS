import { expect, test } from 'vitest';
import type { AssetLatest, AssetYearFile } from '../data/birthdayAssets';
import {
  apartmentCell, assetBase, assetCells, assetInflation, assetMemo, assetResult, assetsAvailable, assetSourceLine, changeOf, depositCell, ecosOrgs,
  goldCell, inflationLine, onOrBefore, periodLabel, usdCell, type AssetBase,
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

test('기준일: 서른 살 생일이 지났으면(당일 포함) 스무 살 생일, 아직이면 태어난 날', () => {
  // 스무 살 전·21살·29살은 태어난 날 — 비교 기간이 1년 치로 줄지 않는다.
  expect(assetBase(birth('2010-08-20'), TODAY)).toEqual({ date: '2010-08-20', kind: 'birthday' });
  expect(assetBase(birth('2005-03-10'), TODAY)).toEqual({ date: '2005-03-10', kind: 'birthday' });
  expect(assetBase(birth('2006-10-21'), TODAY)).toEqual({ date: '2006-10-21', kind: 'birthday' });
  expect(assetBase(birth('1997-01-15'), TODAY)).toEqual({ date: '1997-01-15', kind: 'birthday' });
  // 서른 살 생일 하루 전은 태어난 날, 당일부터 스무 살 생일.
  expect(assetBase(birth('1996-10-22'), TODAY)).toEqual({ date: '1996-10-22', kind: 'birthday' });
  expect(assetBase(birth('1996-10-21'), TODAY)).toEqual({ date: '2016-10-21', kind: 'twentieth' });
  expect(assetBase(birth('1996-05-01'), TODAY)).toEqual({ date: '2016-05-01', kind: 'twentieth' });
  expect(assetBase(birth('1990-05-15'), TODAY)).toEqual({ date: '2010-05-15', kind: 'twentieth' });
  // 2월 29일생: 서른 살 생일은 anniversary 규칙대로 2월 28일, 스무 살 생일은 윤년이라 2월 29일.
  expect(assetBase(birth('1996-02-29'), '2026-02-27')).toEqual({ date: '1996-02-29', kind: 'birthday' });
  expect(assetBase(birth('1996-02-29'), '2026-02-28')).toEqual({ date: '2016-02-29', kind: 'twentieth' });
  expect(assetBase(birth('2004-02-29'), TODAY)).toEqual({ date: '2004-02-29', kind: 'birthday' });
  // 연도 공유는 YYYY-01-01이 들어온다 — 서른 살이 되는 해의 1월 1일부터 스무 살이 된 해의 1월 1일.
  expect(assetBase(birth('1997-01-01'), TODAY)).toEqual({ date: '1997-01-01', kind: 'birthday' });
  expect(assetBase(birth('1996-01-01'), TODAY)).toEqual({ date: '2016-01-01', kind: 'twentieth' });
  expect(assetBase(birth('1990-01-01'), TODAY)).toEqual({ date: '2010-01-01', kind: 'twentieth' });
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

test('칸은 배수와 상관없이 정기예금 → 달러 → 서울 아파트 고정 순서', () => {
  const cells = assetCells(base('2010-05-15'), file2010, latest());
  expect(cells.map(cell => cell.id)).toEqual(['deposit', 'usd', 'apartment']);
  expect(cells.map(cell => cell.name)).toEqual(['정기예금', '달러', '서울 아파트']);
  // 달러(3배)가 예금(1.5배)보다 커도 순서는 그대로다.
  expect(cells[1].multiple).toBe(3);
  expect(cells[0].multiple).toBe(1.5);
});

test('물가 줄: 기준일이 속한 달 → 최신 물가, 그달 지수가 없으면 null', () => {
  expect(assetInflation(base('2010-05-15'), file2010, latest())).toEqual({ multiple: 2, then: '2010-05', now: '2026-09' });
  // 그달 지수가 없으면 다른 달로 대신하지 않는다.
  expect(assetInflation(base('2010-07-01'), file2010, latest())).toBeNull();
  expect(assetInflation(base('2010-05-15'), file2010, latest({ cpi: undefined }))).toBeNull();
  // 1964-05-04 이전 기준일은 칸과 같이 물가 줄도 없다.
  expect(assetInflation(base('1964-05-03'), { year: 1964, cpi: [['1964-05', 1]] }, latest())).toBeNull();
});

test('1964-05~12 기준일은 달러(월평균) 칸만 있고 물가 줄이 없다 — 물가는 1965-01부터', () => {
  const file1964: AssetYearFile = { year: 1964, cpi: [], deposit: [], usdkrw: { daily: [], monthly: [['1964-06', 255.77]] }, apartment: [] };
  const june = assetBase(birth('1944-06-01'), TODAY);
  expect(june).toEqual({ date: '1964-06-01', kind: 'twentieth' });
  const cells = assetCells(june, file1964, latest());
  expect(cells.map(cell => cell.id)).toEqual(['usd']);
  expect(cells[0].then).toEqual({ period: '1964-06', monthlyAverage: true });
  expect(assetInflation(june, file1964, latest())).toBeNull();
  expect(assetSourceLine(cells, null)).not.toContain('소비자물가지수');
});

test('물가 줄 문장: 배수는 times(), 1배로 반올림되면 %로', () => {
  expect(inflationLine({ multiple: 120.43 / 86.128, then: '2010-05', now: '2026-09' })).toBe(`같은 기간 물가는 ${nb('1.4배 올랐어요.')}`);
  expect(inflationLine({ multiple: 12.775, then: '1975-06', now: '2026-09' })).toBe(`같은 기간 물가는 ${nb('12.8배 올랐어요.')}`);
  expect(inflationLine({ multiple: 1.03, then: '2026-03', now: '2026-09' })).toBe(`같은 기간 물가는 ${nb('3% 올랐어요.')}`);
  expect(inflationLine({ multiple: 1.002, then: '2026-08', now: '2026-09' })).toBe(`같은 기간 물가는 ${nb('거의 그대로예요.')}`);
  expect(inflationLine({ multiple: 0.99, then: '2026-08', now: '2026-09' })).toBe(`같은 기간 물가는 ${nb('1% 내렸어요.')}`);
});

test('정기예금: 기준월 지수 → 다음 달 지수, 금리가 없는 달은 칸이 없다', () => {
  const cell = depositCell(base('2010-05-15'), file2010, latest())!;
  expect(cell.nowAmount).toBe(1_500_000);
  expect(cell.now).toEqual({ period: '2026-09', label: '2026년 8월 금리까지' });
  expect(cell.notes).toEqual(['세전 월복리로, 매달 그달 신규 정기예금 금리를 적용했어요.']);
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
  // 수집 끝 날짜(until 2026-10-20) 뒤의 기준일은 종가가 없어 칸이 없다 — 마지막 종가를 휴일 대체로 쓰지 않는다.
  const file2026: AssetYearFile = { year: 2026, cpi: [['2026-09', 100]], usdkrw: { daily: [['2026-10-20', 3000]], monthly: [['2026-09', 1400]] } };
  const newborn: AssetBase = { date: '2026-10-21', kind: 'birthday' };
  expect(usdCell(newborn, file2026, latest())).toBeNull();
  expect(assetCells(newborn, file2026, latest())).toEqual([]);
  expect(usdCell({ date: '2026-10-20', kind: 'birthday' }, file2026, latest())!.notes).toEqual([]);
});

test('서울 아파트: 지수 비율만(원 금액 없음), 2005-12·미발표 달은 칸이 없다', () => {
  const cell = apartmentCell(base('2010-05-15'), file2010, latest())!;
  expect(cell.multiple).toBe(3);
  expect(cell.nowAmount).toBeNull();
  expect(cell.now.label).toBe('2026년 7월 지수');
  expect(apartmentCell(base('2005-12-01'), { year: 2005, apartment: [] }, latest())).toBeNull();
  expect(apartmentCell(base('2026-08-10'), { year: 2026, apartment: [['2026-07', 101.9]] }, latest())).toBeNull();
});

test('금: 금괴 생산자물가지수 비율, latest에 금이 있을 때만 넷째 칸, 100만 원 기준 금액', () => {
  const file = { ...file2010, gold: [['2010-05', 69.37]] } satisfies AssetYearFile;
  const withGold = latest({ gold: ['2026-09', 281.92] });
  const cells = assetCells(base('2010-05-15'), file, withGold);
  expect(cells.map(cell => cell.id)).toEqual(['deposit', 'usd', 'apartment', 'gold']);
  const gold = cells[3];
  expect(gold.name).toBe('금');
  expect(gold.multiple).toBeCloseTo(281.92 / 69.37, 12);
  expect(gold.nowAmount).toBeCloseTo(1_000_000 * 281.92 / 69.37, 6);
  expect(gold.unit).toBeUndefined();
  expect(gold.then).toEqual({ period: '2010-05', monthlyAverage: false });
  expect(gold.now).toEqual({ period: '2026-09', label: '2026년 9월 금괴 지수' });
  expect(gold.notes).toEqual(['한국은행 생산자물가지수의 금괴 가격 변화로 계산했어요. 금은방 판매가와는 다를 수 있어요.']);
  // latest에 금이 없거나 기준월 지수가 없으면(1964년·미발표 달) 칸이 없다 — 다른 달로 대신하지 않는다.
  expect(assetCells(base('2010-05-15'), file, latest()).map(cell => cell.id)).toEqual(['deposit', 'usd', 'apartment']);
  expect(goldCell(base('2010-06-15'), file, withGold)).toBeNull();
  expect(goldCell(base('1964-06-01'), { year: 1964, gold: [] }, withGold)).toBeNull();
});

test('증감은 화살표와 부호로 — 감소는 U+2212', () => {
  expect(changeOf(3.5617)).toEqual({ arrow: '▲', signed: '+256%' });
  expect(changeOf(12.5)).toEqual({ arrow: '▲', signed: '+1,150%' });
  expect(changeOf(0.68)).toEqual({ arrow: '▼', signed: '\u221232%' });
  expect(changeOf(1.004)).toEqual({ arrow: '', signed: '0%' });
  expect(changeOf(0.996)).toEqual({ arrow: '', signed: '0%' });
});

test('칸 아래 결과 줄은 지금 금액(아파트는 배수)과 증감만, 1달러 환율은 설명 줄 맨 앞', () => {
  const [deposit, usd, apartment] = assetCells(base('2010-05-15'), file2010, latest());
  expect(assetResult(deposit)).toEqual({ arrow: '▲', label: '지금', figure: '150만 원', signed: '+50%' });
  expect(assetMemo(deposit)).toBe('세전 월복리로, 매달 그달 신규 정기예금 금리를 적용했어요.');
  // 달러 결과 줄에는 환율이 없고, 환율은 설명 줄 맨 앞(그 뒤에 휴일 안내).
  expect(assetResult(usd)).toEqual({ arrow: '▲', label: '지금', figure: '300만 원', signed: '+200%' });
  expect(JSON.stringify(assetResult(usd))).not.toContain('1달러');
  expect(assetMemo(usd)).toBe(`${nb('1달러 = 그때 1,000원')} → ${nb('지금 3,000원')}\u00a0· 휴일이라 직전 영업일 종가로 계산했어요.`);
  expect(assetResult(apartment)).toEqual({ arrow: '▲', label: '서울 아파트값', figure: '3배', signed: '+200%' });
  // 주석이 없는 달러 칸(그날 종가)은 환율만, 감소는 ▼와 U+2212.
  const file1990: AssetYearFile = { year: 1990, usdkrw: { daily: [['1990-03-02', 4000]], monthly: [] } };
  const down = usdCell(base('1990-03-02'), file1990, latest())!;
  expect(assetResult(down)).toEqual({ arrow: '▼', label: '지금', figure: '75만 원', signed: '\u221225%' });
  expect(assetMemo(down)).toBe(`${nb('1달러 = 그때 4,000원')} → ${nb('지금 3,000원')}`);
});

test('출처 문장: ECOS 제공, 보이는 칸(과 물가 줄)의 작성기관·통계, 지금 시점', () => {
  const cells = assetCells(base('2010-05-15'), file2010, latest());
  const inflation = assetInflation(base('2010-05-15'), file2010, latest());
  const line = assetSourceLine(cells, inflation);
  expect(line.startsWith(`${nb('한국은행 ECOS')}에서 받은 `)).toBe(true);
  expect(line).toContain('한국은행 예금은행 정기예금 신규취급액 가중평균 금리, 한국은행 원/달러 환율, 한국부동산원 서울 아파트 실거래가격지수, 국가데이터처 소비자물가지수로 계산했어요.');
  for (const cell of cells) expect(line).toContain(nb(cell.now.label));
  expect(line).toContain(`${nb('2026년 7월 지수')}, ${nb('2026년 9월 물가')} 기준이에요.`);
  // 물가 줄이 없으면 소비자물가지수와 물가 시점도 빠진다.
  const noInflation = assetSourceLine(cells, null);
  expect(noInflation).toContain('한국부동산원 서울 아파트 실거래가격지수로 계산했어요.');
  expect(noInflation).not.toContain('소비자물가지수');
  expect(noInflation).not.toContain('물가');
  // 금도 ECOS 한 계열이라 다른 칸처럼 작성기관·통계 이름과 지금 시점이 들어간다.
  const goldFile = { ...file2010, gold: [['2010-05', 69.37]] } satisfies AssetYearFile;
  const gold = assetCells(base('2010-05-15'), goldFile, latest({ gold: ['2026-09', 281.92] }));
  expect(assetSourceLine(gold, inflation)).toContain('한국부동산원 서울 아파트 실거래가격지수, 한국은행 생산자물가지수(금괴), 국가데이터처 소비자물가지수로 계산했어요.');
  expect(assetSourceLine(gold, inflation)).toContain(`${nb('2026년 7월 지수')}, ${nb('2026년 9월 금괴 지수')}, ${nb('2026년 9월 물가')} 기준이에요.`);
  expect(assetSourceLine(gold, null)).toContain('한국은행 생산자물가지수(금괴)로 계산했어요.');
  expect(assetSourceLine([], inflation)).toBe('');
  expect(periodLabel('2026-09')).toBe('2026년 9월');
  expect(periodLabel('2026-10-20')).toBe('2026년 10월 20일');
});

test('하단 출처 작성기관: 국가데이터처는 물가를 보일 때, 한국부동산원은 아파트 칸이 있을 때만', () => {
  expect(ecosOrgs(assetCells(base('2010-05-15'), file2010, latest()), true)).toEqual(['한국은행', '국가데이터처', '한국부동산원']);
  expect(ecosOrgs(assetCells(base('2000-03-01'), { year: 2000, cpi: [['2000-03', 62.962]] }, latest()), true)).toEqual(['한국은행', '국가데이터처']);
  expect(ecosOrgs([], false)).toEqual(['한국은행']);
});
