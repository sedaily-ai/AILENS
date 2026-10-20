// "그 순간, 나는 몇 살" 장면에 쓰는 국민적 순간들(2026-10-20 편집).
// 예전에는 연대기 대표 사건(featured — 금융실명제·IMF 지원 요청·리먼 파산·코로나 폭락·12·3 계엄)을 그대로 써서 대부분 생일에 위기만 나왔다.
// 위기·참사와 선거·취임·정상회담(정치적 해석 여지), 코스피 이정표는 넣지 않는다.
//
// 두 종류가 있다.
//  - chronicleId: 연대기(shared/data/timelineEvents)에 이미 있는 사건. 날짜·출처는 연대기 원자료를 따르고, 줄을 누르면 연대기의 그 사건으로 간다.
//  - date + sources: 연대기(경제 뉴스로 고른 사건)에 넣기 어색한 행사. 연대기와 같은 기준으로 서로 독립된 출처 2개가 날짜를 확인한 것만 둔다(2026-10-20 확인).
//    날짜는 한국 시간. 외국에서 열린 행사는 현지 날짜와 다르면 note에 적는다.
//    paperDate는 그날 서울경제(/timeline/{날짜})에 이 행사 기사가 실린 것을 빅카인즈 보관본에서 확인한 날이다. 없으면 줄을 링크로 만들지 않는다.
// label은 장면 제목("○○ 때 나는 만 N세")과 영수증 줄에 쓰는 이름이다. 홈 "역사 속 그날" 칩이 쓰는 featured 표시는 건드리지 않는다.
export interface MomentSource { label: string; url: string }
export type BirthdayMoment =
  | { chronicleId: string; label: string }
  | { date: string; label: string; paperDate?: string; sources: readonly [MomentSource, MomentSource]; note?: string };

export const BIRTHDAY_MOMENTS: readonly BirthdayMoment[] = [
  { date: '1993-08-07', label: '대전 엑스포 개막', paperDate: '1993-08-07', sources: [
    { label: '국제박람회기구(BIE) — Expo Daejeon 1993 20주년', url: 'https://support.bie-paris.org/site/en/news-announcements/specialised-expo/expo-daejeon-1993-international-expo-bie' },
    { label: '노무라공예사 박람회 자료 — Expo\'93 개최 일정', url: 'https://www.nomurakougei.co.jp/expo/exposition/detail?e_code=1634' },
  ] },
  { chronicleId: '1996-12-12-1', label: 'OECD 가입' },
  // 빅카인즈 보관본에 1998년 7월 서울경제 기사가 없어 그날 신문으로 잇지 않는다.
  { date: '1998-07-07', label: '박세리 US여자오픈 우승', note: '현지 1998년 7월 6일(월) 연장전 — 한국 시간 7일 아침', sources: [
    { label: 'Los Angeles Times 1998-07-07 — Se Ri Pak Goes the Distance', url: 'https://www.latimes.com/archives/la-xpm-1998-jul-07-sp-1469-story.html' },
    { label: 'Deseret News 1998-07-07 — Dry Pak wins U.S. Open championship', url: 'https://www.deseret.com/1998/7/7/19389983/dry-pak-wins-u-s-open-championship/' },
  ] },
  { date: '2001-03-29', label: '인천국제공항 개항', paperDate: '2001-03-29', sources: [
    { label: '한국관광공사 VISITKOREA — 인천국제공항', url: 'https://japanese.visitkorea.or.kr/svc/contents/contentsView.do?vcontsId=174796' },
    { label: 'The Korea Herald — Incheon Airport celebrates 25 years', url: 'https://m.koreaherald.com/article/10704330' },
  ] },
  { chronicleId: '2001-08-23-1', label: 'IMF 졸업' },
  { chronicleId: '2002-05-31-1', label: '2002 한일 월드컵 개막' },
  { date: '2004-04-01', label: 'KTX 개통', paperDate: '2004-04-01', sources: [
    { label: 'EASTS 2005 학술대회 논문 — 경부고속철도 1단계 개통', url: 'https://easts.info/on-line/proceedings_05/175.pdf' },
    { label: 'Tech Times — Korail KTX-I 교체 계획', url: 'https://www.techtimes.com/articles/321124/20260720/korail-greenlights-domestic-emu-320-fleet-retire-south-koreas-tgv-derived-ktx-trains.htm' },
  ] },
  { date: '2010-02-26', label: '김연아 밴쿠버 금메달', paperDate: '2010-02-26', note: '현지 2010년 2월 25일(목) 밤 — 한국 시간 26일 오후', sources: [
    { label: 'New York Post 2010-02-26 — World-record night gives Kim figure skating gold', url: 'https://nypost.com/2010/02/26/world-record-night-gives-kim-figure-skating-gold/' },
    { label: 'Los Angeles Daily News 2010-02-26 — Kim is queen of the ice', url: 'https://www.dailynews.com/2010/02/26/kim-is-queen-of-the-ice-wins-with-record-score/' },
  ] },
  { chronicleId: '2010-11-11-1', label: 'G20 서울 정상회의' },
  { date: '2018-02-09', label: '평창 동계올림픽 개막', paperDate: '2018-02-09', sources: [
    { label: 'AP — With extraordinary political theater, Winter Olympics begin', url: 'https://www.apnews.com/2f6b0674f38d4920907787e648a9aba4' },
    { label: 'CNN 2018-02-09 — Olympics Opening Ceremony preaches peace', url: 'https://www.cnn.com/2018/02/09/sport/olympics-opening-ceremony-peyongchang-color-intl/' },
  ] },
  { date: '2020-02-10', label: '기생충 아카데미 작품상', paperDate: '2020-02-10', note: '현지 2020년 2월 9일(일) 밤 — 한국 시간 10일 오후', sources: [
    { label: 'PBS NewsHour — Parasite becomes first non-English language film to win best picture', url: 'https://www.pbs.org/newshour/arts/parasite-becomes-first-non-english-language-film-to-win-best-picture-oscar' },
    { label: 'The Globe and Mail — Oscars 2020: Parasite makes history', url: 'https://www.theglobeandmail.com/arts/article-oscars-2020-brad-pitt-wins-best-supporting-actor/' },
  ] },
  { date: '2020-09-01', label: 'BTS 빌보드 핫100 1위', paperDate: '2020-09-01', note: '현지 2020년 8월 31일(월) 발표 — 한국 시간 9월 1일', sources: [
    { label: 'South China Morning Post — How BTS conquered the Billboard Hot 100', url: 'https://www.scmp.com/magazines/style/celebrity/article/3099896/how-bts-conquered-americas-billboard-hot-100-chart' },
    { label: 'VICE — BTS is the first K-pop group to reach #1 on the Billboard Hot 100', url: 'https://www.vice.com/en/article/bts-becomes-first-kpop-group-to-reach-1-billboard-history-dynamite/' },
  ] },
  { date: '2022-06-21', label: '누리호 발사 성공', paperDate: '2022-06-21', sources: [
    { label: '동아사이언스 — Nuri rocket full launch video', url: 'https://dongascience.com/en/news/55002' },
    { label: 'ABC News — South Korea launches first successful homegrown rocket', url: 'https://abcnews.com/International/south-korea-launches-successful-homegrown-rocket-starting-era/story?id=85522998' },
  ] },
  { date: '2024-10-10', label: '한강 노벨문학상', paperDate: '2024-10-10', sources: [
    { label: '노벨상 공식 — Nobel Prize in Literature 2024 announcement', url: 'https://www.nobelprize.org/prizes/literature/2024/prize-announcement/' },
    { label: 'ABC News(호주) 2024-10-10 — Han Kang wins the 2024 Nobel Prize in Literature', url: 'https://www.abc.net.au/news/2024-10-10/nobel-prize-for-literature-announcement/104458068' },
  ] },
];

/** 이 순간을 겪은 생일은 이 순간을 장면 제목으로 쓴다(겪지 않았으면 가장 최근 순간). */
export const HERO_MOMENT_ID = '2002-05-31-1';
