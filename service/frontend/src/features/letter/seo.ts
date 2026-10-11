import type { Metadata } from 'next';
import { SITE_URL } from '@/shared/constants/site';
import { buildPageTitle } from '@/shared/lib/seo/buildPageTitle';
import { buildSeoDescription } from '@/shared/lib/seo/sanitizeDescription';
import { issueLetterPath } from '@/shared/lib/api/issueLettersSeoApi';
import type { IssueLetter } from './data/letterTypes';

// 모아쓰기 레터의 검색·공유용 메타데이터와 구조화 데이터(JSON-LD). 정식 오픈(2026-10-12)부터 검색엔진에 노출한다.
// 에디터 필터 화면(/letter/editors/{id})은 목록과 내용이 겹쳐 색인에서 뺀다(noindex, follow, canonical=/letter).

const OG_IMAGE = { url: `${SITE_URL}/og-image.png`, width: 1200, height: 630, alt: 'AI LENS 레터' };
const LIST_TITLE = '레터 — 하나의 이슈, 여러 관점';
const LIST_DESCRIPTION = '소식, 실체, 다른 시각. 서울경제신문 보도를 바탕으로 하나의 이슈를 여러 기사와 관점으로 엮어, 좋아하는 에디터의 새 레터를 이메일로 받아 보는 AI LENS 레터.';

/** 발행 시각(KST "YYYY-MM-DDTHH:mm" 또는 ISO)을 ISO 8601(+09:00)로. */
function isoKst(publishedAt: string): string {
  return /[zZ]|[+-]\d{2}:?\d{2}$/.test(publishedAt) ? publishedAt : `${publishedAt}${publishedAt.length === 16 ? ':00' : ''}+09:00`;
}

export function buildLetterListMetadata(): Metadata {
  const url = `${SITE_URL}/letter`;
  return {
    title: LIST_TITLE,
    description: LIST_DESCRIPTION,
    keywords: ['레터', 'AI LENS 레터', '뉴스레터', '경제 뉴스레터', '서울경제'],
    alternates: { canonical: url },
    openGraph: { title: LIST_TITLE, description: LIST_DESCRIPTION, url, type: 'website', images: [OG_IMAGE], locale: 'ko_KR', siteName: 'AI LENS — 서울경제' },
    twitter: { card: 'summary_large_image', title: LIST_TITLE, description: LIST_DESCRIPTION, images: [OG_IMAGE.url] },
  };
}

export function buildLetterMetadata(letter: IssueLetter): Metadata {
  const url = `${SITE_URL}${issueLetterPath(letter.slug)}`;
  const title = buildPageTitle(letter.title, '레터');
  const description = buildSeoDescription(letter.deck || letter.summary[0], LIST_DESCRIPTION);
  return {
    title,
    description,
    keywords: [...(letter.topics ?? []), ...letter.categories, '레터', 'AI LENS', '서울경제'],
    alternates: { canonical: url },
    openGraph: {
      title, description, url, type: 'article', images: [OG_IMAGE], locale: 'ko_KR', siteName: 'AI LENS — 서울경제',
      publishedTime: isoKst(letter.publishedAt), section: letter.categories[0], authors: ['AI LENS 편집팀'],
    },
    twitter: { card: 'summary_large_image', title, description, images: [OG_IMAGE.url] },
  };
}

export function buildLetterEditorMetadata(name: string, intro: string): Metadata {
  return {
    title: `${name} 에디터의 레터`,
    description: intro,
    robots: { index: false, follow: true },
    alternates: { canonical: `${SITE_URL}/letter` },
  };
}

const PUBLISHER = { '@id': `${SITE_URL}/#organization` };
const AUTHOR = {
  '@type': 'Organization',
  name: 'AI LENS 편집팀',
  description: '서울경제신문 보도를 바탕으로 AI가 초안을 만들고 편집 원칙(사실 확인·중립)에 따라 검증해 발행합니다.',
  url: `${SITE_URL}/about`,
  parentOrganization: PUBLISHER,
};

export function buildLetterJsonLd(letter: IssueLetter) {
  const url = `${SITE_URL}${issueLetterPath(letter.slug)}`;
  const published = isoKst(letter.publishedAt);
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'NewsArticle',
      '@id': `${url}#article`,
      url,
      mainEntityOfPage: url,
      headline: letter.title.slice(0, 110),
      description: buildSeoDescription(letter.deck || letter.summary[0], LIST_DESCRIPTION),
      inLanguage: 'ko-KR',
      datePublished: published,
      dateModified: published,
      articleSection: letter.categories[0],
      keywords: [...(letter.topics ?? []), ...letter.categories].join(', '),
      isPartOf: { '@id': `${SITE_URL}/#website` },
      publisher: PUBLISHER,
      author: AUTHOR,
      image: [`${SITE_URL}/og-image.png`],
      // 레터가 근거로 삼은 서울경제 기사(출처 패널과 같은 목록).
      citation: letter.sources.filter((s) => s.href).map((s) => ({ '@type': 'NewsArticle', name: s.title, url: s.href, publisher: { '@type': 'NewsMediaOrganization', name: s.outlet } })),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'AI LENS', item: SITE_URL },
        { '@type': 'ListItem', position: 2, name: '레터', item: `${SITE_URL}/letter` },
        { '@type': 'ListItem', position: 3, name: letter.title, item: url },
      ],
    },
  ];
}

export function buildLetterListJsonLd(letters: IssueLetter[]) {
  const url = `${SITE_URL}/letter`;
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': `${url}#collection`,
    url,
    name: LIST_TITLE,
    description: LIST_DESCRIPTION,
    inLanguage: 'ko-KR',
    isPartOf: { '@id': `${SITE_URL}/#website` },
    publisher: PUBLISHER,
    author: AUTHOR,
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: letters.slice(0, 20).map((l, i) => ({ '@type': 'ListItem', position: i + 1, url: `${SITE_URL}${issueLetterPath(l.slug)}`, name: l.title })),
    },
  };
}
