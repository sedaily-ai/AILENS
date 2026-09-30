import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { buildEconomyCategoryMetadata, EconomyCategoryPage } from '@/widgets/CategoryArchiveClient';

// 카테고리 아카이브 페이지네이션(2026-09-30, 서울경제 본지 사이트
// sedaily.com/politics/president 참고 요청) — video/listen/lens와 같은
// /{slug}/page/[n] 경로 세그먼트 패턴. 이 파일은 카테고리 슬러그만
// 고정해서 넘기는 wrapper(EconomyCategoryPage.tsx 참조).
type Params = Promise<{ n: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { n } = await params;
  return buildEconomyCategoryMetadata('culture', parseInt(n, 10) || 1);
}

export default async function Page({ params }: { params: Params }) {
  const { n: rawN } = await params;
  const n = parseInt(rawN, 10);
  if (!Number.isFinite(n) || n <= 1) redirect('/culture');
  return EconomyCategoryPage({ slug: 'culture', page: n });
}
