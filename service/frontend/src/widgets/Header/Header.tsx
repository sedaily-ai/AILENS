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
  /** true면 next/link 대신 일반 <a> 하드 내비게이션 — 다른 Next.js 앱(zone)으로
   *  rewrite되는 경로용 (shared/lib/headerTabs.ts의 HeaderTab과 동일 필드). */
  hardNav?: boolean;
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
//
// 회색 알약(bg-gray-100) active 표시 → 밑줄로 교체(2026-08-16, 사용자 확인) —
// 에디토리얼 매체 레퍼런스 리서치 결과 "배경을 채우기보다 절제된 밑줄이
// 매거진 무드에 더 맞는다"는 판단. 액센트 컬러는 로고 옆 BETA 배지와 동일한
// 파랑(#1d4ed8)으로 통일 — 챗봇 아이콘의 보라(violet-500)와 섞이지 않게
// 탭 액센트는 이 하나로만 쓴다. 밑줄은 TabUnderline이 그린다(group-hover로
// 슬라이드인).
const TAB_ACCENT = '#1d4ed8';
const TAB_BASE =
  'group relative px-2.5 lg:px-4 py-2 text-[13px] lg:text-[15px] font-semibold transition-colors duration-200 whitespace-nowrap flex-shrink-0';
const TAB_ACTIVE = 'text-gray-900';
const TAB_IDLE = 'text-gray-600 hover:text-gray-900';
// tier: 'extra' — 코어보다는 작고 옅지만, 이전만큼 위축되진 않게(11px는
// 레퍼런스 대비 너무 작았다). 뉴닉의 얇은 텍스트 목차 톤 참고(2026-08-06).
// letter-spacing을 살짝 벌려(0.01em) 빽빽함 완화(2026-08-16).
const TAB_EXTRA_BASE =
  'group relative px-2 lg:px-3 py-2 text-[12.5px] lg:text-[14px] font-normal tracking-[0.01em] transition-colors duration-200 whitespace-nowrap flex-shrink-0';
const TAB_EXTRA_IDLE = 'text-gray-400 hover:text-gray-600';

// active 탭 밑에 항상, idle 탭은 호버 시에만 슬라이드인 되는 밑줄.
// 부모(DesktopTab의 a/Link/button/span)가 TAB_BASE의 `group relative`를
// 가지고 있어야 group-hover가 동작한다.
function TabUnderline({ active }: { active?: boolean }) {
  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute inset-x-2 lg:inset-x-3 -bottom-px h-[2px] origin-left rounded-full transition-transform duration-200 ${
        active ? 'scale-x-100' : 'scale-x-0 group-hover:scale-x-100'
      }`}
      style={{ background: TAB_ACCENT }}
    />
  );
}

// "시선" 전용 손그림 눈 아이콘 — 점 액센트로는 부족하다는 사용자 피드백
// (2026-08-16)으로 교체. 9개 탭 전부를 아이콘화하는 대신 서비스 핵심
// 차별화 탭 하나에만 일러스트 포인트를 준다. features/news-feed의
// HandDrawnIcons(카드 썸네일용, 96x96·디테일 많음)와 같은 스트로크 톤
// (검정 라인 + accent 포인트, 그라데이션 없음)을 쓰되, 13~15px 텍스트
// 옆에 인라인으로 들어가는 크기라 디테일을 최소화해 24x24로 새로 그렸다
// — 그 아이콘들을 그대로 축소하면 이 크기에서 뭉개져 안 읽힌다.
function LensEyeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M2 12 Q12 3.5 22 12 Q12 20.5 2 12 Z"
        stroke="#1a1a1a"
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx="12" cy="12" r="3.4" stroke={TAB_ACCENT} strokeWidth={1.5} />
      <circle cx="12.9" cy="10.9" r="1" fill={TAB_ACCENT} />
    </svg>
  );
}

function TabLabel({ tab }: { tab: HeaderTab }) {
  // "시선"만 텍스트 앞에 작은 손그림 눈 아이콘 — 위 LensEyeIcon 참조.
  const isFlagship = tab.key === 'lens';
  return (
    <span className="inline-flex items-center gap-1.5">
      {isFlagship && <LensEyeIcon className="w-[15px] h-[15px] flex-shrink-0 -mt-px" />}
      {tab.label}
      {tab.soon && (
        <span className="px-1.5 py-0.5 bg-gray-100 text-gray-500 text-[9px] font-semibold rounded-full tracking-wide">
          SOON
        </span>
      )}
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
    // hardNav 탭(다른 zone으로 rewrite되는 경로)은 next/link 소프트
    // 내비게이션을 쓰면 안 된다 — 클라이언트 라우터가 이 앱의 RSC 포맷으로
    // 응답을 해석하려다 화면이 안 바뀌는 채로 URL만 바뀌는 문제가 생긴다.
    // 일반 <a>로 풀 페이지 로드를 강제해서 대상 zone이 처음부터 새로 뜨게 한다.
    if (tab.hardNav) {
      return (
        <a href={href} className={cls}>
          <TabLabel tab={tab} />
          <TabUnderline active={tab.active} />
        </a>
      );
    }
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
        <TabUnderline active={tab.active} />
      </Link>
    );
  }
  if (tab.onClick) {
    return (
      <button onClick={tab.onClick} className={cls}>
        <TabLabel tab={tab} />
        <TabUnderline active={tab.active} />
      </button>
    );
  }
  return (
    <span className={cls}>
      <TabLabel tab={tab} />
      <TabUnderline active={tab.active} />
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
              if (tab.hardNav) {
                return (
                  <a key={tab.key} href={tab.href} onClick={deferClose} className={cls}>
                    <TabLabel tab={tab} />
                  </a>
                );
              }
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
          <nav className="hidden md:flex items-center gap-1 flex-1 overflow-x-auto scrollbar-hide">
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
