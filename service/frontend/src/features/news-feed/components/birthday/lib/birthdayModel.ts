import type { AgeEvent, AgeMonths, BirthdayDate, BirthdayResult, MarketSnapshot, PensionCalendar, ViewMode } from '../data/birthdayTypes';
import { kstTodayStr } from '@/shared/lib/date/date';
import { AS_OF, CPI_LATEST, CPI_MONTHLY, WAGES } from '../data/birthdayCatalog';
import { BIRTHDAY_MARKET_PATH } from '../data/birthdayRoutes';
import { BIRTHDAY_MOMENTS, HERO_MOMENT_ID } from '../data/birthdayMoments';

export const number = (value: number, digits = 0) => Number(value).toLocaleString('ko-KR', { maximumFractionDigits: digits });
export const won = (value: number) => `${number(value)}원`;
/** 금액을 만 원 단위로 반올림해 읽기 쉽게 쓴다(기획안 v3 표시 규칙). 1억 이상은 억·만을 함께 쓴다. */
export function manwon(value: number) {
  const man = Math.round(value / 10000);
  if (man >= 10000) { const eok = Math.floor(man / 10000), rest = man % 10000; return `${number(eok)}억${rest ? ` ${number(rest)}만` : ''} 원`; }
  return man >= 1 ? `${number(man)}만 원` : won(value);
}
export const times = (value: number) => `${number(value, 1)}배`;

export function parseDate(value: string, today = kstTodayStr()): BirthdayDate | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1900 || value > today || month < 1 || month > 12 || day < 1) return null;
  if (day > new Date(Date.UTC(year, month, 0)).getUTCDate()) return null;
  return { year, month, day, iso: value };
}

export function anniversary(date: BirthdayDate, years: number) {
  const year = date.year + years;
  const day = Math.min(date.day, new Date(Date.UTC(year, date.month, 0)).getUTCDate());
  return `${year}-${String(date.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function wageAt(date: string) {
  return WAGES.findLast(([start]) => start <= date)?.[1] ?? null;
}

/** 그 날짜의 CPI. 확보한 달은 월별 값, 없으면 그해 연평균. */
export function cpiAt(date: string, snapshot: Pick<MarketSnapshot, 'cpi'>) {
  return CPI_MONTHLY[date.slice(0, 7)] ?? snapshot.cpi.find(point => point.period === date.slice(0, 4))?.value ?? null;
}

const PENSION_EARLY = 70;
const PENSION_LATE = 136;
const PENSION_SHIFT_YEARS = 5;

/**
 * 정상(100) 대비 ratio로 shift년 일찍(음수)·늦게(양수) 받기 시작했을 때 누적액이 같아지는 시점(정상 개시 후 개월).
 * r(x − s) = x → x = r·s ÷ (r − 1). 물가 연동·세금·건강보험료는 뺀 단순 계산(기획안 v3).
 */
function breakEvenMonths(ratio: number, shiftYears: number) {
  return Math.round(shiftYears * (ratio / 100) / (ratio / 100 - 1) * 12);
}
const plusMonths = (age: number, months: number): AgeMonths => ({ years: age + Math.floor(months / 12), months: months % 12 });

/** 기획안 v3 §5 모드 A — 개시 연월(해당 나이 생일의 다음 달), 정상 100 대비 비율, 손익분기 나이. 개인 수령액이 아니다. */
export function pensionCalendar(date: BirthdayDate): PensionCalendar | null {
  if (date.year < 1953) return null;
  const age = date.year <= 1956 ? 61 : date.year <= 1960 ? 62 : date.year <= 1964 ? 63 : date.year <= 1968 ? 64 : 65;
  const start = (years: number) => {
    const [year, month] = anniversary(date, years).split('-').map(Number);
    return month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, '0')}`;
  };
  return {
    points: [
      { label: '당겨 받기', age: age - PENSION_SHIFT_YEARS, start: start(age - PENSION_SHIFT_YEARS), ratio: PENSION_EARLY },
      { label: '정상', age, start: start(age), ratio: 100 },
      { label: '미뤄 받기', age: age + PENSION_SHIFT_YEARS, start: start(age + PENSION_SHIFT_YEARS), ratio: PENSION_LATE },
    ],
    breakEven: {
      early: plusMonths(age, breakEvenMonths(PENSION_EARLY, -PENSION_SHIFT_YEARS)),
      late: plusMonths(age, breakEvenMonths(PENSION_LATE, PENSION_SHIFT_YEARS)),
    },
  };
}

export function ageOn(birthDate: string, eventDate: string) {
  let age = Number(eventDate.slice(0, 4)) - Number(birthDate.slice(0, 4));
  if (eventDate.slice(5) < birthDate.slice(5)) age--;
  return age;
}

/** 2026년 최저시급(원). */
export const WAGE_NOW = 10320;
/** 그때 1억 원을 오늘 물가로 바꾼 금액(원). */
export const hundredMillionNow = (cpi: number) => 100_000_000 * CPI_LATEST.value / cpi;
/** "그 순간, 나는 몇 살" 장면에 쓰는 순간 수와, 순간끼리 떨어뜨릴 햇수("만 5세, 만 5세"처럼 겹치지 않게). */
const MOMENT_LIMIT = 3;
const MOMENT_GAP_YEARS = 2;
/** 월드컵을 겪지 않았으면 이 나이에 가장 가까운 순간을 제목으로 쓴다 — 십 대 무렵의 기억이 가장 또렷하다. */
const HERO_AGE = 12;

/** 순간 하나를 날짜·링크로 푼다. 연대기 사건은 연대기의 날짜와 주소, 그 밖의 행사는 직접 확인한 날짜와 그날 신문. */
function resolveMoment(moment: (typeof BIRTHDAY_MOMENTS)[number], byId: Map<string, MarketSnapshot['events'][number]>) {
  if ('chronicleId' in moment) {
    const event = byId.get(moment.chronicleId);
    return event ? { id: event.id, date: event.date, link: { href: `/timeline/chronicle?e=${encodeURIComponent(event.id)}`, label: '연대기에서 보기' as const } } : null;
  }
  return { id: `moment-${moment.date}`, date: moment.date, link: moment.paperDate ? { href: `/timeline/${moment.paperDate}`, label: '그날 신문 보기' as const } : null };
}

/**
 * 생일 뒤 만 1세 이상에 겪은 국민적 순간(data/birthdayMoments.ts) 중 최대 3개, 날짜 순.
 * 대표(제목)는 2002 월드컵을 겪었으면 월드컵, 아니면 만 12세에 가장 가까운 순간.
 * 나머지는 가장 최근 순간 → 가장 이른 순간 → 고른 범위의 한가운데에 가까운 순간 순으로, 이미 고른 것과 MOMENT_GAP_YEARS년 이상
 * 떨어진 것만 더한다. 그래서 어릴 때·자라서·최근이 고루 나온다.
 */
export function pickMoments(birthDate: string, birthYear: number, events: MarketSnapshot['events'], mode: ViewMode) {
  const byId = new Map(events.map(event => [event.id, event]));
  const lived: AgeEvent[] = BIRTHDAY_MOMENTS.flatMap(moment => {
    const resolved = resolveMoment(moment, byId);
    if (!resolved || resolved.date < birthDate || resolved.date > AS_OF) return [];
    const age = mode === 'year' ? null : ageOn(birthDate, resolved.date);
    const yearsAfter = Number(resolved.date.slice(0, 4)) - birthYear;
    return (age ?? yearsAfter) >= 1 ? [{ ...resolved, title: moment.label, age, yearsAfter }] : [];
  }).sort((a, b) => a.date.localeCompare(b.date));
  if (!lived.length) return { ages: [], heroAge: null };
  const ageValue = (moment: AgeEvent) => moment.age ?? moment.yearsAfter;
  const heroAge = lived.find(moment => moment.id === HERO_MOMENT_ID)
    ?? lived.reduce((best, moment) => Math.abs(ageValue(moment) - HERO_AGE) <= Math.abs(ageValue(best) - HERO_AGE) ? moment : best);
  const yearOf = (moment: AgeEvent) => Number(moment.date.slice(0, 4));
  const picked = [heroAge];
  const fits = (moment: AgeEvent) => !picked.includes(moment) && picked.every(other => Math.abs(yearOf(moment) - yearOf(other)) >= MOMENT_GAP_YEARS);
  for (const moment of [lived[lived.length - 1], lived[0]]) if (picked.length < MOMENT_LIMIT && fits(moment)) picked.push(moment);
  while (picked.length < MOMENT_LIMIT) {
    const years = picked.map(yearOf);
    const middle = (Math.min(...years) + Math.max(...years)) / 2;
    // 한가운데에서 가까운 순, 같으면 이른 순간(lived가 날짜 순이라 sort가 순서를 지킨다).
    const next = lived.filter(fits).sort((a, b) => Math.abs(yearOf(a) - middle) - Math.abs(yearOf(b) - middle))[0];
    if (!next) break;
    picked.push(next);
  }
  return { ages: picked.sort((a, b) => a.date.localeCompare(b.date)), heroAge };
}

export function calculate(birthDate: string, snapshot: MarketSnapshot, mode: ViewMode = 'personal'): BirthdayResult {
  const today = kstTodayStr();
  const date = parseDate(birthDate, today);
  if (!date) throw new Error('1900년 1월 1일부터 오늘까지의 실제 날짜를 입력해 주세요.');
  const cpiMonth = CPI_MONTHLY[birthDate.slice(0, 7)];
  const { ages, heroAge } = pickMoments(birthDate, date.year, snapshot.events, mode);
  return { birthDate, date, cpi: cpiAt(birthDate, snapshot), cpiPeriod: cpiMonth ? `${date.year}년 ${date.month}월` : `${date.year}년 연평균`,
    wage: wageAt(birthDate), calendar: pensionCalendar(date), ages, heroAge, snapshot };
}

// 서비스 공유 링크에는 월·일을 넣지 않는다. 월·일 공개는 저장 이미지에서만 선택한다.
export function shareUrl(base: string, result: BirthdayResult) {
  const url = new URL(base);
  url.pathname = BIRTHDAY_MARKET_PATH;
  url.search = '';
  url.hash = `birthday-year=${result.date.year}`;
  return url.href;
}

export function sharedYear(hash: string): string | null {
  const match = /^#birthday-year=(\d{4})$/.exec(hash);
  return match && parseDate(`${match[1]}-01-01`) ? match[1] : null;
}

export function dateLabel(iso: string) {
  const [year, month, day] = iso.split('-');
  return `${year}년 ${Number(month)}월 ${Number(day)}일`;
}

/** 오늘까지 지난 기간 — "26년 7개월". */
export function elapsedLabel(birthDate: string, today = kstTodayStr()) {
  const [by, bm, bd] = birthDate.split('-').map(Number), [ty, tm, td] = today.split('-').map(Number);
  let months = (ty - by) * 12 + (tm - bm);
  if (td < bd) months--;
  const years = Math.floor(months / 12), rest = months % 12;
  return years ? `${years}년${rest ? ` ${rest}개월` : ''}` : `${rest}개월`;
}
