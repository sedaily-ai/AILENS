import { fetchTerms, sliceTermsPage, buildWordsJsonLd, WordsPage } from '@/widgets/WordsPage';

// 서버에서 fetchTerms()를 미리 호출해 실제 목록을 첫 HTML에 포함한다(클라이언트 fetch로만 채우면 크롤러가 보는 첫 페인트에는 스켈레톤뿐이다).
// 용어 1,600여 개를 100개씩 나눠 /words(1페이지), /words/page/{n}으로 낸다. 메타데이터는 words/layout.tsx가 담당한다.
export default async function WordsGlossaryPage() {
  const view = sliceTermsPage(await fetchTerms(), 1);
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(buildWordsJsonLd(view.items, '/words')) }} />
      <WordsPage {...view} initialTerms={view.items} />
    </>
  );
}
