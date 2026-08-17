import Link from 'next/link';
import type { ArchiveItem } from '@/shared/lib/archiveItems';
import type { EconCategoryConfig } from '@/shared/constants/econCategories';
import { ArticleRailCard } from './ArticleCard';

// 카테고리별 레일(2026-08-17, 뉴닉 홈 "기후 재난 ›"/"코스피·주식 ›" 구조
// 참고) — 홈에서 "최신 뉴스" 그리드 아래, 카테고리마다 최근 글 최대 3건을
// 보여주고 전체는 /{slug} 아카이브로 연결한다. 콘텐츠가 하나도 없는
// 카테고리는 섹션 자체를 숨긴다(VideoPreviewSection과 같은 원칙 — 목업으로
// 안 채운다). 지금 발행량 기준 부동산이 3건뿐이라 max 3으로 맞췄다 — 4건
// 이상 쌓이면 늘려도 됨.
const MAX_PER_RAIL = 3;

export function CategoryRailSection({ config, items }: { config: EconCategoryConfig; items: ArchiveItem[] }) {
  if (items.length === 0) return null;
  const shown = items.slice(0, MAX_PER_RAIL);

  return (
    <section style={{ padding: 'clamp(28px, 4vw, 36px) 0 0' }}>
      <header style={{ marginBottom: 16 }}>
        <Link
          href={`/${config.slug}`}
          className="inline-flex items-center gap-1.5 hover:opacity-70 transition-opacity"
          style={{ textDecoration: 'none' }}
        >
          <h2 className="text-gray-900" style={{ fontSize: 'clamp(18px, 3.6vw, 21px)', fontWeight: 800, letterSpacing: '-0.02em' }}>
            {config.label}
          </h2>
          <span aria-hidden style={{ fontSize: 16, color: '#9ca3af' }}>›</span>
        </Link>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-3" style={{ gap: 'clamp(16px, 2.4vw, 24px)' }}>
        {shown.map((item) => (
          <ArticleRailCard key={item.key} item={item} />
        ))}
      </div>
    </section>
  );
}
