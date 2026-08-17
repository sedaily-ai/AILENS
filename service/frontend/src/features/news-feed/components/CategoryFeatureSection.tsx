import Link from 'next/link';
import Image from 'next/image';
import type { ArchiveItem } from '@/shared/lib/archiveItems';
import type { EconCategoryConfig } from '@/shared/constants/econCategories';

// 본지(en.sedaily.com, 로컬 참고 경로:
// 1_ailink/globe/dev/frontend/src/components/home/HeroSection/HeroSection.tsx)
// 스타일 카테고리 섹션(2026-08-17, 사용자 확인 — "본지형식대로 해보시죠") —
// 왼쪽 큰 히어로(이미지+헤드라인+요약) + 오른쪽(또는 아래) 작은 리스트를
// 2/3+1/3 비율로 짝지어 한 줄에 배치, 얇은 가로선으로 섹션을 나누는
// "신문 지면" 구성. 카테고리 레일(2026-08-17 초반에 만들었다 바로 뺀 버전)
// 과 다른 점: 카드마다 카테고리 태그를 다시 안 붙인다 — 본지도 섹션
// 헤더("Markets" 등) 하나로 충분하다고 보고 카드에 라벨을 반복 안 한다.
// 그래서 이전처럼 "헤더=태그 완전 중복" 문제가 재발하지 않는다(사용자가
// 지적했던 지점).
function dateLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map((s) => parseInt(s, 10));
  if (!y || !m || !d) return iso;
  return `${y}.${String(m).padStart(2, '0')}.${String(d).padStart(2, '0')}`;
}

function HeroArticle({ item, large }: { item: ArchiveItem; large: boolean }) {
  return (
    <Link href={item.href ?? '#'} className="block group">
      {/* rounded-sm(2px)이던 걸 10px로 맞췄다(2026-08-17, 사용자 피드백:
          "round는 어때요 전체적으로?" — ArticleCard.tsx의 ArticleThumb,
          ArchiveList.tsx 썸네일이 전부 10px라 이 카드만 각지게 보였다). */}
      {item.avatarUrl && (
        <div className="relative w-full aspect-video overflow-hidden rounded-[10px] mb-3" style={{ background: '#f3f4f6' }}>
          <Image
            src={item.avatarUrl}
            alt=""
            fill
            sizes={large ? '(max-width: 768px) 100vw, 66vw' : '(max-width: 768px) 100vw, 33vw'}
            style={{ objectFit: 'cover', objectPosition: 'center 15%' }}
          />
        </div>
      )}
      <h3
        className="font-bold leading-snug text-gray-900 group-hover:text-blue-700 transition-colors mb-2"
        style={{
          fontSize: large ? 'clamp(20px, 2.6vw, 26px)' : 'clamp(17px, 2vw, 20px)',
          letterSpacing: '-0.02em',
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
      {item.date && <time className="text-xs text-gray-400">{dateLabel(item.date)}</time>}
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
      {item.date && <time className="text-xs text-gray-400">{dateLabel(item.date)}</time>}
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
  const listItems = span === 'wide' ? rest.slice(0, 2) : [];

  return (
    <div className={span === 'wide' ? 'md:col-span-2' : 'md:col-span-1'}>
      {/* 헤더 밑줄을 2px 검정에서 1px 연회색으로 낮췄다(2026-08-17, 사용자
          피드백: "영문사이트처럼 선 색깔을 그레이로 하면 좋지 않으려나...
          진한 느낌이 없고 디자인적으로 깔끔한, 모던한 느낌" — 본지
          en.sedaily.com 영문판 참고 스크린샷 대비). */}
      <header className="flex items-center justify-between mb-4" style={{ borderBottom: '1px solid #d1d5db', paddingBottom: 8 }}>
        <h2 className="font-bold text-gray-900" style={{ fontSize: 17 }}>
          {config.label}
        </h2>
        <Link href={`/${config.slug}`} className="text-gray-400 hover:text-gray-900 transition-colors" style={{ fontSize: 13, fontWeight: 600 }}>
          전체 보기 →
        </Link>
      </header>

      <HeroArticle item={hero} large={span === 'wide'} />

      {listItems.length > 0 && (
        <div className="mt-5 space-y-4">
          {listItems.map((item) => (
            <div key={item.key} className="pt-4" style={{ borderTop: '1px solid #e5e7eb' }}>
              <ListArticle item={item} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
