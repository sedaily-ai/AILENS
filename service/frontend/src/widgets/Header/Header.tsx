'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { UserMenu } from '@/features/auth';

/**
 * 전 페이지 공용 상단 헤더 (7곳 복붙 통합).
 * - 데스크탑(md+): 기존 마크업 그대로 — 가로 탭바.
 * - 모바일(<md): 탭은 햄버거 드로어로 접음(잘림/가로스크롤 해소).
 * 탭의 동작(상태형 onClick / 라우트형 href / 비라우트 active span)은
 * 호출부가 tabs 배열로 그대로 넘겨 페이지별 동작을 보존한다.
 */

export type HeaderTab = {
  key: string;
  label: string;
  active?: boolean;
  soon?: boolean;
  href?: string;
  onClick?: () => void;
  // 'extra' — 사주·타임라인·게임·웹툰처럼 "덤" 성격의 탭. 드롭다운으로
  // 숨기는 대신(클릭 한 번 더 필요해서 덜 "효율적"), 뉴닉 참고 — 개수를
  // 줄이지 않고 무게(굵기·크기·색)만 낮춰서 "본체 vs 덤"을 구분한다
  // (2026-08-06). 생략하면 기본값 'core'.
  tier?: 'core' | 'extra';
};

interface HeaderProps {
  tabs: HeaderTab[];
  onSearch: () => void;
  logoHref?: string;
  onLogo?: () => void;
  frosted?: boolean;
}

// 폰트 크기(2026-08-06 확대) — 컬리/밑미/밑미도구상점 등 레퍼런스 대비
// 기존 12~14px가 위축돼 보인다는 지적. 코어 탭은 15~16px대로 키워
// 존재감을 준다(레퍼런스들도 탭 텍스트가 다 큼직하고 자신감 있음).
const TAB_BASE =
  'px-2.5 lg:px-4 py-2 text-[13px] lg:text-[15px] font-semibold rounded-lg transition-colors duration-200 whitespace-nowrap flex-shrink-0';
const TAB_ACTIVE = 'bg-gray-100 text-gray-900';
const TAB_IDLE = 'text-gray-600 hover:text-gray-900 hover:bg-gray-50';
// tier: 'extra' — 코어보다는 작고 옅지만, 이전만큼 위축되진 않게(11px는
// 레퍼런스 대비 너무 작았다). 뉴닉의 얇은 텍스트 목차 톤 참고(2026-08-06).
const TAB_EXTRA_BASE =
  'px-2 lg:px-3 py-2 text-[12.5px] lg:text-[14px] font-normal rounded-lg transition-colors duration-200 whitespace-nowrap flex-shrink-0';
const TAB_EXTRA_IDLE = 'text-gray-400 hover:text-gray-600 hover:bg-gray-50';

function TabLabel({ tab }: { tab: HeaderTab }) {
  if (!tab.soon) return <>{tab.label}</>;
  return (
    <span className="flex items-center gap-1">
      {tab.label}
      <span className="px-1.5 py-0.5 bg-gray-100 text-gray-500 text-[9px] font-semibold rounded-full tracking-wide">
        SOON
      </span>
    </span>
  );
}

function DesktopTab({ tab }: { tab: HeaderTab }) {
  const router = useRouter();
  const base = tab.tier === 'extra' ? TAB_EXTRA_BASE : TAB_BASE;
  const idle = tab.tier === 'extra' ? TAB_EXTRA_IDLE : TAB_IDLE;
  const cls = `${base} ${tab.active ? TAB_ACTIVE : idle}`;
  if (tab.href) {
    const href = tab.href;
    // hover/touch 시점에 router.prefetch — viewport 자동 prefetch 위에
    // 강한 의도 신호로 청크/RSC 가 더 빨리 따뜻해진다.
    const warm = () => {
      try { router.prefetch(href); } catch { /* noop */ }
    };
    return (
      <Link
        href={href}
        className={cls}
        onMouseEnter={warm}
        onFocus={warm}
        onTouchStart={warm}
      >
        <TabLabel tab={tab} />
      </Link>
    );
  }
  if (tab.onClick) {
    return (
      <button onClick={tab.onClick} className={cls}>
        <TabLabel tab={tab} />
      </button>
    );
  }
  return (
    <span className={cls}>
      <TabLabel tab={tab} />
    </span>
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
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 포털은 클라이언트 마운트 후 1회만(SSR/정적 export 가드)
    setMounted(true);
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = overflow;
    };
  }, []);
  if (!mounted) return null;

  const rowCls =
    'w-full text-left flex items-center gap-2 px-5 py-4 text-[16px] font-semibold rounded-xl transition-colors';

  return createPortal(
    <div
      className="md:hidden"
      style={{ position: 'fixed', inset: 0, zIndex: 200 }}
      role="dialog"
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
          width: 'min(78vw, 320px)',
          background: '#fff',
          boxShadow: '-12px 0 40px -16px rgba(0,0,0,0.25)',
          display: 'flex',
          flexDirection: 'column',
          animation: 'hdr-slide 220ms cubic-bezier(.22,1,.36,1) both',
        }}
      >
        <style>{`@keyframes hdr-slide{from{transform:translateX(100%)}to{transform:translateX(0)}}`}</style>
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
        <nav className="flex-1 overflow-y-auto p-3 flex flex-col gap-1">
          {tabs.map((tab) => {
            const cls = `${rowCls} ${tab.active ? 'bg-gray-100 text-gray-900' : 'text-gray-600 hover:bg-gray-50'}`;
            // 메뉴 닫기를 다음 frame 으로 미뤄 Link 의 navigation 이 먼저 commit 되도록.
            // (동기로 close 하면 panel unmount → navigation race cancel 가능)
            const deferClose = () => requestAnimationFrame(onClose);
            const handle = () => {
              tab.onClick?.();
              deferClose();
            };
            if (tab.href) {
              return (
                <Link key={tab.key} href={tab.href} onClick={deferClose} className={cls}>
                  <TabLabel tab={tab} />
                </Link>
              );
            }
            return (
              <button key={tab.key} onClick={handle} className={cls}>
                <TabLabel tab={tab} />
              </button>
            );
          })}
        </nav>
      </div>
    </div>,
    document.body,
  );
}

export function Header({ tabs, onSearch, logoHref = '/', onLogo, frosted }: HeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);

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
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6">
        <div className="flex items-center h-[56px] gap-4 md:gap-10">
          {onLogo ? (
            <button onClick={onLogo} className={logoCls}>
              <span>AI LENS</span>
              {betaBadge}
            </button>
          ) : (
            <Link href={logoHref} className={logoCls}>
              <span>AI LENS</span>
              {betaBadge}
            </Link>
          )}

          {/* 데스크탑 탭 — core/extra 구분선은 뺐다(2026-08-11) — 탭이 8개로
              늘면서 "|" 하나로는 굳이 안 나눠도 된다는 피드백, 무게(굵기·색)
              차이만으로 core/extra 구분은 그대로 유지. */}
          <nav className="hidden md:flex items-center gap-0.5 flex-1 overflow-x-auto scrollbar-hide">
            {tabs.map((tab) => (
              <DesktopTab key={tab.key} tab={tab} />
            ))}
          </nav>

          <div className="flex items-center gap-2 flex-shrink-0 ml-auto">
            {/* 검색창처럼 생긴 입력 바로 재설계(2026-08-06) — 실제로는 음성·마크다운
                지원 AI 챗봇인데, 겉모습은 별 아이콘 + "대화" 라벨뿐이라 뭘 누르는
                건지 애매하다는 지적. Notion/Linear류 "Search or ask AI" 패턴처럼
                placeholder 문구가 있는 입력창 모양으로 바꿔 용도를 바로 읽히게 했다. */}
            <button
              onClick={onSearch}
              className="hidden md:flex items-center gap-2 pl-3.5 pr-3 py-1.5 min-w-[176px] lg:min-w-[208px] bg-gray-50 hover:bg-gray-100 border border-gray-200/70 rounded-full transition-colors text-[13px] text-gray-400 group"
            >
              <svg className="w-3.5 h-3.5 text-violet-500 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8L12 2z" />
              </svg>
              <span className="flex-1 text-left truncate group-hover:text-gray-600">이슈에 대해 물어보세요</span>
              <span className="hidden lg:inline text-gray-300 flex-shrink-0">⌘K</span>
            </button>
            <button
              onClick={onSearch}
              className="md:hidden p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-colors"
              aria-label="대화"
            >
              <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="currentColor">
                <path className="text-violet-500" d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8L12 2z" />
              </svg>
            </button>
            {/* '둘러보기'(서비스 소개) 상시 링크 제거(2026-08-06) — 레퍼런스 7곳
                (컬리/밑미/밑미도구상점/29CM/올리브영 등) 중 "우리 서비스 소개"를
                상시 헤더에 두는 곳이 하나도 없었다. 이미 쓰고 있는 사용자에겐
                군더더기 — /onboarding 랜딩 자체는 남기고 외부 유입 경로로만 쓴다. */}
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

      {menuOpen && <MobileDrawer tabs={tabs} onClose={() => setMenuOpen(false)} />}
    </header>
  );
}
