import { fetchTerms, WordsPage } from '@/widgets/WordsPage';

// 서버에서 fetchTerms()를 미리 호출해 실제 목록을 첫 HTML에 포함한다(/timeline과 같은 이유 — 클라이언트 fetch로만 채우면 크롤러가 보는 첫 페인트에는 스켈레톤뿐이다).
// 메타데이터는 words/layout.tsx가 담당한다.
import { SITE_URL } from '@/shared/constants/site';

export default async function WordsGlossaryPage() {
  const terms = await fetchTerms();

  // DefinedTermSet — 용어 해설 콘텐츠에 맞는 schema.org 타입이라 다른 목록 페이지의 CollectionPage 대신 쓴다.
  // 너무 큰 JSON-LD 블록은 파싱 비용만 늘리므로 처음 60개만 담는다(timeline/[date]의 "최대 30개" 캡과 같은 이유).
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
        '서울경제신문 기자들이 취재한 원본 기사를 바탕으로 AI가 레터·웹툰·팟캐스트·영상을 자동으로 만들어 발행하고, 편집팀이 발행 후 점검해 오류를 바로잡습니다.',
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
