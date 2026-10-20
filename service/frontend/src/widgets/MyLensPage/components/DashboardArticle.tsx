import Link from 'next/link';
import { LetterBookmarkIcon } from '@/features/letter';
import type { ArticleBookmark } from '@/entities/user';
import { normalizeCategory } from '../lib/news/newsModel';

/**
 * 내 서랍 '저장한 기사' 한 줄(2026-10-20). 저장한 레터(DashboardLetter)와 같은 모양·북마크 버튼을 쓴다.
 * 공개가 끝난 기사는 제목 대신 안내를 보여 주고, 저장 해제만 할 수 있다.
 */
export function DashboardArticle({ item, pending, onRemove }: { item: ArticleBookmark; pending: boolean; onRemove: () => void }) {
  const content = item.content;
  const available = content.available && !!content.title && !!content.href;
  const category = (content.categories ?? []).map((key) => normalizeCategory(key)?.label ?? key).find(Boolean);
  const savedAt = Number.isFinite(Date.parse(item.saved_at)) ? `${new Date(item.saved_at).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })} 저장` : '저장한 기사';
  const name = available ? content.title! : '더 이상 볼 수 없는 기사';
  return (
    <article className="ml-letter" data-testid={`article-${item.article_id}`}>
      <div className="ml-letter-top">
        <span>{available ? category ?? '뉴스' : '공개 종료'}</span>
        <button type="button" className="ml-bookmark" onClick={onRemove} disabled={pending} aria-busy={pending} aria-label={`${name} 저장 해제`} aria-pressed>
          <LetterBookmarkIcon saved />
        </button>
      </div>
      {available ? (
        <Link href={content.href!} className="ml-letter-link" prefetch={false}>
          <h3>{content.title}</h3>
          {content.summary && <p className="ml-deck">{content.summary}</p>}
        </Link>
      ) : (
        <div className="ml-letter-link">
          <h3>{name}</h3>
          <p className="ml-helper">비공개로 바뀌었거나 삭제된 기사예요. 저장을 해제할 수 있어요.</p>
        </div>
      )}
      <div className="ml-letter-foot"><span>{savedAt}</span></div>
    </article>
  );
}
