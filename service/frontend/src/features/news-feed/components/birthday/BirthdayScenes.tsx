import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { CPI_LATEST } from './data/birthdayCatalog';
import type { BirthdayResult, ViewMode } from './data/birthdayTypes';
import type { AssetResult } from './lib/birthdayAssets';
import { dateLabel, elapsedLabel, hundredMillionNow, manwon, number, times, WAGE_NOW } from './lib/birthdayModel';
import { nb } from './lib/keepTogether';
import styles from './birthdayStory.module.css';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const shortDate = (date: string) => date.replaceAll('-', '.');
const REWIND_MS = 1200;

/** 연도 숫자판 — 첫 화면에서 오늘 연도부터 생일 연도까지 한 번 되감는다. 움직임 줄이기 설정이면 바로 보여 준다. */
function useRewind(target: number) {
  const [from] = useState(() => typeof window !== 'undefined' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches ? new Date().getFullYear() : target);
  const [shown, setShown] = useState(from);
  useEffect(() => {
    if (from === target) return;
    let frame = 0;
    const started = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - started) / REWIND_MS);
      setShown(Math.round(from + (target - from) * (1 - (1 - progress) ** 3)));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [from, target]);
  return shown;
}

export function ArrivalScene({ result, mode }: { result: BirthdayResult; mode: ViewMode }) {
  const { year, month, day } = result.date;
  const shown = useRewind(year);
  const weekday = WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  return <section className={`${styles.scene} ${styles.arrival}`} aria-labelledby="birthday-arrival">
    <p className={styles.kicker}>{mode === 'year' ? `${year}년으로 왔어요` : `${elapsedLabel(result.birthDate)}을 거슬러 왔어요`}</p>
    <div className={styles.odometer} aria-hidden="true">{String(shown).split('').map((digit, index) => <span key={index}>{digit}</span>)}</div>
    <h2 id="birthday-arrival" className={styles.title}>{mode === 'year' ? `${year}년생` : <>{month}월 {day}일<br />{weekday}요일</>}<span className="sr-only">{mode === 'year' ? '' : `, ${dateLabel(result.birthDate)}`}</span></h2>
    <p className={styles.lead}>{mode === 'year' ? '그해와 지금을 비교했어요. 날짜가 필요한 값은 1월 1일 기준이에요.' : `내가 태어난 날, 서울경제는 ${nb('이런 소식을')} 실었어요.`}</p>
  </section>;
}

/** 자산 시세가 하나라도 있을 때 — 1등 자산과 다섯 자산의 배수(기획안 v3 S2·배수 한눈에). */
export function AssetScene({ assets }: { assets: AssetResult[] }) {
  const ready = assets.filter(asset => asset.state === 'ready' && asset.multiple !== null).sort((a, b) => b.multiple! - a.multiple!);
  const top = ready[0];
  const max = top?.multiple ?? 1;
  if (!top) return null;
  return <section className={styles.scene} aria-labelledby="birthday-assets">
    <p className={styles.kicker}>태어난 날 그때 샀다면, 오늘 1등은</p>
    <h3 id="birthday-assets" className={styles.figure} data-accent="">{top.name} {times(top.multiple!)}</h3>
    <ol className={styles.bars}>{assets.map(asset => <li key={asset.id}>
      <div className={styles.barRow} data-state={asset.state}>
        <span>{asset.name}</span>
        <span className={styles.barTrack} aria-hidden="true">{asset.multiple !== null && <span style={{ width: `${Math.max(4, Math.log10(1 + asset.multiple) / Math.log10(1 + max) * 100)}%` }} />}</span>
        <strong>{asset.multiple !== null ? times(asset.multiple) : asset.state === 'pending' ? '준비 중' : '계산 불가'}</strong>
      </div>
      {asset.start && asset.now && <p className={styles.barDetail}>{shortDate(asset.start.date)} {asset.start.label} {manwon(asset.start.amount)} → 오늘 {asset.now.label} {manwon(asset.now.amount)}{asset.notes.length ? ` · ${asset.notes[0]}` : ''}</p>}
    </li>)}</ol>
    <p className={styles.source}>과거 시세로 계산한 가정이에요. 특정 자산을 사거나 팔라는 권유가 아니에요. 수수료·세금·배당은 빼고 계산했고 막대는 로그 눈금이에요.</p>
    <p className={styles.links}><Link href="/search?q=%EB%B0%98%EB%8F%84%EC%B2%B4" prefetch={false}>반도체 기사 보기</Link><Link href="/search?q=%EB%B6%80%EB%8F%99%EC%82%B0" prefetch={false}>부동산 기사 보기</Link></p>
  </section>;
}

/** 자산 시세가 아직 없을 때 — 장면 대신 한 줄 안내. */
export function AssetSoon() {
  return <p className={styles.soon}><strong>그때 삼성전자·아파트·비트코인·금을 샀다면?</strong>시세를 연결하고 있어요. 들어오면 이 이야기가 맨 앞 장면이 돼요.</p>;
}

export function WageScene({ result }: { result: BirthdayResult }) {
  if (!result.wage) return null;
  return <section className={styles.scene} aria-labelledby="birthday-wage">
    <p className={styles.kicker}>한 시간 일한 대가, 최저시급</p>
    <h3 id="birthday-wage" className={styles.figure} data-accent="">{times(WAGE_NOW / result.wage)}</h3>
    <div className={styles.flow}><span>{result.date.year}년<b>{number(result.wage, 1)}원</b></span><span className={styles.flowArrow} aria-hidden="true" /><span>2026년<b>{number(WAGE_NOW)}원</b></span></div>
    {/* 구분점(·)이 줄 맨 앞에 오지 않게 '2026년 시간급 · 최저임금위원회'를 한 덩어리로 둔다. */}
    <p className={styles.source}>생일 당시 시행 중이던 시간급과 {nb('2026년 시간급 · 최저임금위원회')}{result.date.year === 1988 ? `\u00a0· ${nb('1988년은 2그룹 기준')}` : ''}</p>
  </section>;
}

export function MoneyScene({ result }: { result: BirthdayResult }) {
  if (!result.cpi) return null;
  return <section className={styles.scene} aria-labelledby="birthday-money">
    <p className={styles.kicker}>그때 1억 원은 지금</p>
    <h3 id="birthday-money" className={styles.figure}>{manwon(hundredMillionNow(result.cpi))}</h3>
    <p className={styles.lead}>같은 {nb('1억 원으로')} 살 수 있는 것이 그때의 {number(result.cpi / CPI_LATEST.value * 100)}% 수준이 됐어요.</p>
    {/* 문장 한가운데 괄호(기간·출처)가 끼어 'ECOS) / 로'처럼 엉뚱한 데서 꺾여서, 무엇을 무엇으로 바꿨는지를 한 문장으로 풀었다. */}
    <p className={styles.source}>{nb('한국은행 ECOS')} 소비자물가지수로 {nb(result.cpiPeriod)} {nb('물가로 본')} {nb('1억 원을')} {nb('2026년 9월')} 가치로 환산했어요. {nb('실제 생활비')} 변화와는 {nb('다를 수 있어요')}.</p>
  </section>;
}

/** 연대기 첫 화면(제목 순간이 연대기 사건이 아닐 때 '연대기에서 더 보기'가 가는 곳). */
const CHRONICLE_HREF = '/timeline/chronicle';

/** ④ 그 순간, 나는 몇 살 — 생일 뒤 겪은 국민적 순간(data/birthdayMoments.ts).
 *  줄을 누르면 연대기 사건은 연대기의 그 사건으로, 그 밖의 행사는 그날 서울경제로 간다. 그날 신문이 보관본에 없는 행사(박세리 우승)는 링크 없는 줄이다.
 *  링크는 자기 hover를 그려서 전역 링크 효과(흐려짐)를 끈다(data-fx="own"). */
export function AgesScene({ result, mode }: { result: BirthdayResult; mode: ViewMode }) {
  const hero = result.heroAge;
  if (!hero) return null;
  const age = (event: BirthdayResult['ages'][number]) => mode === 'year' || event.age === null ? `${event.yearsAfter}년 뒤` : `만 ${event.age}세`;
  return <section className={styles.scene} aria-labelledby="birthday-ages">
    <p className={styles.kicker}>그 순간, 나는 몇 살</p>
    {/* '나는 만 5세'·'태어난 지 6년 뒤'는 한 덩어리로 둬서 좁은 화면에서 '만 / 5세'로 갈라지지 않게 한다. */}
    <h3 id="birthday-ages" className={styles.title}>{mode === 'year' || hero.age === null ? `${hero.title}, ${nb(`태어난 지 ${hero.yearsAfter}년 뒤`)}` : `${hero.title} 때 ${nb(`나는 만 ${hero.age}세`)}`}</h3>
    <ul className={styles.ages}>{result.ages.map(event => {
      const body = <>
        <span>{event.title}<small>{shortDate(event.date)}</small></span>
        <strong>{age(event)}</strong>
      </>;
      return <li key={event.id}>{event.link
        ? <Link href={event.link.href} prefetch={false} data-fx="own">
            {body}
            <ChevronRight size={20} aria-hidden="true" />
            <span className="sr-only">, {event.link.label}</span>
          </Link>
        : <div>{body}</div>}</li>;
    })}</ul>
    <Link className={styles.sceneAction} href={hero.link?.label === '연대기에서 보기' ? hero.link.href : CHRONICLE_HREF} prefetch={false} data-fx="own">연대기에서 더 보기</Link>
  </section>;
}
