// 기사 제목에 걸 링크 결정 — 서울경제 원문이 살아 있으면 그것을, 끊겼으면 빅카인즈 상세를, 둘 다 안 되면 링크를 걸지 않는다.

/**
 * 폐기된 레거시 CMS 호스트. 빅카인즈가 오래된 기사에 이 주소를 주는데 기사가 아니라 서울경제 홈으로 리다이렉트된다.
 * 실측(2026-08-19, 날짜별 표본 3건 리다이렉트 추적): 2003·2010·2015년 sednews.com은 전부 홈으로,
 * 2020·2024·2026년 sedaily.com은 전부 기사로 갔다. 날짜가 아니라 호스트로 가른다 — 백엔드가 나중에 레거시 ID를 현재 ID로 매핑하면 자동으로 통과한다.
 */
const DEAD_ORIGIN_HOSTS = new Set(['sednews.com', 'www.sednews.com']);

/** news_id 형식 — `02100311.20160316203759254` 처럼 숫자.숫자. */
const NEWS_ID_SHAPE = /^\d+\.\d+$/;

/** 서울경제 원문 링크가 실제로 기사까지 데려가는가. false면 그 주소로는 링크를 걸지 않는다(눌렀는데 홈이 뜨면 다른 버튼도 안 믿게 된다). */
export function isReadableOriginal(url: string | null | undefined): boolean {
  if (!url || url === '#') return false;
  try {
    return !DEAD_ORIGIN_HOSTS.has(new URL(url).host.toLowerCase());
  } catch {
    return false;
  }
}

/**
 * 빅카인즈 기사 상세 주소. 서울경제 원문이 끊긴 구간의 대안이다(같은 news_id로 열린다, 2026-08-19 실측).
 * 본문이 로그인 없이 보이는지는 확인하지 못해 화면 라벨은 "빅카인즈에서 보기"로 목적지를 밝힌다. news_id 형식이 아니면 null.
 */
export function bigkindsArticleUrl(newsId: string | null | undefined): string | null {
  const id = (newsId ?? '').trim();
  return NEWS_ID_SHAPE.test(id) ? `https://www.bigkinds.or.kr/v2/news/newsDetailView.do?newsId=${encodeURIComponent(id)}` : null;
}

export interface ArticleLink {
  href: string;
  /** 'sedaily' = 서울경제 원문, 'bigkinds' = 뉴스 아카이브 상세. */
  kind: 'sedaily' | 'bigkinds';
}

export function resolveArticleLink(article: { original_link?: string | null; news_id?: string | null }): ArticleLink | null {
  if (isReadableOriginal(article.original_link)) return { href: article.original_link!, kind: 'sedaily' };
  const fallback = bigkindsArticleUrl(article.news_id);
  return fallback ? { href: fallback, kind: 'bigkinds' } : null;
}
