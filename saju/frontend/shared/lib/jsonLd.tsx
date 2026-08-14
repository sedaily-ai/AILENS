export const SITE_URL = 'https://saju.sedaily.ai';
export const SITE_NAME_KO = '사주매칭';
export const SITE_NAME_EN = 'Saju Matching';

type Crumb = { name: string; path: string };

export function breadcrumbSchema(crumbs: Crumb[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.name,
      item: `${SITE_URL}${c.path}`,
    })),
  };
}

export function webPageSchema(args: {
  name: string;
  description: string;
  path: string;
  topic?: string[];
  datePublished?: string;
  dateModified?: string;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: args.name,
    description: args.description,
    url: `${SITE_URL}${args.path}`,
    inLanguage: 'ko-KR',
    isPartOf: { '@type': 'WebSite', name: SITE_NAME_KO, url: SITE_URL },
    about: (args.topic ?? []).map((t) => ({ '@type': 'Thing', name: t })),
    isAccessibleForFree: true,
    ...(args.datePublished ? { datePublished: args.datePublished } : {}),
    ...(args.dateModified ? { dateModified: args.dateModified } : {}),
  };
}

/** FAQ schema — AEO(Answer Engine) 인용 확률을 높이는 핵심 스키마 */
export function faqSchema(items: { q: string; a: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map(({ q, a }) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a },
    })),
  };
}

/** HowTo schema — 절차(예: 궁합 계산 단계)를 AI가 단계별로 인용하게 해줌 */
export function howToSchema(args: {
  name: string;
  description: string;
  steps: { name: string; text: string }[];
  totalTime?: string; // ISO8601 duration e.g., "PT2M"
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: args.name,
    description: args.description,
    ...(args.totalTime ? { totalTime: args.totalTime } : {}),
    step: args.steps.map((s, i) => ({
      '@type': 'HowToStep',
      position: i + 1,
      name: s.name,
      text: s.text,
    })),
  };
}

/** 사이트 전역 WebSite schema — 루트 layout에서 항상 노출 */
export function siteWebSiteSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME_KO,
    alternateName: SITE_NAME_EN,
    url: SITE_URL,
    inLanguage: ['ko-KR', 'en'],
    potentialAction: {
      '@type': 'SearchAction',
      target: `${SITE_URL}/saju?birthdate={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  };
}

/** 사이트 전역 Organization schema */
export function siteOrganizationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME_KO,
    alternateName: SITE_NAME_EN,
    url: SITE_URL,
    logo: `${SITE_URL}/icon.svg`,
    description:
      '궁통보감·삼명통회·자평진전 3대 고전과 KASI 만세력을 결합해 사주·운세·궁합을 데이터 기반으로 해석하는 독립 프로젝트.',
    foundingDate: '2026',
    knowsLanguage: ['ko', 'en'],
    sameAs: [] as string[],
  };
}

export function JsonLd({ data }: { data: unknown }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
