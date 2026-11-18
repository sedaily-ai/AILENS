import type { Metadata } from 'next';
import { SITE_URL } from '@/shared/constants/site';

// 페이지가 openGraph/twitter를 직접 정의하면 Next는 layout의 값과 합치지 않고 통째로 덮어쓴다(얕은 병합).
// 그래서 openGraph를 쓰는 페이지마다 공유 이미지를 따로 넣어야 하는데, 타임라인 5곳이 이를 빠뜨려 카카오톡·SNS 미리보기에 그림이 없었다(2026-11-18 점검).
// 이 함수로 openGraph·twitter를 한 번에 만들어 이미지 누락을 구조적으로 막는다. 새 페이지는 openGraph를 직접 쓰지 말고 이 함수를 쓴다.
const DEFAULT_IMAGE = { url: `${SITE_URL}/og-image.png`, width: 1200, height: 630 };

export function pageShareMeta(opts: {
  title: string;
  description: string;
  url: string;
  type?: 'website' | 'article';
  imageAlt?: string;
}): Pick<Metadata, 'openGraph' | 'twitter'> {
  const alt = opts.imageAlt ?? opts.title;
  return {
    openGraph: {
      title: opts.title,
      description: opts.description,
      url: opts.url,
      type: opts.type ?? 'website',
      images: [{ ...DEFAULT_IMAGE, alt }],
      locale: 'ko_KR',
      siteName: 'AI LENS — 서울경제',
    },
    twitter: { card: 'summary_large_image', title: opts.title, description: opts.description, images: [DEFAULT_IMAGE.url] },
  };
}
