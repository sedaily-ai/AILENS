'use client';

/**
 * TopNav — PC(lg+) 전용 상단 내비게이션 (phase-05)
 *
 * - 모바일에서는 완전히 숨김 (hidden lg:flex)
 * - 점신 결 톤에 맞춘 미니멀한 상단바
 * - BottomNav와 동일한 탭 구성
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home, ScrollText, Sparkles, BookOpen, MessageCircle, User,
  type LucideIcon,
} from 'lucide-react';
import { useLang } from '@saju/shared/lib/LangContext';
import { SAJU, SERIF } from './sajuTokens';
import { InlineLangToggle } from './InlineLangToggle';

type NavItem = {
  href: string;
  icon: LucideIcon;
  ko: string;
  en: string;
  key: string;
};

// 재운/커리어/이상형/궁합/주역점은 /saju 하위로 편입 — /unse 허브는 폐지 (2026-07-09)
const NAV_ITEMS: NavItem[] = [
  { href: '/',          icon: Home,        ko: '홈',     en: 'Home',       key: 'home' },
  { href: '/saju',      icon: ScrollText,  ko: '사주',   en: 'Saju',       key: 'saju' },
  { href: '/character', icon: Sparkles,    ko: '캐릭터', en: 'Characters', key: 'character' },
  { href: '/blog',      icon: BookOpen,    ko: '블로그', en: 'Blog',       key: 'blog' },
  { href: '/chat',      icon: MessageCircle, ko: '챗봇', en: 'Chat',       key: 'chat' },
];

export function TopNav() {
  const { t, localePath } = useLang();
  const pathname = usePathname();

  function isActive(href: string) {
    if (!pathname) return false;
    // /saju 마운트 프리픽스 제거 (AILENS 안에 내장된 앱이라 실제 경로는 /saju/... 로 시작)
    const mounted = pathname.startsWith('/saju/') ? pathname.slice(5) || '/' : pathname === '/saju' ? '/' : pathname;
    const bare = mounted.startsWith('/en/') ? mounted.slice(3) : mounted === '/en' ? '/' : mounted;
    if (href === '/') return bare === '/';
    return bare.startsWith(href);
  }

  return (
    <header
      className="sticky top-0 z-50 w-full"
      style={{
        background: 'rgba(255,255,255,0.92)',
        backdropFilter: 'saturate(180%) blur(14px)',
        WebkitBackdropFilter: 'saturate(180%) blur(14px)',
        borderBottom: `1px solid ${SAJU.line}`,
      }}
    >
      <div className="max-w-[1080px] mx-auto px-6 flex items-center justify-between h-14">
        {/* 로고 / 브랜드 */}
        <Link href={localePath('/')} className="flex items-center gap-2 shrink-0">
          <span
            style={{
              fontFamily: SERIF,
              fontWeight: 900,
              fontSize: 22,
              color: SAJU.ink,
              letterSpacing: '-0.02em',
            }}
          >
            운<span style={{ color: SAJU.warmDeep }}>세</span>
          </span>
          <span className="text-[11px] font-medium" style={{ color: SAJU.inkMute }}>
            사주매칭
          </span>
        </Link>

        {/* 내비 링크들 — PC 전용 */}
        <nav className="hidden lg:flex items-center gap-1">
          {NAV_ITEMS.map(item => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.key}
                href={localePath(item.href)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-semibold transition-all hover:bg-black/[0.04] active:scale-95"
                style={{
                  color: active ? SAJU.warmDeep : SAJU.inkSoft,
                  background: active ? SAJU.warmSoft : undefined,
                }}
              >
                <item.icon size={15} strokeWidth={active ? 2.5 : 2} />
                <span>{t(item.ko, item.en)}</span>
              </Link>
            );
          })}
        </nav>

        {/* 우측: 언어 토글 + 마이페이지 */}
        <div className="shrink-0 flex items-center gap-2">
          <InlineLangToggle />
          <Link
            href={localePath('/mypage')}
            aria-label={t('마이페이지', 'My Page')}
            className="w-9 h-9 rounded-full flex items-center justify-center transition-all hover:bg-black/[0.04] active:scale-95"
            style={{ color: SAJU.inkSoft }}
          >
            <User size={20} strokeWidth={2} />
          </Link>
        </div>
      </div>
    </header>
  );
}
