import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { StaticPageShell } from '@/widgets/StaticPageShell';
import { SITE_URL } from '@/shared/constants/site';
import { fetchLensBySlug } from '@/shared/lib/api/cmsPostsApi';
import { lensPath } from '@/shared/lib/content/lensUrl';
import { buildCompareCard } from '../compareCard';
import { CARD_SIZES, CARD_TEXT_MAX } from '../renderCompareCard';

// 비교 카드 공유 페이지 — SNS에 퍼지는 링크(신청서 모듈 F "SNS 공유 링크(OG 태그)").
// 링크 미리보기는 og.png(같은 기사의 4형식 첫 마디)를 보여 주고, 들어온 사람은 카드를 본 뒤 원래 기사(4형식 탭)로 이어진다.
// 기사와 내용이 겹치는 얇은 페이지라 색인하지 않고 정본은 기사 주소로 둔다.
export const revalidate = 300;

type Params = { params: Promise<{ id: string }> };

function decodeId(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const id = decodeId((await params).id);
  const lens = await fetchLensBySlug(id);
  if (!lens) return { robots: { index: false } };
  const card = buildCompareCard(lens, CARD_TEXT_MAX.og);
  const title = `${card.headline} — 4가지로 비교`;
  const description = '같은 기사를 레터·웹툰·팟캐스트·영상으로. 형식마다 어떻게 시작하는지 한 장에 모았어요.';
  const pageUrl = `${SITE_URL}/card/${encodeURIComponent(lens.id)}`;
  const image = { url: `${pageUrl}/og.png`, ...CARD_SIZES.og, alt: `${card.headline} — 레터·웹툰·팟캐스트·영상 비교 카드` };
  return {
    title,
    description,
    alternates: { canonical: `${SITE_URL}${lensPath(lens)}` },
    robots: { index: false, follow: true },
    openGraph: { type: 'article', url: pageUrl, siteName: 'AI LENS', title, description, images: [image] },
    twitter: { card: 'summary_large_image', title, description, images: [image.url] },
  };
}

/** 형식 이름 + 조사(받침 유무에 맞춘 '로/으로'). */
const VIEW_AS: Record<string, string> = { letter: '레터로', webtoon: '웹툰으로', podcast: '팟캐스트로', video: '영상으로' };

const btn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: 44,
  padding: '0 18px',
  borderRadius: 999,
  fontSize: 14.5,
  fontWeight: 700,
  textDecoration: 'none',
};

export default async function CompareCardPage({ params }: Params) {
  const id = decodeId((await params).id);
  const lens = await fetchLensBySlug(id);
  if (!lens) notFound();
  const card = buildCompareCard(lens, CARD_TEXT_MAX.story);
  const articleHref = lensPath(lens);
  const storyUrl = `/card/${encodeURIComponent(lens.id)}/story.png`;

  return (
    <StaticPageShell title="같은 뉴스, 4가지로 비교">
      <p style={{ margin: '0 0 6px', fontSize: 13, color: '#6b7280' }}>{[card.category, card.date].filter(Boolean).join(' · ')}</p>
      <p style={{ margin: '0 0 18px', fontSize: 18, fontWeight: 700, color: '#111827', lineHeight: 1.5, wordBreak: 'keep-all' }}>
        <Link href={articleHref} style={{ color: 'inherit', textDecoration: 'none' }}>
          {card.headline}
        </Link>
      </p>
      {/* eslint-disable-next-line @next/next/no-img-element -- 같은 출처의 PNG를 원본 크기 그대로 보여 준다(이미지 최적화 대상 아님). */}
      <img
        src={storyUrl}
        alt={`${card.headline} — 레터·웹툰·팟캐스트·영상이 각각 어떻게 시작하는지 비교한 카드`}
        width={CARD_SIZES.story.width}
        height={CARD_SIZES.story.height}
        style={{ display: 'block', width: '100%', height: 'auto', borderRadius: 16, border: '1px solid #e5e7eb' }}
      />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 20 }}>
        <Link href={articleHref} style={{ ...btn, background: '#111827', color: '#fff' }}>
          이 기사 4가지로 보기
        </Link>
        <Link href="/start" style={{ ...btn, background: '#f3f4f6', color: '#111827' }}>
          나에게 맞는 형식 찾기
        </Link>
      </div>
      <p style={{ marginTop: 16, fontSize: 13.5, color: '#6b7280', wordBreak: 'keep-all' }}>
        {card.entries.map((e, i) => (
          <span key={e.format}>
            {i > 0 && ' · '}
            <Link href={`${articleHref}?v=${i + 1}`} style={{ color: e.color, fontWeight: 700 }}>
              {VIEW_AS[e.format]} 보기
            </Link>
          </span>
        ))}
      </p>
      <p style={{ marginTop: 18, fontSize: 13, color: '#9ca3af', wordBreak: 'keep-all' }}>
        카드의 문장은 발행된 레터·웹툰·팟캐스트·영상의 첫 부분을 그대로 옮긴 것이며, 네 형식 모두 같은 서울경제 기사를 바탕으로 합니다.
      </p>
    </StaticPageShell>
  );
}
