import { PAPER_SECTION_VALUES, type CmsLens } from '@/shared/lib/api/cmsPostsApi';
import type { ArchiveItem } from '@/shared/lib/archiveItems';

// 홈이 서버에서 클라이언트로 직렬화하는 기사 데이터를 "화면이 실제로 쓰는 만큼"으로 줄인다(2026-10-04, 검색 점검의 HTML 크기 항목).
//
// 실측(운영 홈 HTML 533KB 중): initialLensPosts 109KB(100건) + initialArchiveItems 74KB — RSC 페이로드가 277KB.
// 화면이 쓰는 건 훨씬 적다:
//  - 히어로(LensPreviewSection): 4개 지면 탭 × 최대 4건 = 최대 16건
//  - 최신 그리드(LatestGridSection): 8건
//  - 카테고리 카드(CategoryFeatureSection): 카테고리당 히어로 1 + 목록 2(wide) 또는 카드 1(narrow) = 3건
// 나머지는 페이지에 그려지지도 않는데 HTML에 실려 있었다. 이 파일의 두 함수는 "화면이 쓰는 건수" 기준으로 잘라 보낸다.
// 기사 링크·본문은 서버가 렌더한 DOM에 그대로 있어(홈 DOM 내 기사 링크 30개) 검색 크롤러가 보는 구조는 바뀌지 않는다.
//
// ⚠️ 화면 쪽 기준이 바뀌면(탭 추가, 카드 수 변경) 아래 상수를 같이 올려야 한다 — 부족하면 해당 지면·카테고리가 비어 보인다.

/** LensPreviewSection의 SECTIONS(탭)와 같은 paper_section 값 — 정본은 cmsPostsApi의 PAPER_SECTION_VALUES("지난 지면" 페이지도 같은 값을 쓴다). */
const HOME_PAPER_SECTIONS = PAPER_SECTION_VALUES;
const PER_SECTION = 4;

/** 정렬은 LensPreviewSection의 sectionArticles와 같다: 날짜 최신 우선, 같은 날은 display_order 오름차순(있는 쪽 우선). */
function sortLikeHero(a: CmsLens, b: CmsLens): number {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1;
  const orderA = a.display_order;
  const orderB = b.display_order;
  if (orderA != null && orderB != null) return orderA - orderB;
  if (orderA != null) return -1;
  if (orderB != null) return 1;
  return 0;
}

/** 지면 탭 4개가 실제로 쓰는 기사만(최대 16건) — 입력 100건 전체를 보내지 않는다. "지난 지면" 페이지(/paper/[date])도 이 함수로 그날의 지면 16건만 고른다(일반 기사는 제외). */
export function pickLensPostsForHome(posts: CmsLens[]): CmsLens[] {
  const keep = new Set<string>();
  for (const section of HOME_PAPER_SECTIONS) {
    posts
      .filter((l) => l.paper_section === section)
      .sort(sortLikeHero)
      .slice(0, PER_SECTION)
      .forEach((l) => keep.add(l.id));
  }
  return posts.filter((l) => keep.has(l.id));
}

const LATEST_GRID = 12; // 그리드 8건 + 여유
const PER_CATEGORY = 4; // 카드가 쓰는 3건 + 여유

/** 최신 그리드와 카테고리 카드가 쓰는 만큼만 남긴다(원래 순서 유지). */
export function trimArchiveItemsForHome(items: ArchiveItem[]): ArchiveItem[] {
  const keep = new Set<number>();
  const perCategory = new Map<string, number>();
  items.forEach((it, i) => {
    if (i < LATEST_GRID) keep.add(i);
    if (it.category) {
      const n = perCategory.get(it.category) ?? 0;
      if (n < PER_CATEGORY) {
        keep.add(i);
        perCategory.set(it.category, n + 1);
      }
    }
  });
  return items.filter((_, i) => keep.has(i));
}
