'use client';

import { useEffect, useRef, useState } from 'react';
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
  // 'extra' — 무게(굵기·크기·색)만 낮춰서 1차 줄에 그대로 노출(카테고리
  // 6개가 여기 해당, 2026-08-17). 'more' — 웹툰·영상·사주·타임라인·게임처럼
  // 콘텐츠 브라우징이 아닌 부가 기능들 — 카테고리 6개가 추가되며 1차 줄이
  // 12개까지 늘어나 잘리는 문제가 생겨(사용자 확인), "더보기" 드롭다운으로
  // 옮겼다(2026-08-17, 이전엔 'extra'로 인라인 유지 — 뉴닉 참고해 무게만
  // 낮추는 전략이었는데 카테고리 탭까지 겹치자 더는 안 버텼다). 생략하면
  // 기본값 'core'.
  tier?: 'core' | 'extra' | 'more';
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

// "더보기" 드롭다운(2026-08-17) — 웹툰/영상/사주/타임라인/게임처럼
// 콘텐츠 브라우징이 아닌 부가 기능들을 1차 줄에서 걷어내 한 항목으로
// 묶는다.
//
// 버그였던 것(2026-08-17, 실사용 확인 — "더보기는 지금 눌러도 안나와요"):
// position:absolute 드롭다운을 UserMenu.tsx 패턴 그대로 따라 만들었는데,
// UserMenu는 overflow 없는 컨테이너 안에 있는 반면 이 버튼은
// `<nav className="... overflow-x-auto ...">`(탭이 넘칠 때 가로 스크롤
// 되게 하는 컨테이너) 안에 있다 — CSS 스펙상 overflow-x를 visible이
// 아닌 값으로 주면 overflow-y도 (명시 안 해도) auto로 계산돼, nav가
// 사실상 양쪽 축 다 스크롤 컨테이너가 된다. 그 안의 absolute 드롭다운은
// nav의 얕은 높이(56px) 밖으로 나가는 순간 페이지 위에 떠 보이는 대신
// 그냥 잘려서 안 보인다. 모바일 드로어(MobileDrawer, 바로 아래)가 이미
// 쓰던 createPortal(document.body로 포털) 패턴을 그대로 가져와 해결 —
// 포털된 요소는 버튼의 로컬 상대 위치를 못 쓰므로 getBoundingClientRect로
// 화면 좌표를 직접 계산해 position:fixed로 배치한다.
function MoreTabsMenu({ tabs }: { tabs: HeaderTab[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (btnRef.current?.contains(target)) return;
      if (menuRef.current && !menuRef.current.contains(target)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  if (tabs.length === 0) return null;
  const hasActive = tabs.some((t) => t.active);

  const toggle = () => {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 6, left: r.left });
    }
    setOpen((v) => !v);
  };

  return (
    <div className="relative">
      <button
        ref={btnRef}
        onClick={toggle}
        className={`${TAB_EXTRA_BASE} inline-flex items-center gap-1 ${hasActive ? TAB_ACTIVE : TAB_EXTRA_IDLE}`}
      >
        더보기
        <svg
          className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && pos && createPortal(
        <div
          ref={menuRef}
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: 176, zIndex: 200 }}
          className="bg-white rounded-lg shadow-lg border border-gray-200 py-1.5"
        >
          {tabs.map((tab) => {
            const cls = `w-full px-4 py-2 text-left text-[13.5px] flex items-center gap-2 ${
              tab.active ? 'text-gray-900 font-semibold' : 'text-gray-600 hover:bg-gray-50'
            }`;
            const close = () => setOpen(false);
            if (tab.href) {
              if (tab.hardNav) {
                return (
                  <a key={tab.key} href={tab.href} onClick={close} className={cls}>
                    <TabLabel tab={tab} />
                  </a>
                );
              }
              return (
                <Link
                  key={tab.key}
                  href={tab.href}
                  onClick={close}
                  onMouseEnter={() => {
                    try { router.prefetch(tab.href!); } catch { /* noop */ }
                  }}
                  className={cls}
                >
                  <TabLabel tab={tab} />
                </Link>
              );
            }
            return (
              <button
                key={tab.key}
                onClick={() => {
                  tab.onClick?.();
                  close();
                }}
                className={cls}
              >
                <TabLabel tab={tab} />
              </button>
            );
          })}
        </div>,
        document.body,
      )}
    </div>
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
        {/* 로그인 — 데스크톱은 헤더 우측 UserMenu가 상시 보이지만, 모바일은
            그 자리가 통째로 숨겨져 있어(md:flex) 로그인으로 갈 방법이 "내
            서랍" 탭 안 CTA뿐이었다(2026-08-24, 사용자 지적). 드로어 최상단에
            같은 UserMenu를 그대로 재사용 — 로그인 여부에 따른 버튼/드롭다운
            분기를 새로 만들 필요 없이 기존 컴포넌트 그대로 끌어왔다. */}
        <div className="px-5 py-3 border-b border-gray-100">
          <UserMenu />
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
  // 1차 줄(핵심+카테고리) vs "더보기" 드롭다운(부가 기능) — tier:'more'
  // 참조(shared/lib/headerTabs.ts). 모바일 드로어는 그대로 전체 목록을
  // 보여준다(세로 스크롤이라 굳이 또 접을 이유가 없음).
  const primaryTabs = tabs.filter((t) => t.tier !== 'more');
  const moreTabs = tabs.filter((t) => t.tier === 'more');

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
            {primaryTabs.map((tab) => (
              <DesktopTab key={tab.key} tab={tab} />
            ))}
            <MoreTabsMenu tabs={moreTabs} />
          </nav>

          <div className="flex items-center gap-2 flex-shrink-0 ml-auto">
            {/* 검색창처럼 생긴 입력 바(2026-08-06 설계, Notion/Linear류 "Search or
                ask AI" 패턴)를 아이콘 전용으로 축소(2026-08-17) — 카테고리 탭
                6개가 늘면서 1차 줄이 좁아져(사용자 확인), 모바일에서 이미 쓰던
                아이콘 버튼을 데스크탑까지 확장했다. 클릭하면 여전히 같은
                SmartSearchOverlay가 뜬다 — "펼쳐지는" 지점이 인라인 입력창이
                아니라 오버레이로 옮겨갔을 뿐, 기능 손실은 없다. title로 용도
                힌트는 유지. */}
            {/* 아이콘을 별(AI 신호)에서 돋보기로 교체(2026-08-17, 사용자 피드백
                — "검색 돋보기가 낫지 않으려나요") — 아이콘만 보고는 별 모양이
                뭘 누르는 건지 더 헷갈린다는 지적, 돋보기가 훨씬 직관적. 다만
                이게 실제로는 검색이 아니라 AI 챗봇이라는 신호는 violet 색으로만
                남긴다. */}
            <button
              onClick={onSearch}
              className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-colors"
              aria-label="이슈에 대해 물어보세요"
              title="이슈에 대해 물어보세요 (⌘K)"
            >
              <svg className="w-[18px] h-[18px] text-violet-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <circle cx="11" cy="11" r="7" />
                <path strokeLinecap="round" d="M21 21l-4.3-4.3" />
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
