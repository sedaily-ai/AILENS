/**
 * lens 기사 상세 URL 생성: 단일 정본 함수.
 *
 * 경로는 "/{category}/{yyyy}/{mm}/{dd}/{slug}"(en.sedaily.com 패턴)이다. canonical·OG·JSON-LD·sitemap.ts·rss.xml·news-sitemap.xml·내부 링크가
 * 모두 이 함수를 써서 같은 값을 갖게 하며, 개별 관리로 인한 불일치를 구조적으로 막는다.
 *
 * 카테고리 세그먼트는 ECON_CATEGORIES(econCategories.ts)의 영문 슬러그를 쓴다(nav·카테고리 아카이브 페이지와 동일 값).
 * category가 없거나(미분류 lens 글) 6개 라벨에 없는 값이면 FALLBACK_SLUG로 폴백한다(카테고리 세그먼트 없이는 경로를 만들 수 없다).
 *
 * lens.id 슬러그는 이미 "YYYY-MM-DD-제목" 형태로 날짜를 포함해 경로 세그먼트와 슬러그 사이에 날짜가 중복된다.
 * 슬러그에서 날짜를 떼려면 lens.id를 파싱/재조합해야 하고 서버 조회 키가 id 전체라 조회 로직도 바꿔야 하므로,
 * lens.id는 그대로 두고 경로만 카테고리+날짜로 감싼다.
 */
import { ECON_CATEGORIES } from '@/shared/constants/econCategories';

const FALLBACK_CATEGORY_SLUG = 'news';

const LABEL_TO_SLUG: Record<string, string> = Object.fromEntries(
  ECON_CATEGORIES.map((c) => [c.label, c.slug]),
);

export function lensCategorySlug(category?: string | null): string {
  if (!category) return FALLBACK_CATEGORY_SLUG;
  return LABEL_TO_SLUG[category] ?? FALLBACK_CATEGORY_SLUG;
}

export interface LensUrlInput {
  id: string;
  date: string; // "YYYY-MM-DD"
  category?: string | null;
}

/** 경로만(도메인 없이), 쿼리스트링 없이 — `/markets/2026/09/30/{slug}` */
export function lensPath(lens: LensUrlInput): string {
  const catSlug = lensCategorySlug(lens.category);
  const [y, m, d] = lens.date.split('-');
  return `/${catSlug}/${y}/${m}/${d}/${encodeURIComponent(lens.id)}`;
}
