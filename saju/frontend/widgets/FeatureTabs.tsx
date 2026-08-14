'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useLang } from '@saju/shared/lib/LangContext';

type TabId = 'saju' | 'chat' | 'today' | 'chaeun' | 'career' | 'compatibility' | 'couple' | 'news' | 'blog' | 'zodiac';

const TABS: { id: TabId; href: string; ko: string; en: string }[] = [
  { id: 'saju',          href: '/saju',          ko: '내 사주',   en: 'My Saju' },
  { id: 'chat',          href: '/chat',          ko: '사주 챗봇', en: 'Saju Chat' },
  { id: 'today',         href: '/today',         ko: '오늘의 운세', en: "Today's Saju" },
  { id: 'chaeun',        href: '/chaeun',        ko: '재운',     en: 'Wealth'  },
  { id: 'career',        href: '/career',        ko: '커리어',   en: 'Career'  },
  { id: 'compatibility', href: '/compatibility', ko: '이상형',   en: 'Ideal'   },
  { id: 'couple',        href: '/couple',        ko: '커플 궁합', en: 'Couple'  },
  { id: 'zodiac',        href: '/zodiac',        ko: '띠별 운세', en: 'Zodiac'  },
  // 뉴스 탭: 검색 API 회귀로 임시 숨김
  // { id: 'news',          href: '/news',          ko: '뉴스',     en: 'News'    },
  { id: 'blog',          href: '/blog',          ko: '블로그',   en: 'Blog'    },
];

function resolveActive(pathname: string | null): TabId | null {
  if (!pathname) return null;
  // 2026-08-15: basePath("/saju") 복원 — usePathname()이 이미 그 프리픽스를
  // 뗀 값을 돌려주므로(TopNav.tsx의 isActive와 동일한 이유) 수동 스트립 제거.
  const bare = pathname.startsWith('/en/') ? pathname.slice(3) : pathname === '/en' ? '/' : pathname;
  if (bare.startsWith('/today')) return 'today';
  if (bare.startsWith('/chaeun')) return 'chaeun';
  if (bare.startsWith('/career')) return 'career';
  if (bare.startsWith('/compatibility')) return 'compatibility';
  if (bare.startsWith('/couple')) return 'couple';
  if (bare.startsWith('/chat')) return 'chat';
  if (bare.startsWith('/saju')) return 'saju';
  if (bare.startsWith('/zodiac')) return 'zodiac';
  if (bare.startsWith('/news')) return 'news';
  if (bare.startsWith('/blog')) return 'blog';
  return null;
}

export function FeatureTabs() {
  const pathname = usePathname();
  const { t, localePath } = useLang();
  const active = resolveActive(pathname);

  return (
    <nav
      aria-label={t('기능 탭', 'Feature tabs')}
      className="sticky top-0 z-40 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800"
    >
      <div className="max-w-[480px] lg:max-w-[1080px] mx-auto px-3 sm:px-[14px]">
        <ul className="flex gap-2 overflow-x-auto py-2.5 scrollbar-hide">
          {TABS.map(tab => {
            const isActive = active === tab.id;
            return (
              <li key={tab.id} className="shrink-0">
                <Link
                  href={localePath(tab.href)}
                  aria-current={isActive ? 'page' : undefined}
                  className={[
                    'inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors border',
                    isActive
                      ? 'bg-gray-900 text-white border-gray-900 dark:bg-gray-100 dark:text-gray-900 dark:border-gray-100'
                      : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50 dark:bg-gray-900 dark:text-gray-200 dark:border-gray-700 dark:hover:bg-gray-800',
                  ].join(' ')}
                >
                  <span>{t(tab.ko, tab.en)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
