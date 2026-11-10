// "그날 서울경제" 신문 장면 — 1면 사진·기사 목록·안내·문구를 정하는 규칙(화면은 이 결과를 그리기만 한다).
// 표시 규칙과 안내 문구 정본: timemachine-data/261103_타임머신_신문장면_표시규칙.md (1~4절).
// 신문 장면 스위치(NEWSPAPER_SCENE)가 꺼져 있으면 화면이 이 파일을 쓰지 않고 지금 문구를 그대로 쓴다.
import type { BigKindsArticle, FrontPageData } from '@/shared/lib/api/timelineApi';
import type { FrontPageReason } from '@/shared/lib/api/timelineApi';
import { frontPageReasonLines, frontPageReplacementLine, frontSourceNote, type FrontNotice, type FrontPageState } from './birthdayFrontPage';
import { isPaperlessSunday, naverArticles } from './birthdayNewspaper';
import { nb } from './keepTogether';

/** 사진을 불러오는 중 · 불러옴 · 못 찾음(없음과 네트워크 문제를 구분할 수 없다). */
export type PhotoState = 'loading' | 'ok' | 'missing';
/** naver 네이버 1면 목록 · front 빅카인즈 1면(면 번호 시기) · day 빅카인즈 그날 기사 · none 목록 없음. */
export type ListSource = 'naver' | 'front' | 'day' | 'none';

export interface NewspaperView {
  /** 사진·기사 목록·제호 줄의 날짜. 생일 당일 신문이 아니면 생일과 다르다. */
  shown: string;
  list: ListSource;
  articles: BigKindsArticle[];
  /** 서버가 하루 이상 물러났지만 생일 당일 사진이 있어 그 사진을 보여 주는 중이다(기사 목록은 비어 있다). */
  ownPhotoDay: boolean;
  /** 생일 당일이 아닌 날을 보여 줄 때 지면 위에 붙이는 안내. */
  substitute: FrontNotice | null;
  /** 사진이나 목록 자리를 대신하는 지면 안 안내. */
  empty: { title: string; body: string } | null;
  kicker: string;
  /** 화면 낭독용 장면 제목. */
  heading: string;
  /** 지면 아래 출처 줄(고른 자료와 기준). */
  source: string;
}

interface Plan {
  shown: string;
  list: ListSource;
  articles: BigKindsArticle[];
  /** 생일이 오늘인데 아직 보관본에 없는 경우. */
  today: boolean;
  /** 서버가 다른 날로 물러났지만 생일 당일 사진이 있어 그 사진을 보여 주는 경우. */
  ownPhotoDay?: boolean;
  data: FrontPageData | null;
}

/**
 * 서버가 생일을 '신문 없음(no_paper)'이라며 다른 날로 물러났을 때 — 생일 당일 사진이 있는지 먼저 봐야 하는가.
 * 서버는 빅카인즈 기사가 있는지로 신문 유무를 정하므로, 기사가 빠진 날(토요일에 많다)은 사진이 있어도 물러난다.
 * 사진이 있다는 것이 그날 신문이 있었다는 가장 확실한 증거다. 일요일 대체·오늘·보관본에 없음은 해당하지 않는다.
 */
export function needsOwnPhotoProbe(state: FrontPageState, birthDate: string) {
  if (state.status !== 'ok') return false;
  const { data } = state;
  return data.reason === 'no_paper' && data.kind !== 'none' && data.shown_date !== null && data.shown_date !== birthDate;
}

/**
 * 어느 날짜의 사진·목록을 보여 줄지. 사진을 시도하지 않는 상태(찾는 중·오류·안내)는 null.
 * own은 생일 당일 사진의 상태이고 needsOwnPhotoProbe가 참일 때만 의미가 있다: 불러오는 중이거나 떴으면 그 사진을 보여 주고(기사 목록은 비운다),
 * 없으면(missing) 지금처럼 서버가 고른 직전 발행일을 보여 준다.
 */
function plan(state: FrontPageState, birthDate: string, own: PhotoState | null = null): Plan | null {
  if (state.status === 'image-only') return { shown: birthDate, list: 'none', articles: [], today: false, data: null };
  if (state.status !== 'ok') return null;
  const { data, naver } = state;
  // 오늘 신문은 대신 어제 신문을 보여 주지 않는다. 오늘 사진이 올라와 있으면 사진만 보여 준다.
  if (data.reason === 'not_yet') return { shown: birthDate, list: 'none', articles: [], today: true, data };
  if (data.kind === 'none' || !data.shown_date) return { shown: birthDate, list: 'none', articles: [], today: false, data };
  if (own !== null && own !== 'missing' && needsOwnPhotoProbe(state, birthDate)) {
    return { shown: birthDate, list: 'none', articles: [], today: false, ownPhotoDay: true, data };
  }
  if (naver?.length) return { shown: data.shown_date, list: 'naver', articles: naverArticles(naver), today: false, data };
  if (!data.articles.length) return { shown: data.shown_date, list: 'none', articles: [], today: false, data };
  return { shown: data.shown_date, list: data.kind, articles: data.articles, today: false, data };
}

/** 사진을 불러올 날짜. null이면 사진 자리를 만들지 않는다. own은 생일 당일 사진의 상태(needsOwnPhotoProbe가 참일 때만, 아니면 null). */
export function newspaperPhotoDate(state: FrontPageState, birthDate: string, own: PhotoState | null = null) {
  return plan(state, birthDate, own)?.shown ?? null;
}

// 월·일만 쓰되 해가 다르면(12월 31일 → 1월 1일 등) 연도까지 쓴다. 날짜는 한 줄에 붙여 둔다.
function substituteNotice(birthDate: string, shown: string, reason: FrontPageReason | null): FrontNotice {
  const actualReason = reason === 'sunday' || isPaperlessSunday(birthDate) ? 'sunday' : reason;
  if (actualReason === 'sunday') {
    return {
      title: '선택한 날은 일요일이라 서울경제가 발행되지 않았어요',
      lines: [...frontPageReasonLines(birthDate, 'sunday'), frontPageReplacementLine(shown)],
    };
  }
  return {
    title: '선택한 날짜의 신문 자료를 찾지 못했어요',
    lines: [...frontPageReasonLines(birthDate, actualReason), frontPageReplacementLine(shown)],
  };
}

const TODAY = { title: '오늘 1면은 아직 올라오지 않았어요', body: '오늘자 서울경제 1면이 올라오면 볼 수 있어요.' };
const NO_LIST = { title: '이 시기는 1면 기사 목록이 없어요', body: '1면 사진을 크게 보면 기사를 읽을 수 있어요.' };
// 시기 전체가 아니라 이 날 하루만 목록을 못 찾았을 때(서버가 신문 없음으로 물러났지만 사진은 있는 날).
const NO_LIST_DAY = { title: '이 날은 기사 목록을 찾지 못했어요', body: '1면 사진을 크게 보면 기사를 읽을 수 있어요.' };
const NO_PHOTO = { title: '이 날의 1면 사진을 찾지 못했어요', body: '대신 그날 서울경제 기사를 보여 드려요.' };

function emptyNotice(p: Plan, photo: PhotoState, birthDate: string) {
  if (photo === 'missing') {
    if (p.list !== 'none') return NO_PHOTO;
    if (p.today) return TODAY;
    // 1978-01-01~1980-11-25는 보관된 지면이 아예 없다고 알려진 구간이다.
    const known = birthDate >= '1978-01-01' && birthDate <= '1980-11-25';
    return {
      title: '이 날의 1면은 보관돼 있지 않아요',
      body: known ? `${nb('1978년 1월 1일')}부터 ${nb('1980년 11월 25일')}까지는 보관된 지면이 없어요.` : '서울경제는 발행됐지만 1면 사진과 기사를 구하지 못했어요.',
    };
  }
  if (photo === 'ok' && p.list === 'none' && !p.today) return p.ownPhotoDay ? NO_LIST_DAY : NO_LIST;
  return null;
}

const PICTURE = '1면 사진은 서울경제 지면 이미지예요.';
const NOT_PAPER = '실제 지면을 옮긴 것이 아니에요.';

/** 그날 기사 시기에서 기사를 고른 기준 — frontSourceNote(지금 문구)와 같은 기준 문장이다. */
function dayBasis(data: FrontPageData) {
  if (data.basis !== 'issue') return `기사는 본문이 긴 순서로, 사진 설명은 맨 뒤에 ${nb('보여 줘요.')}`;
  const filled = data.articles.some(article => !article.coverage);
  return `그날 여러 언론이 가장 많이 다룬 소식을 ${nb('보여 줘요.')}${filled ? ` 이슈로 고르지 못한 칸은 본문이 긴 ${nb('기사로 채워요.')}` : ''}`;
}

function sourceNote(p: Plan, photo: PhotoState) {
  const picture = photo === 'ok' ? PICTURE : '';
  const notPaper = photo === 'ok' ? '' : NOT_PAPER;
  const join = (...parts: string[]) => parts.filter(Boolean).join(' ');
  if (p.list === 'naver') return join(picture, `1면 기사 목록은 네이버 신문보기에서 ${nb('가져왔어요.')}`, notPaper);
  if (p.list === 'front') return join(picture, `기사는 빅카인즈 보관본에서 고른 1면 기사예요. 본문이 긴 순서로, 사진 설명은 맨 뒤에 ${nb('보여 줘요.')}`, notPaper);
  if (p.list === 'day' && p.data) {
    // 사진이 없을 때는 지금 문구(frontSourceNote) 그대로다.
    return photo === 'ok' ? join(picture, `기사는 빅카인즈 보관본에서 고른 그날 서울경제 기사예요. 1면 기사 목록이 아니에요. ${dayBasis(p.data)}`) : frontSourceNote(p.data);
  }
  return picture;
}

/**
 * 지면 안의 배치. 기사 목록이 있으면 목록(제목만)이 먼저, 사진은 작게 그 아래에 둔다 — 제목 4개와 사진이 한눈에 들어오게 하려는 배치다.
 * 목록이 없는 날(사진만 있는 날)은 사진이 읽는 용도라 지금처럼 크게 먼저 둔다.
 * noticeFirst: 사진을 못 찾아 목록으로 대신하는 날의 안내("대신 그날 서울경제 기사를 보여 드려요")는 목록을 읽기 전에 먼저 보여야 한다.
 */
export function frontLayout(view: Pick<NewspaperView, 'articles' | 'empty'>) {
  const listed = view.articles.length > 0;
  return { photoSize: listed ? 'compact' : 'full', noticeFirst: listed && view.empty !== null } as const;
}

/**
 * 신문 장면 상태 → 화면에 그릴 것. 찾는 중·오류·안내(창간 전·발행 중단)처럼 사진을 시도하지 않는 상태는 null(화면이 기존 모양으로 그린다).
 * photo는 plan이 정한 날짜(newspaperPhotoDate)의 사진 상태다. '1면'이라는 말은 사진이 떴거나 1면 목록(네이버·빅카인즈 면 번호 시기)일 때만 쓴다.
 * own은 newspaperPhotoDate와 같은 값을 넘긴다(생일 당일 사진의 상태, 해당하지 않으면 null).
 */
export function newspaperView(state: FrontPageState, birthDate: string, photo: PhotoState, own: PhotoState | null = null): NewspaperView | null {
  const p = plan(state, birthDate, own);
  if (!p) return null;
  const oneFace = photo === 'ok' || p.list === 'naver' || p.list === 'front';
  return {
    shown: p.shown,
    list: p.list,
    articles: p.articles,
    ownPhotoDay: p.ownPhotoDay === true,
    substitute: p.shown !== birthDate ? substituteNotice(birthDate, p.shown, state.status === 'ok' ? state.data.reason : null) : null,
    empty: emptyNotice(p, photo, birthDate),
    kicker: `${p.shown === birthDate ? '내가 태어난 날' : '내 생일 무렵'} 서울경제${oneFace ? ' 1면' : ''}`,
    heading: oneFace ? '그날의 서울경제 1면' : '그날의 서울경제',
    source: sourceNote(p, photo),
  };
}
