'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, BookOpen, Hash, Quote } from 'lucide-react';
import { normalizeCategory, type buildNewsProfile, type NewsFilter, type NewsRecommendation } from '../lib/news/newsModel';

export function PersonalNews({ recommendations, profile, loading, available, localAvailable, archiveCount, archiveLoading, archiveFailed, signedIn, historyAvailable, unmatched, onRetry, onArchiveRetry, serverFilter, onFilterChange }: {
  serverFilter?: NewsFilter; onFilterChange?: (filter: NewsFilter) => void;
  recommendations: NewsRecommendation[]; profile: ReturnType<typeof buildNewsProfile>; loading: boolean; available: boolean; localAvailable: boolean;
  archiveCount: number; archiveLoading: boolean; archiveFailed: boolean; signedIn: boolean; historyAvailable: boolean; unmatched: number; onRetry: () => void; onArchiveRetry: () => void;
}) {
  const [localFilter, setFilter] = useState<NewsFilter>('all');
  const filter = serverFilter ?? localFilter;
  const candidates = recommendations.filter((item) => filter === 'all' || item.reasons.some((reason) => reason.type === filter));
  const personalized = candidates.filter((item) => item.reasons.length);
  const visible = (personalized.length ? personalized : filter === 'all' ? candidates : []).slice(0, 4);
  return <section id="ml-news" className="ml-personal-news" aria-labelledby="ml-news-title" aria-busy={loading}>
    <div className="ml-section-title ml-extension-heading"><div><h2 id="ml-news-title">나의 관심에서 이어지는 뉴스</h2><p className="ml-helper">자주 본 분야, 글 속 키워드, 담아둔 문장을 함께 살펴요.</p></div><span className="ml-pending-label">계정 기록 기반 추천</span></div>
    <div className="ml-interest-overview" aria-label="뉴스 추천에 활용한 기록">
      <div><h3><BookOpen size={14} aria-hidden /> 열람한 뉴스·레터 분야</h3>{profile.categories.length ? <div className="ml-evidence-chips">{profile.categories.map((item) => <Link key={item.slug} href={`/${item.slug}`}>{item.label}<span>{item.count}편</span></Link>)}</div> : <p>뉴스를 살펴보면 자주 만난 분야가 여기에 쌓여요.</p>}</div>
      <div><h3><Hash size={14} aria-hidden /> 열람한 글의 키워드</h3>{profile.keywords.length ? <div className="ml-evidence-chips">{profile.keywords.slice(0, 6).map((item) => <span key={item.label}>#{item.label}<small>{item.count}편</small></span>)}</div> : <p>열람한 글에 등록된 키워드를 모아요. 키워드가 없는 글은 제외해요.</p>}</div>
      <div><h3><Quote size={14} aria-hidden /> 담아둔 문장의 단어</h3>{archiveLoading ? <p role="status">내 서랍을 확인하고 있어요.</p> : archiveFailed ? <p>문장을 불러오지 못했어요. <button className="ml-text-link" onClick={onArchiveRetry}>다시 불러오기</button></p> : profile.sentenceTerms.length ? <><div className="ml-evidence-chips">{profile.sentenceTerms.slice(0, 5).map((term) => <span key={term}>{term}</span>)}</div><p>계정 저장 문장 {archiveCount}개에서 찾은 단어</p></> : <p>{signedIn ? '내 서랍에 문장을 담으면 그 안의 단어로 새 글을 찾아요.' : '로그인하면 내 서랍의 문장도 추천에 활용해요.'}</p>}</div>
    </div>
    <div className="ml-news-filters" role="group" aria-label="뉴스 추천 근거 선택">{([{ value: 'all', label: '전체 추천' }, { value: 'category', label: '관심 분야' }, { value: 'keyword', label: '관심 키워드' }, { value: 'sentence', label: '저장 문장에서' }] as const).map((item) => <button type="button" key={item.value} aria-pressed={filter === item.value} onClick={() => onFilterChange ? onFilterChange(item.value) : setFilter(item.value)}>{item.label}</button>)}</div>
    {loading ? <p className="ml-loading" role="status">관심 기록과 새 뉴스를 살펴보고 있어요.</p> : !available ? <div className="ml-saved-empty"><h3>새 뉴스를 불러오지 못했어요</h3><p>저장한 관심 기록은 그대로 유지돼요.</p><button className="ml-button ml-button-quiet" onClick={onRetry}>뉴스 다시 불러오기</button></div> : visible.length ? <div className="ml-news-list">{visible.map((article) => <article key={article.id} className="ml-news-item"><div className="ml-news-meta"><span>{normalizeCategory(article.category)?.label ?? (article.category || '뉴스')}</span><time dateTime={article.date}>{article.date.replaceAll('-', '.')}</time></div><Link href={article.href}><h3>{article.title}</h3><ArrowUpRight size={17} aria-hidden /></Link>{article.context && <p className="ml-news-context">{article.context}</p>}<div className="ml-news-reasons">{article.preferredFormat && <span>{{letter:'읽기로 이어보기',webtoon:'웹툰으로 이어보기',podcast:'듣기로 이어보기',video:'영상으로 이어보기'}[article.preferredFormat]}</span>}{article.reasons.length ? article.reasons.map((reason) => <span key={reason.type}>{reason.text}</span>) : <span>최근 발행된 뉴스예요. 관심 기록이 쌓이면 추천에 반영해요.</span>}</div></article>)}</div> : <div className="ml-saved-empty"><h3>{filter === 'sentence' && !signedIn ? '내 서랍의 문장에서 관심을 이어보세요' : '현재 기록과 맞는 새 글을 찾지 못했어요'}</h3><p>{filter === 'sentence' && !signedIn ? '로그인 후 저장한 문장을 사용할 수 있어요.' : '서버에서 공개된 뉴스와 추천 근거를 확인해요. 관심 분야를 직접 고르거나 다른 추천을 확인해 보세요.'}</p><Link href={filter === 'sentence' ? '/my-lens?tab=archive' : '/lens'} className="ml-text-link">{filter === 'sentence' ? '내 서랍 열기' : '전체 뉴스 둘러보기'} <ArrowUpRight size={14} /></Link></div>}
    <div className="ml-news-scope"><p>현재 계정의 최근 90일 유효 열람과 직접 고른 관심·저장 문장을 사용해요. 같은 글은 한 편으로 세며, 서버에서 등록 분야와 키워드를 확인해요.</p><p>추천은 제목·요약·등록 키워드의 단어 일치에 근거해요. 의미 유사도 분석은 포함하지 않아요. 관심이 맞는 글에서는 최근 뉴스 이용 형식도 함께 반영해요. 새 글 알림은 <Link href="/my-lens?tab=settings#ml-notifications">알림 설정</Link>에서 별도로 선택해요.</p>{!localAvailable && <p>기록을 불러오지 못했어요.</p>}{signedIn && !historyAvailable && <p>계정 관심 집계를 불러오지 못했어요. <button className="ml-text-link" onClick={onRetry}>다시 불러오기</button></p>}{unmatched > 0 && <p>이전 자료 {unmatched}편은 등록 정보를 확인하지 못해 분석에서 제외했어요.</p>}</div>
  </section>;
}
