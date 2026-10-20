// 내 관심(분야·섹터·화두) 매칭과 집계 — 순수 함수(저장소·React·네트워크 없음).
// 관심은 3층이다: 분야(category) → 섹터(sub, 분야의 세부 분류) → 화두(topic, 금리·반도체 같은 주제어).
export type InterestType = 'category' | 'sub' | 'topic';
export interface Interest {
  type: InterestType;
  /** category: 분야 slug / sub: `분야slug:세부이름` / topic: 주제 slug. */
  key: string;
  label: string;
  /** 소속 분야 slug(섹터·화두의 분야 가점 계산용). 알 수 없으면 없음. */
  category?: string;
}

/** 검색 목록(/api/search-index)의 한 건 중 매칭에 쓰는 필드. */
export interface RecLike {
  i: string;
  h: string;
  s?: string;
  c?: string;
  u?: string;
  d: string;
  t?: string;
  p?: string;
}

/** 화두 이름에서 찾을 말들: 이름 전체 + '·'로 나눈 두 글자 이상 조각 + 영문 약어 별칭. */
const ALIASES: Record<string, string[]> = { 인공지능: ['AI'], '공모주·IPO': ['공모주', 'IPO'], '무역·통상': ['통상', '무역'], 'SK하이닉스': ['하이닉스'], 'LG에너지솔루션': ['LG엔솔'], '환경·기후': ['기후', '환경'], '여행·관광': ['여행', '관광'] };
export function needlesOf(label: string): string[] {
  const parts = label.split('·').map((s) => s.trim()).filter((s) => s.length >= 2);
  return [...new Set([label, ...parts, ...(ALIASES[label] ?? [])])];
}

/** 이 관심에 이 기사가 해당하는지. slugOf 는 분야 이름('시그널')→slug('markets') 변환. */
export function matches(it: Interest, r: RecLike, slugOf: (c?: string) => string | null): boolean {
  if (it.type === 'category') return slugOf(r.c) === it.key;
  if (it.type === 'sub') {
    const [slug, name] = it.key.split(':');
    return slugOf(r.c) === slug && r.u === name;
  }
  const text = `${r.h} ${r.s ?? ''}`;
  return needlesOf(it.label).some((n) => text.includes(n));
}

/** 가장 최근 날짜부터 limit 건. 최신순(발행 시각 → 날짜). */
export function feedFor(it: Interest, recs: RecLike[], slugOf: (c?: string) => string | null, limit = 40): RecLike[] {
  return recs
    .filter((r) => matches(it, r, slugOf))
    .sort((a, b) => (b.t || b.d).localeCompare(a.t || a.d))
    .slice(0, limit);
}

/** 최근 hours 시간 안에 발행된 매칭 기사 수(발행 시각이 없으면 오늘 날짜 기준). */
export function freshCount(it: Interest, recs: RecLike[], slugOf: (c?: string) => string | null, now = Date.now(), hours = 24): number {
  const from = now - hours * 3600000;
  const todayKst = new Date(now + 9 * 3600000).toISOString().slice(0, 10);
  let n = 0;
  for (const r of recs) {
    if (!matches(it, r, slugOf)) continue;
    const t = r.t ? Date.parse(r.t.replace(/\.\d+/, '')) : NaN;
    if (!Number.isNaN(t) ? t >= from : r.d === todayKst) n++;
  }
  return n;
}

/** 담은 관심들이 속한 분야 slug 모음(추천·기사 선정 가점용). */
export function categorySlugsOf(items: Interest[]): string[] {
  const out = new Set<string>();
  for (const it of items) {
    if (it.type === 'category') out.add(it.key);
    else if (it.type === 'sub') out.add(it.key.split(':')[0]);
    else if (it.category) out.add(it.category);
  }
  return [...out];
}

export const keyOf = (it: Pick<Interest, 'type' | 'key'>) => `${it.type}|${it.key}`;
