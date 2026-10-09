import { permanentRedirect } from 'next/navigation';
import { redirectToLensArticle } from '@/shared/lib/seo/redirectToLensArticle';

// 구 공유 링크 별칭(/letters/view?id=...). 같은 기사 페이지로 영구 이동하고, id가 없으면 /lens로 보낸다.
export default async function Page({ searchParams }: { searchParams: Promise<{ id?: string | string[] }> }) {
  const { id } = await searchParams;
  const value = Array.isArray(id) ? id[0] : id;
  if (!value) permanentRedirect('/lens');
  return redirectToLensArticle(value);
}
