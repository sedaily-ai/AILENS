import { CPI_LATEST } from './data/birthdayCatalog';
import type { BirthdayResult, ViewMode } from './data/birthdayTypes';
import { dateLabel, number } from './lib/birthdayModel';
import { BirthdayLedger } from './BirthdayLedger';
import { BirthdayDetails } from './BirthdayDetails';
import { BirthdayShare } from './BirthdayShare';
import styles from './birthdayMarket.module.css';

export function BirthdayResults({ result, mode }: { result: BirthdayResult; mode: ViewMode }) {
  return (
    <>
      <div className={styles.resultHeading}><p className={styles.eyebrow}>{mode === 'example' ? '예시로 보는 생일 시세' : mode === 'year' ? '출생연도로 보는 시세' : '나의 생일 시세'}</p><h3>{mode === 'year' ? `${result.date.year}년에 태어난 당신의 시세` : dateLabel(result.birthDate)}</h3><p className={styles.description}>{result.cpi ? `그때의 1억 원은 물가를 반영하면 약 ${number(10000 * CPI_LATEST.value / result.cpi)}만 원이에요.` : '해당 연도의 통계는 확인 중이에요. 비교할 수 있는 항목부터 살펴보세요.'}</p>{mode === 'year' && <p className={styles.note}>월·일을 공개하지 않은 공유예요. 날짜가 필요한 항목은 1월 1일을 기준으로 보고, 연금은 연도만 표시해요.</p>}</div>
      <BirthdayLedger result={result} />
      <BirthdayDetails key={result.birthDate} result={result} mode={mode} />
      <BirthdayShare key={`${result.birthDate}-${mode}`} result={result} mode={mode} />
      <p className={styles.footerNote}>한국은행 ECOS·최저임금위원회·국민연금공단의 확인된 자료를 사용했어요. 항목을 누르면 출처와 실제 기준 시점을 볼 수 있어요. 실시간 시세는 아니며, 확인 전 자료로 수익률을 만들지 않아요. 자료 확인 {result.snapshot.retrievedAt.replaceAll('-', '.')}</p>
    </>
  );
}
