// 타임라인 사건 데이터 접근 계층 — 사건 목록은 자동 생성 파일(timelineEvents.generated.ts), 여기는 타입과 조회 함수.
// 구조: 연대(decade) / 시대(era, 사건 3개 이상 묶음) → 사건(event) → 그날(/timeline/{날짜}). 기획: docs/product/time-machine-그날로떠나요.md
import { TIMELINE_EVENTS } from './timelineEvents.generated';

export interface EventSource {
  label: string;
  url: string;
}

export interface TimelineEvent {
  id: string;
  /** 사건 시작일 'YYYY-MM-DD'. 월 단위만 확인된 사건은 'YYYY-MM'. */
  date: string;
  /** 기간 사건의 끝. */
  endDate?: string;
  title: string;
  /** 홈 칩에 쓰는 짧은 이름(8자 안팎). */
  shortTitle?: string;
  /** 출처에서 확인된 사실만 쓴 설명. */
  description: string;
  /** 속한 시대 이름. */
  era?: string;
  /** 시대 페이지가 있으면 그 주소(slug). */
  eraSlug?: string;
  /** 사건 기간의 서울경제 기사를 찾을 검색어(앞이 가장 정확). */
  keywords: string[];
  /** 이 사건을 다룬 신문이 실린 날(보통 사건 다음 날). */
  paperDate?: string;
  /** 서로 독립된 출처(2개 이상). */
  sources: EventSource[];
  /** 출처 간 표현 차이 등 독자에게 밝힐 메모. */
  note?: string;
  /** 홈 "역사 속 그날" 칩에 올릴 대표 사건. */
  featured?: boolean;
}

export type DecadeKey = '1990s' | '2000s' | '2010s' | '2020s';

export const DECADES: { key: DecadeKey; label: string; from: number }[] = [
  { key: '1990s', label: '1990년대', from: 1990 },
  { key: '2000s', label: '2000년대', from: 2000 },
  { key: '2010s', label: '2010년대', from: 2010 },
  { key: '2020s', label: '2020년대', from: 2020 },
];

/** 시대 페이지의 소개 문장 — 사건 설명과 같은 검증 원칙으로 쓴 것만 둔다. 없으면 기간과 사건 수만 보여준다. */
const ERA_SUMMARIES: Record<string, string> = {
  'imf-1997':
    '1997년 1월 한보철강 부도를 시작으로 대기업이 잇달아 쓰러졌고, 7월 태국 바트화 폭락이 아시아로 번지면서 11월에는 외환보유액이 20억 달러밖에 남지 않았습니다. 11월 21일 정부가 IMF에 지원을 요청했고 12월 3일 협상이 타결돼 총 195억 달러를 빌렸습니다. 2001년 8월 23일 잔액을 갚으면서 예정보다 3년가량 앞서 IMF 관리체제에서 벗어났습니다.',
};

export interface TimelineEra {
  slug: string;
  title: string;
  /** 'YYYY.MM ~ YYYY.MM'. */
  period: string;
  summary?: string;
  events: TimelineEvent[];
}

export const EVENTS: TimelineEvent[] = TIMELINE_EVENTS;

export function decadeOf(date: string): DecadeKey {
  return `${date.slice(0, 3)}0s` as DecadeKey;
}

export function getDecadeEvents(key: DecadeKey): TimelineEvent[] {
  return EVENTS.filter((e) => decadeOf(e.date) === key);
}

export function isDecadeKey(v: string): v is DecadeKey {
  return DECADES.some((d) => d.key === v);
}

const ym = (d: string) => d.slice(0, 7).replace('-', '.');

export const ERAS: TimelineEra[] = (() => {
  const bySlug = new Map<string, TimelineEvent[]>();
  for (const e of EVENTS) if (e.eraSlug) bySlug.set(e.eraSlug, [...(bySlug.get(e.eraSlug) ?? []), e]);
  return [...bySlug.entries()]
    .map(([slug, events]) => ({
      slug,
      title: events[0].era!,
      period: `${ym(events[0].date)} ~ ${ym(events.reduce((m, e) => ((e.endDate ?? e.date) > m ? (e.endDate ?? e.date) : m), events[0].date))}`,
      summary: ERA_SUMMARIES[slug],
      events,
    }))
    .sort((a, b) => a.events[0].date.localeCompare(b.events[0].date));
})();

export function getEra(slug: string): TimelineEra | undefined {
  return ERAS.find((e) => e.slug === slug);
}

export function getFeaturedEvents(): TimelineEvent[] {
  return EVENTS.filter((e) => e.featured && e.shortTitle && e.paperDate);
}
