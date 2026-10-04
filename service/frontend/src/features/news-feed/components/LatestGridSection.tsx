import type { ReactNode } from 'react';
import Link from 'next/link';
import type { ArchiveItem } from '@/shared/lib/content/archiveItems';
import { ArticleHeroCard, ArticleGridCard } from './ArticleCard';

// "최신 뉴스" — 히어로 자리 + 4열 그리드 8건 + 전체보기(2026-08-17, 뉴닉 홈
// 구조 참고). 예전엔 형식 기준 섹션("이슈 톡톡" FollowingFeed, "인사이트"
// ColumnPreviewSection)이 따로 있었는데, 그 둘을 여기 하나로 합쳤다 —
// 카테고리별 레일 섹션도 따로 만들어봤지만 카드마다 이미 붙는 카테고리
// 태그(ArticleCard.tsx)와 순수 중복이라 바로 뺐다(사용자 지적) — 주제별로
// 몰아보고 싶으면 상단 탭(카테고리 아카이브 페이지)으로.
//
// heroSlot: 히어로 자리에 일반 최신 글 카드 대신 다른 컴포넌트를 통으로
// 꽂는다(2026-08-17, 사용자 확인 — 스크린샷으로 이 히어로 위치를 정확히
// 짚어주며 "4가지 시선 부분 그대로 가져와서 구성"). NewsFeedTab.tsx가
// <LensPreviewSection/>을 그대로 넘긴다 — 카드로 축약하지 않고 원래
// 디자인(히어로+"같은 이슈, 네 사람은 이렇게 읽습니다" 4행 비교) 그대로.
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
      {/* heroSlot이 있을 땐 "최신 뉴스" 제목을 안 그린다(2026-08-17,
          사용자 피드백: "헤더가 두 번 겹쳐 보인다") — heroSlot으로 넘어온
          컴포넌트(LensPreviewSection)가 이미 자기 헤더("오늘의 이슈,
          4가지 시선")를 갖고 있어서, 둘 다 그리면 제목이 위아래로
          두 개 붙어 보이고 그 사이 여백도 이중으로 벌어졌다(각 섹션이
          자기 몫의 top padding을 따로 갖고 있어서). heroSlot이 없을
          때(시선 미발행일)만 이 컴포넌트가 스스로 "최신 뉴스" 제목을
          맡는다. */}
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
          {/* heroSlot이 있을 땐 그리드 바로 위에 가로선+작은 구분 라벨로
              "4가지 시선" 섹션과 분리한다(2026-10-01, 사용자 피드백 —
              "실선이나... 디자인을 통해서 분류할 수 있으면 좋겠다". 라벨만
              있던 1차 시도는 바로 위 LensPreviewSection의 3단 기사 리스트와
              그리드가 시각적으로 안 끊겨 어디서부터 "최신 뉴스"인지
              구분이 안 됐다). 굵은 색 박스 태그(어피티 RECENT LETTERS 식)는
              AI LENS 기존 톤(CategoryFeatureSection.tsx 주석 — "진한 느낌
              없이 모던하게")과 안 맞아서, 이미 쓰고 있던 얇은 대문자 eyebrow
              관용구(LensPreviewSection "오늘의 지면", NewsletterCTA
              "Newsletter")에 연회색 hairline만 더했다 — 카테고리 섹션
              (CategoryFeatureSection)의 리스트 기사 구분선과 같은 색.
              "전체 보기" 링크도 LensPreviewSection 헤더에서 여기로
              옮겨왔다(2026-10-01, 사용자 요청) — 어차피 같은 /lens
              목적지라 "4가지 시선" 쪽엔 더 이상 안 둔다. */}
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
