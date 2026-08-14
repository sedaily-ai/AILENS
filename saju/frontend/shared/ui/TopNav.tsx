'use client';

/**
 * TopNav — PC(lg+) 전용 상단 내비게이션 (phase-05)
 *
 * - 모바일에서는 완전히 숨김 (hidden lg:flex)
 * - 점신 결 톤에 맞춘 미니멀한 상단바
 * - BottomNav와 동일한 탭 구성
 */

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  ArrowLeft, Home, ScrollText, Sparkles, BookOpen, MessageCircle, User,
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
  /** true면 /saju 마운트 프리픽스를 안 붙인다 — AILENS 자체 경로로 나간다 */
  exitsMount?: boolean;
};

// 재운/커리어/이상형/궁합/주역점은 /saju 하위로 편입 — /unse 허브는 폐지 (2026-07-09)
// '홈'은 사주 내부 랜딩(/saju)이 아니라 AILENS 실제 홈(/)으로 나간다(2026-08-14) —
// 이 앱이 AILENS 안에 마운트된 서브 서비스라, "홈"이라는 말을 듣고 눌렀을 때
// 계속 사주 브랜딩 안에 머무르면 사용자가 헷갈린다(피드백: "홈 눌러도 사주
// 안에서만 이동한다"). AILENS 자체 랜딩(/saju)으로 가고 싶으면 로고를 누른다.
const NAV_ITEMS: NavItem[] = [
  { href: '/',          icon: Home,        ko: '홈',     en: 'Home',       key: 'home', exitsMount: true },
  { href: '/saju',      icon: ScrollText,  ko: '사주',   en: 'Saju',       key: 'saju' },
  { href: '/character', icon: Sparkles,    ko: '캐릭터', en: 'Characters', key: 'character' },
  { href: '/blog',      icon: BookOpen,    ko: '블로그', en: 'Blog',       key: 'blog' },
  { href: '/chat',      icon: MessageCircle, ko: '챗봇', en: 'Chat',       key: 'chat' },
];

export function TopNav() {
  const { t, localePath } = useLang();
  const pathname = usePathname();
  const router = useRouter();

  function isActive(href: string) {
    if (!pathname) return false;
    // 2026-08-15: basePath("/saju")가 다시 켜지면서 usePathname()이 이미 그
    // 프리픽스를 뗀 값을 돌려준다(Next.js 공식 동작) — 예전 vendoring 시절엔
    // 마운트 프리픽스가 실제 문자열에 섞여 있어서 수동으로 벗겨냈지만 이제
    // 불필요(오히려 이중으로 벗기면 원국 페이지(/saju) 탭 활성 표시가 깨짐).
    const bare = pathname.startsWith('/en/') ? pathname.slice(3) : pathname === '/en' ? '/' : pathname;
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
        {/* 뒤로가기 + 로고 / 브랜드 — 뒤로가기는 브라우저 히스토리를 따라가
            사주 진입 전 사용자가 있던 페이지(대개 /lens)로 되돌아간다.
            history가 없을 때(새 탭으로 직접 진입 등)만 AILENS 홈으로 대체한다. */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => {
              if (typeof window !== 'undefined' && window.history.length > 1) {
                router.back();
              } else {
                router.push('/');
              }
            }}
            aria-label={t('이전 페이지로', 'Go back')}
            className="w-8 h-8 -ml-1 rounded-full flex items-center justify-center transition-all hover:bg-black/[0.04] active:scale-95"
            style={{ color: SAJU.inkSoft }}
          >
            <ArrowLeft size={18} strokeWidth={2.2} />
          </button>
          <Link href={localePath('/')} className="flex items-center gap-2">
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
        </div>

        {/* 내비 링크들 — PC 전용 */}
        <nav className="hidden lg:flex items-center gap-1">
          {NAV_ITEMS.map(item => {
            const active = !item.exitsMount && isActive(item.href);
            return (
              <Link
                key={item.key}
                href={item.exitsMount ? item.href : localePath(item.href)}
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
