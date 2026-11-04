'use client';

import Link from 'next/link';
import { BIRTHDAY_MARKET_PATH } from './data/birthdayRoutes';
import { ARRIVAL_COPY, arrivalMissing } from './lib/birthdayArrival';
import { arrivalShowsPaper, useFrontPage, weekdayOf } from './lib/birthdayFrontPage';
import { dateLabel } from './lib/birthdayModel';
import { BirthdayFrontPage } from './BirthdayFrontPage';
import market from './birthdayMarket.module.css';
import styles from './birthdayStory.module.css';

/**
 * 도착 페이지 — 그날 신문 카드의 QR을 찍은 사람이 처음 보는 화면(/birthday-market/YYYY-MM-DD).
 * 생일 입력보다 먼저 그날 신문을 보여 주고, 아래 버튼으로 자기 생일의 신문 찾기(결과 페이지의 입력 화면)로 이어 준다. 버튼은 날짜를 담지 않는다.
 * 지면 장면은 결과 화면과 같은 컴포넌트이고(guest) 공유 버튼만 없다. 서버에 묻는 것도 주소의 이 날짜뿐이다.
 */
export function BirthdayArrival({ date }: { date: string }) {
  const front = useFrontPage(date);
  const missing = arrivalMissing(front.state);
  return <div className={market.market} data-clarity-mask="true">
    <div className={`${styles.story} ${styles.arrivalBody}`}>
      <div className={styles.scenes}>
        {arrivalShowsPaper(front.state)
          ? <BirthdayFrontPage state={front.state} birthDate={date} onRetry={front.retry} guest />
          : <section className={`${styles.scene} ${styles.narrowScene}`} aria-labelledby="birthday-arrival-missing">
            <p className={styles.kicker}>{ARRIVAL_COPY.kicker}</p>
            <div className={styles.paper}>
              <div className={styles.masthead}><strong>서울경제</strong><span>{`${dateLabel(date)} ${weekdayOf(date)}요일`}</span></div>
              <div className={styles.paperEmpty}>
                <strong id="birthday-arrival-missing">{missing.title}</strong>
                <p>{missing.body}</p>
              </div>
            </div>
          </section>}
        <section className={`${styles.scene} ${styles.narrowScene}`} aria-labelledby="birthday-arrival-cta">
          <h3 id="birthday-arrival-cta" className={styles.arrivalQuestion}>{ARRIVAL_COPY.question}</h3>
          <Link className={`${market.primary} ${styles.arrivalAction}`} href={BIRTHDAY_MARKET_PATH} prefetch={false}>{ARRIVAL_COPY.action}</Link>
        </section>
      </div>
    </div>
  </div>;
}
