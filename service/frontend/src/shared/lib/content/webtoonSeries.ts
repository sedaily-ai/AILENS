// 웹툰 "시리즈" 구조: 여러 개의 독립된 웹툰 시리즈로 /webtoon을 구성한다.
// 백엔드에 시리즈 마스터 테이블은 없고, 매 편(post)에 자유 텍스트 series_title을 중복 저장한다(cms_posts_public.py _shape_webtoon 참조).
// 이 파일은 그 평평한 편 목록을 시리즈 단위로 묶는 순수 함수만 담는다(API 호출도 React도 없다).
import type { CmsWebtoon } from '@/shared/lib/api/cmsPostsApi';

export interface WebtoonSeries {
  /** URL 세그먼트로 쓸 원문 문자열(한글 포함, 미인코딩). 링크를 만들 때 encodeURIComponent를 씌운다(기존 `/webtoon/{id}` 링크와 같은 패턴). */
  slug: string;
  title: string;
  /** 최신 화의 카테고리 — 시리즈 전체를 대표하는 값으로 쓴다. */
  category: string | null;
  coverImageUrl: string | null;
  /** 최신 화 발행일 — 시리즈 목록 정렬·배지에 쓴다. */
  latestDate: string;
  /** 최신 화가 먼저(date desc) — 상세 페이지 이웃 탐색과 같은 순서 규약. */
  episodes: CmsWebtoon[];
  /**
   * 최신 화의 "전체 채널 기준" 회차 번호. series_title이 없는 편은 각자 1편짜리 "단편" 시리즈가 되어
   * episodes.length(=1)를 화수 배지에 쓰면 모든 표지가 "1화"로 보이므로, 전체 웹툰 발행 이력에서의 순번
   * (오래된 편이 1화, 최신 편이 가장 큰 번호)을 대신 쓴다. WebtoonViewClient.tsx의 episodeLabel과 같은 번호 매김 규약이다.
   * 시리즈에 여러 편이 묶여도 이 값은 최신 편의 전체 순번을 계속 정확히 가리킨다.
   */
  latestEpisodeNumber: number;
}

/**
 * series_title이 없는 편은 자기 자신이 유일한 시리즈다("단편"). 편의 id는 CMS slug 기반 전역 고유값이라
 * 키로 쓰면 어떤 series_title 문자열과도 충돌하지 않는다.
 */
function seriesKey(w: CmsWebtoon): string {
  return w.series_title?.trim() || w.id;
}

/**
 * 웹툰 채널 전체를 시리즈 단위로 묶는다. 반환 목록은 최신화가 갱신된 시리즈가 앞인 순서(latestDate desc)다
 * (실제 웹툰 앱의 "업데이트순" 관례).
 */
export function groupIntoSeries(items: CmsWebtoon[]): WebtoonSeries[] {
  // 전체 채널 기준 회차 번호(오래된 편이 1화). 호출부마다 정렬 여부가 다르면 번호가 흔들리므로 items가 이미 정렬되어 있더라도 여기서 다시 정렬해 기준을 고정한다.
  const byDateDesc = [...items].sort((a, b) => b.date.localeCompare(a.date));
  const episodeNumber = new Map<string, number>();
  byDateDesc.forEach((w, i) => episodeNumber.set(w.id, byDateDesc.length - i));

  const map = new Map<string, CmsWebtoon[]>();
  for (const w of items) {
    const key = seriesKey(w);
    const arr = map.get(key);
    if (arr) arr.push(w);
    else map.set(key, [w]);
  }

  const list: WebtoonSeries[] = [];
  for (const [slug, eps] of map) {
    eps.sort((a, b) => b.date.localeCompare(a.date));
    const latest = eps[0];
    list.push({
      slug,
      title: latest.series_title?.trim() || latest.title,
      category: latest.category ?? null,
      coverImageUrl: latest.cover_image_url,
      latestDate: latest.date,
      episodes: eps,
      latestEpisodeNumber: episodeNumber.get(latest.id) ?? eps.length,
    });
  }
  list.sort((a, b) => b.latestDate.localeCompare(a.latestDate));
  return list;
}

export function findSeriesBySlug(items: CmsWebtoon[], slug: string): WebtoonSeries | null {
  return groupIntoSeries(items).find((s) => s.slug === slug) ?? null;
}

/**
 * 시리즈 내 화수 번호. 오래된 화가 1화, 최신 화가 가장 큰 번호다(상세 페이지의 episodeLabel과 같은 규약, WebtoonViewClient.tsx 참조).
 * episodes는 이미 date desc로 정렬되어 있다는 전제다.
 */
export function episodeNumberInSeries(series: WebtoonSeries, episodeId: string): number | undefined {
  const idx = series.episodes.findIndex((e) => e.id === episodeId);
  if (idx === -1) return undefined;
  return series.episodes.length - idx;
}
