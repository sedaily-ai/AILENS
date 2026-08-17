import { fetchTerms, WordsPage } from '@/widgets/WordsPage';

// SSR 분리(2026-08-12, "다른 페이지들도 이 패턴으로 검토해주시죠" GEO 감사) —
// /timeline과 같은 원인·같은 수정: 예전엔 이 페이지 전체가 'use client'라
// terms를 useEffect+fetch로 채웠고, 첫 페인트(크롤러가 보는 그 순간)엔
// 스켈레톤 8개뿐이었다. 메타데이터는 words/layout.tsx가 이미 담당하고 있어서
// (2026-08-11 SEO 감사) 그대로 두고, 이 파일만 서버에서 미리 fetchTerms()를
// 돌려 실제 목록을 첫 HTML에 박아 넣는다.
const SITE_URL = 'https://ailens.sedaily.ai';

export default async function WordsGlossaryPage() {
  const terms = await fetchTerms();

  // DefinedTermSet — 용어 해설이라는 콘텐츠 성격에 정확히 맞는 schema.org
  // 타입이라 다른 목록 페이지들이 쓰는 CollectionPage 대신 이걸 쓴다. 용어가
  // 많아질 수 있어 처음 60개만(timeline/[date]의 "최대 30개" 캡과 같은 이유 —
  // 너무 큰 JSON-LD 블록은 오히려 파싱 비용만 늘린다).
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'DefinedTermSet',
    name: '용어 해설 — 경제 용어 사전',
    description: 'AI LENS 레터에 나온 경제·시사 용어를 모아뒀어요.',
    url: `${SITE_URL}/words`,
    inLanguage: 'ko-KR',
    author: {
      '@type': 'Organization',
      name: 'AI LENS 편집팀',
      description:
        '서울경제신문 기자들이 취재한 원본 기사를 바탕으로 AI가 요약·재구성한 초안을 작성하고, 편집팀이 검수해 발행합니다.',
      url: `${SITE_URL}/about`,
      parentOrganization: { '@id': `${SITE_URL}/#organization` },
    },
    publisher: { '@id': `${SITE_URL}/#organization` },
    hasDefinedTerm: terms.slice(0, 60).map((t) => ({
      '@type': 'DefinedTerm',
      name: t.term,
      description: t.explain,
      url: t.href ? `${SITE_URL}${t.href}` : undefined,
      inDefinedTermSet: `${SITE_URL}/words`,
    })),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <WordsPage initialTerms={terms} />
    </>
  );
}
