import { fetchLensBySlug } from '@/shared/lib/api/cmsPostsApi';
import { buildCompareCard } from '../../compareCard';
import { CARD_TEXT_MAX, renderCompareCard, type CardVariant } from '../../renderCompareCard';

// 비교 카드 이미지 — /card/{기사 id}/og.png(링크 미리보기 1200×630), /card/{기사 id}/story.png(저장용 1080×1350).
// 크기를 쿼리스트링이 아니라 경로로 받는다: CloudFront 캐시 키에 쿼리스트링이 들어가지 않아(cache-policy-rsc-aware.json)
// ?size= 로 나누면 먼저 캐시된 크기가 다른 크기 요청에도 나간다.
const FILES: Record<string, CardVariant> = { 'og.png': 'og', 'story.png': 'story' };

export async function GET(_req: Request, { params }: { params: Promise<{ id: string; file: string }> }) {
  const { id: rawId, file } = await params;
  const variant = FILES[file];
  if (!variant) return new Response('Not found', { status: 404 });
  let id = rawId;
  try {
    id = decodeURIComponent(rawId);
  } catch {
    // 이미 풀린 값이면 그대로 쓴다.
  }
  const lens = await fetchLensBySlug(id);
  if (!lens) return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'public, s-maxage=60' } });
  const card = buildCompareCard(lens, CARD_TEXT_MAX[variant]);
  if (card.entries.length === 0) return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'public, s-maxage=60' } });
  try {
    // 발행 뒤 본문이 고쳐질 수 있어 CDN은 1시간만 보관한다(그 사이에도 낡은 카드를 먼저 주고 뒤에서 갱신).
    return await renderCompareCard(card, variant, {
      'Cache-Control': 'public, max-age=600, s-maxage=3600, stale-while-revalidate=86400',
    });
  } catch (e) {
    console.error('compare card render failed:', id, variant, e);
    return new Response('Failed to render card', { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}
