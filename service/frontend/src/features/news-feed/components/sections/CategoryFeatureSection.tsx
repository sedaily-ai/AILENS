import Link from 'next/link';
import { HandUnderline } from '@/shared/ui/effects/HandUnderline';
import Image from 'next/image';
import type { ArchiveItem } from '@/shared/lib/content/archiveItems';
import type { EconCategoryConfig } from '@/shared/constants/econCategories';
import { kstDateTimeLabel } from '@/shared/lib/date/date';

// 카테고리 섹션 — 왼쪽 큰 히어로(이미지+헤드라인+요약) + 오른쪽(또는 아래) 작은 리스트를 2/3+1/3 비율로 짝지어 한 줄에 배치하는 신문 지면 구성이다.
// 섹션 헤더 하나로 카테고리를 표시하므로 카드마다 카테고리 태그를 반복하지 않는다.
function dateLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map((s) => parseInt(s, 10));
  if (!y || !m || !d) return iso;
  return `${y}.${String(m).padStart(2, '0')}.${String(d).padStart(2, '0')}`;
}

// lens 항목은 published_at(시:분 포함)이 있어 날짜뿐 아니라 시:분까지 표시한다. ArticleCard.tsx의 dateTimeLabel과 같은 패턴이지만 이 파일이 별도 dateLabel을 가지므로 변경 시 함께 맞춘다.
function dateTimeLabel(item: ArchiveItem): string {
  return kstDateTimeLabel(item.publishedAt) ?? (item.date ? dateLabel(item.date) : '');
}

function HeroArticle({ item, large }: { item: ArchiveItem; large: boolean }) {
  return (
    <Link href={item.href ?? '#'} className="cf-hero block group">
      {/* 썸네일 라운드는 12px로 카드 라운드(16~18px)와 톤을 맞추고, hover 확대는 ArticleCard.tsx의 .block-thumb-img와 같은 방식이다. */}
      {item.avatarUrl && (
        <div className="relative w-full aspect-video overflow-hidden rounded-xl mb-3" style={{ background: '#f3f4f6' }}>
          <Image
            src={item.avatarUrl}
            alt=""
            fill
            sizes={large ? '(max-width: 768px) 100vw, 66vw' : '(max-width: 768px) 100vw, 33vw'}
            className="cf-hero-img"
            style={{ objectFit: 'cover', objectPosition: 'center 15%', transition: 'transform .4s cubic-bezier(.2,.7,.3,1)' }}
          />
        </div>
      )}
      {/* 헤드라인 — 대표 기사(large)만 Noto Serif KR로 무게감을 주고, 목록 기사(ListArticle)·narrow 카드는 산세리프로 두어 대표/목록 위계를 서체로 표현한다. */}
      <h3
        className="leading-snug group-hover:text-blue-700 transition-colors mb-2"
        style={{
          fontFamily: large ? "'Noto Serif KR', serif" : undefined,
          fontWeight: large ? 700 : 700,
          color: '#1c1917',
          fontSize: large ? 'clamp(21px, 2.7vw, 27px)' : 'clamp(17px, 2vw, 20px)',
          letterSpacing: large ? '-0.01em' : '-0.02em',
          display: '-webkit-box',
          WebkitLineClamp: large ? 3 : 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
      >
        {item.title}
      </h3>
      {item.excerpt && (
        <p
          className="text-gray-600"
          style={{
            fontSize: 13.5,
            lineHeight: 1.6,
            marginBottom: 6,
            display: '-webkit-box',
            WebkitLineClamp: large ? 2 : 3,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {item.excerpt}
        </p>
      )}
      {item.date && <time className="text-xs text-gray-400">{dateTimeLabel(item)}</time>}
    </Link>
  );
}

function ListArticle({ item }: { item: ArchiveItem }) {
  return (
    <Link href={item.href ?? '#'} className="block group">
      <h4
        className="font-bold leading-snug text-gray-900 group-hover:text-blue-700 transition-colors mb-1.5"
        style={{
          fontSize: 15.5,
          letterSpacing: '-0.015em',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
      >
        {item.title}
      </h4>
      {item.date && <time className="text-xs text-gray-400">{dateTimeLabel(item)}</time>}
    </Link>
  );
}

export function CategoryFeatureSection({
  config,
  items,
  span = 'wide',
}: {
  config: EconCategoryConfig;
  items: ArchiveItem[];
  span?: 'wide' | 'narrow';
}) {
  if (items.length === 0) return null;
  const [hero, ...rest] = items;
  // wide: 히어로 1개(큼) + 텍스트만 있는 목록 최대 2개. narrow: 히어로 아래 빈 공간을 채우기 위해 이미지가 있는 카드(HeroArticle, large=false)를 하나 더 둔다. 글자만 있는 ListArticle이 아니라 hero와 같은 카드 톤이어야 2개 카드로 보인다.
  const wideListItems = span === 'wide' ? rest.slice(0, 2) : [];
  const narrowSecond = span === 'narrow' ? rest[0] : null;

  return (
    <div
      className={span === 'wide' ? 'md:col-span-2' : 'md:col-span-1'}
      // 평면 구성 — 둥근 테두리·그림자 카드 없이 구역 위에 가는 먹색 선 한 줄을 둔다(홈의 다른 구역과 같은 규칙).
      style={{ borderTop: '1px solid #d3d6db', paddingTop: 16 }}
    >
      {/* 헤더 밑줄은 1px 연회색으로 가볍게 유지하고 굵은 검정 선은 쓰지 않는다. 제목 크기는 다른 섹션(단어퀴즈/웹툰/영상/오디오/타임머신)과 같은 eyebrow 11px + h2 24px 조합에 맞춘다. */}
      <header className="mb-4">
        <div className="flex items-baseline justify-between" style={{ gap: 8 }}>
          <h2 className="text-gray-900" style={{ fontSize: 'clamp(17px, 3.6vw, 20px)', fontWeight: 800, letterSpacing: '-0.02em' }}>
            <HandUnderline>{config.label}</HandUnderline>
          </h2>
          <Link
            href={`/${config.slug}`}
            className="flex-shrink-0 text-gray-500 hover:text-gray-900 transition-colors"
            style={{ fontSize: 13, fontWeight: 600 }}
          >
            전체 보기 →
          </Link>
        </div>
      </header>

      <HeroArticle item={hero} large={span === 'wide'} />

      {wideListItems.length > 0 && (
        <div className="mt-5 space-y-4">
          {wideListItems.map((item) => (
            <div key={item.key} className="pt-4" style={{ borderTop: '1px solid #e5e7eb' }}>
              <ListArticle item={item} />
            </div>
          ))}
        </div>
      )}

      {narrowSecond && (
        <div className="mt-5 pt-5" style={{ borderTop: '1px solid #e5e7eb' }}>
          <HeroArticle item={narrowSecond} large={false} />
        </div>
      )}
    </div>
  );
}
