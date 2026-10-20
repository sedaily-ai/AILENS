'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowUpRight, Bell, Bookmark, BookOpen, ChevronRight } from 'lucide-react';
import { useAuth } from '@/entities/user';
import { rememberReturnTo } from '@/shared/lib/auth/returnTo';
import { LETTER_CSS, LetterShelfStatus, SubscribeDialog, useFollowedEditors, useLetterShelf } from '@/features/letter';
import { ArticlePageShell } from '@/widgets/ArticlePageShell';
import { ArchiveDiscovery } from './components/ArchiveDiscovery';
import { DrawerPanel } from './components/DrawerPanel';
import { DashboardLetter } from './components/DashboardLetter';
import { PersonalNews } from './components/PersonalNews';
import { useDashboardArchive } from './lib/news/useDashboardArchive';
import { useArticleShelf } from './lib/news/useArticleShelf';
import { useServerDashboard } from './lib/useServerDashboard';
import { cardLetter, newsRecommendations as mapNewsRecommendations } from './lib/dashboardApi';
import { mergeLetters } from './lib/dashboardModel';
import { useDashboardLetters } from './lib/useDashboardLetters';
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
  // 메뉴는 홈·내 서랍 두 탭이다. 알림 설정(settings)·이용 기록(records) 탭은 2026-10-19 기능 다이어트로 제거했고, 옛 주소는 홈으로 연다.
  const tab = requestedTab === 'archive' ? 'archive' : 'home';
  const { user, logout } = useAuth();
  const router = useRouter();
  // 옛 주소 정리. 목적지는 이 규칙에 다시 걸리지 않아 반복 이동이 없다. CloudFront 캐시 키에 쿼리가 없어 서버 리다이렉트는 쓰지 않는다.
  //  - ?tab=records|settings(제거된 탭): tab을 지워 홈으로 연다. 북마크가 옛 주소로 남지 않게 주소창에서도 지운다.
  //  - ?sentence=…(제거된 저장 문장 관련 글, 2026-10-19): sentence를 지운다. 서랍은 그대로 열린다.
  useEffect(() => {
    const legacyTab = requestedTab === 'records' || requestedTab === 'settings';
    if (!legacyTab && !params.has('sentence')) return;
    const next = new URLSearchParams(params.toString());
    if (legacyTab) next.delete('tab');
    next.delete('sentence');
    const qs = next.toString();
    router.replace(`/my-lens${qs ? `?${qs}` : ''}`);
  }, [requestedTab, params, router]);
  const authRedirectStarted = useRef(false);
  const [subscribeOpen, setSubscribeOpen] = useState(false);
  // 대시보드 집계는 홈에서만 쓴다. 내 서랍은 문장(/api/archive)·저장 레터를 따로 불러오므로 요청하지 않는다.
  const server = useServerDashboard(user?.userId, 'home', tab === 'home');
  const needsLetters = tab === 'home' || tab === 'archive';
  const needsShelf = needsLetters;
  const shelf = useLetterShelf(needsShelf);
  const archive = useDashboardArchive(tab === 'archive');
  const articleShelf = useArticleShelf(tab === 'archive');
  const follow = useFollowedEditors(tab === 'home' || subscribeOpen);
  const data = useDashboardLetters(needsLetters && shelf.ready);
  const [savedExpanded, setSavedExpanded] = useState(false);
  const rawProfile = server.data?.profile.data;
  const profile = { categories: (rawProfile?.categories ?? []).map(item => ({slug:item.key,label:item.label,count:item.distinct_contents})) };
  const recommended = (server.data?.letters.data?.items ?? []).map(cardLetter);
  const letters = useMemo(() => mergeLetters(mergeLetters(data.letters, shelf.savedLetters), (server.data?.letters.data?.items ?? []).map(cardLetter)), [data.letters, shelf.savedLetters, server.data]);
  const newsRecommendations = mapNewsRecommendations(server.news?.data);
  const news = { articles: newsRecommendations, loading:server.newsLoading, available:server.news?.status === 'ready', retry:server.retry };
  const savedTotal = server.data?.saved_letters.data?.total ?? shelf.saved.length;
  const savedLetters = shelf.saved.flatMap(slug => { const letter=letters.find(item=>item.slug===slug); return letter ? [letter] : []; });
  const homeArchive={...archive,sentences:server.data?.recent_sentences.data?.items??[],loading:server.loading,failed:!!server.error||server.data?.recent_sentences.status==='error',retry:server.retry};
  const toggleSaved = (slug: string) => { void shelf.toggleSaved(slug); };
  const busy = server.loading || !shelf.ready || !follow.ready;
  const authRequired = shelf.authRequired || follow.authRequired || server.authRequired;
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
        ] as const).map((item) => <Link key={item.key} href={item.href} className={tab === item.key ? 'ml-nav-current' : undefined} aria-current={tab === item.key ? 'page' : undefined}>{item.label}</Link>)}</nav>

        {needsShelf && <LetterShelfStatus shelf={shelf} />}
        {follow.error && <p role="alert" className="ml-helper">{follow.error} <button type="button" onClick={follow.retry}>팔로우 다시 불러오기</button></p>}
        {server.error && <p role="alert" className="ml-helper">{server.error} <button type="button" onClick={server.retry}>대시보드 다시 불러오기</button></p>}
        <div className={`ml-layout${tab === 'archive' ? ' ml-layout-drawer' : ''}`}>
          <div className="ml-main">
            {tab === 'home' && <>
            <PersonalNews recommendations={newsRecommendations} categories={profile.categories} loading={news.loading} available={news.available} historyAvailable={server.data?.profile.status === 'ready'} unmatched={rawProfile?.coverage.legacy_unmatched ?? 0} onRetry={news.retry} />
            <section id="ml-today" className="ml-today" aria-labelledby="ml-today-title" aria-busy={busy}>
              <div className="ml-section-title"><div><h2 id="ml-today-title">오늘, 나를 위한 레터</h2><p className="ml-helper">팔로우한 에디터의 최신 레터예요. 팔로우가 없으면 최근 발행된 레터를 보여드려요.</p></div></div>
              {busy ? <div className="ml-loading" role="status">나에게 맞는 레터를 불러오고 있어요.</div> : recommended.length ? <div className="ml-recommend-grid">{recommended.map((letter, index) => <DashboardLetter key={letter.slug} letter={letter} featured={index === 0} saved={shelf.isSaved(letter.slug)} onSave={() => toggleSaved(letter.slug)} />)}</div> : <div className="ml-empty"><BookOpen size={25} aria-hidden /><h3>{server.data?.letters.status === 'error' ? '레터를 불러오지 못했어요' : '아직 새 레터가 없어요'}</h3><p>{server.data?.letters.status === 'error' ? '연결을 확인한 뒤 다시 불러와 주세요.' : '팔로우한 에디터의 새 레터를 기다리거나 전체 레터를 둘러보세요.'}</p>{server.data?.letters.status === 'error' ? <button className="ml-button" onClick={server.retry}>레터 다시 불러오기</button> : <Link className="ml-button ml-button-quiet" href="/letter">레터 둘러보기</Link>}</div>}
              {!busy && server.data?.letters.status === 'error' && recommended.length > 0 && <p className="ml-helper">최신 목록 일부를 불러오지 못했어요. <button className="ml-text-link" onClick={server.retry}>다시 불러오기</button></p>}
            </section>

            <section id="ml-saved" className="ml-saved" aria-labelledby="ml-saved-title">
              <div className="ml-section-title"><div><h2 id="ml-saved-title">다시 펼쳐볼 레터 <span className="ml-heading-count">{shelf.ready ? savedTotal : ''}</span></h2><p className="ml-helper">읽고 싶어 담아둔 이야기를 모았어요.</p></div><Link href="/my-lens?tab=archive&kind=letters" className="ml-text-link">내 서랍에서 보기 <ChevronRight size={14} /></Link></div>
              {data.loading || !shelf.ready ? <p className="ml-loading" role="status">저장한 레터를 불러오고 있어요.</p> : !shelf.available ? <div className="ml-saved-empty"><h3>저장한 레터를 불러오지 못했어요</h3><p>연결을 확인하고 다시 불러와 주세요. 저장 기록은 유지돼요.</p><button type="button" className="ml-text-link" onClick={shelf.retry}>저장 레터 다시 불러오기</button></div> : savedLetters.length ? <><div className="ml-saved-list">{savedLetters.slice(0, savedExpanded ? undefined : 3).map((letter) => <DashboardLetter key={letter.slug} letter={letter} saved onSave={() => toggleSaved(letter.slug)} />)}</div>{savedLetters.length > 3 && <button className="ml-more" onClick={() => setSavedExpanded((value) => !value)}>{savedExpanded ? '접기' : `저장한 레터 ${savedLetters.length}편 모두 보기`}</button>}</> : <div className="ml-saved-empty"><Bookmark size={23} aria-hidden /><h3>{shelf.saved.length ? '저장 레터의 내용을 불러오지 못했어요' : '마음에 드는 레터를 담아보세요'}</h3><p>{shelf.saved.length ? '전체 목록을 확인하거나 새로운 레터를 만나보세요.' : '레터 옆의 북마크를 누르면 이곳에서 이어볼 수 있어요.'}</p><Link href="/letter" className="ml-text-link">레터 둘러보기 <ArrowUpRight size={15} /></Link></div>}
            </section>

            </>}
            {tab === 'archive' && <><BrowserBookmarksImport owner={user!.userId} letters={letters} onImported={()=>{shelf.retry();server.retry();}} /><DrawerPanel key={`${archive.owner ?? 'browser'}:${params.get('kind')}`} initialFilter={params.get('kind') === 'letters' ? 'letters' : params.get('kind') === 'articles' ? 'articles' : 'sentences'} articleShelf={articleShelf} archive={archive} articles={news.articles} letters={letters} savedSlugs={shelf.saved} lettersLoading={data.loading || !shelf.ready} lettersFailed={!shelf.available} retryLetters={()=>{data.retry();shelf.retry();}} onSave={toggleSaved} /></>}
          </div>

          {tab === 'home' && <aside className="ml-rail" aria-label="내 기록과 구독">
            <ArchiveDiscovery archive={homeArchive} articles={news.articles} letters={letters} />
            <section className="ml-editors" aria-labelledby="ml-editors-title"><div className="ml-section-title"><h2 id="ml-editors-title">내가 팔로우한 에디터</h2><span className="ml-heading-count">{follow.ready ? follow.ids.length : '·'}</span></div>{!follow.ready ? <p className="ml-helper" role="status">팔로우한 에디터를 불러오고 있어요.</p> : !follow.available ? <p className="ml-helper">에디터 목록을 불러오지 못했어요.</p> : follow.followed.length ? <div className="ml-editor-list">{follow.followed.map((editor) => <Link key={editor.id} href={`/letter/editors/${editor.id}`} className="ml-editor">{editor.image && <Image src={editor.image} alt="" width={38} height={38} />}<span><strong>{editor.name}</strong></span><ChevronRight size={15} /></Link>)}</div> : <p className="ml-helper">관심 분야가 맞는 에디터를 팔로우하면 새 레터를 찾기 쉬워져요.</p>}{follow.items.filter(item=>item.active&&!follow.followed.some(editor=>editor.id===item.id)).map(item=><div key={item.id}><Link href={item.href} className="ml-text-link">{item.name}</Link><button type="button" className="ml-text-link" disabled={follow.pending} onClick={()=>void follow.toggle(item.id)}>팔로우 해제</button></div>)}{follow.items.filter(item=>!item.active).map(item=><p className="ml-helper" key={item.id}>{item.name} · 활동 중지 <button type="button" disabled={follow.pending} onClick={()=>void follow.toggle(item.id)}>팔로우 해제</button></p>)}<Link href="/letter" className="ml-text-link">에디터 만나보기 <ArrowUpRight size={15} /></Link></section>
            <section className="ml-notify" aria-labelledby="ml-notify-title"><Bell size={22} aria-hidden /><h2 id="ml-notify-title">관심 있는 소식,<br />메일로도 만나요.</h2><p>선택한 에디터의 새 레터를 이메일로 받아보세요. 기존 이메일 구독은 그대로 유지돼요.</p><button type="button" className="ml-button" onClick={() => setSubscribeOpen(true)} disabled={!follow.ready || !follow.available}>레터 이메일 구독</button><p className="ml-storage-note">구독 신청 후 이메일 확인이 필요해요.</p></section>
          </aside>}
        </div>
        <footer className="ml-footer"><span>AI LENS</span><p>나의 관심을 따라, 뉴스 너머의 맥락까지.</p></footer>
        <SubscribeDialog open={subscribeOpen} onClose={() => setSubscribeOpen(false)} editors={follow.followed} title="에디터의 새 레터를 이메일로 받아보세요" source="my_lens" />
      </main>
    </ArticlePageShell>
  );
}
