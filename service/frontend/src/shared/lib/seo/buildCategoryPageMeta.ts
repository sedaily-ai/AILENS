import type { Metadata } from 'next';
import type { EconCategoryConfig } from '@/shared/constants/econCategories';
import type { ArchiveItem } from '@/shared/lib/archiveItems';

// 6개 카테고리 아카이브 페이지(/markets 등)가 구조는 완전히 같고 설정값만
// 달라서, column/page.tsx·trend/page.tsx가 각자 손으로 쓰던 metadata/JSON-LD
// 빌더를 여기 하나로 합쳐 재사용한다(2026-08-17).
import { SITE_URL } from '@/shared/constants/site';

export function buildCategoryMetadata(config: EconCategoryConfig): Metadata {
  const suffix = config.metaSuffix ?? '경제 뉴스';
  const title = `${config.label} — ${suffix}`;
  const url = `${SITE_URL}/${config.slug}`;
  return {
    title,
    description: config.description,
    keywords: [config.label, `${config.label} 뉴스`, 'AI LENS', '서울경제', suffix],
    // 카테고리별 RSS 자동 발견(2026-10-01) — /{slug}/rss.xml
    alternates: { canonical: url, types: { 'application/rss+xml': `${url}/rss.xml` } },
    openGraph: {
      title,
      description: config.description,
      url,
      type: 'website',
      images: [{ url: `${SITE_URL}/og-image.png`, width: 1200, height: 630, alt: 'AI LENS' }],
      locale: 'ko_KR',
      siteName: 'AI LENS — 서울경제',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: config.description,
      images: [`${SITE_URL}/og-image.png`],
    },
  };
}

// 2쪽 이상(2026-09-30, 페이지네이션 신설) — video/listen/lens의 page/[n]과
// 같은 원칙: 페이지마다 title·canonical을 다르게 줘서 중복 콘텐츠로
// 묶이지 않게 한다(/video/page/[n]/page.tsx 참조).
export function buildCategoryPageNMetadata(config: EconCategoryConfig, page: number): Metadata {
  const suffix = config.metaSuffix ?? '경제 뉴스';
  const title = `${config.label} — ${suffix} — ${page}페이지`;
  const url = `${SITE_URL}/${config.slug}/page/${page}`;
  return {
    title,
    description: config.description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description: config.description,
      url,
      type: 'website',
      images: [{ url: `${SITE_URL}/og-image.png`, width: 1200, height: 630, alt: 'AI LENS' }],
      locale: 'ko_KR',
      siteName: 'AI LENS — 서울경제',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: config.description,
      images: [`${SITE_URL}/og-image.png`],
    },
  };
}

export function buildCategoryJsonLd(config: EconCategoryConfig, items: ArchiveItem[]) {
  const url = `${SITE_URL}/${config.slug}`;
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': `${url}#collection`,
    url,
    name: `${config.label} — ${config.metaSuffix ?? '경제 뉴스'}`,
    description: config.description,
    inLanguage: 'ko-KR',
    isPartOf: { '@id': `${SITE_URL}/#website` },
    publisher: { '@id': `${SITE_URL}/#organization` },
    author: {
      '@type': 'Organization',
      name: 'AI LENS 편집팀',
      description: '서울경제신문 기자들이 취재한 원본 기사를 바탕으로 AI가 요약·재구성한 초안을 작성하고, 편집팀이 검수해 발행합니다.',
      url: `${SITE_URL}/about`,
      parentOrganization: { '@id': `${SITE_URL}/#organization` },
    },
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: items
        .filter((it) => it.href)
        .slice(0, 20)
        .map((it, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          url: it.external ? it.href! : `${SITE_URL}${it.href}`,
          name: it.title,
        })),
    },
  };
}
