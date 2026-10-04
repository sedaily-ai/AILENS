import Link from 'next/link';
import { HandUnderline } from '@/shared/ui/HandUnderline';
import Image from 'next/image';
import type { ArchiveItem } from '@/shared/lib/archiveItems';
import type { EconCategoryConfig } from '@/shared/constants/econCategories';
import { kstDateTimeLabel } from '@/shared/lib/date';

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

// 2026-08-23 — lens 항목은 published_at(시:분 포함)이 있어서 이 레일
// 카드에서도 날짜만이 아니라 시:분까지 보여줄 수 있다(ArticleCard.tsx의
// dateTimeLabel과 같은 패턴 — 이 파일이 독립적으로 자기 dateLabel을 갖고
// 있어서 그쪽 수정이 자동으로 여기 반영되지 않았다, 사용자 지적으로 확인).
function dateTimeLabel(item: ArchiveItem): string {
  return kstDateTimeLabel(item.publishedAt) ?? (item.date ? dateLabel(item.date) : '');
}

function HeroArticle({ item, large }: { item: ArchiveItem; large: boolean }) {
  return (
    <Link href={item.href ?? '#'} className="cf-hero block group">
      {/* rounded-sm(2px)이던 걸 10px로 맞췄다(2026-08-17, 사용자 피드백:
          "round는 어때요 전체적으로?" — ArticleCard.tsx의 ArticleThumb,
          ArchiveList.tsx 썸네일이 전부 10px라 이 카드만 각지게 보였다).
          2026-09-30 리디자인 — 12px로 한 단계 더 키워 카드 라운드(16~18px)
          와 톤을 맞추고, 썸네일에도 hover 확대(ArticleCard.tsx의
          .block-thumb-img와 같은 언어)를 추가. */}
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
      {/* 헤드라인(large만 세리프) — 신문 지면 탭 리디자인(2026-09-30)과 같은
          방향: 이 카드의 대표 기사만 Noto Serif KR로 무게감을 주고, 목록
          기사(ListArticle)·narrow 카드는 산세리프로 남겨 "대표 vs 목록"
          위계를 서체로도 표현한다. */}
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
  // wide: 히어로 1개(큼) + 텍스트만 있는 목록 최대 2개. narrow: 원래 히어로
  // 1개만 두고 그 아래를 통째로 비웠는데(2026-08-17 최초 구현), 사용자가
  // "우측에 2개 충분히 들어가는 크기 아닌가요" — 실제로 히어로 아래
  // 빈 공간이 카드 하나가 더 들어갈 만큼 남아 있었다. narrow도 이미지가
  // 있는 카드(HeroArticle, large=false) 하나를 추가로 채운다 — wide처럼
  // 글자만 있는 ListArticle이 아니라 hero와 같은 카드 톤으로 맞춰야
  // "2개 카드"로 보인다는 사용자 의도에 맞다.
  const wideListItems = span === 'wide' ? rest.slice(0, 2) : [];
  const narrowSecond = span === 'narrow' ? rest[0] : null;

  return (
    <div
      className={span === 'wide' ? 'md:col-span-2' : 'md:col-span-1'}
      // 2026-10-04 평면화(사용자: "NYT처럼 선으로 깔끔하게") — 둥근 테두리·그림자 카드를 걷고, 구역 위에 가는 먹색 선 한 줄(홈의 다른 구역과 같은 규칙).
      style={{ borderTop: '1px solid #d3d6db', paddingTop: 16 }}
    >
      {/* 헤더 밑줄을 2px 검정에서 1px 연회색으로 낮췄던 결정(2026-08-17,
          "진한 느낌이 없고 모던한 느낌" 피드백)은 유지한다 — 굵은 검정 선을
          다시 넣지 않는다. 대신 리디자인(2026-09-30, "고급지게·신문
          느낌")은 카드 자체(배경·둥근 모서리·옅은 그림자)와 대표 기사
          세리프 헤드라인으로 무게감을 준다 — 헤더는 여전히 가볍게.
          제목 크기만 다른 섹션(단어퀴즈/웹툰/영상/오디오/타임머신 — 전부
          eyebrow 11px+h2 24px 조합)과 맞춘다(2026-10-01) — 상단 네비게이션에도
          있는 핵심 카테고리인데 이 섹션에서만 16px로 작게 나와 위계가
          어긋나 있었다. 박스·그림자·언더라인 톤은 그대로 유지. */}
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
