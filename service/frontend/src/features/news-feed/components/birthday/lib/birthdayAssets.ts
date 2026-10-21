// 기획안 v3 §7 계산식(옛 시나리오, 시세가 비어 있으면 'pending')과, 그 아래 "스무 살의 내가 100만 원을 어디에 뒀다면" 칸 계산.
import { kstTodayStr } from '@/shared/lib/date/date';
import {
  ASSET_DATA, ASSET_DATA_FROM, ASSET_SOURCE_INFO,
  type AssetData, type AssetLatest, type AssetPoint, type AssetYearFile, type DailyPoint, type MonthlyPoint, type SavingItem, type StockSeries, type YearPrice,
} from '../data/birthdayAssets';
import type { BirthdayDate, BirthdayResult } from '../data/birthdayTypes';
import { anniversary, dateLabel, number } from './birthdayModel';
import { nb } from './keepTogether';

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

// ── 스무 살의 내가 100만 원을 어디에 뒀다면 ──────────────────────────────────────────────
// 칸은 고정 순서(현금 → 정기예금 → 달러 → 서울 아파트 → 금)이고 정렬·1등 강조가 없다. 그때 값이 연도 파일에 정확히
// 있을 때만 칸을 만든다(대체·추정 없음). 월별 자료는 기준일이 속한 달 값을 쓴다(그달 초에 넣었다고 본다).

/** 넣었다고 보는 금액(원). */
export const ASSET_STAKE = 1_000_000;
/** 이보다 앞선 기준일은 칸이 없다(원/달러 월평균 시작). */
export const FX_START = ASSET_DATA_FROM.fx;

export type AssetCellId = 'cash' | 'deposit' | 'usd' | 'apartment' | 'gold';
export const ASSET_CELL_ORDER: readonly AssetCellId[] = ['cash', 'deposit', 'usd', 'apartment', 'gold'];

/** 기준일 — 스무 살 생일이 지났으면 그날, 아직이면 태어난 날. */
export interface AssetBase { date: string; kind: 'twentieth' | 'birthday' }

export interface AssetCell {
  id: AssetCellId;
  name: string;
  /** 지금 ÷ 그때(현금은 명목 1). */
  multiple: number;
  /** 100만 원 기준 지금 금액(원). 서울 아파트는 지수 비율뿐이라 null. */
  nowAmount: number | null;
  /** 그때 값의 시점. monthlyAverage면 그달 월평균. */
  then: { period: string; monthlyAverage: boolean };
  /** 지금 값의 시점과 출처 줄 표기('2026년 9월 물가' 등). */
  now: { period: string; label: string };
  /** 현금만: 그때 100만 원어치를 지금 사려면(원). */
  purchase?: number;
  unit?: { label: '1달러' | '1돈'; then: number; now: number };
  notes: string[];
}

type CellOf = (base: AssetBase, file: AssetYearFile, latest: AssetLatest) => AssetCell | null;

export function assetBase(date: BirthdayDate, today = kstTodayStr()): AssetBase {
  const twentieth = anniversary(date, 20);
  return twentieth <= today ? { date: twentieth, kind: 'twentieth' } : { date: date.iso, kind: 'birthday' };
}

/** 기준일이 공식 환율 기록 시작(1964-05-04) 이후인가. 아니면 칸도 파일 요청도 없다. */
export const assetsAvailable = (base: AssetBase) => base.date >= FX_START;

/** 'YYYY-MM' → 'YYYY년 M월', 'YYYY-MM-DD' → 'YYYY년 M월 D일'. */
export function periodLabel(period: string) {
  if (period.length > 7) return dateLabel(period);
  const [year, month] = period.split('-');
  return `${year}년 ${Number(month)}월`;
}

const monthOf = (base: AssetBase) => base.date.slice(0, 7);
const exact = (points: AssetPoint[] | undefined, period: string) => points?.find(([at]) => at === period) ?? null;
const atOf = ([at]: AssetPoint) => at;

export const cashCell: CellOf = (base, file, latest) => {
  const then = exact(file.cpi, monthOf(base)), now = latest.cpi;
  if (!then || !now) return null;
  return { id: 'cash', name: '현금', multiple: 1, nowAmount: ASSET_STAKE, purchase: ASSET_STAKE * now[1] / then[1],
    then: { period: then[0], monthlyAverage: false }, now: { period: now[0], label: `${periodLabel(now[0])} 물가` }, notes: [] };
};

export const depositCell: CellOf = (base, file, latest) => {
  const then = exact(file.deposit, monthOf(base)), now = latest.deposit, rateMonth = latest.last.deposit_rate;
  if (!then || !now || !rateMonth || then[0] > rateMonth) return null;
  const multiple = now[1] / then[1];
  return { id: 'deposit', name: '정기예금', multiple, nowAmount: ASSET_STAKE * multiple,
    then: { period: then[0], monthlyAverage: false }, now: { period: now[0], label: `${periodLabel(rateMonth)} 금리까지` },
    notes: ['세전, 매달 그달 신규 정기예금 금리로 굴린 값이에요.'] };
};

export const usdCell: CellOf = (base, file, latest) => {
  const now = latest.usdkrw?.daily;
  if (!now || !file.usdkrw) return null;
  const daily = base.date >= ASSET_DATA_FROM.usdDaily;
  const then = daily ? onOrBefore(file.usdkrw.daily, base.date, atOf) : exact(file.usdkrw.monthly, monthOf(base));
  if (!then) return null;
  const multiple = now[1] / then[1];
  const notes = !daily ? [`그때 값은 ${periodLabel(then[0])} 월평균이에요.`]
    : then[0] !== base.date ? ['휴일이라 직전 영업일 종가로 계산했어요.'] : [];
  return { id: 'usd', name: '달러', multiple, nowAmount: ASSET_STAKE * multiple,
    then: { period: then[0], monthlyAverage: !daily }, now: { period: now[0], label: `${periodLabel(now[0])} 종가` },
    unit: { label: '1달러', then: then[1], now: now[1] }, notes };
};

export const apartmentCell: CellOf = (base, file, latest) => {
  const then = exact(file.apartment, monthOf(base)), now = latest.apartment;
  if (!then || !now) return null;
  return { id: 'apartment', name: '서울 아파트', multiple: now[1] / then[1], nowAmount: null,
    then: { period: then[0], monthlyAverage: false }, now: { period: now[0], label: `${periodLabel(now[0])} 지수` },
    notes: ['집값(원)이 아니라 가격지수의 비율이에요.'] };
};

/** 금 1돈(원) = 달러/트로이온스 ÷ 31.1034768 × 3.75 × 원/달러. */
const donPrice = (usdPerOunce: number, krwPerUsd: number) => usdPerOunce / GRAMS_PER_TROY_OUNCE * GRAMS_PER_DON * krwPerUsd;

export const goldCell: CellOf = (base, file, latest) => {
  const month = monthOf(base);
  const ounce = exact(file.gold, month), fx = exact(file.usdkrw?.monthly, month), now = latest.gold;
  if (!ounce || !fx || !now) return null;
  const then = donPrice(ounce[1], fx[1]), today = donPrice(now.usd[1], now.usdkrw[1]);
  const multiple = today / then;
  return { id: 'gold', name: '금 한 돈', multiple, nowAmount: ASSET_STAKE * multiple,
    then: { period: month, monthlyAverage: true }, now: { period: now.usd[0], label: `${periodLabel(now.usd[0])} 월평균` },
    unit: { label: '1돈', then, now: today }, notes: ['국제 금값 월평균을 그달 평균 환율로 바꾼 값이에요.'] };
};

const CELL_OF: Record<AssetCellId, CellOf> = { cash: cashCell, deposit: depositCell, usd: usdCell, apartment: apartmentCell, gold: goldCell };

/** 자료가 있는 칸만 고정 순서로. 기준일이 1964-05-04보다 앞서면 []. */
export function assetCells(base: AssetBase, file: AssetYearFile, latest: AssetLatest): AssetCell[] {
  if (!assetsAvailable(base)) return [];
  return ASSET_CELL_ORDER.flatMap(id => CELL_OF[id](base, file, latest) ?? []);
}

/** 증감 표시 — 색 없이 읽히도록 화살표와 부호를 함께 쓴다. 감소는 U+2212 빼기 기호. */
export function changeOf(multiple: number): { arrow: '▲' | '▼' | ''; signed: string } {
  const pct = Math.round((multiple - 1) * 100);
  if (pct > 0) return { arrow: '▲', signed: `+${number(pct)}%` };
  if (pct < 0) return { arrow: '▼', signed: `\u2212${number(-pct)}%` };
  return { arrow: '', signed: '0%' };
}

/** 한글 끝 글자에 받침이 있는가. ㄹ 받침 여부도 함께(조사 '로/으로'용). */
function finalConsonant(word: string) {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  const jong = code >= 0 && code < 11172 ? code % 28 : 0;
  return { has: jong > 0, rieul: jong === 8 };
}
const withRo = (word: string) => { const end = finalConsonant(word); return `${word}${end.has && !end.rieul ? '으로' : '로'}`; };
const withWa = (word: string) => `${word}${finalConsonant(word).has ? '과' : '와'}`;

/** 자산 장면 출처 문장 — ECOS 제공, 보이는 칸의 작성기관·통계, 그때·지금 기준 시점. 칸이 없으면 ''. */
export function assetSourceLine(cells: AssetCell[], latest: Pick<AssetLatest, 'last'>) {
  void latest; // 지금 시점은 각 칸의 now.label에 이미 들어 있다(latest.last에서 만든 값).
  if (!cells.length) return '';
  const statOf = (cell: AssetCell) => `${ASSET_SOURCE_INFO[cell.id].org} ${ASSET_SOURCE_INFO[cell.id].name}`;
  const ecos = cells.filter(cell => cell.id !== 'gold').map(statOf).join(', ');
  const gold = cells.find(cell => cell.id === 'gold');
  const used = gold ? `${withWa(ecos)} ${statOf(gold)}` : ecos;
  return `${nb('한국은행 ECOS')}에서 받은 ${withRo(used)} 계산했어요. `
    + '그때 값은 기준일이 속한 달(달러는 그날 또는 직전 영업일 종가, 1990년 3월 이전은 월평균) 기준이고, '
    + `지금 값은 ${cells.map(cell => nb(cell.now.label)).join(', ')} 기준이에요.`;
}

/** 하단 출처 줄의 ECOS 작성기관 — 한국은행·국가데이터처(1억 원 장면 물가)는 항상, 한국부동산원은 아파트 칸이 있을 때. */
export function ecosOrgs(cells: AssetCell[]) {
  return ['한국은행', '국가데이터처', ...(cells.some(cell => cell.id === 'apartment') ? ['한국부동산원'] : [])];
}
