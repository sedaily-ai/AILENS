import { redirectToLensArticle } from '@/shared/lib/seo/redirectToLensArticle';

// 레터 전용 상세는 두지 않는다(2026-10-09). 레터는 기사(lens) 페이지의 첫 탭이고 ID가 같으므로, 옛 주소 /letters/{id}는 그 기사로 영구 이동(308)한다.
// 대응하는 기사가 없으면 실제 404. 색인·공유된 옛 링크를 살리려고 라우트 자체는 남긴다(redirectToLensArticle.ts 참조).
export const revalidate = 300;
export const dynamicParams = true;

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return redirectToLensArticle(id);
}
