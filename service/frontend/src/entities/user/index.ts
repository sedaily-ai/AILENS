export { AuthProvider, useAuth } from './contexts/AuthContext';
export { useNewsReadingSignal } from './hooks/useReadingSignals';
export type { ReadingSignal } from './lib/readingSignals';

export { ACCOUNT_VIEW_CHANGED } from './data/activityApi';
export { useArticleBookmark, type ArticleSaveOutcome } from './hooks/useArticleBookmark';
export { ARTICLE_BOOKMARKS_CHANGED, ArticleBookmarkError, listArticleBookmarks, setArticleBookmark, type ArticleBookmark } from './data/articleBookmarksApi';

