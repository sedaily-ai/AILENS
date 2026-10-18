import type { AnnualPoint, AnnualComparison, BirthdayDate, BirthdayResult, MarketRow, MarketSnapshot, Sex } from '../data/birthdayTypes';
import { kstTodayStr } from '@/shared/lib/date/date';
import { AS_OF, CPI_LATEST, CPI_MONTHLY, CATALOG, WAGES } from '../data/birthdayCatalog';
import { BIRTHDAY_MARKET_PATH } from '../data/birthdayRoutes';

export const number = (value: number, digits = 0) => Number(value).toLocaleString('ko-KR', { maximumFractionDigits: digits });
export const won = (value: number) => `${number(value)}원`;
export const percent = (value: number) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${number(Math.abs(value), 1)}%`;

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

export function pensionAt(year: number) {
  if (year < 1988) return null;
  return {
    contribution: year < 1993 ? 3 : year < 1998 ? 6 : year < 2026 ? 9 : Math.min(13, 9.5 + (year - 2026) * 0.5),
    replacement: year <= 1998 ? 70 : year <= 2007 ? 60 : year <= 2025 ? 50 - (year - 2008) * 0.5 : 43,
  };
}

export function pensionCalendar(date: BirthdayDate) {
  if (date.year < 1953) return null;
  const age = date.year <= 1956 ? 61 : date.year <= 1960 ? 62 : date.year <= 1964 ? 63 : date.year <= 1968 ? 64 : 65;
  return [
    { label: '당겨 받기', age: age - 5, date: anniversary(date, age - 5), change: '최대 −30%', changeValue: -30 },
    { label: '정상', age, date: anniversary(date, age), change: '기준', changeValue: 0 },
    { label: '미뤄 받기', age: age + 5, date: anniversary(date, age + 5), change: '최대 +36%', changeValue: 36 },
  ];
}

export function ageOn(birthDate: string, eventDate: string) {
  let age = Number(eventDate.slice(0, 4)) - Number(birthDate.slice(0, 4));
  if (eventDate.slice(5) < birthDate.slice(5)) age--;
  return age;
}

function annual(series: AnnualPoint[], year: number) { return series.find(point => point.period === String(year)); }
function comparison(before: number | undefined, after: number | undefined): number | null {
  return typeof before === 'number' && Number.isFinite(before) && before > 0 && typeof after === 'number' && Number.isFinite(after) ? (after / before - 1) * 100 : null;
}

export function calculate(birthDate: string, sex: Sex, snapshot: MarketSnapshot): BirthdayResult {
  const today = kstTodayStr();
  const date = parseDate(birthDate, today);
  if (!date) throw new Error('1900년 1월 1일부터 오늘까지의 실제 날짜를 입력해 주세요.');
  const cpiMonth = CPI_MONTHLY[birthDate.slice(0, 7)];
  const cpiYear = annual(snapshot.cpi, date.year);
  const cpi = cpiMonth ?? cpiYear?.value ?? null;
  const cpiPeriod = cpiMonth ? `${date.year}년 ${date.month}월` : `${date.year}년 연평균`;
  const wage = wageAt(birthDate);
  const gni = annual(snapshot.gni, date.year);
  const gniNow = snapshot.gni[snapshot.gni.length - 1];
  const pension = pensionAt(date.year);
  const calendar = pensionCalendar(date);
  const purchasingPower = cpi ? 1000000 * cpi / CPI_LATEST.value : null;
  const rows: MarketRow[] = CATALOG.map(item => ({ ...item, state: 'pending', before: '자료 연결 전', after: '자료 연결 전', change: '—', changeValue: null, period: '', detail: '' }));
  const set = (id: string, values: Partial<MarketRow>) => { const row = rows.find(row => row.id === id); if (row) Object.assign(row, values); };
  const unavailable = (id: string, reason: string) => set(id, { state: 'unavailable', before: reason, after: '—', availability: reason });

  set('front-page', { before: '그날의 1면', after: '지면 확인 중', detail: '과거 지면에서 실제 인쇄일과 1면 머리기사를 확인하고 있어요.' });
  set('market-snapshot', { state: 'partial', before: birthDate === '1988-02-03' ? '780.5원 / 달러' : '해당일 환율 연결 전', after: `${number(snapshot.fx[0].value, 1)}원 / 달러`, period: '환율 최근값 2026.10.16', changeValue: birthDate === '1988-02-03' ? comparison(780.5, snapshot.fx[0].value) : null, change: birthDate === '1988-02-03' ? percent(comparison(780.5, snapshot.fx[0].value) ?? 0) : '일부 확인', detail: '코스피·금리는 아직 연결하지 않았습니다. 최근 환율은 실시간이 아닌 공표 시점의 고정 자료입니다.' });
  if (cpi) set('cpi', { state: 'ready', before: '1억 원', after: `약 ${number(10000 * CPI_LATEST.value / cpi)}만 원`, change: `${number(CPI_LATEST.value / cpi, 2)}배`, changeValue: comparison(cpi, CPI_LATEST.value), period: `${cpiPeriod} → 2026년 9월`, detail: `CPI ${number(cpi, 3)} → ${number(CPI_LATEST.value, 2)}. ${cpiMonth ? '해당 월의 실제 통계' : '해당 월 자료를 연결하기 전, 출생연도 평균으로 비교'}합니다.` });
  else unavailable('cpi', date.year < 1965 ? '1965년 이전 자료 없음' : '출생연도 통계 미연결');
  if (wage) set('minimum-wage', { state: 'ready', before: `${number(wage, 1)}원`, after: '10,320원', change: `${number(10320 / wage, 2)}배`, changeValue: comparison(wage, 10320), period: '출생일 적용액 → 2026년 적용액', detail: date.year === 1988 ? '1988년 2그룹 기준입니다. 당시 1그룹은 462.5원입니다.' : '시행일을 기준으로 계산합니다. 2027년 고시액은 미리 적용하지 않습니다.' });
  else unavailable('minimum-wage', '최저임금 시행 전');
  if (anniversary(date, 1) > today) unavailable('gold-ring', '아직 첫돌 전');
  set('million-won', { state: cpi ? 'partial' : 'pending', before: '현금 100만 원', after: purchasingPower !== null ? `구매력 ${number(purchasingPower / 10000, 2)}만 원` : '구매력 자료 없음', change: '아래에서 보기', changeValue: comparison(1000000, purchasingPower ?? undefined), period: cpi ? `${cpiPeriod}의 구매력 기준` : '', detail: '명목 잔액은 그대로 100만 원입니다. 물가를 반영한 구매력만 달라집니다.' });
  if (gni) set('national-economy', { state: 'partial', before: `$${number(gni.value, 1)}`, after: `$${number(gniNow.value, 1)}`, change: percent(comparison(gni.value, gniNow.value) ?? 0), changeValue: comparison(gni.value, gniNow.value), period: `1인당 GNI · ${date.year}년 → ${gniNow.period}년`, detail: '명목 달러 기준입니다. 수출액은 아직 원 통계 응답을 연결하지 않았습니다.' });
  else set('national-economy', { state: 'partial', before: '출생연도 자료 없음', after: `$${number(gniNow.value, 1)}`, period: `최근 GNI ${gniNow.period}년` });
  set('life-expectancy', { detail: `선택: ${{ all: '전체', female: '여성', male: '남성' }[sex] ?? '전체'}. 해당 성별의 검증된 원 통계가 연결되면 계산합니다.` });
  if (pension) set('pension-rules', { state: 'ready', before: `${pension.contribution}% / ${pension.replacement}%`, after: '9.5% / 43%', change: '제도값 비교', period: '보험료율 / 소득대체율', detail: `보험료율 ${number(9.5 - pension.contribution, 1)}%p 변화, 소득대체율 ${number(43 - pension.replacement, 1)}%p 변화. 개인 연금액이 아닙니다.` });
  else unavailable('pension-rules', '국민연금 시행 전');
  if (calendar) set('pension-calendar', { state: 'ready', before: `${calendar[0].date.slice(0, 4)}년부터`, after: `${calendar[1].date.slice(0, 4)}년 정상`, change: '달력 보기', period: '현행 제도 · 연령에 해당하는 생일' });
  else unavailable('pension-calendar', '1953년 이전 규칙 미연결');
  const chart = snapshot.cpi.filter(point => Number(point.period) >= date.year);
  set('history-chart', { state: chart.length ? 'partial' : 'unavailable', before: chart.length ? `${chart[0].period}년` : '출생연도 연간값 없음', after: chart.length ? `${chart[chart.length - 1].period}년` : '—', change: '그래프 보기', period: '연평균 CPI · 코스피 연결 전' });

  return { birthDate, sex, date, rows, cpi, cpiPeriod, purchasingPower, calendar, chart, events: snapshot.events.filter(event => event.date >= birthDate && event.date <= AS_OF), snapshot };
}

// 공유 순위는 같은 출생연도~2025년의 연간 자료만 비교한다.
export function comparableAnnual(result: BirthdayResult): AnnualComparison[] {
  const year = result.date.year;
  const seriesList: [string, AnnualPoint[], string][] = [['cpi', result.snapshot.cpi, '물가 전체'], ['national-economy', result.snapshot.gni, '1인당 국민총소득']];
  return seriesList.flatMap(([id, series, title]) => {
    const before = annual(series, year);
    const after = annual(series, 2025);
    const change = comparison(before?.value, after?.value);
    return change === null || !before || !after ? [] : [{ id, title, before: before.value, after: after.value, change, unit: before.unit, period: `${year}년 → 2025년 · 연간 기준` }];
  }).sort((a, b) => b.change - a.change);
}

// 서비스 공유 링크에는 월·일/성별을 넣지 않는다. 월·일 공개는 저장 이미지에서만 선택한다.
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
