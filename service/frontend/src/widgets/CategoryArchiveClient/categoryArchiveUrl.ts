import type { DateRange } from '@/shared/ui/list/DateRangeFilter';

export type CategoryArchiveState = { activeSub: string; dateRange: DateRange | null; pageSize: number; page: number };

function validDate(value: string | null): value is string {
  return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}

export function readCategoryArchiveState(location: string, basePath: string, subcategories: readonly string[]): CategoryArchiveState {
  const url = new URL(location, 'https://archive.invalid');
  const sub = url.searchParams.get('sub');
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const size = Number(url.searchParams.get('size'));
  const page = Number(url.pathname.startsWith(`${basePath}/page/`) ? url.pathname.slice(`${basePath}/page/`.length) : 1);
  return {
    activeSub: sub && subcategories.includes(sub) ? sub : 'all',
    dateRange: validDate(from) && validDate(to) && from <= to ? { from, to } : null,
    pageSize: [20, 50, 100].includes(size) ? size : 20,
    page: Number.isSafeInteger(page) && page > 0 ? page : 1,
  };
}

export function categoryArchiveHref(location: string, basePath: string, state: CategoryArchiveState): string {
  const url = new URL(location, 'https://archive.invalid');
  url.pathname = state.page > 1 ? `${basePath}/page/${state.page}` : basePath;
  const params = url.searchParams;
  if (state.activeSub === 'all') params.delete('sub'); else params.set('sub', state.activeSub);
  if (state.pageSize === 20) params.delete('size'); else params.set('size', String(state.pageSize));
  if (state.dateRange) {
    params.set('from', state.dateRange.from);
    params.set('to', state.dateRange.to);
  } else {
    params.delete('from');
    params.delete('to');
  }
  return url.pathname + url.search + url.hash;
}
