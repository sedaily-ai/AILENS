import { NextResponse } from 'next/server';
import { fetchAllLensPosts } from '@/shared/lib/api/cmsPostsApi';
import { SITE_URL } from '@/shared/constants/site';
import { LENS_PERSPECTIVES } from '@/shared/constants/lensPerspectives';
import { seoHeadline } from '@/shared/lib/content/displayHeadline';
import { lensPath } from '@/shared/lib/content/lensUrl';
import { SEDAILY_SITES, sedailyArticleKey, type SedailySite } from '../../../sedailyArticle';

// 본지 기사 → AI LENS 기사 찾기(신청서 모듈 G "MBTI로 읽기" 위젯이 부른다).
// GET /api/widget/lookup/{www|signal}/{본지 기사번호} → { found, url, headline, formats[], typeFinderUrl }
// · 본지(sedaily.com) 페이지의 스크립트가 부르므로 CORS를 연다(공개된 기사 정보만, 읽기 전용).
// · 쿼리스트링이 아니라 경로로 받는다 — CloudFront 캐시 키에 쿼리스트링이 없어 ?url= 로 받으면 다른 기사의 응답이 섞인다.
// · 본지 기사마다 한 번씩 불리므로 응답은 CDN이 보관하고, 서버는 전체 글 목록으로 만든 색인을 메모리에 10분 둔다
//   (전체 목록 ~3MB는 Next 데이터 캐시 한도 2MB를 넘어 캐시되지 않는다 — fetchPaperDates()와 같은 방식).

type Entry = { id: string; date: string; category?: string | null; headline: string };

const INDEX_TTL_MS = 10 * 60 * 1000;
let indexMemo: { at: number; map: Map<string, Entry> } | null = null;
let indexInFlight: Promise<Map<string, Entry>> | null = null;

async function articleIndex(): Promise<Map<string, Entry>> {
  if (indexMemo && Date.now() - indexMemo.at < INDEX_TTL_MS) return indexMemo.map;
  if (indexInFlight) return indexInFlight;
  indexInFlight = (async () => {
    const posts = await fetchAllLensPosts();
    const map = new Map<string, Entry>();
    for (const p of posts) {
      const key = sedailyArticleKey(p.source_url);
      if (!key) continue;
      const prev = map.get(key);
      // 같은 본지 기사로 만든 글이 둘 이상이면 최근 글을 쓴다.
      if (!prev || p.date > prev.date) map.set(key, { id: p.id, date: p.date, category: p.category, headline: p.headline });
    }
    // 목록 API가 일시적으로 비면 직전 색인을 계속 쓴다(빈 색인을 굳히지 않는다).
    if (map.size === 0) return indexMemo?.map ?? map;
    indexMemo = { at: Date.now(), map };
    return map;
  })().finally(() => {
    indexInFlight = null;
  });
  return indexInFlight;
}

const CORS = { 'Access-Control-Allow-Origin': '*' };

export async function GET(_req: Request, { params }: { params: Promise<{ site: string; id: string }> }) {
  const { site, id } = await params;
  if (!SEDAILY_SITES.includes(site as SedailySite) || !/^\d{5,12}$/.test(id)) {
    return NextResponse.json({ found: false }, { status: 400, headers: { ...CORS, 'Cache-Control': 'public, s-maxage=86400' } });
  }
  const index = await articleIndex();
  if (index.size === 0) {
    return NextResponse.json({ found: false }, { status: 503, headers: { ...CORS, 'Cache-Control': 'no-store' } });
  }
  const hit = index.get(`${site}:${id}`);
  if (!hit) {
    // 아직 AI LENS로 만들지 않은 기사 — 하루 여러 번 새로 발행되므로 짧게만 보관한다.
    return NextResponse.json({ found: false }, { headers: { ...CORS, 'Cache-Control': 'public, max-age=60, s-maxage=300' } });
  }
  const url = `${SITE_URL}${lensPath(hit)}`;
  return NextResponse.json(
    {
      found: true,
      url,
      headline: seoHeadline(hit.headline),
      formats: LENS_PERSPECTIVES.map((p, i) => ({ label: p.short, who: p.full, color: p.color, url: `${url}?v=${i + 1}` })),
      typeFinderUrl: `${SITE_URL}/start`,
    },
    { headers: { ...CORS, 'Cache-Control': 'public, max-age=300, s-maxage=600, stale-while-revalidate=3600' } },
  );
}
