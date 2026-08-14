'use client';

import { useEffect, useMemo, useState } from 'react';
import { useLang } from '@saju/shared/lib/LangContext';
import { Spinner } from '@saju/shared/ui/Spinner';
import { PageShell } from '@saju/shared/ui/PageShell';
import { PageHeader } from '@saju/shared/ui/PageHeader';
import { BottomNav } from '@saju/shared/ui/BottomNav';
import { withBasePath } from '@saju/shared/lib/basePath';

interface IndexEntry {
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  tags: string[];
  published_at: string;
  author: string;
  cover: string | null;
}

interface IndexFile {
  version: number;
  updated_at: string;
  posts: IndexEntry[];
}

interface PostFile {
  slug: string;
  title: string;
  published_at: string;
  author: string;
  category: string;
  tags: string[];
  cover: string | null;
  body_md?: string;
  body_html?: string;
}

const MAIN_TABS = [
  { id: 'question', name: '오늘의 질문' },
  { id: 'feed', name: '뉴스피드' },
  { id: 'community', name: '커뮤니티' },
  { id: 'archive', name: '내 서랍' },
  { id: 'dna', name: '나의 DNA' },
  { id: 'fortune', name: '오늘의 운세' },
];

function goToMain(tab?: string) {
  window.location.href = tab ? `/?tab=${tab}` : '/';
}

function TopNav({ activeId }: { activeId?: string }) {
  return (
    <header className="sticky top-0 bg-white z-[100] border-b border-gray-100">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6">
        <div className="flex items-center h-[56px] gap-6 sm:gap-10">
          <button
            type="button"
            onClick={() => goToMain()}
            className="text-[20px] font-bold text-gray-900 tracking-tight flex-shrink-0 border-none bg-transparent cursor-pointer"
          >
            AI LENS
          </button>
          <nav className="flex items-center gap-0.5 flex-1 overflow-x-auto scrollbar-hide">
            {MAIN_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => goToMain(tab.id)}
                className={`px-2.5 lg:px-4 py-2 text-[12px] lg:text-[14px] font-medium rounded-lg transition-colors duration-200 whitespace-nowrap flex-shrink-0 ${
                  activeId === tab.id
                    ? 'bg-gray-100 text-gray-900'
                    : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                {tab.name}
              </button>
            ))}
          </nav>
        </div>
      </div>
    </header>
  );
}

const CATEGORY_LABEL: Record<string, { ko: string; en: string }> = {
  'zodiac-daily': { ko: '데일리 별자리', en: 'Daily Zodiac' },
  'zodiac-weekly': { ko: '주간 별자리', en: 'Weekly Zodiac' },
  'saju-weekly': { ko: '주간 사주', en: 'Weekly Saju' },
  'myeongri-note': { ko: '명리 노트', en: 'Myeongri Note' },
  'notice': { ko: '공지', en: 'Notice' },
};

function formatDate(iso: string, lang: 'ko' | 'en'): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return lang === 'en'
    ? d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

function categoryLabel(cat: string, lang: 'ko' | 'en'): string {
  const e = CATEGORY_LABEL[cat];
  if (!e) return cat;
  return lang === 'en' ? e.en : e.ko;
}

/** Minimal markdown → HTML. 외부 디펜던시 없이 소제목·굵게·이탤릭·리스트·구분선·단락만 처리. */
function renderMarkdown(md: string): string {
  const escape = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const lines = md.split('\n');
  const blocks: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed === '') {
      i += 1;
      continue;
    }

    if (trimmed === '---') {
      blocks.push('<hr class="my-6 border-gray-200 dark:border-gray-700" />');
      i += 1;
      continue;
    }

    const h2 = /^##\s+(.+)$/.exec(trimmed);
    if (h2) {
      blocks.push(
        `<h2 class="mt-6 mb-3 text-[18px] font-extrabold text-gray-900 dark:text-gray-100 tracking-tight">${escape(h2[1])}</h2>`,
      );
      i += 1;
      continue;
    }
    const h3 = /^###\s+(.+)$/.exec(trimmed);
    if (h3) {
      blocks.push(
        `<h3 class="mt-5 mb-2 text-[14px] font-bold text-gray-900 dark:text-gray-100">${escape(h3[1])}</h3>`,
      );
      i += 1;
      continue;
    }

    // 리스트
    if (/^[-*]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        const raw = lines[i].trim().replace(/^[-*]\s+/, '');
        items.push(`<li class="leading-relaxed">${inline(raw)}</li>`);
        i += 1;
      }
      blocks.push(
        `<ul class="list-disc list-inside text-[14px] text-gray-700 dark:text-gray-200 space-y-1 my-3">${items.join('')}</ul>`,
      );
      continue;
    }

    // 일반 단락
    const paraLines: string[] = [line];
    i += 1;
    while (i < lines.length && lines[i].trim() !== '' && !/^(---|#|[-*]\s)/.test(lines[i].trim())) {
      paraLines.push(lines[i]);
      i += 1;
    }
    const para = paraLines.join(' ').trim();
    blocks.push(
      `<p class="my-3 text-[14px] leading-[1.75] text-gray-700 dark:text-gray-200">${inline(para)}</p>`,
    );
  }

  function inline(s: string): string {
    return escape(s)
      .replace(/\*\*([^*]+)\*\*/g, '<strong class="font-bold text-gray-900 dark:text-gray-100">$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em class="italic">$1</em>');
  }

  return blocks.join('\n');
}

export default function BlogPage() {
  const { t, lang } = useLang();
  const [isSajuHost, setIsSajuHost] = useState(false);
  const [indexFile, setIndexFile] = useState<IndexFile | null>(null);
  const [indexLoading, setIndexLoading] = useState(true);
  const [indexError, setIndexError] = useState(false);

  const [slug, setSlug] = useState<string | null>(null);
  const [post, setPost] = useState<PostFile | null>(null);
  const [postLoading, setPostLoading] = useState(false);
  const [postError, setPostError] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setIsSajuHost(window.location.hostname === 'saju.sedaily.ai');
      const url = new URL(window.location.href);
      const s = url.searchParams.get('slug');
      if (s) setSlug(s);
      const onPop = () => {
        const next = new URL(window.location.href).searchParams.get('slug');
        setSlug(next);
      };
      window.addEventListener('popstate', onPop);
      return () => window.removeEventListener('popstate', onPop);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    setIndexLoading(true);
    setIndexError(false);
    fetch(withBasePath(`/blog-content/index.json?v=${Date.now()}`))
      .then((r) => {
        if (!r.ok) throw new Error('index fetch failed');
        return r.json();
      })
      .then((data: IndexFile) => {
        if (cancelled) return;
        setIndexFile(data);
      })
      .catch(() => {
        if (!cancelled) setIndexError(true);
      })
      .finally(() => {
        if (!cancelled) setIndexLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!slug) {
      setPost(null);
      return;
    }
    let cancelled = false;
    setPostLoading(true);
    setPostError(false);
    setPost(null);
    fetch(withBasePath(`/blog-content/posts/${encodeURIComponent(slug)}.json?v=${Date.now()}`))
      .then((r) => {
        if (!r.ok) throw new Error('post fetch failed');
        return r.json();
      })
      .then((data: PostFile) => {
        if (cancelled) return;
        setPost(data);
      })
      .catch(() => {
        if (!cancelled) setPostError(true);
      })
      .finally(() => {
        if (!cancelled) setPostLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const sortedPosts = useMemo(() => {
    if (!indexFile) return [];
    return [...indexFile.posts].sort(
      (a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime(),
    );
  }, [indexFile]);

  const openPost = (s: string) => {
    setSlug(s);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('slug', s);
      window.history.pushState({}, '', url.toString());
      window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    }
  };

  const closePost = () => {
    setSlug(null);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.delete('slug');
      window.history.pushState({}, '', url.toString());
      window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    }
  };

  const bodyHtml = useMemo(() => {
    if (!post) return '';
    if (post.body_html && post.body_html.trim().length > 0) return post.body_html;
    return post.body_md ? renderMarkdown(post.body_md) : '';
  }, [post]);

  return (
    <PageShell hanjaRight="道" hanjaLeft="筆">
      <PageHeader
        title={t('블로그', 'Blog')}
        titleAccent={t('그', 'og')}
        sub={t('매일 아침 AI가 쓰는 별자리·사주 콘텐츠',
              'Daily zodiac & Saju notes written by AI')}
      />

      <div className="relative z-10 px-3 pt-2">
        {slug ? (
          <article className="bg-white dark:bg-gray-900 shadow-[0_1px_4px_rgba(0,0,0,0.06)] border border-gray-100 dark:border-gray-800 rounded-xl p-4 sm:p-5">
            <button
              type="button"
              onClick={closePost}
              className="mb-3 inline-flex items-center gap-1 text-[12px] font-semibold text-blue-600 hover:text-blue-700 bg-transparent border-none cursor-pointer p-0"
            >
              ← {t('목록으로', 'Back to list')}
            </button>

            {postLoading && (
              <div className="flex items-center justify-center py-10">
                <Spinner size="md" label={t('글을 불러오는 중…', 'Loading post…')} />
              </div>
            )}

            {postError && (
              <p className="py-6 text-center text-[13px] text-gray-500 dark:text-gray-300">
                {t('글을 불러오지 못했어요.', 'Failed to load post.')}
              </p>
            )}

            {post && !postLoading && !postError && (
              <>
                <div className="flex items-center gap-2 mb-2 text-[11px] text-gray-400 dark:text-gray-400">
                  <span className="font-semibold text-gray-500 dark:text-gray-300">
                    {categoryLabel(post.category, lang as 'ko' | 'en')}
                  </span>
                  <span>·</span>
                  <span>{formatDate(post.published_at, lang as 'ko' | 'en')}</span>
                  <span>·</span>
                  <span>{post.author}</span>
                </div>
                <h1 className="text-[22px] font-extrabold text-gray-900 dark:text-gray-100 tracking-tight mb-4 leading-[1.3]">
                  {post.title}
                </h1>
                {post.cover && (
                  <img
                    src={post.cover}
                    alt=""
                    className="w-full rounded-lg mb-4 border border-gray-100 dark:border-gray-800"
                  />
                )}
                <div
                  className="blog-body"
                  dangerouslySetInnerHTML={{ __html: bodyHtml }}
                />
                {post.tags && post.tags.length > 0 && (
                  <div className="mt-6 pt-4 border-t border-gray-100 dark:border-gray-800 flex flex-wrap gap-1.5">
                    {post.tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-block px-2 py-0.5 text-[11px] font-medium text-gray-500 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-full"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}
              </>
            )}
          </article>
        ) : (
          <>
            {indexLoading && (
              <div className="flex items-center justify-center py-10">
                <Spinner size="md" label={t('글 목록을 불러오는 중…', 'Loading posts…')} />
              </div>
            )}
            {indexError && (
              <p className="py-6 text-center text-[13px] text-gray-500 dark:text-gray-300">
                {t('목록을 불러오지 못했어요.', 'Failed to load posts.')}
              </p>
            )}
            {!indexLoading && !indexError && sortedPosts.length === 0 && (
              <p className="py-6 text-center text-[13px] text-gray-500 dark:text-gray-300">
                {t('아직 등록된 글이 없어요.', 'No posts yet.')}
              </p>
            )}
            {!indexLoading && !indexError && sortedPosts.length > 0 && (
              <ul className="space-y-3">
                {sortedPosts.map((p) => (
                  <li key={p.slug}>
                    <button
                      type="button"
                      onClick={() => openPost(p.slug)}
                      className="w-full text-left bg-white dark:bg-gray-900 shadow-[0_1px_4px_rgba(0,0,0,0.06)] border border-gray-100 dark:border-gray-800 rounded-xl p-4 hover:border-gray-300 dark:hover:border-gray-700 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-2 mb-1 text-[10.5px] text-gray-400 dark:text-gray-400">
                        <span className="font-semibold text-gray-500 dark:text-gray-300">
                          {categoryLabel(p.category, lang as 'ko' | 'en')}
                        </span>
                        <span>·</span>
                        <span>{formatDate(p.published_at, lang as 'ko' | 'en')}</span>
                      </div>
                      <div className="text-[15px] font-extrabold text-gray-900 dark:text-gray-100 leading-snug mb-1.5">
                        {p.title}
                      </div>
                      <p className="text-[12.5px] text-gray-500 dark:text-gray-300 leading-relaxed line-clamp-2">
                        {p.excerpt}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      <BottomNav active="blog" />
    </PageShell>
  );
}
