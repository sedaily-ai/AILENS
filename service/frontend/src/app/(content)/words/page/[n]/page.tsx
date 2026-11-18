import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { fetchTerms, sliceTermsPage, wordsPagePath, buildWordsJsonLd, WordsPage } from '@/widgets/WordsPage';
import { SITE_URL } from '@/shared/constants/site';
import { pageShareMeta } from '@/shared/lib/seo/meta/pageShare';

// /lens/page/[n]과 같은 방식: generateStaticParams를 빈 배열로 두어 요청 시 렌더 + ISR 캐시. n<=1 리다이렉트는 middleware.ts가 처리한다.
export const revalidate = 300;
export const dynamicParams = true;
export async function generateStaticParams() {
  return [];
}

function parsePage(raw: string) {
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 1 ? n : 1;
}

// 마지막 페이지를 넘는 번호는 404다(그대로 마지막 페이지를 보여 주면 같은 내용이 여러 주소로 색인된다).
async function loadView(raw: string) {
  const n = parsePage(raw);
  const view = sliceTermsPage(await fetchTerms(), n);
  if (n > view.totalPages) notFound();
  return view;
}

export async function generateMetadata({ params }: { params: Promise<{ n: string }> }): Promise<Metadata> {
  const { n: raw } = await params;
  const { currentPage } = await loadView(raw);
  const path = wordsPagePath(currentPage);
  const title = `용어 해설 — 경제 용어 사전 (${currentPage}페이지)`;
  const description = `AI LENS 기사에 나온 경제·시사 용어를 쉬운 말로 풀어 모았습니다. 용어 사전 ${currentPage}페이지입니다.`;
  return { title, description, alternates: { canonical: `${SITE_URL}${path}` }, ...pageShareMeta({ title, description, url: `${SITE_URL}${path}` }) };
}

export default async function WordsGlossaryPageN({ params }: { params: Promise<{ n: string }> }) {
  const { n: raw } = await params;
  const view = await loadView(raw);
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(buildWordsJsonLd(view.items, wordsPagePath(view.currentPage))) }} />
      <WordsPage {...view} initialTerms={view.items} />
    </>
  );
}
