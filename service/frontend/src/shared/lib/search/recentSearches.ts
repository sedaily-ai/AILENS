// 최근 검색어 — 이 기기의 localStorage에만 저장한다(서버로 보내지 않는다). 막힌 환경(사생활 보호 모드 등)에서도 화면이 깨지지 않게 모든 접근을 try/catch로 감싼다.
const KEY = 'ailens:recent-searches';
const MAX = 8;

export function getRecentSearches(): string[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string').slice(0, MAX) : [];
  } catch {
    return [];
  }
}

function save(list: string[]): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {
    // 저장이 막혀도 검색 자체는 동작한다.
  }
}

export function addRecentSearch(q: string): string[] {
  const term = q.trim();
  if (!term) return getRecentSearches();
  const next = [term, ...getRecentSearches().filter((x) => x !== term)].slice(0, MAX);
  save(next);
  return next;
}

export function removeRecentSearch(q: string): string[] {
  const next = getRecentSearches().filter((x) => x !== q);
  save(next);
  return next;
}

export function clearRecentSearches(): void {
  save([]);
}
