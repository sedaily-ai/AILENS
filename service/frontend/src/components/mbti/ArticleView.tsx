import { useState, useEffect, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { MbtiGroupId } from "@/shared/data/mbtiGroups";
import type { MbtiVersion } from "@/shared/types/mbti";
import { useAuth } from "@/features/auth";
import { recordArticleRead, recordArticleReadV2 } from "@/shared/lib/userApi";
import { trackArticleRead } from "@/shared/lib/readingTracker";
import { API_URL } from "@/shared/config/api";

interface Article {
  news_id: string;
  title: string;
  sub_title: string;
  published_at: string;
  category: string;
  provider: string;
  byline: string;
  image_url: string | null;
  content: string;
  original_link: string;
  versions?: Record<string, MbtiVersion>;
}

// v2 Article API의 version 객체를 shared MbtiVersion shape로 변환.
// v1의 tone 필드가 v2엔 없어서 빈 문자열로 채움. v1 frontend 컴포넌트는 tone을
// 표시 용도로만 쓰며, 빈 문자열이면 단순히 안 보임 (data-driven hide 패턴).
function adaptV2Version(v2Version: Record<string, unknown>): MbtiVersion {
  return {
    title: (v2Version.title as string) || '',
    subtitle: (v2Version.subtitle as string) || '',
    body: (v2Version.body as string) || '',
    key_points: Array.isArray(v2Version.key_points)
      ? (v2Version.key_points as string[])
      : [],
    closing_line: (v2Version.closing_line as string) || '',
    tone: '',
  };
}

interface Props {
  article: Article;
  currentGroup: MbtiGroupId;
  onClose: () => void;
  onChangeGroup: (group: MbtiGroupId) => void;
  onArchiveSentence?: (text: string, articleId: string, articleTitle: string) => void;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatByline(byline: string): string {
  if (!byline) return "";
  return byline
    .replace(/^by\s+/i, "")
    .replace(/\s*기자$/, " 기자");
}

function parseSentences(body: string | string[]): string[] {
  const text = Array.isArray(body) ? body.join(" ") : body;
  const sentences = text
    .replace(/\*\*/g, '')
    .split(/(?<=[.?!])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 10)
    .filter(s => !s.startsWith('[') || !s.endsWith(']'))
    .filter(s => !s.startsWith('■'))
    .filter(s => !s.startsWith('---'));
  return sentences;
}

// 본문 텍스트 결합 (Markdown 렌더용)
function getBodyText(body: string | string[]): string {
  return Array.isArray(body) ? body.join("\n\n") : body;
}

const MAX_W = "max-w-[800px]";

function ArticleHeader({ onClose, savedCount }: { onClose: () => void; savedCount: number }) {
  return (
    <header className="sticky top-0 bg-[#FAFAFA]/95 backdrop-blur-sm z-10 border-b border-gray-100">
      <div className={`${MAX_W} mx-auto px-6`}>
        <div className="flex items-center justify-between h-14">
          <button
            onClick={onClose}
            className="flex items-center gap-2 text-gray-500 hover:text-gray-900 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" />
            </svg>
            <span className="text-[14px]">목록</span>
          </button>
          {savedCount > 0 && (
            <span className="text-[13px] text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
              {savedCount}개 저장됨
            </span>
          )}
        </div>
      </div>
    </header>
  );
}

function ArticleMeta({ category, date, byline, provider }: { category: string; date: string; byline: string; provider: string }) {
  const formattedByline = formatByline(byline);
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-gray-400">
      <span>{category}</span>
      <span className="text-gray-200">|</span>
      <span>{formatDate(date)}</span>
      {(formattedByline || provider) && (
        <>
          <span className="text-gray-200">|</span>
          <span>{[formattedByline, provider].filter(Boolean).join(" · ")}</span>
        </>
      )}
    </div>
  );
}

function SentenceHint() {
  return (
    <div className="mb-8 py-3.5 px-5 bg-blue-50/60 border border-blue-100/60 rounded-xl">
      <p className="text-[13px] text-blue-400 flex items-center gap-2">
        <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
        </svg>
        문장을 클릭하면 선택됩니다. 여러 문장을 선택해서 저장하세요.
      </p>
    </div>
  );
}

function SentenceBody({ sentences, selectedSentences, onToggle }: {
  sentences: string[];
  selectedSentences: Set<number>;
  onToggle: (idx: number) => void;
}) {
  return (
    <div className="text-[16.5px] leading-[2] text-gray-800 break-keep">
      {sentences.map((sentence, idx) => {
        const isSelected = selectedSentences.has(idx);
        return (
          <span
            key={idx}
            onClick={() => onToggle(idx)}
            className={`cursor-pointer transition-colors duration-150 rounded-sm ${
              isSelected
                ? "bg-yellow-200/80 text-gray-900"
                : "hover:bg-yellow-50"
            }`}
          >
            {sentence}{" "}
          </span>
        );
      })}
    </div>
  );
}

function ArticleImage({ url }: { url: string | null }) {
  if (!url) return null;
  return (
    <div className="mb-8 -mx-6 md:mx-0 md:rounded-2xl overflow-hidden">
      <img loading="lazy" src={url} alt="" className="w-full" />
    </div>
  );
}

function ArticleFooter({ originalLink, byline, provider }: { originalLink: string; byline: string; provider: string }) {
  const formattedByline = formatByline(byline);
  return (
    <div className="mt-14 pt-8 border-t border-gray-200">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        {(formattedByline || provider) && (
          <p className="text-[13px] text-gray-400">
            {[provider, formattedByline].filter(Boolean).join(" · ")}
          </p>
        )}
        <a
          href={originalLink}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[13px] text-gray-400 hover:text-gray-600 transition-colors inline-flex items-center gap-1"
        >
          원문 기사 보기
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </a>
      </div>
    </div>
  );
}

function SaveButton({ count, onSave }: { count: number; onSave: () => void }) {
  if (count === 0) return null;
  return (
    <div className="fixed bottom-8 left-0 right-0 flex justify-center z-50 px-5">
      <button
        onClick={onSave}
        className="flex items-center gap-2.5 px-6 py-3.5 bg-blue-500 hover:bg-blue-600 text-white rounded-2xl shadow-xl shadow-blue-500/20 active:scale-95 transition-all"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
        <span className="text-[15px] font-medium">
          {count}개 문장 저장
        </span>
      </button>
    </div>
  );
}

function Toast({ message, visible, hasSelection }: { message: string; visible: boolean; hasSelection: boolean }) {
  if (!visible) return null;
  return (
    <div className={`fixed left-0 right-0 flex justify-center z-50 ${hasSelection ? "bottom-24" : "bottom-8"}`}>
      <div className="px-5 py-3 bg-gray-800 text-white rounded-full shadow-xl animate-fade-in">
        <span className="text-[14px]">{message}</span>
      </div>
    </div>
  );
}

export function ArticleView({ article: initialArticle, currentGroup, onClose, onArchiveSentence }: Props) {
  const { user, isAuthenticated } = useAuth();
  const [article, setArticle] = useState<Article>(initialArticle);
  const [isLoadingContent, setIsLoadingContent] = useState(false);

  const [selectedSentences, setSelectedSentences] = useState<Set<number>>(new Set());
  const [savedCount, setSavedCount] = useState(0);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState("");

  const version = article.versions?.[currentGroup];
  const bodyText = useMemo(
    () => (version ? getBodyText(version.body) : ""),
    [version]
  );
  const archiveItems = useMemo(
    () => version?.key_points ?? [],
    [version]
  );
  const sentences = useMemo(
    () => (version ? parseSentences(version.body) : []),
    [version]
  );

  // Original-sentence list shown in the no-version fallback render. Lifted
  // out of the `!version` branch so handleArchive can read from the correct
  // source no matter which branch the user is currently looking at.
  const originalSentences = useMemo(
    () =>
      article.content
        ? article.content
            .split(/(?<=[.?!])\s+/)
            .map(s => s.trim())
            .filter(s => s.length > 10)
        : [],
    [article.content]
  );

  // The two render branches click into different arrays via the same index,
  // so swapping between them (e.g. v2 versions arrive after the fallback was
  // shown) would leave indices pointing into the wrong source. Reset.
  useEffect(() => {
    setSelectedSentences(new Set());
  }, [version]);

  // 핵심 정리 선택 토글
  const toggleSentence = (index: number) => {
    setSelectedSentences(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  // 선택된 항목 가져오기 — `selectedSentences` indices map into whichever
  // source is currently rendered. Previously this always read from
  // `archiveItems`, so saves from the fallback branch produced empty text.
  const getSelectedText = () => {
    const source = version ? archiveItems : originalSentences;
    return Array.from(selectedSentences)
      .sort((a, b) => a - b)
      .map(idx => source[idx])
      .filter(Boolean)
      .join(" ");
  };

  // Round 4: 1 fetch with ?include_all_mbti=true.
  // v1은 한 호출에 4 versions를 받았고, TASK-7에서 v2 cutover 시 4-parallel로
  // 갔었음 (Article API가 mbti 단일 variant만 반환했었기 때문). Round 4에서
  // backend에 ?include_all_mbti=true 옵션을 추가해서 1 호출로 복귀.
  // 응답이 all_versions (4 entries)를 포함하면 그것 사용, 부재하거나 <4면
  // 4-parallel fallback (구 backend 호환 + partial transform 케이스).
  // FeedPage prefetchCache가 같은 어댑터 결과를 미리 채워뒀을 수 있지만
  // ArticleView는 prefetchCache를 직접 보지 않음 (FeedPage의 openArticle이
  // 이미 cached article을 setViewArticle해서 versions가 들어온 상태로 props
  // 받음). 즉 prefetch hit 케이스는 line 99 가드로 fetch 자체가 skip됨.
  useEffect(() => {
    if (!version && !isLoadingContent) {
      setIsLoadingContent(true);
      const groups = ['NT', 'NF', 'ST', 'SF'] as const;
      const primaryGroup = currentGroup;

      const fetchAllInOne = fetch(
        `${API_URL}/api/v2/article/${article.news_id}?mbti=${primaryGroup}&include_all_mbti=true`
      ).then((r) => (r.ok ? r.json() : null));

      fetchAllInOne
        .then((data) => {
          // Path A: backend returned all_versions with all 4 MBTI entries.
          if (
            data &&
            data.all_versions &&
            typeof data.all_versions === 'object' &&
            groups.every((g) => data.all_versions[g])
          ) {
            const nextVersions: Record<string, MbtiVersion> = {};
            groups.forEach((g) => {
              nextVersions[g] = adaptV2Version(
                data.all_versions[g] as Record<string, unknown>
              );
            });
            setArticle((prev) => ({ ...prev, versions: nextVersions }));
            return;
          }
          // Path B: fallback to 4-parallel (older backend, partial transform,
          // or include_all_mbti not honored).
          return Promise.all(
            groups.map((g) =>
              fetch(`${API_URL}/api/v2/article/${article.news_id}?mbti=${g}`).then(
                (r) => (r.ok ? r.json() : null)
              )
            )
          ).then((results) => {
            const nextVersions: Record<string, MbtiVersion> = {};
            let allOk = true;
            results.forEach((r, i) => {
              if (r && r.version) {
                nextVersions[groups[i]] = adaptV2Version(
                  r.version as Record<string, unknown>
                );
              } else {
                allOk = false;
              }
            });
            if (allOk) {
              setArticle((prev) => ({ ...prev, versions: nextVersions }));
            }
            // !allOk 케이스: setArticle 안 함 → version 그대로 undefined →
            // fallback render. 어댑터가 content를 body_preview로 이미
            // 채워뒀으니 200자라도 표시됨.
          });
        })
        .catch((err) => console.error('Failed to load v2 versions:', err))
        .finally(() => setIsLoadingContent(false));
    }
  }, [article.news_id, version, currentGroup]);

  // 읽기 기록 — fires once per article open; version hasn't loaded yet
  // at this point, so we always use the original article title
  useEffect(() => {
    trackArticleRead(article.news_id);
    if (isAuthenticated && user) {
      // Dual-write:
      //   - v1 endpoint feeds existing DNA-tab / recommend-API features
      //   - v2 endpoint feeds Phase 3 user_interactions for the
      //     Consolidation Lambda. mbtiForV2 prefers the 4-char form
      //     (Round 5-G — captured at OnboardingPage editor selection)
      //     so the backend can lazy-create the user_profiles row with a
      //     proper CHAR(4) value. Falls back to the 2-char currentGroup
      //     for legacy users until app/page.tsx backfills on next mount.
      const mbtiForV2 = (typeof window !== "undefined"
        ? localStorage.getItem("mbti-type")
        : null) || currentGroup;
      recordArticleRead(user.userId, article.news_id, article.title);
      recordArticleReadV2(user.userId, article.news_id, mbtiForV2);
    }
  }, [article.news_id, isAuthenticated, user]);

  const handleArchive = () => {
    const text = getSelectedText();
    if (text && onArchiveSentence) {
      const title = version?.title || article.title;
      onArchiveSentence(text, article.news_id, title);
      setSavedCount(prev => prev + selectedSentences.size);

      setToastMessage(`${selectedSentences.size}개 문장이 저장되었습니다`);
      setSelectedSentences(new Set());
      setShowToast(true);
      setTimeout(() => setShowToast(false), 1500);
    }
  };

  // 원본 기사 (MBTI 버전 없을 때) — `originalSentences` is computed at
  // component scope (above) so handleArchive can read from it.
  if (!version) {
    return (
      <div className="fixed inset-0 z-[100] bg-[#FAFAFA]">
        <ArticleHeader onClose={onClose} savedCount={savedCount} />

        <main className="h-[calc(100vh-56px)] overflow-y-auto">
          <article className={`${MAX_W} mx-auto px-6 py-8 pb-32`}>
            <div className="pb-6">
              <ArticleMeta
                category={article.category}
                date={article.published_at}
                byline={article.byline}
                provider={article.provider}
              />
              <h1 className="mt-4 text-[26px] md:text-[30px] font-bold text-gray-900 leading-tight">
                {article.title}
              </h1>
            </div>

            <ArticleImage url={article.image_url} />
            <SentenceHint />

            <SentenceBody
              sentences={originalSentences}
              selectedSentences={selectedSentences}
              onToggle={toggleSentence}
            />

            <ArticleFooter
              originalLink={article.original_link}
              byline={article.byline}
              provider={article.provider}
            />
          </article>
        </main>

        <SaveButton count={selectedSentences.size} onSave={handleArchive} />
        <Toast message={toastMessage} visible={showToast} hasSelection={selectedSentences.size > 0} />
      </div>
    );
  }

  // MBTI 변환 기사
  return (
    <div className="fixed inset-0 z-[100] bg-[#FAFAFA]">
      <ArticleHeader onClose={onClose} savedCount={savedCount} />

      <main className="h-[calc(100vh-56px)] overflow-y-auto">
        <article className={`${MAX_W} mx-auto px-6 py-8 pb-32`}>
          <div className="pb-6">
            <ArticleMeta
              category={article.category}
              date={article.published_at}
              byline={article.byline}
              provider={article.provider}
            />
            <h1 className="mt-4 text-[26px] md:text-[30px] font-bold text-gray-900 leading-tight">
              {version.title}
            </h1>
            {version.subtitle && (
              <p className="mt-3 text-[15px] text-gray-500 leading-relaxed">
                {version.subtitle}
              </p>
            )}
          </div>

          <ArticleImage url={article.image_url} />
          <SentenceHint />

          <SentenceBody
            sentences={sentences}
            selectedSentences={selectedSentences}
            onToggle={toggleSentence}
          />

          {version.key_points && version.key_points.length > 0 && (
            <div className="mt-12 p-6 bg-gray-50 rounded-2xl border border-gray-100">
              <p className="text-[13px] font-semibold text-gray-500 uppercase tracking-wider mb-5">
                핵심 정리
              </p>
              <ul className="space-y-4">
                {version.key_points.map((point, idx) => (
                  <li
                    key={idx}
                    className="text-[15px] text-gray-700 leading-relaxed pl-5 border-l-2 border-blue-200"
                  >
                    {point}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {version.closing_line && (
            <div className="mt-10 pl-5 border-l-[3px] border-gray-200">
              <p className="text-[15px] text-gray-500 italic leading-relaxed">
                {version.closing_line}
              </p>
            </div>
          )}

          <ArticleFooter
            originalLink={article.original_link}
            byline={article.byline}
            provider={article.provider}
          />
        </article>
      </main>

      <SaveButton count={selectedSentences.size} onSave={handleArchive} />
      <Toast message={toastMessage} visible={showToast} hasSelection={selectedSentences.size > 0} />
    </div>
  );
}
