import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { LetterBookmarkIcon } from '@/features/letter';
import type { ArticleBookmark } from '@/entities/user';
import { normalizeCategory } from '../lib/news/newsModel';

/**
 * 내 서랍 '저장한 기사'. 추천 뉴스와 제목·요약 레이아웃을 공유한다.
 * 공개가 끝난 기사는 제목 대신 안내를 보여 주고, 저장 해제만 할 수 있다.
 */
export function DashboardArticle({ item, pending, onRemove }: { item: ArticleBookmark; pending: boolean; onRemove: () => void }) {
  const content = item.content;
  const available = content.available && !!content.title && !!content.href;
  const category = (content.categories ?? []).map((key) => normalizeCategory(key)?.label ?? key).find(Boolean);
  const hasSavedAt = Number.isFinite(Date.parse(item.saved_at));
  const savedAt = hasSavedAt ? `${new Date(item.saved_at).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })} 저장` : '저장한 기사';
  const name = available ? content.title! : '더 이상 볼 수 없는 기사';
  return (
    <article className="ml-news-item ml-saved-news-item" data-testid={`article-${item.article_id}`}>
      <div className="ml-saved-news-top">
        <div className="ml-news-meta">
          <span>{available ? category ?? '뉴스' : '공개 종료'}</span>
          <time dateTime={hasSavedAt ? item.saved_at : undefined}>{savedAt}</time>
        </div>
        <button type="button" className="ml-bookmark" onClick={onRemove} disabled={pending} aria-busy={pending} aria-label={`${name} 저장 해제`} aria-pressed>
          <LetterBookmarkIcon saved />
        </button>
      </div>
      {available ? (
        <Link href={content.href!} prefetch={false}>
          <h3>{content.title}</h3><ArrowUpRight size={17} aria-hidden />
        </Link>
      ) : (
        <div>
          <h3>{name}</h3>
        </div>
      )}
      {available ? content.summary && <p className="ml-news-context">{content.summary}</p> : <p className="ml-news-context">비공개로 바뀌었거나 삭제된 기사예요. 저장을 해제할 수 있어요.</p>}
    </article>
  );
}
