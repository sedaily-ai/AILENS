import Link from 'next/link';
import type { ArchiveItem } from '@/shared/lib/archiveItems';
import { ArticleHeroCard, ArticleGridCard } from './ArticleCard';

// "최신 뉴스" — 히어로 1건 + 4열 그리드 8건 + 전체보기(2026-08-17, 뉴닉 홈
// 구조 참고). 예전엔 형식 기준 섹션("이슈 톡톡" FollowingFeed, "인사이트"
// ColumnPreviewSection)이 따로 있었는데, 그 둘을 여기 하나로 합쳤다 —
// 어차피 지금은 letters 전체가 category 태그로 분류돼 있어서, 형식(이슈
// 톡톡/인사이트) 대신 최신순으로 한 번에 보여주고 주제별로는 아래
// CategoryRailSection들이 담당한다.
export function LatestGridSection({ items }: { items: ArchiveItem[] }) {
  if (items.length === 0) return null;
  const [hero, ...rest] = items;
  const grid = rest.slice(0, 8);

  return (
    <section style={{ padding: 'clamp(28px, 4vw, 40px) 0 0' }}>
      <header style={{ marginBottom: 20 }}>
        <h2 className="text-gray-900" style={{ fontSize: 'clamp(20px, 4.4vw, 24px)', fontWeight: 800, letterSpacing: '-0.02em' }}>
          최신 뉴스
        </h2>
      </header>

      <ArticleHeroCard item={hero} />

      {grid.length > 0 && (
        <div
          className="grid grid-cols-2 md:grid-cols-4"
          style={{ gap: 'clamp(16px, 2.4vw, 28px)', marginTop: 'clamp(24px, 3vw, 32px)' }}
        >
          {grid.map((item) => (
            <ArticleGridCard key={item.key} item={item} />
          ))}
        </div>
      )}

      <div style={{ textAlign: 'center', marginTop: 28 }}>
        <Link
          href="/archive"
          className="inline-block rounded-full text-gray-700 hover:bg-gray-100 transition-colors"
          style={{ padding: '10px 22px', border: '1px solid #e5e7eb', fontSize: 13, fontWeight: 700 }}
        >
          최신 뉴스 전체보기
        </Link>
      </div>
    </section>
  );
}
