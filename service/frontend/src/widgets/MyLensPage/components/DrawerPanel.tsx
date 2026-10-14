'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Copy, Quote, Search, Trash2 } from 'lucide-react';
import { type IssueLetter } from '@/features/letter';
import { DashboardLetter } from './DashboardLetter';
import { sentenceSourceHref } from '../lib/drawerModel';
import { normalizeCategory, type NewsArticle } from '../lib/news/newsModel';
import { useSentenceRecommendations } from '../lib/useSentenceRecommendations';
import type { useDashboardArchive } from '../lib/news/useDashboardArchive';

type Props = {
  storageNotice: string;
  archive: ReturnType<typeof useDashboardArchive>;
  articles: NewsArticle[];
  selectedId: string | null;
  initialFilter: 'sentences' | 'letters';
  letters: IssueLetter[];
  savedSlugs: string[];
  lettersLoading: boolean;
  lettersFailed: boolean;
  missingLetters: number;
  retryLetters: () => void;
  isRead: (slug: string) => boolean;
  letterFilter: 'all'|'unread';
  onLetterFilterChange: (filter:'all'|'unread')=>void;
  filteredSavedSlugs:string[];
  onSave: (slug: string) => void;
};

export function DrawerPanel({ storageNotice, archive, articles, selectedId, initialFilter, letters, savedSlugs, lettersLoading, lettersFailed, missingLetters, retryLetters, isRead, onSave, letterFilter, onLetterFilterChange, filteredSavedSlugs }: Props) {
  const [filter, setFilter] = useState<'sentences' | 'letters'>(initialFilter);
  const [query, setQuery] = useState('');
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const needle = query.trim().toLocaleLowerCase();
  const sentences = archive.sentences.filter((item) => `${item.text} ${item.article_title}`.toLocaleLowerCase().includes(needle));
  const savedLetters = filteredSavedSlugs.flatMap((slug) => {
    const letter = letters.find((item) => item.slug === slug);
    return letter && `${letter.title} ${letter.deck}`.toLocaleLowerCase().includes(needle) ? [letter] : [];
  });
  const selected = archive.sentences.find((item) => item.id === selectedId);
  const serverRelated = useSentenceRecommendations(selectedId, !!selected);
  const related = serverRelated.items;
  const newsLoading = serverRelated.loading, newsAvailable = serverRelated.available, retryNews = serverRelated.retry;
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
    <div className="ml-section-title"><div><h2 id="ml-drawer-title">내 서랍</h2><p className="ml-helper">담아둔 문장과 레터에서, 다음 이야기를 발견해 보세요.</p></div><Quote size={21} aria-hidden /></div>
    <div className="ml-drawer-toolbar">
      <div className="ml-news-filters" role="group" aria-label="내 서랍 종류"><button type="button" aria-pressed={filter === 'sentences'} onClick={() => setFilter('sentences')}>담은 문장 {archive.owner && !archive.loading && !archive.failed && <span>{archive.sentences.length}</span>}</button><button type="button" aria-pressed={filter === 'letters'} onClick={() => setFilter('letters')}>저장한 레터 <span>{savedSlugs.length}</span></button></div>
      <label className="ml-drawer-search"><Search size={15} aria-hidden /><input type="search" aria-label="내 서랍 검색" placeholder={filter === 'sentences' ? '문장·원문 제목 검색' : '저장한 레터 검색'} value={query} onChange={(event) => setQuery(event.target.value)} /></label>
    </div>
    {filter === 'sentences' ? <>
      {archive.loading ? <p className="ml-loading" role="status">담은 문장을 불러오고 있어요.</p> : !archive.owner ? <div className="ml-saved-empty"><Quote size={25} aria-hidden /><h3>마음에 남는 문장을 모아보세요</h3><p>로그인하면 뉴스에서 담아둔 문장과 관련 뉴스를 여기서 볼 수 있어요.</p><Link href="/login" className="ml-button">로그인하고 내 서랍 보기</Link></div> : archive.failed ? <div className="ml-saved-empty"><h3>담은 문장을 불러오지 못했어요</h3><p>저장한 문장은 지워지지 않았어요.</p><button type="button" className="ml-button ml-button-quiet" onClick={archive.retry}>문장 다시 불러오기</button></div> : sentences.length ? <div className="ml-drawer-sentences">{sentences.map((sentence) => <article key={sentence.id} className="ml-sentence-card" data-selected={selectedId === sentence.id}>
        <p className="ml-sentence-date">{sentence.created_at && Number.isFinite(Date.parse(sentence.created_at)) ? `${new Date(sentence.created_at).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })} 담음` : '담은 문장'}</p>
        <blockquote>{sentence.text}</blockquote><Link href={sentenceSourceHref(sentence, articles, letters)} prefetch={false} className="ml-sentence-source">{sentence.article_title} <ArrowUpRight size={13} aria-hidden /></Link>
        <div className="ml-sentence-actions"><Link href={`/my-lens?tab=archive&sentence=${encodeURIComponent(sentence.id)}#ml-sentence-related`} className="ml-text-link">관련 글 보기 <ArrowUpRight size={14} /></Link><div><button type="button" className="ml-text-link" aria-label="문장 복사" onClick={() => void copy(sentence.text, sentence.article_title)}><Copy size={14} />복사</button><button type="button" className="ml-sentence-delete" aria-label="문장 삭제" disabled={!!deletingId} onClick={() => setConfirmId(sentence.id)}><Trash2 size={14} />삭제</button></div></div>
        {confirmId === sentence.id && <div className="ml-delete-confirm" role="group" aria-label="문장 삭제 확인"><p>이 문장을 내 서랍에서 삭제할까요?</p><button type="button" disabled={!!deletingId} onClick={() => setConfirmId(null)}>취소</button><button type="button" disabled={!!deletingId} onClick={() => void remove(sentence.id)}>{deletingId === sentence.id ? '삭제 중…' : '삭제하기'}</button></div>}
      </article>)}</div> : <div className="ml-saved-empty"><h3>{needle ? '검색한 문장을 찾지 못했어요' : '아직 담아둔 문장이 없어요'}</h3><p>{needle ? '다른 단어나 원문 제목으로 찾아보세요.' : '뉴스 본문에서 문장을 선택한 뒤 ‘서랍에 담기’를 눌러보세요.'}</p>{needle ? <button className="ml-text-link" onClick={() => setQuery('')}>검색 초기화</button> : <Link href="/lens" className="ml-text-link">뉴스 둘러보기 <ArrowUpRight size={14} /></Link>}</div>}
      {!!archive.owner && !archive.loading && !archive.failed && <p className="ml-storage-note">현재 계정의 최근 저장 문장 최대 200개를 보여드려요. 이전 서랍의 저장·삭제 기록과 연결돼요.</p>}
    </> : <>
      <div className="ml-saved-toolbar" role="group" aria-label="저장한 레터 읽음 필터"><button aria-pressed={letterFilter==='all'} onClick={()=>onLetterFilterChange('all')}>전체</button><button aria-pressed={letterFilter==='unread'} onClick={()=>onLetterFilterChange('unread')}>아직 안 읽은 레터</button></div>
      <p className="ml-helper">로그인 계정의 서버 완료 기록을 기준으로 구분해요.</p>
      {lettersLoading ? <p className="ml-loading" role="status">저장한 레터를 불러오고 있어요.</p> : lettersFailed ? <div className="ml-saved-empty"><h3>저장한 레터를 불러오지 못했어요</h3><p>연결을 확인하고 다시 불러와 주세요. 저장 기록은 유지돼요.</p><button type="button" className="ml-text-link" onClick={retryLetters}>저장 레터 다시 불러오기</button></div> : savedLetters.length ? <div className="ml-saved-list">{savedLetters.map((letter) => <DashboardLetter key={letter.slug} letter={letter} saved read={isRead(letter.slug)} onSave={() => onSave(letter.slug)} />)}</div> : <div className="ml-saved-empty"><h3>{needle ? '검색한 레터를 찾지 못했어요' : savedSlugs.length ? letterFilter==='unread' ? '아직 안 읽은 레터가 없어요' : '저장 레터의 내용을 불러오지 못했어요' : '마음에 드는 레터를 담아보세요'}</h3><p>{needle ? '다른 제목으로 찾아보세요.' : '레터 북마크를 누르면 이곳에서도 이어볼 수 있어요.'}</p><Link href="/letter" className="ml-text-link">레터 둘러보기 <ArrowUpRight size={14} /></Link></div>}
      {missingLetters > 0 && <div className="ml-missing"><p>이전 레터 {missingLetters}편의 정보를 불러오지 못했어요. 저장 기록은 유지돼요.</p><button type="button" className="ml-text-link" onClick={retryLetters}>레터 다시 불러오기</button></div>}
      <p id="ml-storage-note" className="ml-storage-note">{storageNotice}</p>
    </>}
    <p role="status" aria-live="polite" className="ml-drawer-message">{message}</p>
    {selectedId && <section id="ml-sentence-related" className="ml-sentence-related" aria-labelledby="ml-sentence-related-title"><div className="ml-section-title"><div><h2 id="ml-sentence-related-title">이 문장에서 이어지는 뉴스</h2><p className="ml-helper">선택한 문장에 담긴 단어로 새 이야기를 찾아요.</p></div></div>
      {archive.loading || newsLoading ? <p className="ml-loading" role="status">문장과 관련 뉴스를 살펴보고 있어요.</p> : !archive.owner ? <p className="ml-helper">로그인 후 내 서랍의 문장을 확인할 수 있어요.</p> : archive.failed ? <><p className="ml-helper">문장을 불러오지 못했어요.</p><button className="ml-text-link" onClick={archive.retry}>문장 다시 불러오기</button></> : !selected ? <p className="ml-helper">선택한 문장을 찾지 못했어요. 삭제했거나 현재 불러온 문장에 포함되지 않을 수 있어요.</p> : <>
        <blockquote className="ml-related-quote">{selected.text}</blockquote>
        {!newsAvailable ? <><p className="ml-helper">관련 뉴스를 불러오지 못했어요.</p><button className="ml-text-link" onClick={retryNews}>뉴스 다시 불러오기</button></> : related.length ? <div className="ml-news-list">{related.map((article) => <article key={article.id} className="ml-news-item"><div className="ml-news-meta"><span>{normalizeCategory(article.category)?.label ?? (article.category || '뉴스')}</span><time dateTime={article.date}>{article.date.replaceAll('-', '.')}</time></div><Link href={article.href}><h3>{article.title}</h3><ArrowUpRight size={17} aria-hidden /></Link>{article.context && <p className="ml-news-context">{article.context}</p>}<div className="ml-news-reasons">{article.reasons.filter((reason) => reason.type === 'sentence').map((reason) => <span key={reason.type}>{reason.text}</span>)}</div></article>)}</div> : <p className="ml-helper">현재 공개된 뉴스에서 이 문장의 단어와 맞는 새 글을 찾지 못했어요.</p>}
        <p className="ml-storage-note">현재는 단어 일치 기준이에요. 이미 열람했거나 문장을 담은 원문은 제외해요. 의미가 비슷한 글을 찾는 분석은 준비 중이에요.</p>
        <div className="ml-drawer-alert"><div><strong>다음 이야기를 소식으로 받아보려면</strong><p>저장 문장 활용과 새 글 알림을 알림 설정에서 별도로 선택해 주세요.</p></div><Link href="/my-lens?tab=settings#ml-notifications" className="ml-text-link">알림 설정 <ArrowUpRight size={14} /></Link><span className="ml-pending-label">운영 푸시 발송 준비 중</span></div>
      </>}
    </section>}
  </section>;
}
