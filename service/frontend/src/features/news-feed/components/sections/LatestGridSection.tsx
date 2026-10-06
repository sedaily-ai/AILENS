import type { ReactNode } from 'react';
import Link from 'next/link';
import type { ArchiveItem } from '@/shared/lib/content/archiveItems';
import { ArticleHeroCard, ArticleGridCard } from '@/features/news-feed/components/cards/ArticleCard';

// "최신 뉴스" — 히어로 자리 + 4열 그리드 8건 + 전체보기. 카테고리별 레일은 카드마다 붙는 카테고리 태그(ArticleCard.tsx)와 중복이므로 두지 않으며, 주제별 탐색은 상단 탭(카테고리 아카이브 페이지)이 담당한다.
// heroSlot: 히어로 자리에 일반 최신 글 카드 대신 다른 컴포넌트를 통째로 넣는다. NewsFeedTab.tsx가 <LensPreviewSection/>을 넘기며, 카드로 축약하지 않고 원래 디자인 그대로 보여 준다.
export function LatestGridSection({ items, heroSlot }: { items: ArchiveItem[]; heroSlot?: ReactNode }) {
  if (items.length === 0 && !heroSlot) return null;
  const hero = heroSlot ? null : items[0];
  const grid = (heroSlot ? items : items.slice(1)).slice(0, 8);

  return (
    <section
      style={{
        padding: heroSlot ? '0 0 clamp(28px, 4vw, 40px)' : 'clamp(28px, 4vw, 40px) 0',
      }}
    >
      {/* heroSlot이 있을 때는 "최신 뉴스" 제목을 그리지 않는다. heroSlot 컴포넌트(LensPreviewSection)가 이미 자기 헤더를 가지므로 제목이 겹치고 상단 여백이 이중으로 벌어진다. heroSlot이 없을 때만 이 컴포넌트가 제목을 맡는다. */}
      {!heroSlot && (
        <header className="flex items-center justify-between" style={{ marginBottom: 20, gap: 8 }}>
          <h2 className="text-gray-900" style={{ fontSize: 'clamp(20px, 4.4vw, 24px)', fontWeight: 800, letterSpacing: '-0.02em' }}>
            최신 뉴스
          </h2>
          <Link href="/lens" className="flex-shrink-0 text-gray-400 hover:text-gray-900 transition-colors" style={{ fontSize: 13, fontWeight: 600 }}>
            전체 보기 →
          </Link>
        </header>
      )}

      {heroSlot ?? (hero && <ArticleHeroCard item={hero} />)}

      {grid.length > 0 && (
        <>
          {/*
             heroSlot이 있을 때는 그리드 바로 위에 가로선 + 작은 구분 라벨을 두어 위 섹션과 분리한다. 얇은 대문자 eyebrow(LensPreviewSection "오늘의 지면", NewsletterCTA "Newsletter")와 연회색 hairline(CategoryFeatureSection의 리스트 구분선과 같은 색)을 사용한다.
             "전체 보기" 링크도 이 구분 영역에 둔다(/lens 목적지).
           */}
          {heroSlot && (
            <div style={{ marginTop: 'clamp(32px, 4vw, 44px)', borderTop: '1px solid #e5e7eb', paddingTop: 20 }}>
              <div className="flex items-center justify-between" style={{ gap: 8, marginBottom: 10 }}>
                <p
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: '#9ca3af',
                    letterSpacing: '0.16em',
                    textTransform: 'uppercase',
                  }}
                >
                  최신 뉴스
                </p>
                <Link href="/lens" className="flex-shrink-0 text-gray-400 hover:text-gray-900 transition-colors" style={{ fontSize: 13, fontWeight: 600 }}>
                  전체 보기 →
                </Link>
              </div>
            </div>
          )}
          <div
            className="grid grid-cols-2 md:grid-cols-4"
            style={{ gap: 'clamp(16px, 2.4vw, 28px)', marginTop: heroSlot ? 0 : 'clamp(24px, 3vw, 32px)' }}
          >
            {grid.map((item) => (
              <ArticleGridCard key={item.key} item={item} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
