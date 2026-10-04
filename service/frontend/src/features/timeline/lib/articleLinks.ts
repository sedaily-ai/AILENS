// 기사 제목에 걸 링크 결정 — 서울경제 원문이 살아 있으면 그것을, 끊겼으면 빅카인즈 상세를, 둘 다 안 되면 링크를 걸지 않는다.

/**
 * 폐기된 레거시 CMS 호스트. 빅카인즈가 오래된 기사에 이 주소를 주지만 기사가 아닌 서울경제 홈으로 리다이렉트된다.
 * 날짜가 아니라 호스트로 판별하므로, 백엔드가 레거시 ID를 현재 ID로 매핑하면 자동으로 링크가 활성화된다.
 */
const DEAD_ORIGIN_HOSTS = new Set(['sednews.com', 'www.sednews.com']);

/** news_id 형식 — `02100311.20160316203759254` 처럼 숫자.숫자. */
const NEWS_ID_SHAPE = /^\d+\.\d+$/;

/** 서울경제 원문 링크가 실제 기사로 연결되는지 여부. false이면 해당 주소로는 링크를 걸지 않는다. */
export function isReadableOriginal(url: string | null | undefined): boolean {
  if (!url || url === '#') return false;
  try {
    return !DEAD_ORIGIN_HOSTS.has(new URL(url).host.toLowerCase());
  } catch {
    return false;
  }
}

/**
 * 빅카인즈 기사 상세 주소. 서울경제 원문이 끊긴 구간의 대안이며 같은 news_id로 열린다.
 * 로그인 없이 본문이 보이는지 확인되지 않아 화면 라벨은 "빅카인즈에서 보기"로 목적지를 밝힌다. news_id 형식이 아니면 null.
 */
function bigkindsArticleUrl(newsId: string | null | undefined): string | null {
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
