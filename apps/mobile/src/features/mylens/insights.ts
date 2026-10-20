// 나의 LENS "쌓인 것" 계산(순수 함수 — React·저장소 의존 없음). 기기에 쌓인 읽은 기록(history)에서 관심 지도와 한 줄 성향을 만든다.
export interface ReadLike {
  id: string;
  category?: string | null;
  at: number;
}

export interface CategoryStat {
  category: string;
  count: number;
  /** 가장 많이 읽은 분야 대비 비율(0~1) — 막대 길이. */
  ratio: number;
}

/** 최근 days 일 동안 읽은 글의 분야별 개수(많은 순, 같으면 가나다). 분야가 없는 글은 뺀다. */
export function categoryStats(items: ReadLike[], days = 30, now = Date.now()): CategoryStat[] {
  const from = now - days * 86400000;
  const m = new Map<string, number>();
  for (const it of items) {
    if (it.at < from || !it.category) continue;
    m.set(it.category, (m.get(it.category) ?? 0) + 1);
  }
  const arr = [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ko'));
  const max = arr[0]?.[1] ?? 1;
  return arr.map(([category, count]) => ({ category, count, ratio: count / max }));
}

/** 성향 한 줄. 읽은 글이 3건 미만이면 아직 말하기 이르므로 null. */
export function tendencyLine(stats: CategoryStat[], total: number): string | null {
  if (total < 3 || stats.length === 0) return null;
  const top = stats.slice(0, 2).map((s) => s.category);
  const share = stats[0].count / Math.max(1, stats.reduce((a, s) => a + s.count, 0));
  if (stats.length === 1 || share >= 0.6) return `요즘 '${top[0]}' 소식을 가장 많이 보셨어요`;
  return `요즘 '${top[0]}'·'${top[1]}' 소식에 관심이 많으세요`;
}

/** 이번 주(월~일) 읽은 날 수. */
export function activeDaysThisWeek(items: ReadLike[], now = new Date()): number {
  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const days = new Set<string>();
  for (const it of items) {
    if (it.at >= monday.getTime()) days.add(new Date(it.at).toDateString());
  }
  return days.size;
}
