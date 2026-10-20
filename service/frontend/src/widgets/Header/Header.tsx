'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { UserMenu } from '@/features/auth';
import { prefetchSearchIndex } from '@/shared/lib/search/searchIndex';

function trapDialogTab(e: React.KeyboardEvent<HTMLDialogElement>) {
  if (e.key !== 'Tab') return;
  const dialog = e.currentTarget;
  const controls = Array.from(dialog.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), iframe, [tabindex]:not([tabindex="-1"])'))
    .filter((el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden');
  const first = controls[0];
  const last = controls.at(-1);
  const active = document.activeElement;
  if (!first) { e.preventDefault(); dialog.focus(); return; }
  if (active === dialog || !dialog.contains(active) || (e.shiftKey ? active === first : active === last)) {
    e.preventDefault();
    (e.shiftKey ? last : first)?.focus();
  }
}

/**
 * 전 페이지 공용 상단 헤더 (7곳 복붙 통합).
 * - 데스크탑(md+): 기존 마크업 그대로 — 가로 탭바.
 * - 모바일(<md): 탭은 햄버거 드로어로 접음(잘림/가로스크롤 해소).
 * 탭은 호출부가 buildHeaderTabs()(shared/lib/headerTabs.ts)로 만든 href 이동 탭 배열을 넘긴다.
 */

export type HeaderTab = {
  key: string;
  label: string;
  active?: boolean;
  href: string;
  // 'more': 콘텐츠 브라우징이 아닌 부가 기능(타임라인·게임 등)으로, 데스크톱 1차 줄에는 두지 않는다.
  // 생략하면 'core'.
  tier?: 'core' | 'more';
};

interface HeaderProps {
  tabs: HeaderTab[];
  onSearch: () => void;
  searchOpen?: boolean;
  frosted?: boolean;
}

// 코어 탭은 15~16px대로 키워 존재감을 준다. active 표시는 파란색·굵기이며, 액센트 컬러는 로고 옆 BETA 배지와 같은 파랑(#1d4ed8)이다
// (챗봇 아이콘의 보라(violet-500)와 섞이지 않도록 탭 액센트는 이 하나로만 쓴다). 선택 하단선은 사용하지 않는다.
const TAB_BASE =
  'group relative px-2.5 lg:px-4 py-2 text-[13px] lg:text-[15px] transition-colors duration-200 whitespace-nowrap flex-shrink-0';
const TAB_ACTIVE = 'text-[#1d4ed8] font-bold';
const TAB_IDLE = 'font-semibold text-gray-600 hover:text-gray-900';

// "레터" 전용 손그림 아이콘: 크림색 편지지 + 빨간 우체통. 탭에 마우스를 올리면(부모 TAB_BASE의 group-hover) 한 편의 짧은 연출이 나온다:
// 편지가 살짝 움츠렸다가 → 곡선으로 날아가 → 우체통 뚜껑이 열리고 → 편지가 들어가며 → 우체통이 눌렸다 돌아오고 → 깃발이 튀어 오르며 작은 반짝임이 터진다(약 1.25초). 마우스를 떼면 편지가 다시 나타난다.
// 손그림 스트로크 톤(검정 라인, 그라데이션 없음)이고, 색은 따뜻한 크림·코랄·빨강·노랑만 쓴다. 외부 라이브러리 없이 CSS 키프레임만 쓴다.
const LETTER_ICON_CSS = `
  .lt-mb-env, .lt-mb-lid, .lt-mb-box, .lt-mb-flag, .lt-mb-spark { transform-box: fill-box; }
  .lt-mb-env { transform-origin: center; transform: rotate(-5deg); animation: lt-env-back .5s cubic-bezier(.3,1.3,.5,1); }
  .lt-mb-lid { transform-origin: 0% 50%; }
  .lt-mb-box { transform-origin: 50% 100%; }
  .lt-mb-flag { transform-origin: 0% 100%; transform: rotate(62deg); animation: lt-flag-back .35s ease-in; }
  .lt-mb-spark { transform-origin: center; opacity: 0; }
  .group:hover .lt-mb-env { animation: lt-env-go 1.25s cubic-bezier(.45,.05,.35,1) forwards; }
  .group:hover .lt-mb-lid { animation: lt-lid 1.25s ease-in-out; }
  .group:hover .lt-mb-box { animation: lt-box 1.25s ease-out; }
  .group:hover .lt-mb-flag { animation: lt-flag 1.25s cubic-bezier(.3,1.5,.5,1) forwards; }
  .group:hover .lt-mb-spark { animation: lt-spark 1.25s ease-out; }
  @keyframes lt-env-back { 0% { opacity: 0; transform: translate(6px,-2px) rotate(-5deg) scale(.6); } 100% { opacity: 1; transform: rotate(-5deg); } }
  @keyframes lt-env-go {
    0% { transform: translate(0,0) rotate(-5deg) scale(1); opacity: 1; }
    12% { transform: translate(-1.6px,1.2px) rotate(-12deg) scale(1); }
    40% { transform: translate(10px,-9px) rotate(-18deg) scale(.95); }
    66% { transform: translate(22px,-8px) rotate(-8deg) scale(.8); }
    82% { transform: translate(25px,-1px) rotate(0deg) scale(.62); opacity: 1; }
    96% { transform: translate(25px,5px) rotate(0deg) scale(.5); opacity: 0; }
    100% { transform: translate(25px,5px) rotate(0deg) scale(.5); opacity: 0; }
  }
  @keyframes lt-lid { 0%, 28% { transform: rotate(0deg); } 42%, 80% { transform: rotate(-72deg); } 90% { transform: rotate(5deg); } 100% { transform: rotate(0deg); } }
  @keyframes lt-box { 0%, 84% { transform: scale(1,1); } 88% { transform: scale(1.08,.9); } 94% { transform: scale(.97,1.04); } 100% { transform: scale(1,1); } }
  @keyframes lt-flag-back { 0% { transform: rotate(0deg); } 100% { transform: rotate(62deg); } }
  @keyframes lt-flag { 0%, 84% { transform: rotate(62deg); } 92% { transform: rotate(-14deg); } 100% { transform: rotate(0deg); } }
  @keyframes lt-spark { 0%, 84% { opacity: 0; transform: scale(.2); } 90% { opacity: 1; transform: scale(1); } 100% { opacity: 0; transform: scale(1.5); } }
  @media (prefers-reduced-motion: reduce) {
    .lt-mb-env, .lt-mb-flag { animation: none !important; }
    .group:hover .lt-mb-env, .group:hover .lt-mb-lid, .group:hover .lt-mb-box, .group:hover .lt-mb-flag, .group:hover .lt-mb-spark { animation: none !important; }
  }
`;
function LetterMailboxIcon({ className }: { className?: string }) {
  const ink = '#1a1a1a';
  const red = '#e8604c';
  return (
    <>
      <style>{LETTER_ICON_CSS}</style>
      <svg viewBox="0 0 50 28" fill="none" className={className} aria-hidden>
        {/* 편지지(우체통 뒤에 그려서, 다가가면 우체통에 가려지며 들어가는 것처럼 보인다) */}
        <g className="lt-mb-env">
          <path d="M3 9.2 Q12 8.2 21 9 L20.6 22 Q12 22.9 3.4 22.2 Z" fill="#fff3d4" stroke={ink} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
          <path d="M3.5 9.7 Q12 17.4 20.5 9.5" stroke="#e8735a" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />
          <path d="M3.6 21.8 L10 15.6 M20.4 21.6 L14 15.6" stroke={ink} strokeWidth={0.9} strokeLinecap="round" opacity={0.45} />
          <circle cx="12" cy="15.6" r="1.9" fill="#e8735a" />
          <path d="M11.3 15 Q11.6 14.5 12.2 14.4" stroke="#fff" strokeWidth={0.7} strokeLinecap="round" opacity={0.85} />
        </g>
        {/* 우체통 */}
        <g className="lt-mb-box">
          <ellipse cx="37.6" cy="26.3" rx="8.6" ry="1.2" fill={ink} opacity={0.12} />
          <path d="M33.6 23 V26 M42.2 23 V26" stroke={ink} strokeWidth={1.5} strokeLinecap="round" />
          <path d="M30.2 23.4 L30 12 Q30 6.6 37.6 6.6 Q45.2 6.6 45 12 L44.8 23.4 Z" fill={red} stroke={ink} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
          <path d="M41.2 7.3 Q44.8 8.3 45 12 L44.8 23.2 H41.4 Z" fill="#c9422f" />
          <path d="M32.4 10.6 Q32.6 8.6 34.4 7.9" stroke="#fff" strokeWidth={1} strokeLinecap="round" opacity={0.8} />
          <path d="M32.4 13 Q37.6 12 42.8 13 L42.8 14.7 Q37.6 13.7 32.4 14.7 Z" fill={ink} />
          <g className="lt-mb-lid">
            <path d="M31.8 12.5 Q37.6 11.3 43.4 12.5 L43.4 15 Q37.6 13.8 31.8 15 Z" fill="#f08472" stroke={ink} strokeWidth={1.3} strokeLinejoin="round" />
          </g>
          <path d="M33.4 17.6 H41.8 V21 H33.4 Z" fill="#fff3d4" stroke={ink} strokeWidth={1} strokeLinejoin="round" />
          <path d="M35.2 19.3 H40" stroke="#e8735a" strokeWidth={1} strokeLinecap="round" />
          <path d="M29 23.7 Q37.5 24.3 46 23.7" stroke={ink} strokeWidth={1.5} strokeLinecap="round" />
        </g>
        <g className="lt-mb-flag">
          <path d="M45 14.8 L48.4 15 L48.3 10.8 L45 11.2" fill="#f6c453" stroke={ink} strokeWidth={1.2} strokeLinejoin="round" strokeLinecap="round" />
        </g>
        {/* 투입 직후 터지는 작은 반짝임 */}
        <g className="lt-mb-spark">
          <path d="M37.6 2.2 V4.4 M33.4 3.4 L34.7 5 M41.8 3.4 L40.5 5" stroke="#f6c453" strokeWidth={1.4} strokeLinecap="round" />
        </g>
      </svg>
    </>
  );
}

function TabLabel({ tab }: { tab: HeaderTab }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-grid">
        <span className="col-start-1 row-start-1">{tab.label}</span>
        <span aria-hidden className="col-start-1 row-start-1 invisible font-bold">{tab.label}</span>
      </span>
      {tab.key === 'letter' && <LetterMailboxIcon className="w-[40px] h-[22px] flex-shrink-0 -mt-px" />}
    </span>
  );
}

function DesktopTab({ tab }: { tab: HeaderTab }) {
  const router = useRouter();
  const cls = `${TAB_BASE} ${tab.active ? TAB_ACTIVE : TAB_IDLE}`;
  const href = tab.href;
  // hover/touch 시점에 router.prefetch — viewport 자동 prefetch 위에
  // 강한 의도 신호로 청크/RSC 가 더 빨리 따뜻해진다.
  const warm = () => {
    try { router.prefetch(href); } catch { /* noop */ }
  };
  return (
    <Link
      href={href}
      aria-current={tab.active ? 'page' : undefined}
      className={cls}
      onMouseEnter={warm}
      onFocus={warm}
      onTouchStart={warm}
    >
      <TabLabel tab={tab} />
    </Link>
  );
}

function MobileDrawer({
  tabs,
  onClose,
}: {
  tabs: HeaderTab[];
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 포털은 클라이언트 마운트 후 1회만(SSR/정적 export 가드)
    setMounted(true);
  }, []);
  useEffect(() => {
    if (!mounted) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const opener = document.activeElement;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    dialog.showModal();
    const desktop = window.matchMedia('(min-width: 768px)');
    const closeOnDesktop = () => { if (desktop.matches) onClose(); };
    desktop.addEventListener('change', closeOnDesktop);
    closeOnDesktop();
    return () => {
      desktop.removeEventListener('change', closeOnDesktop);
      dialog.close();
      document.body.style.overflow = overflow;
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus({ preventScroll: true });
    };
  }, [mounted, onClose]);
  if (!mounted) return null;

  const rowCls =
    'w-full text-left flex items-center gap-2 px-5 py-4 text-[16px] rounded-xl transition-colors';

  return createPortal(
    <dialog
      ref={dialogRef}
      tabIndex={-1}
      onKeyDown={trapDialogTab}
      onCancel={(e) => { e.preventDefault(); onClose(); }}
      className="hdr-drawer md:hidden"
      style={{ position: 'fixed', inset: 0, zIndex: 200, width: '100%', height: '100%', maxWidth: 'none', maxHeight: 'none', margin: 0, padding: 0, border: 0, background: 'transparent', color: 'inherit' }}
      aria-modal="true"
      aria-label="메뉴"
    >
      <div
        onClick={onClose}
        style={{ position: 'absolute', inset: 0, background: 'rgba(17,17,17,0.35)' }}
      />
      <div
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          height: '100%',
          width: 'min(75vw, 320px)',
          background: '#fff',
          boxShadow: '-12px 0 40px -16px rgba(0,0,0,0.25)',
          display: 'flex',
          flexDirection: 'column',
          animation: 'hdr-slide 220ms cubic-bezier(.22,1,.36,1) both',
        }}
      >
        <style>{`.hdr-drawer::backdrop { background: transparent; } @keyframes hdr-slide{from{transform:translateX(100%)}to{transform:translateX(0)}}`}</style>
        <div className="flex items-center justify-between px-5 h-[56px] border-b border-gray-100">
          <span className="text-[15px] font-bold text-gray-900">메뉴</span>
          <button
            onClick={onClose}
            aria-label="닫기"
            className="p-2 -mr-2 text-gray-500 hover:text-gray-900"
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        {/* 로그인. 데스크톱은 헤더 우측 UserMenu가 상시 보이지만 모바일은 그 자리가 숨겨져(md:flex) 있으므로, 드로어 최상단에 같은 UserMenu를 재사용한다. */}
        <div className="px-5 py-3 border-b border-gray-100">
          <UserMenu />
        </div>
        <nav className="flex-1 overflow-y-auto p-3 flex flex-col gap-1">
          {tabs.map((tab) => {
            const cls = `${rowCls} ${tab.active ? TAB_ACTIVE : 'font-semibold text-gray-600 hover:text-gray-900'}`;
            // 메뉴 닫기를 다음 frame 으로 미뤄 Link 의 navigation 이 먼저 commit 되도록.
            // (동기로 close 하면 panel unmount → navigation race cancel 가능)
            const deferClose = () => requestAnimationFrame(onClose);
            return (
              <Link key={tab.key} href={tab.href} onClick={deferClose} className={cls} aria-current={tab.active ? 'page' : undefined}>
                <TabLabel tab={tab} />
              </Link>
            );
          })}
        </nav>
      </div>
    </dialog>,
    document.body,
  );
}

export function Header({ tabs, onSearch, searchOpen = false, frosted }: HeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  // 데스크톱 1차 줄에는 tier:'more'(타임라인·게임) 탭을 두지 않는다("더보기" 드롭다운은 2026-10-11 삭제). 모바일 드로어는 전체 목록을 그대로 보여준다.
  const primaryTabs = tabs.filter((t) => t.tier !== 'more');
  const primaryNavRef = useRef<HTMLElement>(null);
  const activeKey = primaryTabs.find((tab) => tab.active)?.key;
  useEffect(() => {
    const nav = primaryNavRef.current;
    if (!nav) return;
    const revealActive = () => {
      if (!nav.clientWidth) return;
      const active = nav.querySelector<HTMLElement>('[aria-current="page"]');
      if (!active) return;
      const parent = nav.getBoundingClientRect();
      const item = active.getBoundingClientRect();
      if (item.left < parent.left) nav.scrollLeft += item.left - parent.left;
      else if (item.right > parent.right) nav.scrollLeft += item.right - parent.right;
    };
    revealActive();
    const observer = new ResizeObserver(revealActive);
    observer.observe(nav);
    return () => observer.disconnect();
  }, [activeKey]);

  const logoCls =
    'text-[20px] font-bold tracking-tight flex-shrink-0 transition-colors duration-200 text-gray-900 hover:text-blue-600 inline-flex items-center gap-2';
  const betaBadge = (
    <span
      aria-label="beta"
      className="text-[9.5px] font-bold tracking-[0.14em] uppercase rounded px-1.5 py-[3px] leading-none"
      style={{ background: '#dbeafe', color: '#1d4ed8' }}
    >
      Beta
    </span>
  );

  return (
    <header
      className={`sticky top-0 z-[100] border-b border-gray-100 ${
        frosted ? 'bg-white/95 backdrop-blur-md' : 'bg-white'
      }`}
    >
      {/* 페이지가 바뀌어도 브랜드·주요 서비스 탭·검색의 위치를 유지한다. */}
      <div className="mx-auto" style={{ maxWidth: 1320, paddingInline: 'clamp(24px, 3.5vw, 44px)' }}>
        <div className="flex items-center h-[56px] gap-4 md:gap-10">
          <Link href="/" className={logoCls}>
            <span>AI LENS</span>
            {betaBadge}
          </Link>

          {/* 공통 탐색을 유지하고 현재 탭은 파랑·굵기로 표시한다. */}
          <nav ref={primaryNavRef} aria-label="주요 서비스" className="hidden md:flex min-w-0 items-center gap-1 flex-1 overflow-x-auto scrollbar-hide">
              {primaryTabs.map((tab) => (
                <DesktopTab key={tab.key} tab={tab} />
              ))}
          </nav>

          <div className="flex items-center gap-2 flex-shrink-0 ml-auto">
            {/* 아이콘 전용 검색 버튼. 클릭하면 검색 패널(SearchOverlay)이 뜬다. */}
            <button
              onClick={onSearch}
              onPointerEnter={prefetchSearchIndex}
              onFocus={prefetchSearchIndex}
              onTouchStart={prefetchSearchIndex}
              className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-colors"
              data-search-toggle
              aria-haspopup="dialog"
              aria-expanded={searchOpen}
              aria-label={searchOpen ? '전체 메뉴와 검색 닫기' : '전체 메뉴와 검색'}
              title={searchOpen ? '전체 메뉴와 검색 닫기' : '전체 메뉴 · 검색'}
            >
              {searchOpen ? (
                <svg className="w-[22px] h-[22px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden>
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              ) : (
                <>
                  {/* 서울경제(sedaily.com)의 "통합검색 & 사이트맵" 아이콘처럼 햄버거 막대와 돋보기를 한 아이콘에 담는다: 누르면 전체 메뉴와 검색이 함께 열린다. */}
                  {/* 모바일은 오른쪽에 햄버거(탭 드로어)가 따로 있으므로 돋보기만 보여 아이콘이 두 개 겹쳐 보이지 않게 한다. */}
                  <svg className="w-[22px] h-[22px] md:hidden" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden>
                    <circle cx="11" cy="11" r="6.5" />
                    <path d="M16 16 20.5 20.5" />
                  </svg>
                  <svg className="hidden md:block w-[22px] h-[22px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden>
                    <path d="M3 6.5h9.5M3 12h6M3 17.5h9.5" />
                    <circle cx="16.4" cy="11.6" r="4.1" />
                    <path d="M19.4 14.6 21.5 16.7" />
                  </svg>
                </>
              )}
            </button>
            {/* '둘러보기'(서비스 소개) 상시 링크는 두지 않는다. /onboarding 랜딩은 외부 유입 경로로만 쓴다. */}
            {/* 로그인 / 사용자 메뉴 — 미로그인 시 '로그인' 버튼, 로그인 시 드롭다운 */}
            <div className="hidden md:flex items-center">
              <UserMenu />
            </div>
            <button
              onClick={() => setMenuOpen(true)}
              className="md:hidden p-2 -mr-1 text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-colors"
              aria-label="메뉴 열기"
            >
              <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {menuOpen && <MobileDrawer tabs={tabs} onClose={closeMenu} />}
    </header>
  );
}
