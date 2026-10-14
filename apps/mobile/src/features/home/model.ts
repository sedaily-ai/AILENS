// 홈 화면의 순수 데이터 로직(네트워크·UI 없음). 웹 buildArchiveItems / paperSections / CategoryFeatureSection 규칙을 옮긴 것이다.
import type { LensPost, LetterPost } from '@ailens/api-client';
import { categoryForDataLabel, displayHeadline, ECON_CATEGORIES, type EconCategoryConfig } from '@ailens/domain';

export interface FeedItem {
  id: string;
  title: string;
  excerpt: string;
  category?: string | null;
  publishedAt?: string | null;
  date?: string | null;
  imageUrl?: string | null;
}

/**
 * "최신 뉴스" 항목. letters 채널은 lens 글도 섞어 돌려주므로(letter 포맷 rendition) 같은 id 는 lens 버전만 남기고 최신순 정렬한다.
 */
export function buildLatest(letters: LetterPost[], lens: LensPost[]): FeedItem[] {
  const lensIds = new Set(lens.map((l) => l.id));
  const fromLens: FeedItem[] = lens.map((l) => ({
    id: l.id,
    title: displayHeadline(l.headline),
    excerpt: l.context,
    category: l.category,
    publishedAt: l.published_at,
    date: l.date,
    imageUrl: l.photo_image_url,
  }));
  const fromLetters: FeedItem[] = letters
    .filter((l) => !lensIds.has(l.id))
    .map((l) => ({
      id: l.id,
      title: displayHeadline(l.headline),
      excerpt: l.subtitle ?? '',
      category: l.category,
      publishedAt: l.published_at,
      date: l.publish_date,
      imageUrl: l.photo_image_url ?? l.cover_image_url,
    }));
  const key = (i: FeedItem) => i.publishedAt ?? i.date ?? '';
  return [...fromLens, ...fromLetters].sort((a, b) => key(b).localeCompare(key(a)));
}

/** 지면 특별 코너 4탭. paperSection 은 lens.paper_section 값과 일치해야 한다(웹 features/news-feed/lib/paperSections.ts). */
export const PAPER_TABS = [
  { key: 'all', label: '지면 1면', paperSection: '전체' },
  { key: 'markets', label: '증권 1면', paperSection: '증권' },
  { key: 'industry', label: '산업 1면', paperSection: '산업' },
  { key: 'signal', label: '시그널 1면', paperSection: '시그널' },
] as const;

/** 탭 하나의 기사 최대 4건 — 날짜 최신 우선, 같은 날은 display_order 오름차순. */
export function pickPaperSection(lens: LensPost[], paperSection: string): LensPost[] {
  return lens
    .filter((l) => l.paper_section === paperSection)
    .slice()
    .sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      const oa = a.display_order;
      const ob = b.display_order;
      if (oa != null && ob != null) return oa - ob;
      if (oa != null) return -1;
      if (ob != null) return 1;
      return 0;
    })
    .slice(0, 4);
}

/** "10월 14일 수요일 지면". 요일은 UTC 정오 기준이라 시간대에 흔들리지 않는다. */
export function paperTitle(date?: string): string {
  const m = date ? /^(\d{4})-(\d{2})-(\d{2})/.exec(date) : null;
  if (!m) return '오늘의 지면';
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const wd = ['일', '월', '화', '수', '목', '금', '토'][new Date(Date.UTC(y, mo - 1, d, 12)).getUTCDay()];
  return `${mo}월 ${d}일 ${wd}요일 지면`;
}

export interface CategoryGroup {
  category: EconCategoryConfig;
  items: FeedItem[];
}

/** 카테고리별 묶음(ECON_CATEGORIES 순서). 글이 없는 카테고리는 뺀다. 옛 이름('증시' 등)도 같은 분류로 본다. */
export function groupByCategory(items: FeedItem[]): CategoryGroup[] {
  return ECON_CATEGORIES.map((category) => ({
    category,
    items: items.filter((i) => categoryForDataLabel(i.category)?.slug === category.slug),
  })).filter((g) => g.items.length > 0);
}
