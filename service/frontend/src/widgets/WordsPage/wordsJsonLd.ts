import { SITE_URL } from '@/shared/constants/site';
import type { Term } from './words';

// DefinedTermSet — 용어 해설 콘텐츠에 맞는 schema.org 타입이라 다른 목록 페이지의 CollectionPage 대신 쓴다.
// /words와 /words/page/{n}이 같이 쓴다. terms에는 그 페이지에 실제로 보이는 용어만 넘긴다(화면에 없는 내용을 구조화 데이터에 넣지 않는다).
export function buildWordsJsonLd(terms: Term[], path: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'DefinedTermSet',
    name: '용어 해설 — 경제 용어 사전',
    description: 'AI LENS 레터에 나온 경제·시사 용어를 모아뒀어요.',
    url: `${SITE_URL}${path}`,
    inLanguage: 'ko-KR',
    author: {
      '@type': 'Organization',
      name: 'AI LENS 편집팀',
      description:
        '서울경제신문 기자들이 취재한 원본 기사를 바탕으로 AI가 레터·웹툰·팟캐스트·영상을 자동으로 만들어 발행하고, 편집팀이 발행 후 점검해 오류를 바로잡습니다.',
      url: `${SITE_URL}/about`,
      parentOrganization: { '@id': `${SITE_URL}/#organization` },
    },
    publisher: { '@id': `${SITE_URL}/#organization` },
    hasDefinedTerm: terms.map((t) => ({
      '@type': 'DefinedTerm',
      name: t.term,
      description: t.explain,
      url: t.href ? `${SITE_URL}${t.href}` : undefined,
      inDefinedTermSet: `${SITE_URL}/words`,
    })),
  };
}
