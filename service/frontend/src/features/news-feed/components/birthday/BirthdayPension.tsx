import { ExternalLink } from 'lucide-react';
import type { BirthdayResult, ViewMode } from './data/birthdayTypes';
import { nb } from './lib/keepTogether';
import styles from './birthdayStory.module.css';

// 국민연금공단 예상연금 조회 — 공식 홈페이지로 보낸다(개인 수령액은 공단에서만 확인할 수 있다).
const NPS_URL = 'https://www.nps.or.kr';

/**
 * 정상 수령(100) 대비 매달 받는 돈의 차이. '평생 70'처럼 비율만 쓰면 70이 나이·금액으로 읽혀서
 * '매달 30% 덜 / 기준 금액 / 매달 36% 더'로 풀어 쓴다.
 */
const monthlyChange = (ratio: number) => ratio === 100 ? '기준 금액' : nb(`매달 ${Math.abs(ratio - 100)}% ${ratio < 100 ? '덜' : '더'}`);

/** ⑤ 연금 달력(기획안 v3 S8·§5 모드 A) — 개시 연월과 정상 수령 대비 매달 받는 돈의 비율만. 개인 금액은 쓰지 않는다. */
export function BirthdayPension({ result, mode }: { result: BirthdayResult; mode: ViewMode }) {
  const calendar = result.calendar;
  if (!calendar) return null;
  const month = (start: string) => mode === 'year' ? `${start.slice(0, 4)}년` : `${start.slice(0, 4)}.${start.slice(5)}`;
  const [, normal] = calendar.points;
  const { early, late } = calendar.breakEven;
  return <section className={styles.scene} aria-labelledby="birthday-pension">
    <p className={styles.kicker}>국민연금 정상 수령은</p>
    <h3 id="birthday-pension" className={styles.figure}>{mode === 'year' ? `${normal.start.slice(0, 4)}년부터` : `${normal.start.slice(0, 4)}년 ${Number(normal.start.slice(5))}월`}</h3>
    <ol className={styles.pension}>{calendar.points.map(point => <li key={point.label} data-normal={point.ratio === 100 || undefined}>
      <span>{point.label} · 만 {point.age}세</span><strong>{month(point.start)}</strong><span>{monthlyChange(point.ratio)}</span>
    </li>)}</ol>
    {/* 손익분기는 '같아지는 나이'만 쓰면 그 전후로 어느 쪽이 많은지 알 수 없어서, 각 방식이 정상 수령보다 많은 구간으로 쓴다. */}
    {/* 당겨·미뤄 받을 때 매달 받는 돈이 줄고 느는 비율은 바로 위 목록(매달 …% 덜 / 기준 금액 / 매달 …% 더)과 같은 숫자의 반복이라 문단에서 뺐다(2026-10-22). */}
    <p className={styles.lead}>
      {nb('한번 정한 비율은')} {nb('평생 그대로예요')}.
      {' '}{nb('받은 돈을 모두 더하면')} {nb('당겨 받은 쪽은')} {nb(`만 ${early.years}세 ${early.months}개월까지`)}, {nb('미뤄 받은 쪽은')} {nb(`만 ${late.years}세 ${late.months}개월부터`)} {nb('정상 수령보다 많아요')}. {nb('어느 쪽이 낫다는 뜻은 아니에요')}.
    </p>
    <p className={styles.source}>지금 제도로 계산한 예시이고 실제 내 수령액은 아니에요. 가입 기간이 10년 이상이어야 {nb('받을 수 있고')}, {nb('당겨 받을 때는')} 소득 요건도 있어요. 제도는 {nb('바뀔 수 있으니')} 정확한 내용은 국민연금공단에서 {nb('확인해 주세요')}.</p>
    <a className={styles.official} href={NPS_URL} target="_blank" rel="noopener noreferrer">국민연금공단에서 내 예상 연금 조회하기<ExternalLink size={14} aria-hidden="true" /><span className="sr-only"> (새 창)</span></a>
  </section>;
}
