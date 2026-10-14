'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowUpRight, Bell, Bookmark, BookOpen, Check, ChevronDown, ChevronRight, Quote, SlidersHorizontal } from 'lucide-react';
import { useAuth, useReadingSignals } from '@/entities/user';
import { rememberReturnTo } from '@/shared/lib/auth/returnTo';
import { EDITORS, LETTER_CSS, LETTER_SHELF_NOTICE, SubscribeDialog, fetchTopics, useFollowedEditors, useInterests, useLetterShelf, type TopicOption } from '@/features/letter';
import { ArticlePageShell } from '@/widgets/ArticlePageShell';
import { ArchiveDiscovery } from './components/ArchiveDiscovery';
import { DrawerPanel } from './components/DrawerPanel';
import { DashboardLetter } from './components/DashboardLetter';
import { InterestDialog } from './components/InterestDialog';
import { PersonalNews } from './components/PersonalNews';
import { useDashboardArchive } from './lib/news/useDashboardArchive';
import { usePersonalNews } from './lib/news/usePersonalNews';
import { buildNewsProfile, mergeNewsEvidence, recommendNews } from './lib/news/newsModel';
import { NotificationSettings } from './components/NotificationSettings';
import { ReadingRewards } from './components/ReadingRewards';
import { WeeklyStampSummary } from './components/WeeklyStamps';
import { categoryLabel, mergeLetters, readingCategories, recommendLetters } from './lib/dashboardModel';
import { useDashboardLetters } from './lib/useDashboardLetters';
import { MY_LENS_CSS } from './myLensStyles';

export function MyLensPage() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading || isAuthenticated) return;
    rememberReturnTo(window.location.pathname + window.location.search + window.location.hash);
    router.replace('/login');
  }, [isLoading, isAuthenticated, router]);

  // 인증 확인 전에는 개인 화면의 훅을 마운트하지 않는다.
  // 로그아웃하면 화면을 내리고, 계정 변경 시 화면 상태도 새로 만든다.
  if (!isLoading && isAuthenticated && user) return <MyLensDashboard key={user.userId} />;

  return (
    <ArticlePageShell>
      <style>{MY_LENS_CSS}</style>
      <main id="main-content" tabIndex={-1} className="ml-page" aria-busy={isLoading}>
        <p className="ml-loading" role="status">{isLoading ? '로그인 상태를 확인하고 있어요.' : '나의 LENS는 로그인 후 이용할 수 있어요. 로그인 화면으로 이동합니다.'}</p>
        {!isLoading && <Link href="/login" className="ml-text-link">로그인하기 <ChevronRight size={14} /></Link>}
      </main>
    </ArticlePageShell>
  );
}

function MyLensDashboard() {
  const params = useSearchParams();
  const requestedTab = params.get('tab');
  const tab = requestedTab === 'archive' || requestedTab === 'records' || requestedTab === 'settings' ? requestedTab : 'home';
  const { user } = useAuth();
  const shelf = useLetterShelf();
  const readingSignals = useReadingSignals();
  const archive = useDashboardArchive();
  const news = usePersonalNews(archive.owner);
  const interests = useInterests();
  const follow = useFollowedEditors(interests.save);
  const data = useDashboardLetters([...shelf.saved, ...shelf.read], shelf.ready);
  const [topics, setTopics] = useState<TopicOption[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [subscribeOpen, setSubscribeOpen] = useState(false);
  const [budget, setBudget] = useState(0);
  const [savedFilter, setSavedFilter] = useState<'all' | 'unread'>('all');
  const [savedExpanded, setSavedExpanded] = useState(false);
  const [notice, setNotice] = useState('');
  const [rewardsExample, setRewardsExample] = useState(false);
  useEffect(() => {
    let active = true;
    void fetchTopics().then((options) => { if (active) setTopics(options); });
    try {
      const value = Number(localStorage.getItem('lens-dashboard-budget'));
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 브라우저 설정을 마운트 후 복원한다.
      if ([0, 5, 10].includes(value)) setBudget(value);
    } catch { /* 저장소를 사용할 수 없으면 기본 설정으로 이용한다. */ }
    return () => { active = false; };
  }, []);
  const letters = useMemo(() => mergeLetters(data.letters, interests.matchedLetters), [data.letters, interests.matchedLetters]);
  const selectedTopicLabels = interests.saved.filter((item) => item.type === 'topic').map((item) => topics.find((topic) => topic.slug === item.key)?.name ?? EDITORS.flatMap((editor) => editor.topics).find((topic) => topic.slug === item.key)?.name ?? item.key);
  const evidence = readingSignals.ready ? mergeNewsEvidence([...news.history, ...readingSignals.records], letters, archive.owner ? [] : shelf.read) : [];
  const profile = buildNewsProfile(evidence, archive.sentences, news.articles.flatMap((item) => item.keywords));
  const newsRecommendations = recommendNews(news.articles, evidence, profile, interests.saved.filter((item) => item.type === 'category').map((item) => item.key), archive.sentences.map((item) => item.article_id), selectedTopicLabels);
  const recommended = recommendLetters(letters, interests.saved, follow.ids, shelf.read, budget);
  const savedLetters = [...shelf.saved].reverse().flatMap((slug) => { const letter = letters.find((item) => item.slug === slug); return letter && (savedFilter === 'all' || !shelf.isRead(slug)) ? [letter] : []; });
  const categories = readingCategories(letters, shelf.read);
  const preferenceName = (key: string, type: 'category' | 'topic') => type === 'category' ? categoryLabel(key) : topics.find((topic) => topic.slug === key)?.name ?? EDITORS.flatMap((editor) => editor.topics).find((topic) => topic.slug === key)?.name ?? key;
  const toggleSaved = (slug: string) => { const wasSaved = shelf.isSaved(slug); const persisted = shelf.toggleSaved(slug); setNotice(!persisted ? '브라우저 저장을 사용할 수 없어 이번 화면에서만 반영돼요.' : wasSaved ? '저장한 레터에서 제외했어요.' : '저장한 레터에 담았어요.'); };
  const changeBudget = (value: number) => { setBudget(value); try { localStorage.setItem('lens-dashboard-budget', String(value)); } catch { /* 이번 방문에만 적용한다. */ } };
  const busy = data.loading || !shelf.ready || !interests.ready || !follow.ready;

  return (
    <ArticlePageShell>
      <style>{MY_LENS_CSS}</style>
      {subscribeOpen && <style>{LETTER_CSS}</style>}
      <main id="main-content" tabIndex={-1} className="ml-page">
        <header className="ml-intro">
          <div><p className="ml-greeting">{user?.name ? `${user.name}님을 위한 뉴스 공간` : '나의 관심이 이어지는 곳'}</p><h1>나의 LENS<span className="ml-title-dot" aria-hidden /></h1><p className="ml-intro-copy">궁금했던 이야기부터, 다시 읽고 싶은 한 편까지.</p></div>
          <button type="button" className="ml-settings-button" onClick={() => setSettingsOpen(true)} disabled={!interests.ready}><SlidersHorizontal size={16} /> 관심사 설정</button>
        </header>

        <div className="ml-topics" aria-label="설정한 관심사">
          <span className="ml-topics-label">직접 고른 관심</span>
          {!interests.ready ? <span className="ml-helper">관심사를 불러오고 있어요.</span> : interests.saved.length ? <>{interests.saved.slice(0, 6).map((item) => <button type="button" key={`${item.type}:${item.key}`} className="ml-topic" onClick={() => setSettingsOpen(true)}>{preferenceName(item.key, item.type)}</button>)}{interests.saved.length > 6 && <button className="ml-topic" onClick={() => setSettingsOpen(true)}>+{interests.saved.length - 6}</button>}</> : <button type="button" className="ml-text-link" onClick={() => setSettingsOpen(true)}>{interests.available ? '관심사를 골라 뉴스·레터 추천 받기' : '관심사 연결 확인하고 설정하기'} <ChevronRight size={14} /></button>}
        </div>

        <nav className="ml-page-nav" aria-label="나의 LENS 메뉴">{([
          { key: 'home', label: '홈', href: '/my-lens' },
          { key: 'archive', label: '내 서랍', href: '/my-lens?tab=archive' },
          { key: 'records', label: '읽기 기록·리워드', href: '/my-lens?tab=records' },
          { key: 'settings', label: '관심사·알림', href: '/my-lens?tab=settings' },
        ] as const).map((item) => <Link key={item.key} href={item.href} className={tab === item.key ? 'ml-nav-current' : undefined} aria-current={tab === item.key ? 'page' : undefined}>{item.label}</Link>)}</nav>

        <div className={`ml-layout${tab === 'archive' ? ' ml-layout-drawer' : ''}`}>
          <div className="ml-main">
            {tab === 'home' && <>
            <PersonalNews recommendations={newsRecommendations} profile={profile} loading={news.loading || !readingSignals.ready || archive.loading} available={news.available} localAvailable={readingSignals.available} archiveCount={archive.sentences.length} archiveLoading={archive.loading} archiveFailed={archive.failed} signedIn={!!archive.owner} historyAvailable={news.historyAvailable} unmatched={news.unmatched} onRetry={news.retry} onArchiveRetry={archive.retry} />
            <section id="ml-today" className="ml-today" aria-labelledby="ml-today-title" aria-busy={busy}>
              <div className="ml-section-title"><div><h2 id="ml-today-title">오늘, 나를 위한 레터</h2><p className="ml-helper">{interests.saved.length || follow.ids.length ? '나의 관심과 팔로우에서 고른 이야기예요.' : '최근 발행된 레터에서 시작해 보세요.'}</p></div><label className="ml-budget">읽을 시간<span className="ml-budget-select"><select aria-label="읽을 시간" value={budget} onChange={(event) => changeBudget(Number(event.target.value))}><option value={0}>여유롭게</option><option value={5}>5분 안에</option><option value={10}>10분 안에</option></select><ChevronDown size={14} aria-hidden /></span></label></div>
              {busy ? <div className="ml-loading" role="status">나에게 맞는 레터를 불러오고 있어요.</div> : recommended.length ? <><div className="ml-recommend-grid">{recommended.map((letter, index) => <DashboardLetter key={letter.slug} letter={letter} featured={index === 0} saved={shelf.isSaved(letter.slug)} read={shelf.isRead(letter.slug)} onSave={() => toggleSaved(letter.slug)} />)}</div><p className="ml-duration-note"><strong style={{ fontWeight: 500 }}>{recommended.length}편, 약 {recommended.reduce((sum, letter) => sum + Math.max(1, letter.readMinutes || 1), 0)}분의 이야기</strong> <span>내 속도에 맞춰 읽어보세요.</span></p></> : <div className="ml-empty"><BookOpen size={25} aria-hidden /><h3>{!data.available ? '레터를 불러오지 못했어요' : letters.length && budget ? '선택한 시간에 맞는 레터가 없어요' : '새로운 레터를 준비하고 있어요'}</h3><p>{!data.available ? '연결을 확인한 뒤 다시 불러와 주세요.' : budget && letters.length ? '읽을 시간을 늘리면 더 긴 이야기를 만날 수 있어요.' : '발행된 레터가 있으면 여기에 보여드릴게요.'}</p>{!data.available ? <button className="ml-button" onClick={data.retry}>레터 다시 불러오기</button> : budget > 0 && letters.length > 0 ? <button className="ml-button" onClick={() => changeBudget(0)}>시간 제한 없이 보기</button> : <Link className="ml-button ml-button-quiet" href="/lens">다른 뉴스 둘러보기</Link>}</div>}
              {!busy && !data.available && recommended.length > 0 && <p className="ml-helper">최신 목록 일부를 불러오지 못했어요. <button className="ml-text-link" onClick={data.retry}>다시 불러오기</button></p>}
            </section>

            <section id="ml-saved" className="ml-saved" aria-labelledby="ml-saved-title">
              <div className="ml-section-title"><div><h2 id="ml-saved-title">다시 펼쳐볼 레터 <span className="ml-heading-count">{shelf.ready ? shelf.saved.length : ''}</span></h2><p className="ml-helper">읽고 싶어 담아둔 이야기를 모았어요.</p></div><Link href="/my-lens?tab=archive&kind=letters" className="ml-text-link">내 서랍에서 보기 <ChevronRight size={14} /></Link></div>
              <div className="ml-saved-toolbar" role="group" aria-label="저장한 레터 필터"><button aria-pressed={savedFilter === 'all'} onClick={() => { setSavedFilter('all'); setSavedExpanded(false); }}>전체</button><button aria-pressed={savedFilter === 'unread'} onClick={() => { setSavedFilter('unread'); setSavedExpanded(false); }}>아직 안 읽은 레터</button></div>
              {data.loading ? <p className="ml-loading" role="status">저장한 레터를 불러오고 있어요.</p> : savedLetters.length ? <><div className="ml-saved-list">{savedLetters.slice(0, savedExpanded ? undefined : 3).map((letter) => <DashboardLetter key={letter.slug} letter={letter} saved read={shelf.isRead(letter.slug)} onSave={() => toggleSaved(letter.slug)} />)}</div>{savedLetters.length > 3 && <button className="ml-more" onClick={() => setSavedExpanded((value) => !value)}>{savedExpanded ? '접기' : `저장한 레터 ${savedLetters.length}편 모두 보기`}</button>}</> : <div className="ml-saved-empty"><Bookmark size={23} aria-hidden /><h3>{shelf.saved.length ? savedFilter === 'unread' ? '아직 안 읽은 레터가 없어요' : '저장 레터의 내용을 불러오지 못했어요' : '마음에 드는 레터를 담아보세요'}</h3><p>{shelf.saved.length ? '전체 목록을 확인하거나 새로운 레터를 만나보세요.' : '레터 옆의 북마크를 누르면 이곳에서 이어볼 수 있어요.'}</p><Link href="/letter" className="ml-text-link">레터 둘러보기 <ArrowUpRight size={15} /></Link></div>}
              {data.missing > 0 && <div className="ml-missing"><p>이전 레터 {data.missing}편의 정보를 불러오지 못했어요. 저장·열람 기록은 유지돼요.</p><button className="ml-text-link" onClick={data.retry}>이전 레터 다시 불러오기</button></div>}
              <p id="ml-storage-note" className="ml-storage-note">{LETTER_SHELF_NOTICE.browser} {LETTER_SHELF_NOTICE.sync}</p>
            </section>

            </>}
            {tab === 'archive' && <DrawerPanel key={`${archive.owner ?? 'browser'}:${params.get('kind')}`} initialFilter={params.get('kind') === 'letters' ? 'letters' : 'sentences'} archive={archive} articles={news.articles} evidence={evidence} newsLoading={news.loading} newsAvailable={news.available} retryNews={news.retry} selectedId={params.get('sentence')} letters={letters} savedSlugs={shelf.saved} lettersLoading={data.loading || !shelf.ready} missingLetters={data.missing} retryLetters={data.retry} isRead={shelf.isRead} onSave={toggleSaved} />}
            {tab === 'records' && <>
            <section className="ml-reading" aria-labelledby="ml-reading-title"><div className="ml-section-title"><div><h2 id="ml-reading-title">내가 읽어온 관심의 흐름</h2><p className="ml-helper">이 브라우저에 쌓인 누적 열람 카테고리예요.</p></div><BookOpen size={20} aria-hidden /></div>{categories.length ? <div className="ml-category-list">{categories.map((category) => <div key={category.slug} className="ml-category-row"><Link href={`/${category.slug}`}>{category.label}</Link><div className="ml-category-track" aria-hidden><span style={{ width: `${category.count / categories[0].count * 100}%` }} /></div><span>{category.count}편</span></div>)}</div> : <p className="ml-helper">레터를 읽으면 자주 만난 분야를 알려드려요.</p>}<div className="ml-record-summary"><span><BookOpen size={15} /> 열람한 레터 <strong>{shelf.ready ? shelf.read.length : '·'}편</strong></span><span><Bookmark size={15} /> 저장한 레터 <strong>{shelf.ready ? shelf.saved.length : '·'}편</strong></span></div><p className="ml-storage-note">이 브라우저의 기록이에요. 카테고리는 불러온 레터를 기준으로 집계해요.</p></section>
            <ReadingRewards example={rewardsExample} onExampleChange={setRewardsExample} />
            </>}
            {tab === 'settings' && <NotificationSettings recommendations={newsRecommendations} interestSummary={{ categories: [...new Set([...profile.categories.map((item) => item.label), ...interests.saved.filter((item) => item.type === 'category').map((item) => categoryLabel(item.key))])], keywords: [...new Set([...profile.keywords.map((item) => item.label), ...selectedTopicLabels])], sentenceWords: profile.sentenceTerms }} />}
          </div>

          <aside className="ml-rail" aria-label="내 기록과 구독">
            <WeeklyStampSummary example={rewardsExample} />
            {tab === 'home' && <ArchiveDiscovery archive={archive} articles={news.articles} letters={letters} />}
            {tab === 'archive' && <div className="ml-drawer-guide"><Quote size={21} aria-hidden /><h2>한 문장, 다음 이야기</h2><p>뉴스를 읽다 마음에 남은 문장을 담아보세요. 각 문장의 ‘관련 글 보기’에서 새로운 뉴스를 만날 수 있어요.</p><Link href="/my-lens?tab=settings#ml-notifications" className="ml-text-link">새 글 알림 설정 <ArrowUpRight size={14} /></Link><p className="ml-storage-note">알림은 별도 선택이 필요해요. 푸시 발송은 아직 연결되지 않았어요.</p></div>}
            {tab === 'home' && <>
            <section className="ml-editors" aria-labelledby="ml-editors-title"><div className="ml-section-title"><h2 id="ml-editors-title">내가 팔로우한 에디터</h2><span className="ml-heading-count">{follow.ready ? follow.ids.length : '·'}</span></div>{follow.followed.length ? <div className="ml-editor-list">{follow.followed.map((editor) => <Link key={editor.id} href={`/letter/editors/${editor.id}`} className="ml-editor">{editor.image && <Image src={editor.image} alt="" width={38} height={38} />}<span><strong>{editor.name}</strong><small>{editor.short ?? editor.role}</small></span><ChevronRight size={15} /></Link>)}</div> : <p className="ml-helper">관심 분야가 맞는 에디터를 팔로우하면 새 레터를 찾기 쉬워져요.</p>}<Link href="/letter" className="ml-text-link">에디터 만나보기 <ArrowUpRight size={15} /></Link></section>
            <section className="ml-notify" aria-labelledby="ml-notify-title"><Bell size={22} aria-hidden /><h2 id="ml-notify-title">관심 있는 소식,<br />메일로도 만나요.</h2><p>관심사와 팔로우한 에디터의 새 레터를 이메일로 받아보세요.</p><button type="button" className="ml-button" onClick={() => setSubscribeOpen(true)} disabled={!interests.ready || !follow.ready}>레터 이메일 구독</button><p className="ml-storage-note">구독 신청 후 이메일 확인이 필요해요.</p></section>
            </>}
          </aside>
        </div>
        <footer className="ml-footer"><span>AI LENS</span><p>나의 관심을 따라, 뉴스 너머의 맥락까지.</p></footer>
        <p className="ml-status" role="status" aria-live="polite">{notice && <><Check size={15} />{notice}</>}</p>
        {settingsOpen && <InterestDialog initial={interests.saved} topics={topics} onSave={async (items) => { const ok = await interests.save(items); if (ok) setNotice('관심사를 저장했어요. 뉴스·레터 추천에 반영했어요.'); return ok; }} onClose={() => setSettingsOpen(false)} />}
        <SubscribeDialog open={subscribeOpen} onClose={() => setSubscribeOpen(false)} interests={interests.saved} editors={follow.followed} title="관심 레터를 이메일로 받아보세요" source="my_lens" />
      </main>
    </ArticlePageShell>
  );
}
