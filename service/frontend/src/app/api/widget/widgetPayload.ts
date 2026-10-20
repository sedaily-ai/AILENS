import { SITE_URL } from '@/shared/constants/site';
import { LENS_PERSPECTIVES } from '@/shared/constants/lensPerspectives';
import { seoHeadline, lensPath } from '@ailens/domain';

// "MBTI로 읽기" 위젯이 그리는 기사 정보 — 기사 조회(lookup)와 최신 기사(latest)가 같은 모양으로 답한다.
// formats 는 4가지 형식 링크, image·date 는 위젯의 기사 미리보기(썸네일·날짜)에 쓴다.
export interface WidgetArticle {
  id: string;
  date: string;
  category?: string | null;
  headline: string;
  image?: string | null;
}

export function widgetPayload(hit: WidgetArticle) {
  const url = `${SITE_URL}${lensPath(hit)}`;
  return {
    found: true,
    url,
    headline: seoHeadline(hit.headline),
    image: hit.image ?? null,
    date: hit.date,
    formats: LENS_PERSPECTIVES.map((p, i) => ({ label: p.short, who: p.full, color: p.color, url: `${url}?v=${i + 1}` })),
    typeFinderUrl: `${SITE_URL}/start`,
  };
}
