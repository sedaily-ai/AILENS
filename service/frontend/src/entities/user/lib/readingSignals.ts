export type ReadingSignal = {
  id: string;
  kind: 'news' | 'letter';
  title: string;
  categories: string[];
  keywords: string[];
  seenAt: string;
};

export const READING_SIGNAL_EVENT = 'lens-reading-signals-changed';
export const readingSignalKey = (scope: string) => `lens-reading-signals-v1:${scope}`;
const MAX_AGE = 90 * 24 * 60 * 60 * 1000;

export function parseReadingSignals(raw: string | null, now = Date.now()): ReadingSignal[] {
  try {
    const data: unknown = JSON.parse(raw ?? '[]');
    if (!Array.isArray(data)) return [];
    return data.filter((item): item is ReadingSignal => {
      if (!item || typeof item !== 'object') return false;
      const x = item as Record<string, unknown>;
      return typeof x.id === 'string' && x.id.length <= 300 && typeof x.title === 'string' && x.title.length <= 500 &&
        (x.kind === 'news' || x.kind === 'letter') && Array.isArray(x.categories) && x.categories.length <= 10 && x.categories.every((c) => typeof c === 'string' && c.length <= 80) &&
        Array.isArray(x.keywords) && x.keywords.length <= 30 && x.keywords.every((k) => typeof k === 'string' && k.length <= 80) &&
        typeof x.seenAt === 'string' && Date.parse(x.seenAt) <= now && Date.parse(x.seenAt) >= now - MAX_AGE;
    }).slice(-200);
  } catch { return []; }
}

/** 반복 열기로 관심을 부풀리지 않는다. 콘텐츠별 최근 열람 한 건만 90일/최대 200건 보관한다. */
export function appendReadingSignal(records: ReadingSignal[], signal: ReadingSignal): ReadingSignal[] {
  return [...records.filter((item) => item.id !== signal.id || item.kind !== signal.kind), signal].slice(-200);
}

export function saveReadingSignal(scope: string, signal: ReadingSignal): boolean {
  try {
    const key = readingSignalKey(scope);
    const records = appendReadingSignal(parseReadingSignals(localStorage.getItem(key)), signal);
    localStorage.setItem(key, JSON.stringify(records));
    window.dispatchEvent(new CustomEvent(READING_SIGNAL_EVENT));
    return true;
  } catch { return false; }
}
