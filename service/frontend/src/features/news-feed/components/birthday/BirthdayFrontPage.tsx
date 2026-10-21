import Link from 'next/link';
import { ExternalLink, Info } from 'lucide-react';
import type { FrontPageData } from '@/shared/lib/api/timelineApi';
import type { FrontPageNotice, FrontPageState } from './lib/birthdayFrontPage';
import { FRONT_LOOKBACK_DAYS, frontArticleHref, frontNotice, shareableFront, weekdayOf } from './lib/birthdayFrontPage';
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

function masthead(date: string, front: boolean) {
  const [year, month, day] = date.split('-').map(Number);
  return `${year}년 ${month}월 ${day}일 ${weekdayOf(date)}요일${front ? ' · 1면' : ''}`;
}

/** 장면 이름 — 생일 당일 신문이 아니면 '내 생일 무렵', 1면이 아니면 '서울경제'라고 부른다. '1면'은 1면을 보여 줄 때만 쓴다(찾는 중·오류·안내에는 쓰지 않는다). */
function kicker(state: FrontPageState | null) {
  if (!state) return '그날 신문';
  if (state.status !== 'ok' || state.data.kind === 'none') return '내가 태어난 날 신문';
  const when = state.data.shown_date === state.date ? '내가 태어난 날' : '내 생일 무렵';
  return state.data.kind === 'day' ? `${when} 서울경제` : `${when} 신문 1면`;
}

/** 지면 위 안내 — 생일 당일 1면을 못 보여 줄 때, 지면을 보기 전에 까닭과 대신 보여 주는 신문을 먼저 읽게 한다. */
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

/** 지면 아래 출처 — 기사를 어떤 자료와 기준으로 골랐는지. */
function sourceNote(data: FrontPageData | null) {
  if (data?.kind === 'day' && data.basis === 'issue') {
    const filled = data.articles.some(article => !article.coverage);
    return <>빅카인즈 보관본과 {nb('언론 이슈 순위')} 기준이에요. 기사 수는 그날 여러 언론사가 같은 소식을 다룬 {nb('기사 수예요.')}{filled ? <> 이슈로 고르지 못한 칸은 본문이 긴 {nb('기사로 채워요.')}</> : null}</>;
  }
  if (data?.kind === 'day') return <>빅카인즈 보관본 기준이에요. 기사는 본문이 긴 순서로, 사진 설명은 맨 뒤에 {nb('보여 줘요.')}</>;
  return <>빅카인즈 보관본의 면 번호 기준이라 실제 지면 배치·순서와 {nb('다를 수 있어요')}. 기사는 본문이 긴 순서로, 사진 설명은 맨 뒤에 {nb('보여 줘요.')}</>;
}

/** ② 그날 1면 — 이 페이지에서 유일하게 지면 모양으로 힘을 주는 장면. 생일에 신문이 없으면 서버가 고른 직전 발행일을 보여 준다. */
export function BirthdayFrontPage({ state, birthDate, onRetry, onUseBirthday, onShare }: {
  state: FrontPageState | null; birthDate: string;
  onRetry: () => void; onUseBirthday: () => void; onShare: () => void;
}) {
  const data = state?.status === 'ok' ? state.data : null;
  const shown = data?.shown_date ?? birthDate;
  const sameDay = shown === birthDate;
  const isFront = data?.kind === 'front';
  const canShare = shareableFront(state).length > 0;
  const [, month, day] = shown.split('-').map(Number);
  // 화면 낭독기용 상태 문장 — 늘 있는 요소의 글만 갈아 끼워야 읽힌다(로딩이 끝나 요소가 사라지면 결과가 알려지지 않는다).
  const spoken = state?.status === 'loading' ? '그날 신문을 찾고 있어요.'
    : data && data.kind !== 'none' && !sameDay ? `생일 당일 신문이 없어 ${dateLabel(shown)}자 신문을 보여 줘요.` : '';
  return <section id="birthday-front" className={styles.scene} aria-labelledby="birthday-front-title">
    <p className={styles.kicker}>{kicker(state)}</p>
    <h3 id="birthday-front-title" className="sr-only">{isFront ? '그날의 서울경제 1면' : '그날의 서울경제'}</h3>
    <p className="sr-only" role="status">{spoken}</p>
    {data && <FrontNote data={data} />}
    <div className={styles.paper} aria-busy={state?.status === 'loading'}>
      {/* '· 1면'은 1면을 보여 줄 때만. 그날 기사(면 번호 없는 시기)·보관본에 없는 경우와, 어느 쪽인지 모르는 로딩·오류에는 붙이지 않는다. */}
      <div className={styles.masthead}><strong>서울경제</strong>{state && <span>{masthead(shown, isFront)}</span>}</div>
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
      {canShare && <button type="button" className={styles.sceneAction} onClick={onShare}>이 1면 공유하기</button>}
    </div>}
    {/* 서로 다른 사실(보여 주는 순서·날짜 전송)을 '-고,'로 한 문장에 잇던 것을 나눴다.
        '그날 신문 전체 보기'도 주소에 날짜를 담아 서버에 묻기 때문에 '1면을'이 아니라 '그날 신문을 찾을 때'로 쓴다.
        그날 기사(면 번호 없는 시기)는 면 번호 기준이 아니라서 첫 문장을 바꾼다. */}
    <p className={styles.source}>{sourceNote(data)} 날짜는 {nb('그날 신문을')} {nb('찾을 때만')} 서버로 보내요.</p>
  </section>;
}
