import { redirectToLensArticle } from '@/shared/lib/seo/redirectToLensArticle';

// 전용 상세 없음 — 같은 기사 페이지로 영구 이동한다(redirectToLensArticle.ts 참조).
export const revalidate = 300;
export const dynamicParams = true;

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return redirectToLensArticle(slug);
}
