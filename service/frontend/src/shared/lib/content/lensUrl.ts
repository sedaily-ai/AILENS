/**
 * lens 기사 상세 URL 생성 — 단일 정본 함수(2026-09-30, SEO 감사 R20).
 *
 * "/lens/{slug}" → "/{slug}"(같은 날 1차 변경) → "/{category}/{yyyy}/{mm}/
 * {dd}/{slug}"(en.sedaily.com 패턴 — "/politics/2026/09/30/..." — 참고
 * 요청)로 2차 변경. 이 함수 하나로 canonical·OG·JSON-LD·sitemap.ts·
 * rss.xml·news-sitemap.xml·내부 링크(8곳 이상)가 전부 같은 값을 쓰도록
 * 묶는다 — R20이 지적한 "3곳 개별 관리로 인한 불일치 위험"을 여기서
 * 구조적으로 차단한다.
 *
 * 카테고리 세그먼트는 ECON_CATEGORIES(econCategories.ts)의 영문 슬러그를
 * 그대로 쓴다(nav·카테고리 아카이브 페이지와 동일 값). category가 없거나
 * (미분류 lens 글, 실측 약 10%) 6개 라벨에 없는 값이면 FALLBACK_SLUG로
 * 폴백 — 카테고리 세그먼트 없이는 경로 자체를 못 만들기 때문에 반드시
 * 뭔가는 채워야 한다.
 *
 * 날짜는 lens.id 슬러그 자체가 이미 "YYYY-MM-DD-제목" 형태로 날짜를
 * 포함하고 있어(2026-08-05 최초 슬러그 설계) 경로 세그먼트와 슬러그 사이에
 * 날짜가 중복된다 — en.sedaily.com처럼 슬러그에서 날짜를 떼어내는 건
 * lens.id를 파싱/재조합해야 해서(서버 조회 키가 id 전체이므로 일부만
 * 잘라 쓰면 조회 로직도 같이 바꿔야 함) 리스크 대비 이득이 적다고 판단해
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
