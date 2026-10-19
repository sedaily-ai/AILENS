'use client';

import Link from 'next/link';
import { ArrowUpRight, BookOpen, ChevronDown } from 'lucide-react';
import { normalizeCategory, type NewsRecommendation } from '../lib/news/newsModel';

export function PersonalNews({ recommendations, categories, loading, available, historyAvailable, unmatched, onRetry }: {
  recommendations: NewsRecommendation[]; categories: {slug:string;label:string;count:number}[];
  loading: boolean; available: boolean; historyAvailable: boolean; unmatched: number; onRetry: () => void;
}) {
  return <section id="ml-news" className="ml-personal-news" aria-labelledby="ml-news-title" aria-busy={loading}>
    <div className="ml-section-title ml-extension-heading"><div><h2 id="ml-news-title">최근 본 분야의 새로운 뉴스</h2><p className="ml-helper">열람한 분야의 새 글을 최신순으로 모았어요.</p></div></div>
    <div className="ml-news-categories" aria-label="최근 열람한 분야">
      <h3><BookOpen size={14} aria-hidden /> 최근 90일에 만난 분야</h3>
      {categories.length ? <div className="ml-evidence-chips">{categories.map(item => <Link key={item.slug} href={`/${item.slug}`}>{item.label}<span>{item.count}편</span></Link>)}</div> : <p className="ml-helper">열람한 분야가 없으면 최근 발행된 뉴스를 보여드려요.</p>}
    </div>
    {loading ? <p className="ml-loading" role="status">새 뉴스를 불러오고 있어요.</p> : !available ? <div className="ml-saved-empty"><h3>새 뉴스를 불러오지 못했어요</h3><button className="ml-button ml-button-quiet" onClick={onRetry}>뉴스 다시 불러오기</button></div> : recommendations.length ? <div className="ml-news-list">{recommendations.slice(0, 4).map(article => <article key={article.id} className="ml-news-item"><div className="ml-news-meta"><span>{normalizeCategory(article.category)?.label ?? (article.category || '뉴스')}</span><time dateTime={article.date}>{article.date.replaceAll('-', '.')}</time></div><Link href={article.href}><h3>{article.title}</h3><ArrowUpRight size={17} aria-hidden /></Link>{article.context && <p className="ml-news-context">{article.context}</p>}<div className="ml-news-reasons">{article.reasons.length ? article.reasons.map(reason => <span key={reason.type}>{reason.text}</span>) : <span>최근 발행된 뉴스예요.</span>}</div></article>)}</div> : <div className="ml-saved-empty"><h3>지금 볼 수 있는 새 뉴스가 없어요</h3><p>이미 열람한 글은 새 뉴스 목록에서 제외해요.</p><Link href="/lens" className="ml-text-link">전체 뉴스 둘러보기 <ArrowUpRight size={14} /></Link></div>}
    <div className="ml-news-scope">
      <details className="ml-format-method">
        <summary><span><strong>추천 기준 보기</strong><small>최근 열람한 분야와 발행일을 확인해요.</small></span><ChevronDown size={18} aria-hidden /></summary>
        <div className="ml-rule-content"><dl className="ml-rule-list">
          <div><dt>최근 90일의 열람 분야</dt><dd>계정에서 열람한 뉴스·레터의 상위 5개 분야를 사용해요. 같은 글은 한 편으로 세요.</dd></div>
          <div><dt>새 글부터 차례로</dt><dd>해당 분야의 아직 열람하지 않은 뉴스를 최신순으로 보여드려요. 맞는 새 글이 없으면 전체 최신 뉴스로 이어져요.</dd></div>
        </dl></div>
      </details>
      {!loading && !historyAvailable && <p>계정 열람 분야를 불러오지 못했어요. <button className="ml-text-link" onClick={onRetry}>다시 불러오기</button></p>}{unmatched > 0 && <p>이전 자료 {unmatched}편은 등록 정보를 확인하지 못해 집계에서 제외했어요.</p>}
    </div>
  </section>;
}
