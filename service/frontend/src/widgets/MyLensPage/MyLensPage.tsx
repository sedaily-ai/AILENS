'use client';

import { notificationStatus } from './lib/notificationPresentation';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowUpRight, Bell, Bookmark, BookOpen, Check, ChevronDown, ChevronRight, Info, Quote } from 'lucide-react';
import { useAuth } from '@/entities/user';
import { rememberReturnTo } from '@/shared/lib/auth/returnTo';
import { LETTER_CSS, LetterShelfStatus, SubscribeDialog, useFollowedEditors, useReadingTime, useLetterShelf } from '@/features/letter';
import { ArticlePageShell } from '@/widgets/ArticlePageShell';
import { ArchiveDiscovery } from './components/ArchiveDiscovery';
import { DrawerPanel } from './components/DrawerPanel';
import { DashboardLetter } from './components/DashboardLetter';
import { PersonalNews } from './components/PersonalNews';
import { useDashboardArchive } from './lib/news/useDashboardArchive';
import { useServerDashboard } from './lib/useServerDashboard';
import { cardLetter, newsRecommendations as mapNewsRecommendations } from './lib/dashboardApi';
import { NotificationSettings } from './components/NotificationSettings';
import { ReadingRewards } from './components/ReadingRewards';
import { WeeklyStampSummary } from './components/WeeklyStamps';
import { mergeLetters } from './lib/dashboardModel';
import { useDashboardLetters } from './lib/useDashboardLetters';
import { FormatPreference } from './components/FormatPreference';
import { BrowserBookmarksImport } from './components/BrowserBookmarksImport';
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
  const { user, logout } = useAuth();
  const router = useRouter();
  const authRedirectStarted = useRef(false);
  const [savedFilter, setSavedFilter] = useState<'all' | 'unread'>('all');
  const readingTime = useReadingTime(tab === 'home');
  const [subscribeOpen, setSubscribeOpen] = useState(false);
  const budget = readingTime.minutes;
  const server = useServerDashboard(user?.userId, budget, tab);
  const needsLetters = tab === 'home' || tab === 'archive';
  const needsShelf = needsLetters || tab === 'records' && !server.loading && server.data?.saved_letters.status !== 'ready';
  const shelf = useLetterShelf(savedFilter, needsShelf);
  const archive = useDashboardArchive(tab === 'archive');
  const follow = useFollowedEditors(tab === 'home' || tab === 'records' || subscribeOpen);
  const data = useDashboardLetters(shelf.read, needsLetters && shelf.ready);
  const [savedExpanded, setSavedExpanded] = useState(false);
  const [notice, setNotice] = useState('');
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 3000);
    return () => window.clearTimeout(timer);
  }, [notice]);
  const rawProfile = server.data?.profile.data;
  const profile = { categories: (rawProfile?.categories ?? []).map(item => ({slug:item.key,label:item.label,count:item.distinct_contents})) };
  const recommended = (server.data?.letters.data?.items ?? []).map(cardLetter);
  const letters = useMemo(() => mergeLetters(mergeLetters(data.letters, shelf.savedLetters), (server.data?.letters.data?.items ?? []).map(cardLetter)), [data.letters, shelf.savedLetters, server.data]);
  const newsRecommendations = mapNewsRecommendations(server.news?.data);
  const news = { articles: newsRecommendations, loading:server.newsLoading, available:server.news?.status === 'ready', retry:server.retry };
  const savedTotal = server.data?.saved_letters.data?.total ?? shelf.saved.length;
  const savedLetters = shelf.filteredSaved.flatMap(slug => { const letter=letters.find(item=>item.slug===slug); return letter ? [letter] : []; });
  const categories=profile.categories;
  const homeArchive={...archive,sentences:server.data?.recent_sentences.data?.items??[],loading:server.loading,failed:!!server.error||server.data?.recent_sentences.status==='error',retry:server.retry};
  const toggleSaved = (slug: string) => { void shelf.toggleSaved(slug); };
  const changeBudget = async (value: number) => { if (!await readingTime.saveMinutes(value)) setNotice('읽을 시간을 저장하지 못했어요. 기존 설정은 유지돼요.'); };
  const busy = server.loading || !shelf.ready || !follow.ready;
  const authRequired = shelf.authRequired || follow.authRequired || readingTime.authRequired || server.authRequired;
  useEffect(() => {
    if (!authRequired || authRedirectStarted.current) return;
    authRedirectStarted.current = true;
    rememberReturnTo(window.location.pathname + window.location.search + window.location.hash);
    void logout().finally(() => router.replace('/login'));
  }, [authRequired, logout, router]);
  if (authRequired) return <ArticlePageShell><p role="status">로그인이 만료됐어요. 로그인 화면으로 이동합니다.</p></ArticlePageShell>;


  return (
    <ArticlePageShell>
      <style>{MY_LENS_CSS}</style>
      {subscribeOpen && <style>{LETTER_CSS}</style>}
      <main id="main-content" tabIndex={-1} className="ml-page">
        <header className="ml-intro">
          <div><p className="ml-greeting">{user?.name ? `${user.name}님을 위한 뉴스 공간` : '나의 관심이 이어지는 곳'}</p><h1>나의 LENS<span className="ml-title-dot" aria-hidden /></h1><p className="ml-intro-copy">궁금했던 이야기부터, 다시 읽고 싶은 한 편까지.</p></div>
        </header>

        <nav className="ml-page-nav" aria-label="나의 LENS 메뉴">{([
          { key: 'home', label: '홈', href: '/my-lens' },
          { key: 'archive', label: '내 서랍', href: '/my-lens?tab=archive' },
          { key: 'records', label: '이용 기록', href: '/my-lens?tab=records' },
          { key: 'settings', label: '알림 설정', href: '/my-lens?tab=settings' },
        ] as const).map((item) => <Link key={item.key} href={item.href} className={tab === item.key ? 'ml-nav-current' : undefined} aria-current={tab === item.key ? 'page' : undefined}>{item.label}</Link>)}</nav>

        {needsShelf && <LetterShelfStatus shelf={shelf} />}
        {follow.error && <p role="alert" className="ml-helper">{follow.error} <button type="button" onClick={follow.retry}>팔로우 다시 불러오기</button></p>}
        {server.error && <p role="alert" className="ml-helper">{server.error} <button type="button" onClick={server.retry}>대시보드 다시 불러오기</button></p>}
        {readingTime.error && <p role="alert" className="ml-helper">{readingTime.error} <button type="button" onClick={readingTime.retry} disabled={readingTime.pending}>읽을 시간 다시 불러오기</button></p>}
        <div className={`ml-layout${tab === 'archive' ? ' ml-layout-drawer' : ''}`}>
          <div className="ml-main">
            {tab === 'home' && <>
            <FormatPreference data={server.data?.format_preference.data} loading={server.loading} onRetry={server.retry} />
            <PersonalNews recommendations={newsRecommendations} categories={profile.categories} loading={news.loading} available={news.available} historyAvailable={server.data?.profile.status === 'ready'} unmatched={rawProfile?.coverage.legacy_unmatched ?? 0} onRetry={news.retry} />
            <section id="ml-today" className="ml-today" aria-labelledby="ml-today-title" aria-busy={busy}>
              <div className="ml-section-title"><div><h2 id="ml-today-title">오늘, 나를 위한 레터</h2><p className="ml-helper">팔로우한 에디터의 최신 레터예요. 팔로우가 없으면 최근 발행된 레터를 보여드려요.</p></div><label className="ml-budget">읽을 시간<span className="ml-budget-select"><select aria-label="읽을 시간" value={budget ?? ''} disabled={!readingTime.available || readingTime.pending} onChange={(event) => changeBudget(Number(event.target.value))}><option value="" disabled>읽을 시간 확인 중</option><option value={0}>여유롭게</option><option value={5}>5분 안에</option><option value={10}>10분 안에</option></select><ChevronDown size={14} aria-hidden /></span></label></div>
              {busy ? <div className="ml-loading" role="status">나에게 맞는 레터를 불러오고 있어요.</div> : recommended.length ? <><div className="ml-recommend-grid">{recommended.map((letter, index) => <DashboardLetter key={letter.slug} letter={letter} featured={index === 0} saved={shelf.isSaved(letter.slug)} read={server.data?.letters.data?.items.find(item=>item.slug===letter.slug)?.completed ?? false} onSave={() => toggleSaved(letter.slug)} />)}</div><p className="ml-duration-note"><strong style={{ fontWeight: 500 }}>{recommended.length}편, {recommended.every(letter=>letter.readMinutes>0) ? `약 ${server.data?.letters.data?.total_minutes ?? 0}분의 이야기` : '소요 시간 확인 중'}</strong> <span>내 속도에 맞춰 읽어보세요.</span></p></> : <div className="ml-empty"><BookOpen size={25} aria-hidden /><h3>{server.data?.letters.status === 'error' ? '레터를 불러오지 못했어요' : letters.length && budget ? '선택한 시간에 맞는 레터가 없어요' : '아직 새 레터가 없어요'}</h3><p>{server.data?.letters.status === 'error' ? '연결을 확인한 뒤 다시 불러와 주세요.' : budget && letters.length ? '읽을 시간을 늘리면 더 긴 이야기를 만날 수 있어요.' : '팔로우한 에디터의 새 레터를 기다리거나 전체 레터를 둘러보세요.'}</p>{server.data?.letters.status === 'error' ? <button className="ml-button" onClick={server.retry}>레터 다시 불러오기</button> : (budget ?? 0) > 0 && letters.length > 0 ? <button className="ml-button" onClick={() => changeBudget(0)}>시간 제한 없이 보기</button> : <Link className="ml-button ml-button-quiet" href="/letter">레터 둘러보기</Link>}</div>}
              {!busy && server.data?.letters.status === 'error' && recommended.length > 0 && <p className="ml-helper">최신 목록 일부를 불러오지 못했어요. <button className="ml-text-link" onClick={server.retry}>다시 불러오기</button></p>}
            </section>

            <section id="ml-saved" className="ml-saved" aria-labelledby="ml-saved-title">
              <div className="ml-section-title"><div><h2 id="ml-saved-title">다시 펼쳐볼 레터 <span className="ml-heading-count">{shelf.ready ? savedTotal : ''}</span></h2><p className="ml-helper">읽고 싶어 담아둔 이야기를 모았어요.</p></div><Link href="/my-lens?tab=archive&kind=letters" className="ml-text-link">내 서랍에서 보기 <ChevronRight size={14} /></Link></div>
              <div className="ml-saved-toolbar" role="group" aria-label="저장한 레터 필터"><button aria-pressed={savedFilter === 'all'} onClick={() => { setSavedFilter('all'); setSavedExpanded(false); }}>전체</button><button aria-pressed={savedFilter === 'unread'} onClick={() => { setSavedFilter('unread'); setSavedExpanded(false); }}>아직 안 읽은 레터</button></div>
              {data.loading || !shelf.ready ? <p className="ml-loading" role="status">저장한 레터를 불러오고 있어요.</p> : !shelf.available ? <div className="ml-saved-empty"><h3>저장한 레터를 불러오지 못했어요</h3><p>연결을 확인하고 다시 불러와 주세요. 저장 기록은 유지돼요.</p><button type="button" className="ml-text-link" onClick={shelf.retry}>저장 레터 다시 불러오기</button></div> : savedLetters.length ? <><div className="ml-saved-list">{savedLetters.slice(0, savedExpanded ? undefined : 3).map((letter) => <DashboardLetter key={letter.slug} letter={letter} saved read={shelf.isCompleted(letter.slug)} onSave={() => toggleSaved(letter.slug)} />)}</div>{savedLetters.length > 3 && <button className="ml-more" onClick={() => setSavedExpanded((value) => !value)}>{savedExpanded ? '접기' : `저장한 레터 ${savedLetters.length}편 모두 보기`}</button>}</> : <div className="ml-saved-empty"><Bookmark size={23} aria-hidden /><h3>{shelf.saved.length ? savedFilter === 'unread' ? '아직 안 읽은 레터가 없어요' : '저장 레터의 내용을 불러오지 못했어요' : '마음에 드는 레터를 담아보세요'}</h3><p>{shelf.saved.length ? '전체 목록을 확인하거나 새로운 레터를 만나보세요.' : '레터 옆의 북마크를 누르면 이곳에서 이어볼 수 있어요.'}</p><Link href="/letter" className="ml-text-link">레터 둘러보기 <ArrowUpRight size={15} /></Link></div>}
              {data.missing > 0 && <div className="ml-missing"><p>이전 레터 {data.missing}편의 정보를 불러오지 못했어요. 저장·열람 기록은 유지돼요.</p><button className="ml-text-link" onClick={server.retry}>이전 레터 다시 불러오기</button></div>}
              <p id="ml-storage-note" className="ml-storage-note">{shelf.notice}</p>
            </section>

            </>}
            {tab === 'archive' && <><BrowserBookmarksImport owner={user!.userId} letters={letters} onImported={()=>{shelf.retry();server.retry();}} /><DrawerPanel notificationNotice={notificationStatus(server.data?.notifications.status === 'ready' ? server.data.notifications.data : null)} storageNotice={shelf.notice} key={`${archive.owner ?? 'browser'}:${params.get('kind')}`} initialFilter={params.get('kind') === 'letters' ? 'letters' : 'sentences'} archive={archive} articles={news.articles} selectedId={params.get('sentence')} letters={letters} savedSlugs={shelf.saved} lettersLoading={data.loading || !shelf.ready} lettersFailed={!shelf.available} missingLetters={data.missing} retryLetters={()=>{data.retry();shelf.retry();}} isRead={shelf.isCompleted} letterFilter={savedFilter} onLetterFilterChange={setSavedFilter} filteredSavedSlugs={shelf.filteredSaved} onSave={toggleSaved} /></>}
            {tab === 'records' && <>
            <section className="ml-reading" aria-labelledby="ml-reading-title"><div className="ml-section-title"><div><h2 id="ml-reading-title">내가 만나온 관심의 흐름</h2><p className="ml-helper">최근 90일 계정 이용 기록의 분야예요. 완료 기록과는 구분해요.</p></div><BookOpen size={20} aria-hidden /></div>{categories.length ? <div className="ml-category-list">{categories.map((category) => <div key={category.slug} className="ml-category-row"><Link href={`/${category.slug}`}>{category.label}</Link><div className="ml-category-track" aria-hidden><span style={{ width: `${category.count / categories[0].count * 100}%` }} /></div><span>{category.count}편</span></div>)}</div> : <p className="ml-helper">뉴스·레터를 이용하면 자주 만난 분야를 알려드려요.</p>}<div className="ml-record-summary"><span><BookOpen size={15} /> 열람한 레터 <strong>{rawProfile?.viewed_letter_count ?? '·'}편</strong></span><span><Bookmark size={15} /> 저장한 레터 <strong>{server.data?.saved_letters.status === 'ready' || shelf.ready ? savedTotal : '·'}편</strong></span></div><div className="ml-method-note"><Info size={15} aria-hidden /><p>분야는 계정의 뉴스·레터 유효 열람을 함께 집계해요. 반복 열람은 한 편으로 세며, 완료·스탬프 기록이 아니에요.</p></div></section>
            <ReadingRewards />
            </>}
            {tab === 'settings' && <NotificationSettings />}
          </div>

          <aside className="ml-rail" aria-label="내 기록과 구독">
            {tab !== 'records' && <WeeklyStampSummary area={server.data?.weekly_activity} loading={server.loading} onRetry={server.retry} />}
            {tab === 'home' && <ArchiveDiscovery archive={homeArchive} articles={news.articles} letters={letters} />}
            {(tab === 'archive' || tab === 'records') && <div className="ml-drawer-guide"><Quote size={21} aria-hidden /><h2>한 문장, 다음 이야기</h2><p>뉴스를 읽다 마음에 남은 문장을 담아보세요. 각 문장의 ‘관련 글 보기’에서 새로운 뉴스를 만날 수 있어요.</p><Link href="/my-lens?tab=settings#ml-notifications" className="ml-text-link">새 글 알림 설정 <ArrowUpRight size={14} /></Link><p className="ml-storage-note">알림은 별도 선택이 필요해요. 설정·동의는 계정에 저장돼요. {notificationStatus(server.data?.notifications.status === 'ready' ? server.data.notifications.data : null)}</p></div>}
            {(tab === 'home' || tab === 'records') && <section className="ml-editors" aria-labelledby="ml-editors-title"><div className="ml-section-title"><h2 id="ml-editors-title">내가 팔로우한 에디터</h2><span className="ml-heading-count">{follow.ready ? follow.ids.length : '·'}</span></div>{!follow.ready ? <p className="ml-helper" role="status">팔로우한 에디터를 불러오고 있어요.</p> : !follow.available ? <p className="ml-helper">에디터 목록을 불러오지 못했어요.</p> : follow.followed.length ? <div className="ml-editor-list">{follow.followed.map((editor) => <Link key={editor.id} href={`/letter/editors/${editor.id}`} className="ml-editor">{editor.image && <Image src={editor.image} alt="" width={38} height={38} />}<span><strong>{editor.name}</strong><small>{editor.short ?? editor.role}</small></span><ChevronRight size={15} /></Link>)}</div> : <p className="ml-helper">관심 분야가 맞는 에디터를 팔로우하면 새 레터를 찾기 쉬워져요.</p>}{follow.items.filter(item=>item.active&&!follow.followed.some(editor=>editor.id===item.id)).map(item=><div key={item.id}><Link href={item.href} className="ml-text-link">{item.name}</Link><button type="button" className="ml-text-link" disabled={follow.pending} onClick={()=>void follow.toggle(item.id)}>팔로우 해제</button></div>)}{follow.items.filter(item=>!item.active).map(item=><p className="ml-helper" key={item.id}>{item.name} · 활동 중지 <button type="button" disabled={follow.pending} onClick={()=>void follow.toggle(item.id)}>팔로우 해제</button></p>)}<Link href="/letter" className="ml-text-link">에디터 만나보기 <ArrowUpRight size={15} /></Link></section>}
            {tab === 'home' && <section className="ml-notify" aria-labelledby="ml-notify-title"><Bell size={22} aria-hidden /><h2 id="ml-notify-title">관심 있는 소식,<br />메일로도 만나요.</h2><p>선택한 에디터의 새 레터를 이메일로 받아보세요. 기존 이메일 구독은 그대로 유지돼요.</p><button type="button" className="ml-button" onClick={() => setSubscribeOpen(true)} disabled={!follow.ready || !follow.available}>레터 이메일 구독</button><p className="ml-storage-note">구독 신청 후 이메일 확인이 필요해요.</p></section>}
          </aside>
        </div>
        <footer className="ml-footer"><span>AI LENS</span><p>나의 관심을 따라, 뉴스 너머의 맥락까지.</p></footer>
        <p className="ml-status" role="status" aria-live="polite">{notice && <><Check size={15} />{notice}</>}</p>
        <SubscribeDialog open={subscribeOpen} onClose={() => setSubscribeOpen(false)} editors={follow.followed} title="에디터의 새 레터를 이메일로 받아보세요" source="my_lens" />
      </main>
    </ArticlePageShell>
  );
}
