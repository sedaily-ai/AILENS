// 웹툰 "시리즈" 재구조화(2026-08-21) — "화수 나열"이 아니라 "여러 개의 독립된
// 웹툰 시리즈"로 /webtoon을 다시 짠다(사용자 요청, 참고 이미지: 카카오페이지식
// 진열대). 백엔드에 시리즈 마스터 테이블은 없다 — 매 편(post)에 자유 텍스트
// series_title을 중복 저장하는 가장 얕은 방법을 택했다(cms_posts_public.py
// _shape_webtoon 참조). 이 파일은 그 평평한 편 목록을 시리즈 단위로 묶는
// 순수 함수만 담는다 — API 호출도, React도 없다.
import type { CmsWebtoon } from '@/shared/lib/api/cmsPostsApi';

export interface WebtoonSeries {
  /**
   * URL 세그먼트로 쓸 원문 문자열(한글 포함, 미인코딩) — 링크를 만들 때
   * encodeURIComponent를 씌운다. 기존 `/webtoon/{id}` 링크와 같은 패턴
   * (WebtoonListClient.tsx의 encodeURIComponent(w.id) 참조).
   */
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
   * 최신 화의 "전체 채널 기준" 회차 번호(2026-08-21) — series_title 데이터가
   * 아직 없어서(백필 전) 편마다 각자 1편짜리 "단편" 시리즈로 잡히는데,
   * 그 상태에서 episodes.length(=1)를 화수 배지에 쓰면 표지 24장 전부가
   * "1화"로 보인다("이 웹툰의 회차가 있을 텐데 그 숫자로 바꿔 달라" 피드백).
   * 실제로 이 편이 전체 웹툰 발행 이력에서 몇 번째인지(오래된 편이 1화,
   * 최신 편이 가장 큰 번호)를 대신 보여준다 — WebtoonViewClient.tsx의
   * episodeLabel·이전 히어로 캐러셀 epNumber와 같은 번호 매김 규약이다.
   * 시리즈에 실제로 여러 편이 묶이게 되면(series_title 백필 후) 이 값은
   * 그 시리즈의 최신 편이 전체에서 몇 화인지를 계속 정확히 가리킨다.
   */
  latestEpisodeNumber: number;
}

/**
 * series_title이 없는 편은 자기 자신이 유일한 시리즈다("단편"). 편의 id를
 * 키로 쓰면 다른 시리즈와 절대 충돌하지 않는다 — id는 CMS slug 기반 전역
 * 고유값이라 어떤 series_title 문자열과도 우연히 겹칠 일이 없다.
 */
function seriesKey(w: CmsWebtoon): string {
  return w.series_title?.trim() || w.id;
}

/**
 * 웹툰 채널 전체를 시리즈 단위로 묶는다. 반환 목록은 "최신화가 갱신된
 * 시리즈가 앞" 순서(latestDate desc)다 — 편 하나가 갱신되면 그 시리즈
 * 전체가 목록 앞으로 온다(실제 웹툰 앱들의 "업데이트순" 관례와 같다).
 */
export function groupIntoSeries(items: CmsWebtoon[]): WebtoonSeries[] {
  // 전체 채널 기준 회차 번호 — 오래된 편이 1화. items가 이미 date desc로
  // 오든 안 오든 이 함수 안에서 다시 정렬해 기준을 고정한다(호출부마다
  // 정렬 여부가 다르면 번호가 흔들린다).
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
 * 시리즈 내 화수 번호 — 오래된 화가 1화, 최신 화가 가장 큰 번호(상세 페이지의
 * 기존 규약과 동일, WebtoonViewClient.tsx episodeLabel 참조). episodes는
 * 이미 date desc로 정렬돼 있다는 전제.
 */
export function episodeNumberInSeries(series: WebtoonSeries, episodeId: string): number | undefined {
  const idx = series.episodes.findIndex((e) => e.id === episodeId);
  if (idx === -1) return undefined;
  return series.episodes.length - idx;
}

/** 한 편이 속한 시리즈를 찾는다(상세 페이지의 이웃 탐색·시리즈 배지용). */
export function findSeriesContaining(items: CmsWebtoon[], episodeId: string): WebtoonSeries | null {
  return groupIntoSeries(items).find((s) => s.episodes.some((e) => e.id === episodeId)) ?? null;
}
