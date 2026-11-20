// 타임머신 탭에 발행된 콘텐츠. 새 콘텐츠는 public/timemachine/<slug>/ 에 HTML 을 넣고 여기에 한 줄 추가한다(최신순).
export interface TimemachineContent {
  slug: string;
  // 대상 사건: 이 콘텐츠가 다루는 주요 사건명과 시간 범위, 사건 발생일(최근성 표시용).
  event: string;
  period: string;
  eventDate: string;
  title: string;
  description: string;
  date: string;
  kind: string;
  href: string;
  thumbnail: string;
}

export const TIMEMACHINE_CONTENTS: TimemachineContent[] = [
  {
    slug: 'nova-20261119',
    event: '2026 수능 AI 부정행위 대응',
    period: '1558 → 2026',
    eventDate: '2026-11-19',
    title: '답은 누가 썼나',
    description: '조선 과거장에서 AI 수능까지, 시험 부정의 468년',
    date: '2026-11-19',
    kind: '인터랙티브',
    href: '/timemachine/nova-20261119/index.html',
    thumbnail: '/timemachine/nova-20261119/assets/img/og.jpg',
  },
  {
    slug: 'birthday-20020605',
    event: '2002 한·일 월드컵 첫승',
    period: '2002-06-05 → 2026',
    eventDate: '2002-06-05',
    title: '2002년 6월 5일생, 당신이 태어난 날에는',
    description: '그날 서울경제 1면, 최저시급, 그때 1억 원, 국민연금까지 8장으로 보는 내 생일 타임머신 샘플(목업).',
    date: '2026-11-20',
    kind: '카드뉴스 샘플',
    href: '/timemachine/birthday-20020605/index.html',
    thumbnail: 'https://ailens.sedaily.ai/timemachine-newspaper/img/2002/06/20020605.jpg',
  },
];
