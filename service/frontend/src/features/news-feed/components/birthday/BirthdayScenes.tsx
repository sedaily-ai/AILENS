import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { CPI_LATEST } from './data/birthdayCatalog';
import type { BirthdayResult, ViewMode } from './data/birthdayTypes';
import { assetMemo, assetResult, assetSourceLine, inflationLine, type AssetBase, type AssetCell, type AssetInflation } from './lib/birthdayAssets';
import { dateLabel, elapsedLabel, hundredMillionNow, manwon, number, times, WAGE_NOW } from './lib/birthdayModel';
import { itemValue, type ItemMultiple } from './lib/birthdayItemPrices';
import type { AssetLoadState } from './lib/useBirthdayAssets';
import { frontPageNotice } from './lib/birthdayFrontPage';
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
    {/* 그날 신문이 없는 날(창간 전·지면 공백·보관본 시작 전)은 '서울경제는 이런 소식을 실었어요'라고 쓰지 않는다. */}
    <p className={styles.lead}>{mode === 'year' ? '그해와 지금을 비교했어요. 날짜가 필요한 값은 1월 1일 기준이에요.'
      : frontPageNotice(result.birthDate) ? '내가 태어난 날과 지금을 비교했어요.' : `내가 태어난 날, 서울경제는 ${nb('이런 소식을')} 실었어요.`}</p>
  </section>;
}

/** 100만 원을 넣었다고 보는 날의 설명 — 기준일 종류(서른 살부터 스무 살 생일, 그 전은 태어난 날)와 연도 공유 여부에 따라. 이유를 먼저 쓴다. */
function assetLead(base: AssetBase, mode: ViewMode) {
  const day = nb(dateLabel(base.date));
  // 연도 공유 문장은 375px에서 '출생연도만 / 공유된', '넣었다고 / 보고'로 끊겨서 두 덩어리를 붙여 둔다.
  // 괄호 앞('1월 1일 / (2010년…')은 nb로 못 막아서 괄호 없이 '스무 살이 된 해'·'태어난 해'를 앞 문장에 둔다.
  if (mode === 'year') return `${base.kind === 'twentieth' ? '서른 살부터는 스무 살이 된 해' : '서른 살 전이라 태어난 해'} 기준이에요. `
    + `${nb('출생연도만 공유된 결과라')} ${day}에 ${nb('넣었다고 보고 계산했어요.')}`;
  return base.kind === 'twentieth'
    ? `서른 살부터는 스무 살 생일 기준이에요. ${day}에 넣었다고 보고 계산했어요.`
    : `서른 살 전이라 태어난 날(${day})에 넣었다고 보고 계산했어요.`;
}

/** 칸 아래 결과 줄 — 지금 금액(서울 아파트는 배수)만 굵게. 증감은 화살표(낭독 제외)와 부호로 읽히고, 그 위에 한국 금융 관례 색
 *  (오름 빨강·내림 파랑, data-dir)을 덧입힌다. 변화 없음(0%)은 화살표·색 없이 글자색 그대로.
 *  굵은 숫자와 괄호 사이에서 줄이 꺾이지 않게 U+2060을 넣는다(nb는 공백만 묶는다). */
function cellDetail(cell: AssetCell) {
  const result = assetResult(cell);
  const dir = result.arrow === '▲' ? 'up' : result.arrow === '▼' ? 'down' : undefined;
  return <>{result.arrow && <><span aria-hidden="true" data-dir={dir}>{result.arrow}</span>{' '}</>}{result.label} <strong>{nb(result.figure)}</strong>{'\u2060('}<span data-dir={dir}>{result.signed}</span>)</>;
}

/**
 * 그때 100만 원, 지금은 — 서른 살이 지났으면 스무 살 생일, 아니면 태어난 날에 100만 원을 정기예금·달러·서울 아파트·금에 뒀다면.
 * 칸은 고정 순서이고 1등 강조·정렬이 없다(투자 권유로 읽히지 않게). 주인공은 제목 문장이다.
 * 칸 목록 아래 물가 한 줄은 칸을 읽는 기준이라 같은 기간(기준일이 속한 달 → 최신 물가)으로 쓴다. 그달 물가가 없으면 줄을 그리지 않는다.
 * 기준일이 공식 환율 기록 시작(1964-05-04)보다 앞서면(off) 장면 대신 한 줄 안내만 둔다.
 */
export function AssetScene({ base, mode, state, cells, inflation, onRetry }: {
  base: AssetBase; mode: ViewMode; state: AssetLoadState; cells: AssetCell[]; inflation: AssetInflation | null; onRetry: () => void;
}) {
  if (state.status === 'off') {
    const when = base.kind === 'twentieth'
      ? mode === 'year' ? '스무 살이 된 해의 1월 1일' : '스무 살 생일'
      : mode === 'year' ? '태어난 해의 1월 1일' : '태어난 날';
    return <p className={styles.soon}><strong>{`${when}(${nb(dateLabel(base.date))})이 공식 환율 기록이 시작된 ${nb('1964년 5월 4일')}보다 앞서 ${nb('100만 원')} 계산은 하지 않았어요.`}</strong>{`물가·환율 같은 공식 통계가 ${nb('그 뒤부터')} 있어요.`}</p>;
  }
  if (state.status === 'ready' && !cells.length) {
    return <p className={styles.soon}><strong>이 날짜는 아직 계산할 자료가 없어요.</strong>물가·환율 같은 공식 통계가 발표되면 계산해요.</p>;
  }
  // 막대는 정비례 — 배수 ÷ 보이는 칸 중 가장 큰 배수. 아주 작은 칸(1955년생 달러 2.7배 ÷ 금 77배 등)도 보이게 최소 4%.
  const max = Math.max(...cells.map(cell => cell.multiple));
  return <section className={styles.scene} aria-labelledby="birthday-assets">
    <p className={styles.kicker}>그때 100만 원, 지금은</p>
    <h3 id="birthday-assets" className={styles.title}>{base.kind === 'twentieth' ? '스무 살의 내가' : '태어난 날'} {nb('100만 원을')} 어디에 뒀다면</h3>
    <p className={styles.lead}>{assetLead(base, mode)}</p>
    {state.status === 'loading' ? <>
      <div className={styles.skeleton} aria-hidden="true"><span /><span /><span /></div>
      <p className="sr-only" role="status">100만 원 계산 자료를 불러오는 중이에요.</p>
    </>
      // 실패 원인(네트워크·배포 직후 캐시·형식)을 화면에서는 가릴 수 없어 단정하지 않는다. 다른 장면은 그대로 둔다.
      : state.status === 'error' ? <div className={styles.paperEmpty} role="alert">
        <strong>100만 원 계산 자료를 불러오지 못했어요</strong>
        <p>{`연결이 원활하지 않을 수 있어요. 잠시 뒤 다시 ${nb('불러와 주세요.')}`}</p>
        <button type="button" className={styles.sceneAction} onClick={onRetry}>다시 불러오기</button>
      </div>
      : <>
        <ol className={styles.bars}>{cells.map(cell => <li key={cell.id}>
          <div className={styles.barRow}>
            <span>{cell.name}</span>
            <span className={styles.barTrack} aria-hidden="true"><span style={{ width: `${Math.max(4, cell.multiple / max * 100)}%` }} /></span>
            <strong>{times(cell.multiple)}</strong>
          </div>
          <p className={styles.barResult}>{cellDetail(cell)}</p>
          {assetMemo(cell) && <p className={styles.barDetail}>{assetMemo(cell)}</p>}
        </li>)}</ol>
        {inflation && <p className={styles.lead}>{inflationLine(inflation)}</p>}
        <p className={styles.source}>{assetSourceLine(cells, inflation)}</p>
        <p className={styles.source}>과거 자료로 계산한 가정이에요. 특정 자산을 사거나 팔라는 권유가 아니에요. 세금·수수료는 빼고 계산했어요.</p>
        <p className={styles.links}><Link href={`/search?q=${encodeURIComponent('환율')}`} prefetch={false}>환율 기사 보기</Link><Link href="/search?q=%EB%B6%80%EB%8F%99%EC%82%B0" prefetch={false}>부동산 기사 보기</Link></p>
      </>}
  </section>;
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

/**
 * 그때 1억 원은 지금 — 주인공은 금액 숫자. 그 아래 생활 물가 품목 배수(lib/birthdayItemPrices.ts)는 같은 기간(cpiPeriod → 2026년 9월)이고,
 * 100만 원 장면의 막대 목록과 겹쳐 보이지 않게 막대 없이 품목 타일(이름 위, 배수 아래)로 둔다. 품목이 하나도 없으면(1975년 전) 목록·주의·KOSIS 출처를 모두 뺀다.
 */
export function MoneyScene({ result, items }: { result: BirthdayResult; items: ItemMultiple[] }) {
  if (!result.cpi) return null;
  return <section className={styles.scene} aria-labelledby="birthday-money">
    <p className={styles.kicker}>그때 1억 원은 지금</p>
    <h3 id="birthday-money" className={styles.figure}>{manwon(hundredMillionNow(result.cpi))}</h3>
    <p className={styles.lead}>같은 {nb('1억 원으로')} 살 수 있는 것이 그때의 {number(result.cpi / CPI_LATEST.value * 100)}% 수준이 됐어요.</p>
    {items.length > 0 && <>
      <div className={styles.lead}>
        <h4 className={styles.kicker}>물건값은 이만큼 올랐어요(서울 기준)</h4>
        {/* 이름과 배수 사이 공백은 낭독기가 '짜장면 3배'로 띄어 읽게 둔다(두 줄 배치는 CSS가 한다). */}
        <ul className={styles.items}>{items.map(item => {
          const value = itemValue(item.multiple);
          return <li key={item.id}><span>{item.name}</span>{' '}<strong>{value.arrow && <><span aria-hidden="true">{value.arrow}</span>{' '}</>}{nb(value.text)}</strong></li>;
        })}</ul>
      </div>
      {/* 통계설명: 소비자물가지수는 가격변동을 재는 것이라 가격의 절대수준을 나타내지 않는다. */}
      <p className={styles.source}>{nb('지수 비율로')} 계산한 값이라 {nb('실제 가게 가격과')} {nb('다를 수 있어요.')}</p>
    </>}
    {/* 문장 한가운데 괄호(기간·출처)가 끼어 'ECOS) / 로'처럼 엉뚱한 데서 꺾여서, 무엇을 무엇으로 바꿨는지를 한 문장으로 풀었다. */}
    {/* 작성기관(국가데이터처)을 제공처(한국은행 ECOS)와 함께 적는다 — 'ECOS 소비자물가지수'만 쓰면 한국은행 통계로 읽힌다. */}
    {/* 품목 배수는 KOSIS 약관 제7조에 따라 작성기관·통계명·KOSIS를 함께 적는다. 375px에서 '품목별 / (서울)'로 괄호 앞이 꺾여서
        (nb는 공백만 묶는다) 괄호 앞에 줄바꿈을 막는 U+2060을 넣었다. */}
    <p className={styles.source}>{nb('한국은행 ECOS')}에서 받은 {nb('국가데이터처 소비자물가지수로')} {nb(result.cpiPeriod)} {nb('물가로 본')} {nb('1억 원을')} {nb('2026년 9월')} 가치로 환산했어요. {nb('실제 생활비')} 변화와는 {nb('다를 수 있어요')}.
      {items.length > 0 && <>{' '}물건값은 {nb('같은 기간을')} {nb('국가데이터처 소비자물가지수')} {nb('품목별\u2060(서울), KOSIS로')} {nb('비교했어요.')}</>}</p>
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
