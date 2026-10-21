// "스무 살의 내가 100만 원을 어디에 뒀다면" 칸 계산. 값은 수집 스크립트가 만든 연도 파일·latest.json(data/birthdayAssets.ts 형식)에서만 읽는다.
import { kstTodayStr } from '@/shared/lib/date/date';
import { ASSET_SERIES_FROM, ASSET_SOURCE_INFO, GOLD_SOURCE, type AssetLatest, type AssetPoint, type AssetYearFile } from '../data/birthdayAssets';
import type { BirthdayDate } from '../data/birthdayTypes';
import { anniversary, dateLabel, number, times } from './birthdayModel';
import { nb } from './keepTogether';

const GRAMS_PER_DON = 3.75;
const GRAMS_PER_TROY_OUNCE = 31.1034768;

/** 오름차순 배열에서 key 이하인 마지막 원소(휴장일이면 직전 영업일). */
export function onOrBefore<T>(points: T[], key: string, keyOf: (point: T) => string): T | null {
  let low = 0, high = points.length - 1, found: T | null = null;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (keyOf(points[mid]) <= key) { found = points[mid]; low = mid + 1; } else high = mid - 1;
  }
  return found;
}

// ── 스무 살의 내가 100만 원을 어디에 뒀다면 ──────────────────────────────────────────────
// 칸은 고정 순서(정기예금 → 달러 → 서울 아파트 → 금)이고 정렬·1등 강조가 없다. 그때 값이 연도 파일에 정확히
// 있을 때만 칸을 만든다(대체·추정 없음). 월별 자료는 기준일이 속한 달 값을 쓴다(그달 초에 넣었다고 본다).
// 물가는 칸이 아니라 칸 목록 아래 한 줄(assetInflation)로, 칸과 같은 기간 기준이다.

/** 넣었다고 보는 금액(원). */
export const ASSET_STAKE = 1_000_000;
/** 이보다 앞선 기준일은 칸이 없다(원/달러 월평균 시작). */
export const FX_START = ASSET_SERIES_FROM.fx;

export type AssetCellId = 'deposit' | 'usd' | 'apartment' | 'gold';
export const ASSET_CELL_ORDER: readonly AssetCellId[] = ['deposit', 'usd', 'apartment', 'gold'];

/** 기준일 — 서른 살 생일이 지났으면(당일 포함) 스무 살 생일, 아직이면 태어난 날. */
export interface AssetBase { date: string; kind: 'twentieth' | 'birthday' }

export interface AssetCell {
  id: AssetCellId;
  name: string;
  /** 지금 ÷ 그때. */
  multiple: number;
  /** 100만 원 기준 지금 금액(원). 서울 아파트는 지수 비율뿐이라 null. */
  nowAmount: number | null;
  /** 그때 값의 시점. monthlyAverage면 그달 월평균. */
  then: { period: string; monthlyAverage: boolean };
  /** 지금 값의 시점과 출처 줄 표기('2026년 8월 금리까지' 등). */
  now: { period: string; label: string };
  unit?: { label: '1달러' | '1돈'; then: number; now: number };
  notes: string[];
}

type CellOf = (base: AssetBase, file: AssetYearFile, latest: AssetLatest) => AssetCell | null;

/**
 * 서른 살 생일부터 스무 살 생일 기준이라 비교 기간이 늘 10년 이상(그 전은 태어난 뒤 전체)이다.
 * 스무 살 생일 기준이면 21살은 1년 치만 비교돼서 바꿨다(2026-10-21). 2월 29일생은 anniversary 규칙대로 그해 말일.
 * 연도만 공유된 결과는 date가 그해 1월 1일이라 서른 살이 되는 해의 1월 1일부터 스무 살이 된 해의 1월 1일 기준이다.
 */
export function assetBase(date: BirthdayDate, today = kstTodayStr()): AssetBase {
  return anniversary(date, 30) <= today ? { date: anniversary(date, 20), kind: 'twentieth' } : { date: date.iso, kind: 'birthday' };
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

/** 물가 줄 — 칸과 같은 기간의 소비자물가 배수. then·now는 'YYYY-MM'. */
export interface AssetInflation { multiple: number; then: string; now: string }

/** 기준일이 속한 달 → latest.cpi. 그달 지수가 없으면(1964년, 미발표 달) null — 대체·추정 없음. */
export function assetInflation(base: AssetBase, file: AssetYearFile, latest: AssetLatest): AssetInflation | null {
  if (!assetsAvailable(base)) return null;
  const then = exact(file.cpi, monthOf(base)), now = latest.cpi;
  if (!then || !now) return null;
  return { multiple: now[1] / then[1], then: then[0], now: now[0] };
}

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
  const daily = base.date >= ASSET_SERIES_FROM.usdDaily;
  // 수집 끝 날짜(latest.until) 뒤의 기준일은 그날 종가가 아직 없다. 마지막 값을 '직전 영업일'로 대신하지 않는다.
  if (daily && base.date > latest.until) return null;
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
    unit: { label: '1돈', then, now: today },
    // 원화·1돈으로 바꿨다는 변경 표시(CC BY 4.0)이자, 이 값을 국내 금 시세로 읽지 않게 하는 메모.
    // 375px에서 '국내 금 / 시세와는'으로 '금 시세'가 갈라져서 묶는다.
    notes: [`국제 금값 월평균을 그달 평균 환율로 바꾼 값이라 ${nb('국내 금 시세와는')} ${nb('다를 수 있어요.')}`] };
};

const CELL_OF: Record<AssetCellId, CellOf> = { deposit: depositCell, usd: usdCell, apartment: apartmentCell, gold: goldCell };

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

/** 물가 줄 문장. 1배로 반올림되는 짧은 기간(올해 태어난 날 등)은 '1배 올랐어요'가 되지 않게 %로 쓴다. */
export function inflationLine({ multiple }: AssetInflation) {
  const pct = Math.round((multiple - 1) * 100);
  const change = multiple > 1 && times(multiple) !== times(1) ? `${times(multiple)} 올랐어요.`
    : pct > 0 ? `${number(pct)}% 올랐어요.` : pct < 0 ? `${number(-pct)}% 내렸어요.` : '거의 그대로예요.';
  return `같은 기간 물가는 ${nb(change)}`;
}

/** 출처 줄 조각 — 글자, 또는 새 탭으로 여는 링크(자료·라이선스 원문). */
export type SourcePart = string | { text: string; href: string };

/** 조각을 이은 문장(화면에 보이는 글자와 같다). */
export const sourceText = (parts: SourcePart[]) => parts.map(part => typeof part === 'string' ? part : part.text).join('');

/**
 * 금 자료 표기 '세계은행 Pink Sheet(CC BY 4.0)' — '세계은행 Pink Sheet'는 원자료 안내, 'CC BY 4.0'은 라이선스 본문 링크.
 * 'Pink Sheet(CC BY 4.0)'은 'CC / BY 4.0'처럼 갈라지지 않게 붙여 둔다(링크 경계는 줄바꿈 자리가 아니다). together면 '세계은행'까지 붙인다.
 */
export function goldSourceParts(together = false): SourcePart[] {
  const { org } = ASSET_SOURCE_INFO.gold, { dataset, datasetHref, license, licenseHref } = GOLD_SOURCE;
  return [{ text: together ? nb(`${org} ${dataset}`) : `${org} ${nb(dataset)}`, href: datasetHref }, '(', { text: nb(license), href: licenseHref }, ')'];
}

/** 자산 장면 출처 문장 조각 — ECOS 제공, 보이는 칸(과 물가 줄)의 작성기관·통계, 그때·지금 기준 시점. 금 칸이 있으면 세계은행 자료·라이선스 링크. 칸이 없으면 []. */
export function assetSourceParts(cells: AssetCell[], inflation: AssetInflation | null): SourcePart[] {
  if (!cells.length) return [];
  const statOf = (id: keyof typeof ASSET_SOURCE_INFO) => `${ASSET_SOURCE_INFO[id].org} ${ASSET_SOURCE_INFO[id].name}`;
  // 물가 줄은 칸 목록 아래에 있어 ECOS 통계 목록과 지금 시점 목록 모두 칸 뒤에 둔다.
  const ecos = [...cells.filter(cell => cell.id !== 'gold').map(cell => statOf(cell.id)), ...(inflation ? [statOf('cpi')] : [])].join(', ');
  const nowLabels = [...cells.map(cell => cell.now.label), ...(inflation ? [`${periodLabel(inflation.now)} 물가`] : [])];
  const lead = `${nb('한국은행 ECOS')}에서 받은 `;
  const rest = ' 계산했어요. 그때 값은 기준일이 속한 달(달러는 그날 또는 직전 영업일 종가, 1990년 3월 이전은 월평균) 기준이고, '
    + `지금 값은 ${nowLabels.map(nb).join(', ')} 기준이에요.`;
  if (!cells.some(cell => cell.id === 'gold')) return [`${lead}${withRo(ecos)}${rest}`];
  return [`${lead}${withWa(ecos)} `, ...goldSourceParts(), ` ${withRo(ASSET_SOURCE_INFO.gold.name)}${rest}`];
}

/** 출처 문장 글자만. */
export const assetSourceLine = (cells: AssetCell[], inflation: AssetInflation | null) => sourceText(assetSourceParts(cells, inflation));

/** 하단 출처 줄의 ECOS 작성기관 — 한국은행은 항상, 국가데이터처는 물가(1억 원 장면·물가 줄)를 보일 때, 한국부동산원은 아파트 칸이 있을 때. */
export function ecosOrgs(cells: AssetCell[], cpiShown: boolean) {
  return ['한국은행', ...(cpiShown ? ['국가데이터처'] : []), ...(cells.some(cell => cell.id === 'apartment') ? ['한국부동산원'] : [])];
}
