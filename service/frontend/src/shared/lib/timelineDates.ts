// 타임라인 날짜 계산 — 순수 함수만. "오늘"은 항상 KST 기준(kstTodayStr)이다.
import { BIGKINDS_MIN_DATE } from '@/shared/constants/timeline';
import { kstTodayStr } from '@/shared/lib/date';

const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];

const pad2 = (n: number) => String(n).padStart(2, '0');
const parseYmd = (s: string) => s.split('-').map((v) => parseInt(v, 10)) as [number, number, number];

/** Date → 'YYYY-MM-DD'(브라우저 로컬 시각 기준). */
export function ymd(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** 'YYYY-MM-DD' → '2026년 10월 4일'. */
export function kdate(s: string): string {
  const [y, m, d] = s.split('-');
  return `${y}년 ${parseInt(m, 10)}월 ${parseInt(d, 10)}일`;
}

/** 'YYYY-MM-DD' → '2026. 10. 4. (일)'. 파싱이 안 되면 입력을 그대로 돌려준다. */
export function formatDateLabel(dateStr: string): string {
  const [y, m, d] = parseYmd(dateStr);
  if (!y || !m || !d) return dateStr;
  const w = WEEKDAY[new Date(y, m - 1, d).getDay()];
  return `${y}. ${m}. ${d}.${w ? ` (${w})` : ''}`;
}

/** 오늘에서 n년 전 같은 날. 2/29 같은 날이 없는 해는 28일로 맞춘다. */
export function yearsAgoToday(years: number): string {
  const [y, m, d] = parseYmd(kstTodayStr());
  const targetY = y - years;
  const day = new Date(targetY, m - 1, d).getMonth() === m - 1 ? d : 28;
  return `${targetY}-${pad2(m)}-${pad2(day)}`;
}

/** 그 날짜로부터 오늘까지 꽉 찬 해 수(0이면 1년이 안 됐다). */
export function fullYearsAgo(dateStr: string): number {
  const [fy, fm, fd] = parseYmd(dateStr);
  const [ty, tm, td] = parseYmd(kstTodayStr());
  const n = ty - fy;
  return tm < fm || (tm === fm && td < fd) ? n - 1 : n;
}

/** 빅카인즈 최초 날짜~오늘 사이의 무작위 날짜. */
export function randomDateInRange(): string {
  const start = new Date(BIGKINDS_MIN_DATE).getTime();
  return ymd(new Date(start + Math.random() * (Date.now() - start)));
}

/** 숫자만 입력받은 값 → '1999 / 11 / 17' 표시용. */
export function formatDateDigits(digits: string): string {
  if (digits.length < 5) return digits;
  return `${digits.slice(0, 4)} / ${digits.slice(4, 6)}${digits.length >= 7 ? ` / ${digits.slice(6)}` : ''}`;
}

/** 8자리 숫자(YYYYMMDD) → 유효하고 허용 범위(1990-01-01~오늘)인 'YYYY-MM-DD', 아니면 null. */
export function digitsToValidDate(digits: string): string | null {
  if (digits.length !== 8) return null;
  const y = parseInt(digits.slice(0, 4), 10);
  const m = parseInt(digits.slice(4, 6), 10);
  const d = parseInt(digits.slice(6, 8), 10);
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  const candidate = `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
  return candidate < BIGKINDS_MIN_DATE || candidate > kstTodayStr() ? null : candidate;
}

/** 사건 날짜 표기 — 'YYYY-MM-DD' → '1997년 11월 21일', 'YYYY-MM' → '1997년 1월', 기간이면 '… ~ …'. */
export function formatEventDate(date: string, endDate?: string): string {
  const one = (d: string) => (d.length === 7 ? `${d.slice(0, 4)}년 ${parseInt(d.slice(5), 10)}월` : kdate(d));
  return endDate ? `${one(date)} ~ ${one(endDate)}` : one(date);
}

/** 'YYYY-MM-DD'에 일수를 더한 날짜(UTC 계산, 시간대 영향 없음). */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
