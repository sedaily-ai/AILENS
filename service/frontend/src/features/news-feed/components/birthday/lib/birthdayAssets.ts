// 기획안 v3 §7 계산식. 시세가 비어 있으면 'pending'을 돌려주고 숫자를 만들지 않는다.
import { ASSET_DATA, type AssetData, type DailyPoint, type MonthlyPoint, type SavingItem, type StockSeries, type YearPrice } from '../data/birthdayAssets';
import type { BirthdayResult } from '../data/birthdayTypes';
import { anniversary } from './birthdayModel';

export type AssetId = 'samsung' | 'skhynix' | 'apartment' | 'bitcoin' | 'gold';
export interface AssetResult {
  id: AssetId;
  name: string;
  state: 'ready' | 'pending' | 'unavailable';
  /** pending·unavailable 사유. */
  reason: string;
  /** 그때 투입한 금액과 시점 설명. */
  start: { date: string; amount: number; label: string } | null;
  /** 오늘 평가액과 시점 설명. */
  now: { date: string; amount: number; label: string } | null;
  multiple: number | null;
  /** 기준·추정·대체 시점 안내. */
  notes: string[];
}

const GRAMS_PER_DON = 3.75;
const GRAMS_PER_TROY_OUNCE = 31.1034768;

const pending = (id: AssetId, name: string, reason: string): AssetResult => ({ id, name, state: 'pending', reason, start: null, now: null, multiple: null, notes: [] });
const unavailable = (id: AssetId, name: string, reason: string): AssetResult => ({ ...pending(id, name, reason), state: 'unavailable' });

/** 오름차순 배열에서 key 이하인 마지막 원소(휴장일이면 직전 영업일). */
export function onOrBefore<T>(points: T[], key: string, keyOf: (point: T) => string): T | null {
  let low = 0, high = points.length - 1, found: T | null = null;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (keyOf(points[mid]) <= key) { found = points[mid]; low = mid + 1; } else high = mid - 1;
  }
  return found;
}
const byDate = (point: DailyPoint) => point.date;
const byPeriod = (point: MonthlyPoint) => point.period;

function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/** 주식: 그날 1주 → 오늘 보유 주식 수 × 오늘 종가. 상장 전이면 상장일, 휴장일이면 직전 거래일. */
export function stockScenario(stock: StockSeries, buyDate: string): AssetResult {
  const { id, name, prices } = stock;
  if (!prices.length) return pending(id, name, '일별 종가를 연결하고 있어요.');
  if (!stock.capitalEventsVerified) return pending(id, name, '액면분할·증자 이력을 원자료와 대조하고 있어요.');
  const latest = prices[prices.length - 1];
  if (buyDate > latest.date) return unavailable(id, name, '시세 기준일 이후의 날짜예요.');
  const notes: string[] = [];
  let bought = onOrBefore(prices, buyDate, byDate);
  if (!bought) { bought = prices[0]; notes.push(`상장 전이라 상장일(${bought.date.replaceAll('-', '.')}) 종가로 계산했어요.`); }
  else if (bought.date !== buyDate) notes.push('휴장일이라 직전 거래일 종가로 계산했어요.');
  const shares = stock.capitalEvents.filter(event => event.date > bought.date && event.date <= latest.date).reduce((total, event) => total * event.ratio, 1);
  if (shares !== 1) notes.push(`1주가 ${shares.toLocaleString('ko-KR')}주가 됐어요(${stock.capitalEvents.filter(event => event.date > bought.date).map(event => event.label).join(', ')}).`);
  const value = shares * latest.value;
  return { id, name, state: 'ready', reason: '', notes,
    start: { date: bought.date, amount: bought.value, label: '1주' },
    now: { date: latest.date, amount: value, label: `${shares.toLocaleString('ko-KR')}주` },
    multiple: value / bought.value };
}

/** 집: 그때 평균가 = 오늘 평균가 × (그때 지수 ÷ 앵커 지수). 지수 시작 전이면 시작월(추정). */
export function apartmentScenario(data: AssetData['apartment'], date: string): AssetResult {
  const id = 'apartment', name = '서울 아파트';
  if (!data.index.length || !data.anchor) return pending(id, name, '서울 아파트 가격지수를 연결하고 있어요.');
  const anchorIndex = data.index.find(point => point.period === data.anchor!.period);
  if (!anchorIndex) return pending(id, name, '오늘 평균가와 같은 달의 지수를 확인하고 있어요.');
  const notes = ['지수로 거꾸로 계산한 추정치예요. 대출·세금·거래비용은 빼고 계산했어요.'];
  let then = onOrBefore(data.index, date.slice(0, 7), byPeriod);
  if (!then) { then = data.index[0]; notes.push(`지수가 시작된 ${then.period.replace('-', '.')} 값으로 계산했어요.`); }
  const price = data.anchor.price * then.value / anchorIndex.value;
  return { id, name, state: 'ready', reason: '', notes,
    start: { date: then.period, amount: price, label: '평균가 1채' },
    now: { date: data.anchor.period, amount: data.anchor.price, label: '평균가 1채' },
    multiple: anchorIndex.value / then.value };
}

/** 그해 또는 그 이전 가장 가까운 해의 품목 가격. 이후 해의 가격을 과거에 쓰지 않는다. */
function itemPrice(prices: YearPrice[], year: number) {
  return onOrBefore(prices, String(year), price => String(price.year))?.price ?? null;
}

/** 코인: 적립 시작일부터 7일마다 품목 한 번 값만큼 비트코인을 샀다면. */
export function bitcoinScenario(data: AssetData['bitcoin'], startDate: string, item: SavingItem): AssetResult {
  const id = 'bitcoin', name = '비트코인 적립';
  const prices = data.prices, items = data.items[item];
  if (!prices.length || !items.length) return pending(id, name, '비트코인 원화 시세와 품목 가격을 연결하고 있어요.');
  const latest = prices[prices.length - 1];
  const notes: string[] = [];
  let day = startDate;
  if (day < prices[0].date) { day = prices[0].date; notes.push(`원화 시세가 시작된 ${day.replaceAll('-', '.')}부터 모았어요.`); }
  if (day > latest.date) return unavailable(id, name, '적립을 시작할 날이 아직 오지 않았어요.');
  let invested = 0, coins = 0, weeks = 0;
  for (; day <= latest.date; day = addDays(day, 7)) {
    const price = onOrBefore(prices, day, byDate);
    const amount = itemPrice(items, Number(day.slice(0, 4)));
    if (!price || !amount) continue;
    invested += amount; coins += amount / price.value; weeks++;
  }
  if (!weeks) return unavailable(id, name, '적립할 수 있는 기간이 없어요.');
  notes.push('품목 가격은 그해 가격 기준 추정이에요. 수수료·세금은 빼고 계산했어요.');
  const value = coins * latest.value;
  return { id, name, state: 'ready', reason: '', notes,
    start: { date: startDate, amount: invested, label: `${weeks.toLocaleString('ko-KR')}주 적립` },
    now: { date: latest.date, amount: value, label: '평가액' },
    multiple: value / invested };
}

/** 금 1돈: KRX 개장 후는 1g 종가 × 3.75, 개장 전은 국제 금값 ÷ 31.1035 × 3.75 × 원/달러(환산 추정). */
export function goldScenario(data: AssetData['gold'], date: string): AssetResult {
  const id = 'gold', name = '금 1돈';
  if (!data.krx.length) return pending(id, name, 'KRX 금시장 시세를 연결하고 있어요.');
  const latest = data.krx[data.krx.length - 1];
  if (date > latest.date) return unavailable(id, name, '시세 기준일 이후의 날짜예요.');
  const notes = ['부가세·공임·매매 차액을 뺀 시세 기준이에요.'];
  let price: number | null = null, priced = date;
  const krx = onOrBefore(data.krx, date, byDate);
  if (krx) { price = krx.value * GRAMS_PER_DON; priced = krx.date; if (krx.date !== date) notes.push('휴장일이라 직전 거래일 시세로 계산했어요.'); }
  else {
    const ounce = onOrBefore(data.international, date, byDate), fx = onOrBefore(data.usdkrw, date, byDate);
    if (!ounce || !fx) return pending(id, name, 'KRX 개장 전 국제 금값과 환율을 연결하고 있어요.');
    price = ounce.value / GRAMS_PER_TROY_OUNCE * GRAMS_PER_DON * fx.value;
    priced = ounce.date;
    notes.push('KRX 금시장 개장(2014년 3월) 전이라 국제 금값을 환율로 바꾼 추정치예요.');
  }
  const value = latest.value * GRAMS_PER_DON;
  return { id, name, state: 'ready', reason: '', notes,
    start: { date: priced, amount: price, label: '1돈(3.75g)' },
    now: { date: latest.date, amount: value, label: '1돈(3.75g)' },
    multiple: value / price };
}

/** 그냥 뒀다면: 투입액을 오늘 물가로 나눈 구매력. */
export function purchasingPower(amount: number, cpiThen: number | null, cpiNow: number) {
  return cpiThen ? amount * cpiThen / cpiNow : null;
}

/** 오늘 도착 요약 — 계산된 자산 중 배수가 가장 큰 것. */
export function topAsset(results: AssetResult[]) {
  return results.filter(result => result.state === 'ready' && result.multiple !== null)
    .reduce<AssetResult | null>((best, result) => !best || result.multiple! > best.multiple! ? result : best, null);
}

/** 기획안 v3 기본값(태어난 날에 1주·1채·1돈, 만 20세부터 매주 커피값)으로 계산한 자산 5가지. */
export function defaultAssetResults(result: Pick<BirthdayResult, 'birthDate' | 'date'>, data: AssetData = ASSET_DATA): AssetResult[] {
  return [
    ...data.stocks.map(stock => stockScenario(stock, result.birthDate)),
    apartmentScenario(data.apartment, result.birthDate),
    bitcoinScenario(data.bitcoin, anniversary(result.date, 20), 'coffee'),
    goldScenario(data.gold, result.birthDate),
  ];
}
