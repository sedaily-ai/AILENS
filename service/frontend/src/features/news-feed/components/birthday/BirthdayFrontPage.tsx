import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import type { FrontPageNotice, FrontPageState } from './lib/birthdayFrontPage';
import { frontArticleHref, frontPageNotice, previousDay } from './lib/birthdayFrontPage';
import { dateLabel } from './lib/birthdayModel';
import { nb } from './lib/keepTogether';
import styles from './birthdayStory.module.css';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
/** 1면 장면에 보여 줄 기사 수 — 첫 기사와 아래 제목 몇 줄. */
const SHOWN_ARTICLES = 4;

const NOTICES: Record<FrontPageNotice, { title: string; body: string }> = {
  // 날짜(연·월·일)는 한 줄에 붙여 둔다 — '2017년 / 11월 13일'처럼 갈라지면 읽기 어렵다.
  'before-founding': { title: '서울경제가 창간하기 전이에요', body: `서울경제는 ${nb('1960년 8월 1일')}에 창간했어요.` },
  suspended: { title: '이 시기에는 서울경제가 발행되지 않았어요', body: `${nb('1980년 11월 26일')}부터 ${nb('1988년 7월 31일')}까지는 지면이 없어요.` },
  'before-archive': { title: '보관된 지면이 없는 시기예요', body: `빅카인즈 보관본은 ${nb('1990년 1월')}부터 있어요.` },
  'no-page-info': { title: '이 시기는 몇 면 기사인지 기록이 없어요', body: `${nb('1994년 1월~1996년 7월')}, ${nb('2017년 11월 13일')} 이후 생일은 1면을 ${nb('볼 수 있어요')}.` },
  sunday: { title: '일요일이라 신문이 나오지 않았어요', body: `서울경제는 ${nb('1996년 9월 말')}부터 일요일자 신문을 내지 않아요.` },
  holiday: { title: '이날은 신문이 나오지 않았어요', body: '명절·공휴일 등으로 휴간한 날이에요.' },
};

/** 그날 서울경제 전체(뉴스 타임라인 날짜 페이지). 1면은 기사 몇 개만 보여 주므로 나머지는 여기서 본다. */
const paperHref = (date: string) => `/timeline/${date}`;

/**
 * 1면을 보여 줄 수 없는 날의 다음 걸음.
 * - 면 번호 기록이 없는 시기(1990~1993, 1996.8~2017.11.12)도 그날 신문 기사는 있어서 신문 전체로 보낸다.
 * - 휴간일은 하루 전 신문 — 면 번호가 있으면 이 장면에서 1면을, 없으면 하루 전 신문 전체를 연다.
 */
function NoticeAction({ notice, date, onShow }: { notice: FrontPageNotice; date: string; onShow: (date: string) => void }) {
  if (notice === 'no-page-info') return <Link className={styles.sceneAction} href={paperHref(date)} prefetch={false} data-fx="own">그날 신문 전체 보기</Link>;
  if (notice !== 'sunday' && notice !== 'holiday') return null;
  const previous = previousDay(date);
  const previousNotice = frontPageNotice(previous);
  if (previousNotice === null) return <button type="button" className={styles.sceneAction} onClick={() => onShow(previous)}>하루 전 신문 1면 보기</button>;
  if (previousNotice === 'no-page-info') return <Link className={styles.sceneAction} href={paperHref(previous)} prefetch={false} data-fx="own">하루 전 신문 보기</Link>;
  return null;
}

function masthead(date: string) {
  const [year, month, day] = date.split('-').map(Number);
  return `${year}년 ${month}월 ${day}일 ${WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()]}요일 · 1면`;
}

/** ② 그날 1면 — 이 페이지에서 유일하게 지면 모양으로 힘을 주는 장면. */
export function BirthdayFrontPage({ state, birthDate, onShow, onRetry, onUseBirthday, onShare }: {
  state: FrontPageState | null; birthDate: string;
  onShow: (date: string) => void; onRetry: () => void; onUseBirthday: () => void; onShare: () => void;
}) {
  const shown = state?.date ?? birthDate;
  return <section id="birthday-front" className={styles.scene} aria-labelledby="birthday-front-title" aria-busy={state?.status === 'loading'}>
    <p className={styles.kicker}>{state ? '내가 태어난 날 신문 1면' : '그날 신문 1면'}</p>
    <h3 id="birthday-front-title" className="sr-only">그날의 서울경제 1면</h3>
    <div className={styles.paper}>
      <div className={styles.masthead}><strong>서울경제</strong>{state && <span>{masthead(shown)}</span>}</div>
      {!state ? <div className={styles.paperEmpty}><strong>출생연도만 담긴 공유 링크예요</strong><p>내 생일을 넣으면 그날 1면을 볼 수 있어요.</p><button type="button" className={styles.sceneAction} onClick={onUseBirthday}>내 생일로 보기</button></div>
        : state.status === 'loading' ? <div className={styles.skeleton} aria-hidden="true"><span /><span /><span /></div>
        : state.status === 'error' ? <div className={styles.paperEmpty} role="alert"><strong>지금은 1면을 불러올 수 없어요</strong><p>잠시 뒤 다시 시도해 주세요.</p><button type="button" className={styles.sceneAction} onClick={onRetry}>다시 불러오기</button></div>
        : state.status === 'notice' ? <div className={styles.paperEmpty}><strong>{NOTICES[state.notice].title}</strong><p>{NOTICES[state.notice].body}</p><NoticeAction notice={state.notice} date={state.date} onShow={onShow} /></div>
        : <ol className={styles.headlines}>{state.articles.slice(0, SHOWN_ARTICLES).map((article, index) => {
          const href = frontArticleHref(article);
          const title = <>{article.title}{href && <ExternalLink size={14} aria-hidden="true" />}</>;
          return <li key={article.news_id || index} data-lead={index === 0 || undefined}>
            {href ? <a href={href} target="_blank" rel="noopener noreferrer">{title}<span className="sr-only"> (새 창)</span></a> : <span>{article.title}</span>}
            {index === 0 && article.content && <p>{article.content}</p>}
          </li>;
        })}</ol>}
    </div>
    {shown !== birthDate && <p className={styles.source}>생일({dateLabel(birthDate)})에는 신문이 없어 하루 전 신문이에요. <button type="button" className={styles.textButton} onClick={() => onShow(birthDate)}>생일로 돌아가기</button></p>}
    {state?.status === 'ok' && <div className={styles.sceneActions}>
      <Link className={styles.sceneAction} href={paperHref(shown)} prefetch={false} data-fx="own">그날 신문 전체 보기</Link>
      {shown === birthDate && <button type="button" className={styles.sceneAction} onClick={onShare}>이 1면 공유하기</button>}
    </div>}
    {/* 서로 다른 사실(보여 주는 순서·날짜 전송)을 '-고,'로 한 문장에 잇던 것을 나눴다.
        '그날 신문 전체 보기'도 주소에 날짜를 담아 서버에 묻기 때문에 '1면을'이 아니라 '그날 신문을 찾을 때'로 쓴다. */}
    <p className={styles.source}>빅카인즈 보관본의 면 번호 기준이라 실제 지면 배치·순서와 {nb('다를 수 있어요')}. 기사는 본문이 긴 순서로 {nb('보여 줘요')}. 날짜는 {nb('그날 신문을')} {nb('찾을 때만')} 서버로 보내요.</p>
  </section>;
}
