import { useId } from 'react';
import { ArrowLeftRight, ChevronDown } from 'lucide-react';
import type { BirthdayResult, ViewMode } from './data/birthdayTypes';
import { number, percent } from './lib/birthdayModel';
import { changeColor } from './lib/birthdayChangeColor';
import { BirthdayHistory } from './history/BirthdayHistory';
import styles from './birthdayMarket.module.css';

export function BirthdayDetails({ result, mode }: { result: BirthdayResult; mode: ViewMode }) {
  const id = useId();
  const power = result.purchasingPower === null ? '자료 확인 중' : `약 ${number(result.purchasingPower / 10000, 2)}만 원`;
  const powerChange = result.rows.find(row => row.id === 'million-won')?.changeValue ?? null;
  const derived = [
    ['짜장면 한 그릇의 노동시간', '같은 지역의 짜장면 가격을 확보하면 최저시급으로 나눠 볼 수 있어요.'],
    ['현금의 구매력', result.purchasingPower === null ? '해당 출생연도 물가를 확인하고 있어요.' : `그대로 둔 100만 원의 구매력은 그때 기준 ${power}이에요.`],
    ['100만 원의 여섯 갈래', '현금 외 다섯 자산은 같은 기간의 자료를 확인하고 있어요.'],
    ['삼성전자와 그날의 상위 기업', '과거 시총과 수정주가·상장폐지 이력을 확인하고 있어요.'],
    ['돌반지와 물가', '첫돌 금값과 같은 날 환율, 같은 기간 물가를 맞추고 있어요.'],
    ['출생아 수와 연금', '연금 규칙은 반영했어요. 출생아 수를 더하면 동갑의 규모도 볼 수 있어요.'],
    ['큰 사건과 내 나이', mode === 'year' ? '아래에서 그해 이후의 경제 사건을 둘러보세요.' : '아래 사건을 고르면 그때 내 나이를 볼 수 있어요.'],
  ];
  return <>
    <section id="birthday-cash" className={styles.detailSection} aria-labelledby={`${id}-cash`}>
      <h4 id={`${id}-cash`}>그날 100만 원을 두었다면</h4>
      <div className={styles.cash}><div><span>지갑에 남은 돈</span><strong>100만 원</strong><small>명목 금액은 그대로</small></div><ArrowLeftRight className={styles.cashArrow} aria-hidden="true" /><div><span>그때 물건을 살 수 있는 힘</span><strong>{power}</strong><small>{powerChange !== null && <b className={styles.cashRate} style={{ color: changeColor(powerChange) }}>구매력 {percent(powerChange)}</b>}{result.cpiPeriod} 기준 구매력<br />2026.09 물가 적용</small></div></div>
      <div className={styles.assets}>{['현금', '예금', '코스피', '삼성전자', '금', '서울 아파트'].map((name, index) => <div key={name}><h5>{name}</h5><p>{index === 0 ? '100만 원' : '자료 확인 중'}</p></div>)}</div>
      <p className={styles.note}>자산 비교는 세금·수수료·배당을 제외해요. 주택은 지수 환산이에요. 확인 전 자산의 수익률은 표시하지 않았어요.</p>
      <details className={styles.derived}><summary><span>종목을 연결하는 7가지 계산</span><span className={styles.disclosureAction}><span className={styles.showLabel}>펼쳐보기</span><span className={styles.hideLabel}>접어두기</span><ChevronDown size={18} aria-hidden="true" /></span></summary>{derived.map(([title, description]) => <div key={title}><strong>{title}</strong><p>{description}</p></div>)}</details>
    </section>
    <section id="birthday-pension" className={styles.detailSection} aria-labelledby={`${id}-pension`}>
      <h4 id={`${id}-pension`}>내 연금의 세 가지 시점</h4>
      {result.calendar ? <div className={styles.pension}>{result.calendar.map(point => <div key={point.label}><span>{point.label} · {point.age}세</span><strong>{point.date.slice(0, 4)}년</strong><small>{mode === 'year' ? '연도 기준' : `${Number(point.date.slice(5, 7))}월 ${Number(point.date.slice(8))}일에 해당 연령`}</small><b style={{ color: changeColor(point.changeValue) }}>{point.change}</b></div>)}</div> : <p className={styles.note}>1953년 이전 출생자의 규칙은 확인 중이에요.</p>}
      <p className={styles.note}>현행 제도상 연령에 해당하는 생일이며 실제 지급일은 아니에요. 가입 10년 등 수급 요건을 충족해야 해요. 조기 수령은 소득 요건이 있고, 미래에는 제도가 달라질 수 있어요.</p>
    </section>
    <BirthdayHistory result={result} mode={mode} />
  </>;
}
