import Link from 'next/link';
import { ExternalLink, Info } from 'lucide-react';
import type { FrontPageData } from '@/shared/lib/api/timelineApi';
import type { FrontPageNotice, FrontPageState } from './lib/birthdayFrontPage';
import { FRONT_LOOKBACK_DAYS, frontArticleHref, frontNotice, frontSourceNote, shareableFront, weekdayOf } from './lib/birthdayFrontPage';
import { dateLabel } from './lib/birthdayModel';
import { nb } from './lib/keepTogether';
import styles from './birthdayStory.module.css';

/** 지면에 보여 줄 기사 수 — 첫 기사와 아래 제목 몇 줄. */
const SHOWN_ARTICLES = 4;

const NOTICES: Record<FrontPageNotice, { title: string; body: string }> = {
  // 날짜(연·월·일)는 한 줄에 붙여 둔다 — '2017년 / 11월 13일'처럼 갈라지면 읽기 어렵다.
  'before-founding': { title: '서울경제가 창간하기 전이에요', body: `서울경제는 ${nb('1960년 8월 1일')}에 창간했어요.` },
  suspended: { title: '이 시기에는 서울경제가 발행되지 않았어요', body: `${nb('1980년 11월 26일')}부터 ${nb('1988년 7월 31일')}까지는 지면이 없어요.` },
  'before-archive': { title: '보관된 지면이 없는 시기예요', body: `빅카인즈 보관본은 ${nb('1990년 1월')}부터 있어요.` },
};

/** 그날 서울경제 전체(뉴스 타임라인 날짜 페이지). 지면은 기사 몇 개만 보여 주므로 나머지는 여기서 본다. */
const paperHref = (date: string) => `/timeline/${date}`;

function masthead(date: string) {
  const [year, month, day] = date.split('-').map(Number);
  return `${year}년 ${month}월 ${day}일 ${weekdayOf(date)}요일`;
}

/**
 * 장면 이름 — 생일 당일 신문이 아니면 '내 생일 무렵'이라고 부른다. 면 번호가 있는 시기(kind front)와 없는 시기(kind day)가 같은 이름을 쓴다.
 * 실제 지면이 아니라 보관본에서 고른 기사라서 '1면'이라고 부르지 않는다.
 */
function kicker(state: FrontPageState | null) {
  if (!state) return '그날 신문';
  if (state.status !== 'ok' || state.data.kind === 'none') return '내가 태어난 날 신문';
  return `${state.data.shown_date === state.date ? '내가 태어난 날' : '내 생일 무렵'} 서울경제`;
}

/** 지면 위 안내 — 생일 당일 신문을 못 보여 줄 때, 지면을 보기 전에 까닭과 대신 보여 주는 날짜를 먼저 읽게 한다. */
function FrontNote({ data }: { data: FrontPageData }) {
  const note = frontNotice(data);
  if (!note) return null;
  return <div className={styles.frontNote} role="note" aria-labelledby="birthday-front-note">
    <Info size={20} aria-hidden="true" />
    <div>
      <strong id="birthday-front-note">{note.title}</strong>
      {note.lines.map(line => <p key={line}>{line}</p>)}
    </div>
  </div>;
}

function Headlines({ articles }: { articles: FrontPageData['articles'] }) {
  return <ol className={styles.headlines}>{articles.slice(0, SHOWN_ARTICLES).map((article, index) => {
    const href = frontArticleHref(article);
    const title = <>{article.title}{href && <ExternalLink size={14} aria-hidden="true" />}</>;
    return <li key={article.news_id || index} data-lead={index === 0 || undefined}>
      {href ? <a href={href} target="_blank" rel="noopener noreferrer">{title}<span className="sr-only"> (새 창)</span></a> : <span>{article.title}</span>}
      {/* 그날 서울경제(면 번호 없는 시기)를 이슈 순위로 골랐을 때 — 왜 이 기사인지 근거를 기사마다 붙인다. */}
      {/* li > span 은 링크 없는 제목 줄(44px) 규칙이라 small 을 쓴다. */}
      {article.coverage ? <small className={styles.coverage}>{`그날 언론 기사 ${article.coverage.toLocaleString('ko-KR')}건이 다룬 소식`}</small> : null}
      {index === 0 && article.content && <p>{article.content}</p>}
    </li>;
  })}</ol>;
}

/** ② 그날 서울경제 — 이 페이지에서 유일하게 지면 모양으로 힘을 주는 장면. 생일에 신문이 없으면 서버가 고른 직전 발행일을 보여 준다. */
export function BirthdayFrontPage({ state, birthDate, onRetry, onUseBirthday, onShare }: {
  state: FrontPageState | null; birthDate: string;
  onRetry: () => void; onUseBirthday: () => void; onShare: () => void;
}) {
  const data = state?.status === 'ok' ? state.data : null;
  const shown = data?.shown_date ?? birthDate;
  const sameDay = shown === birthDate;
  const canShare = shareableFront(state).length > 0;
  const source = frontSourceNote(data);
  const [, month, day] = shown.split('-').map(Number);
  // 화면 낭독기용 상태 문장 — 늘 있는 요소의 글만 갈아 끼워야 읽힌다(로딩이 끝나 요소가 사라지면 결과가 알려지지 않는다).
  const spoken = state?.status === 'loading' ? '그날 신문을 찾고 있어요.'
    : data && data.kind !== 'none' && !sameDay ? `생일 당일 신문이 없어 ${dateLabel(shown)}자 신문을 보여 줘요.` : '';
  return <section id="birthday-front" className={styles.scene} aria-labelledby="birthday-front-title">
    <p className={styles.kicker}>{kicker(state)}</p>
    <h3 id="birthday-front-title" className="sr-only">그날의 서울경제</h3>
    <p className="sr-only" role="status">{spoken}</p>
    {data && <FrontNote data={data} />}
    <div className={styles.paper} aria-busy={state?.status === 'loading'}>
      {/* 제호 줄은 날짜·요일만. 실제 지면이 아니라서 면 번호를 붙이지 않는다. */}
      <div className={styles.masthead}><strong>서울경제</strong>{state && <span>{masthead(shown)}</span>}</div>
      {!state ? <div className={styles.paperEmpty}><strong>출생연도만 담긴 공유 링크예요</strong><p>내 생일을 넣으면 그날 신문을 볼 수 있어요.</p><button type="button" className={styles.sceneAction} onClick={onUseBirthday}>내 생일로 보기</button></div>
        : state.status === 'loading' ? <div className={styles.skeleton} aria-hidden="true"><span /><span /><span /></div>
        // 실패 원인(네트워크·보관본 응답·형식)을 화면에서는 가릴 수 없어 단정하지 않는다.
        : state.status === 'error' ? <div className={styles.paperEmpty} role="alert"><strong>그날 신문을 불러오지 못했어요</strong><p>{`연결이 원활하지 않을 수 있어요. 잠시 뒤 다시 ${nb('불러와 주세요.')}`}</p><button type="button" className={styles.sceneAction} onClick={onRetry}>다시 불러오기</button></div>
        : state.status === 'notice' ? <div className={styles.paperEmpty}><strong>{NOTICES[state.notice].title}</strong><p>{NOTICES[state.notice].body}</p></div>
        : state.data.kind === 'none' ? <div className={styles.paperEmpty}><strong>이 무렵 신문은 보관본에 없어요</strong><p>{`생일과 그 전 ${FRONT_LOOKBACK_DAYS}일 동안의 서울경제가 빅카인즈 보관본에 ${nb('없어요.')}`}</p></div>
        : <Headlines articles={state.data.articles} />}
    </div>
    {data && data.kind !== 'none' && <div className={styles.sceneActions}>
      <Link className={styles.sceneAction} href={paperHref(shown)} prefetch={false} data-fx="own">{sameDay ? '그날 신문 전체 보기' : `${month}월 ${day}일 신문 전체 보기`}</Link>
      {/* 공유 영역의 카드 종류 버튼('그날 신문 카드')과 같은 이름을 쓴다. */}
      {canShare && <button type="button" className={styles.sceneAction} onClick={onShare}>그날 신문 카드 공유하기</button>}
    </div>}
    {/* 서로 다른 사실(고른 자료·기준·날짜 전송)을 문장별로 나눈다. 기사를 고른 기준은 frontSourceNote가 정한다.
        '그날 신문 전체 보기'도 주소에 날짜를 담아 서버에 묻기 때문에 '그날 신문을 찾을 때'로 쓴다. */}
    <p className={styles.source}>{source && `${source} `}날짜는 {nb('그날 신문을')} {nb('찾을 때만')} 서버로 보내요.</p>
  </section>;
}
