'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Copy, Quote, Search, Trash2 } from 'lucide-react';
import { type IssueLetter } from '@/features/letter';
import { DashboardLetter } from './DashboardLetter';
import { sentenceSourceHref } from '../lib/drawerModel';
import type { NewsArticle } from '../lib/news/newsModel';
import type { useDashboardArchive } from '../lib/news/useDashboardArchive';

type Props = {
  archive: ReturnType<typeof useDashboardArchive>;
  articles: NewsArticle[];
  initialFilter: 'sentences' | 'letters';
  letters: IssueLetter[];
  savedSlugs: string[];
  lettersLoading: boolean;
  lettersFailed: boolean;
  retryLetters: () => void;
  onSave: (slug: string) => void;
};

export function DrawerPanel({ archive, articles, initialFilter, letters, savedSlugs, lettersLoading, lettersFailed, retryLetters, onSave }: Props) {
  const [filter, setFilter] = useState<'sentences' | 'letters'>(initialFilter);
  const [query, setQuery] = useState('');
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const needle = query.trim().toLocaleLowerCase();
  const sentences = archive.sentences.filter((item) => `${item.text} ${item.article_title}`.toLocaleLowerCase().includes(needle));
  const savedLetters = savedSlugs.flatMap((slug) => {
    const letter = letters.find((item) => item.slug === slug);
    return letter && `${letter.title} ${letter.deck}`.toLocaleLowerCase().includes(needle) ? [letter] : [];
  });
  const remove = async (id: string) => {
    setDeletingId(id);
    const ok = await archive.remove(id);
    setDeletingId(null);
    if (ok) setConfirmId(null);
    setMessage(ok ? '문장을 서랍에서 삭제했어요.' : '문장을 삭제하지 못했어요. 다시 시도해 주세요.');
  };
  const copy = async (text: string, title: string) => {
    try { await navigator.clipboard.writeText(`“${text}”\n— ${title}`); setMessage('문장을 복사했어요.'); }
    catch { setMessage('문장을 복사하지 못했어요. 문장을 직접 선택해 복사해 주세요.'); }
  };

  return <section className="ml-drawer" aria-labelledby="ml-drawer-title">
    <div className="ml-section-title"><div><h2 id="ml-drawer-title">내 서랍</h2><p className="ml-helper">담아둔 문장과 레터를 한곳에서 다시 볼 수 있어요.</p></div><Quote size={21} aria-hidden /></div>
    <div className="ml-drawer-toolbar">
      <div className="ml-news-filters" role="group" aria-label="내 서랍 종류"><button type="button" aria-pressed={filter === 'sentences'} onClick={() => setFilter('sentences')}>담은 문장 {archive.owner && !archive.loading && !archive.failed && <span>{archive.sentences.length}</span>}</button><button type="button" aria-pressed={filter === 'letters'} onClick={() => setFilter('letters')}>저장한 레터 <span>{savedSlugs.length}</span></button></div>
      <label className="ml-drawer-search"><Search size={15} aria-hidden /><input type="search" aria-label="내 서랍 검색" placeholder={filter === 'sentences' ? '문장·원문 제목 검색' : '저장한 레터 검색'} value={query} onChange={(event) => setQuery(event.target.value)} /></label>
    </div>
    {filter === 'sentences' ? <>
      {archive.loading ? <p className="ml-loading" role="status">담은 문장을 불러오고 있어요.</p> : !archive.owner ? <div className="ml-saved-empty"><Quote size={25} aria-hidden /><h3>마음에 남는 문장을 모아보세요</h3><p>로그인하면 뉴스에서 담아둔 문장을 여기서 다시 볼 수 있어요.</p><Link href="/login" className="ml-button">로그인하고 내 서랍 보기</Link></div> : archive.failed ? <div className="ml-saved-empty"><h3>담은 문장을 불러오지 못했어요</h3><p>저장한 문장은 지워지지 않았어요.</p><button type="button" className="ml-button ml-button-quiet" onClick={archive.retry}>문장 다시 불러오기</button></div> : sentences.length ? <div className="ml-drawer-sentences">{sentences.map((sentence) => <article key={sentence.id} className="ml-sentence-card">
        <p className="ml-sentence-date">{sentence.created_at && Number.isFinite(Date.parse(sentence.created_at)) ? `${new Date(sentence.created_at).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })} 담음` : '담은 문장'}</p>
        <blockquote>{sentence.text}</blockquote><Link href={sentenceSourceHref(sentence, articles, letters)} prefetch={false} className="ml-sentence-source">{sentence.article_title} <ArrowUpRight size={13} aria-hidden /></Link>
        <div className="ml-sentence-actions"><div><button type="button" className="ml-text-link" aria-label="문장 복사" onClick={() => void copy(sentence.text, sentence.article_title)}><Copy size={14} />복사</button><button type="button" className="ml-sentence-delete" aria-label="문장 삭제" disabled={!!deletingId} onClick={() => setConfirmId(sentence.id)}><Trash2 size={14} />삭제</button></div></div>
        {confirmId === sentence.id && <div className="ml-delete-confirm" role="group" aria-label="문장 삭제 확인"><p>이 문장을 내 서랍에서 삭제할까요?</p><button type="button" disabled={!!deletingId} onClick={() => setConfirmId(null)}>취소</button><button type="button" disabled={!!deletingId} onClick={() => void remove(sentence.id)}>{deletingId === sentence.id ? '삭제 중…' : '삭제하기'}</button></div>}
      </article>)}</div> : <div className="ml-saved-empty"><h3>{needle ? '검색한 문장을 찾지 못했어요' : '아직 담아둔 문장이 없어요'}</h3><p>{needle ? '다른 단어나 원문 제목으로 찾아보세요.' : '뉴스 본문에서 문장을 선택한 뒤 ‘서랍에 담기’를 눌러보세요.'}</p>{needle ? <button className="ml-text-link" onClick={() => setQuery('')}>검색 초기화</button> : <Link href="/lens" className="ml-text-link">뉴스 둘러보기 <ArrowUpRight size={14} /></Link>}</div>}
      {!!archive.owner && !archive.loading && !archive.failed && archive.hasMore && <button type="button" className="ml-more" onClick={() => void archive.loadMore()} disabled={archive.loadingMore} aria-busy={archive.loadingMore}>{archive.loadingMore ? '이전 문장을 불러오고 있어요' : '이전 문장 더 보기'}</button>}
      {archive.moreFailed && <p role="alert" className="ml-helper">이전 문장을 불러오지 못했어요. 저장한 문장은 그대로 있어요. 버튼을 다시 눌러 주세요.</p>}
      {!!archive.owner && !archive.loading && !archive.failed && <p className="ml-storage-note">{archive.hasMore ? '최근 저장 문장부터 보여드려요. 더 오래된 문장은 ‘이전 문장 더 보기’로 이어서 볼 수 있고, 검색은 불러온 문장 안에서 찾아요.' : '저장한 문장을 모두 보여드려요.'} 이전 서랍의 저장·삭제 기록과 연결돼요.</p>}
    </> : <>
      {lettersLoading ? <p className="ml-loading" role="status">저장한 레터를 불러오고 있어요.</p> : lettersFailed ? <div className="ml-saved-empty"><h3>저장한 레터를 불러오지 못했어요</h3><p>연결을 확인하고 다시 불러와 주세요. 저장 기록은 유지돼요.</p><button type="button" className="ml-text-link" onClick={retryLetters}>저장 레터 다시 불러오기</button></div> : savedLetters.length ? <div className="ml-saved-list">{savedLetters.map((letter) => <DashboardLetter key={letter.slug} letter={letter} saved onSave={() => onSave(letter.slug)} />)}</div> : <div className="ml-saved-empty"><h3>{needle ? '검색한 레터를 찾지 못했어요' : savedSlugs.length ? '저장 레터의 내용을 불러오지 못했어요' : '마음에 드는 레터를 담아보세요'}</h3><p>{needle ? '다른 제목으로 찾아보세요.' : '레터 북마크를 누르면 이곳에서도 이어볼 수 있어요.'}</p><Link href="/letter" className="ml-text-link">레터 둘러보기 <ArrowUpRight size={14} /></Link></div>}
    </>}
    <p role="status" aria-live="polite" className="ml-drawer-message">{message}</p>
  </section>;
}
