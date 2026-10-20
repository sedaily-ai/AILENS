'use client';

import Link from 'next/link';
import { ArrowUpRight, Quote } from 'lucide-react';
import type { useDashboardArchive } from '../lib/news/useDashboardArchive';
import type { IssueLetter } from '@/features/letter';
import type { NewsArticle } from '../lib/news/newsModel';
import { sentenceSourceHref } from '../lib/drawerModel';

export function ArchiveDiscovery({ archive, articles, letters }: { archive: ReturnType<typeof useDashboardArchive>; articles: NewsArticle[]; letters: IssueLetter[] }) {
  const { owner, sentences, failed, loading, retry } = archive;
  return (
    <section className="ml-archive" aria-labelledby="ml-archive-title">
      <div className="ml-section-title"><h2 id="ml-archive-title">내 서랍에서 다시 발견</h2><Quote size={19} aria-hidden /></div>
      {loading ? <p className="ml-helper" role="status">저장한 문장을 불러오고 있어요.</p> : sentences.length ? <div className="ml-quote-summary">{sentences.slice(0, 1).map((sentence) => <article key={sentence.id}><blockquote>{sentence.text}</blockquote><p className="ml-helper">{sentence.article_title}</p><div className="ml-sentence-actions"><Link href={sentenceSourceHref(sentence, articles, letters)} className="ml-text-link" prefetch={false}>원문 보기</Link></div></article>)}</div> : failed ? <><p className="ml-helper">저장한 문장을 불러오지 못했어요.</p><button className="ml-text-link" onClick={retry}>다시 불러오기</button></> : <p className="ml-helper">{owner ? '마음에 남는 문장을 저장하면 여기서 다시 만날 수 있어요.' : '로그인하면 내 서랍에 담아둔 문장을 여기서 다시 볼 수 있어요.'}</p>}
      <Link href="/my-lens?tab=archive" className="ml-archive-link">내 서랍 전체 보기 <ArrowUpRight size={16} /></Link>
    </section>
  );
}
