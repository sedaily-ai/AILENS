// 시리즈 카드/그리드/페이지네이션/카테고리 칩 — WebtoonListClient.tsx(홈 목록:
// 히어로+레일+그리드)와 /webtoon/all(전체보기 전용 페이지)이 공유하는 조각들.
//
// 2026-08-21 — "최근 업데이트"·"전체 웹툰" 두 섹션 머리의 부제(편수 텍스트)를
// "더보기" 링크로 바꾸면서, 그 링크가 실제로 갈 곳(모든 웹툰을 볼 수 있는
// 전용 페이지)이 필요해졌다. 새 페이지가 홈 목록과 같은 카드 언어를 써야
// 일관성이 생기므로(§4 일관성 우선), 카드 자체가 아니라 이 조각들을 공유
// 모듈로 뽑아 두 파일 모두 같은 컴포넌트·같은 CSS 를 참조하게 했다 — 카드가
// 두 곳에서 따로 관리되면 한쪽만 고치는 실수가 생긴다.
//
// 히어로 캐러셀(편 단위, 화면 폭을 쓰는 풀블리드 구간)은 여기 없다 — 홈 목록
// 페이지에만 있고 전체보기 페이지에는 없는 요소라 이 파일로 옮기지 않았다.
import Link from 'next/link';
import Image from 'next/image';
import { coverThumb } from '@/shared/lib/webtoonCovers.generated';
import { WEBTOON_CATEGORIES } from '@/shared/constants/webtoonCategories';
import type { WebtoonSeries } from '@/shared/lib/webtoonSeries';

/** 구조색 — 흰 배경과 17.74:1. */
export const INK = '#111827';
/** 본문 — 흰 배경 10.31:1 */
export const BODY = '#374151';
/** 보조 정보 — 흰 배경 4.83:1 (AA 통과). */
export const MUTED = '#6b7280';
/** 카드 경계 — /video 와 같은 값. */
export const HAIRLINE = '#f1f1f0';
/** 비활성 칩 채움. */
export const CHIP = '#f3f4f6';
/** 표지가 오기 전 자리를 잡아두는 면. */
export const PLACEHOLDER = '#f3f4f6';
/** 격자 밴드 — 13px MUTED 가 4.63:1 로 통과하는 가장 진한 회색. */
export const BAND = '#f9fafb';
export const BAND_EDGE = '#eef0f3';
/** /video 카드와 동일 — 액자 대신 부양감으로 카드를 구분한다. */
export const CARD_SHADOW = '0 1px 2px rgba(17,24,39,0.04), 0 6px 18px rgba(17,24,39,0.05)';
/**
 * 사이트 유일의 파란 액센트 — Header.tsx TAB_ACCENT·BETA 배지와 같은 값
 * (#1d4ed8, 흰 배경·흰 글자 모두 6.70:1). "총 N화" 배지를 이 색으로
 * 통일한다(2026-08-21, 참고 이미지 요청) — 새 파란색을 만들지 않고 이미
 * 검증된 값을 재사용한다(§4 일관성 우선, §3 새 토큰 임의 추가 금지).
 */
export const EP_BLUE = '#1d4ed8';

export const fmtDate = (d: string) => d.replaceAll('-', '.');

/** WEBTOON_CATEGORIES 순서를 유지한 라벨 목록 — 데이터에 있는 것만 걸러 쓴다. */
const CATEGORY_ORDER: readonly string[] = WEBTOON_CATEGORIES;

/**
 * 시리즈 목록을 카테고리로 거른 결과 — 홈 목록·전체보기 페이지가 같은 규칙
 * (데이터에 실제로 있는 카테고리만 노출, §4 준비되지 않은 기능)을 각자
 * 다시 구현하면 규칙이 갈릴 위험이 있어 순수 함수 하나로 뽑았다.
 */
export function computeCategoryFilter(allSeries: WebtoonSeries[], initialCategory?: string) {
  const categoryCounts = new Map<string, number>();
  allSeries.forEach((s) => {
    if (s.category) categoryCounts.set(s.category, (categoryCounts.get(s.category) ?? 0) + 1);
  });
  const categories = CATEGORY_ORDER.filter((label) => (categoryCounts.get(label) ?? 0) > 0);
  const activeCategory = initialCategory && categories.includes(initialCategory) ? initialCategory : null;
  const filtering = activeCategory !== null;
  const pool = filtering ? allSeries.filter((s) => s.category === activeCategory) : allSeries;
  return { categoryCounts, categories, activeCategory, filtering, pool };
}

/**
 * 두 페이지가 공유하는 CSS — 시리즈 카드·세로 포스터·격자·밴드·가로 레일·
 * 카테고리 칩·페이지 버튼·더보기 링크. 히어로 캐러셀 전용 CSS는 여기 없다
 * (WebtoonListClient.tsx 안에만 필요).
 */
export const WEBTOON_GRID_CSS = `
  .wt-wrap { max-width: 960px; margin: 0 auto;
    padding-left: clamp(20px, 5vw, 32px); padding-right: clamp(20px, 5vw, 32px); }

  /* ── 시리즈 카드 ── 카드 전체를 감싸는 박스는 없다(2026-08-21, 참고
     이미지 피드백 — "텍스트가 있는 곳에는 박스를 없애 달라"). 둥근 모서리·
     그림자는 포스터(.wt-poster)에만 있고, 제목·메타 텍스트는 페이지
     배경 위에 그냥 놓인다 — 참고 이미지의 웹툰 앱들도 표지만 카드처럼
     떠 있고 글자는 배경과 한 몸이다. */
  .wt-card { display: block; text-decoration: none; height: 100%;
    transition: transform .18s ease; }
  .wt-card:hover { transform: translateY(-2px); }
  .wt-card:hover .wt-poster { box-shadow: 0 2px 4px rgba(17,24,39,.06), 0 12px 28px rgba(17,24,39,.10); }
  .wt-card:focus-visible { outline: 2px solid ${INK}; outline-offset: 2px; border-radius: 12px; }
  .wt-card:hover .wt-poster-fg { transform: scale(1.03); }
  .wt-card:hover .wt-t { text-decoration: underline; text-underline-offset: 2px; }

  /* ── 세로 포스터 ── 2:3. contain+블러 배경(레터박스) 방식을 썼다가
     "위아래 뿌연 여백 없이, 확대되어도 사진으로만 세로 비율을 채워 달라"는
     요청으로 cover 로 바꿨다(2026-08-21) — 원본을 세로 박스에 꽉 채우고
     넘치는 부분만 자른다. 표지 상당수가 3:2 가로라 크롭 폭이 크지만(2:3
     박스 기준 원본의 약 44%만 보임), 이건 사용자가 명시적으로 감수하기로
     확인한 트레이드오프다. */
  .wt-poster { position: relative; aspect-ratio: 2 / 3; overflow: hidden;
    background: ${PLACEHOLDER}; border-radius: 12px; box-shadow: ${CARD_SHADOW};
    transition: box-shadow .18s ease; }
  .wt-poster-fg { position: absolute; inset: 0; transition: transform .3s ease; }
  /* 화수 배지 — 파란색(2026-08-21, 참고 이미지 요청. 어두운 반투명 채움 대신
     사이트 유일의 파란 액센트 EP_BLUE 로 통일했다). 흰 글자와 6.70:1. */
  .wt-poster-badge { position: absolute; right: 8px; bottom: 8px; font-size: 12px;
    font-weight: 700; color: #fff; background: ${EP_BLUE}; padding: 4px 8px;
    border-radius: 4px; font-variant-numeric: tabular-nums; }

  /* ── 격자 ── 375px 에서 2열. */
  .wt-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px 12px;
    list-style: none; margin: 0; padding: 0; }
  @media (min-width: 640px) { .wt-grid { grid-template-columns: repeat(3, 1fr); gap: 24px 16px; } }
  @media (min-width: 900px) { .wt-grid { grid-template-columns: repeat(4, 1fr); } }

  /* ── 격자 밴드 ── 13px MUTED 가 4.63:1 로 통과하는 가장 진한 회색. */
  .wt-band { background: ${BAND}; border-top: 1px solid ${BAND_EDGE};
    margin-top: 48px; padding: 40px 0 96px; }

  /* ── 가로 레일 ── 세로 포스터라 슬롯이 좁고 길다. */
  .wt-rail { display: flex; gap: 12px; overflow-x: auto; scroll-snap-type: x mandatory;
    list-style: none; margin: 0; padding: 4px 0 8px; scrollbar-width: thin;
    overscroll-behavior-x: contain; }
  .wt-rail > li { flex: 0 0 132px; scroll-snap-align: start; }
  @media (min-width: 640px) { .wt-rail { gap: 16px; } .wt-rail > li { flex: 0 0 176px; } }

  /* 레일 화살표 — 마우스 사용자용. 터치는 스와이프가 자연스러워 숨긴다. */
  .wt-arrow { display: none; }
  @media (min-width: 640px) {
    .wt-arrow { display: inline-flex; align-items: center; justify-content: center;
      width: 44px; height: 44px; border-radius: 999px; border: 1px solid #e5e7eb;
      background: #fff; color: ${INK}; cursor: pointer;
      transition: background .14s ease, border-color .14s ease; }
    .wt-arrow:hover:not(:disabled) { background: ${CHIP}; border-color: #d1d5db; }
    .wt-arrow:focus-visible { outline: 2px solid ${INK}; outline-offset: 2px; }
    .wt-arrow:disabled { color: #9ca3af; cursor: default; }
  }

  /* ── 카테고리 칩 ── NewsTimeMachineSection 의 .ntm-chip 과 같은 규격
     (44px 터치 타겟 · 알약 · 활성은 채움+굵기). */
  .wt-chips { display: flex; gap: 8px; overflow-x: auto; padding: 4px 0;
    list-style: none; margin: 0; scrollbar-width: none; }
  .wt-chips::-webkit-scrollbar { display: none; }
  .wt-chip { display: inline-flex; align-items: center; justify-content: center;
    min-height: 44px; padding: 0 16px; border-radius: 999px; border: none;
    font-size: 14px; font-weight: 600; background: ${CHIP}; color: ${BODY};
    white-space: nowrap; text-decoration: none;
    transition: background .15s ease, color .15s ease; }
  .wt-chip:hover { background: #e9ebef; color: ${INK}; }
  .wt-chip[aria-current="page"] { background: ${INK}; color: #fff; font-weight: 700; }
  .wt-chip:focus-visible { outline: 2px solid ${INK}; outline-offset: 2px; }
  .wt-chip-n { margin-left: 6px; font-size: 13px; font-weight: 600;
    font-variant-numeric: tabular-nums; color: ${BODY}; }
  .wt-chip:hover .wt-chip-n { color: ${INK}; }
  .wt-chip[aria-current="page"] .wt-chip-n { color: rgba(255,255,255,.75); }

  .wt-page { transition: background .14s ease, color .14s ease; }
  .wt-page:hover { background: ${CHIP}; }
  .wt-page:focus-visible { outline: 2px solid ${INK}; outline-offset: 2px; }

  /* 더보기 — 섹션 제목 옆에 붙는 링크. 밑줄 없는 평문 + 화살표(헤더 nav
     탭과는 다른 신호, "이동"임을 화살표로만 말한다). */
  .wt-more { font-size: 13px; font-weight: 700; color: ${MUTED}; text-decoration: none;
    transition: color .14s ease; }
  .wt-more:hover { color: ${INK}; text-decoration: underline; text-underline-offset: 3px; }
  .wt-more:focus-visible { outline: 2px solid ${INK}; outline-offset: 3px; border-radius: 4px; }

  @media (prefers-reduced-motion: reduce) {
    .wt-card, .wt-poster-fg, .wt-chip, .wt-page, .wt-arrow, .wt-more { transition: none; }
    .wt-card:hover { transform: none; }
    .wt-card:hover .wt-poster-fg { transform: none; }
  }
`;

/** 섹션 머리 — title + (편수 텍스트 또는 "더보기" 링크 중 하나). */
export function SectionHead({
  title,
  sub,
  moreHref,
}: {
  title: string;
  /** 편수 등 정보 텍스트 — moreHref 가 있으면 무시된다(둘 중 하나만 쓴다). */
  sub?: string;
  /** 지정하면 sub 대신 "더보기 →" 링크를 그린다. */
  moreHref?: string;
}) {
  return (
    <header className="flex items-baseline" style={{ gap: 8, marginBottom: 16 }}>
      <h2 style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em', color: INK }}>{title}</h2>
      {moreHref ? (
        <Link href={moreHref} className="wt-more">
          더보기 →
        </Link>
      ) : (
        sub && (
          <p style={{ fontSize: 13, color: MUTED, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{sub}</p>
        )
      )}
    </header>
  );
}

/**
 * 세로 포스터 — 2:3. object-fit: cover로 원본을 세로 박스에 꽉 채운다
 * (2026-08-21, "뿌연 레터박스 없이 사진으로만 채워 달라" 요청으로 이전의
 * contain+블러 배경 방식을 대체했다).
 *
 * 트레이드오프를 기록해 둔다: 원본 표지 대부분이 3:2 가로(실측 24장 중
 * 22장)라 2:3 세로로 자르면 원본 폭의 절반 이상이 잘려나가고, 좌하단/
 * 좌상단에 그려진 캡션 박스(예:「성과급 갈등이 원인」)가 크롭 경계에
 * 걸리는 편이 있을 수 있다. 이건 사용자가 "사진 확대되어도 된다"고 명시적
 * 으로 확인한 트레이드오프다 — 세로 비율을 채우는 것이 캡션 보존보다
 * 우선한다.
 */
export function SeriesPoster({
  series,
  size,
  sizes,
  priority,
}: {
  series: WebtoonSeries;
  size: 'lg' | 'md';
  sizes: string;
  priority?: boolean;
}) {
  const src = coverThumb(series.coverImageUrl, size);
  return (
    <div className="wt-poster">
      {src ? (
        <div className="wt-poster-fg">
          <Image
            src={src}
            alt={`${series.title} 표지`}
            fill
            sizes={sizes}
            priority={priority}
            loading={priority ? 'eager' : 'lazy'}
            style={{ objectFit: 'cover' }}
          />
        </div>
      ) : (
        <div className="flex items-center justify-center w-full h-full relative" style={{ fontSize: 14, color: BODY }}>
          준비 중
        </div>
      )}
      <span className="wt-poster-badge">{series.latestEpisodeNumber}화</span>
    </div>
  );
}

/** 시리즈 메타 한 줄 — 카테고리·최신 업데이트 날짜. */
export function SeriesMeta({ series, showCategory }: { series: WebtoonSeries; showCategory: boolean }) {
  const parts = [
    showCategory && series.category ? series.category : null,
    `${fmtDate(series.latestDate)} 업데이트`,
  ].filter(Boolean);
  return (
    <p style={{ fontSize: 13, color: MUTED, fontWeight: 600, marginBottom: 8, fontVariantNumeric: 'tabular-nums' }}>
      {parts.join(' · ')}
    </p>
  );
}

/** 격자·레일 공용 시리즈 카드. */
export function SeriesCard({
  series,
  showCategory,
  sizes,
  eager,
}: {
  series: WebtoonSeries;
  showCategory: boolean;
  sizes: string;
  eager?: boolean;
}) {
  // series_title 백필 전에는 모든 시리즈가 1화짜리다(seriesKey()가
  // series_title 없는 편을 자기 자신 id로 묶는다, webtoonSeries.ts 참조).
  // 그 상태에서 시리즈 상세로 보내면 "카드 클릭 → 1화만 있는 시리즈
  // 목록 → 다시 클릭 → 실제 컷" 이라는 의미 없는 중간 단계가 생긴다
  // (2026-08-24, 사용자 지적). 편이 정말 여러 개로 묶인 시리즈만 시리즈
  // 상세로 보내고, 1화짜리는 그 편으로 바로 이동한다.
  const href =
    series.episodes.length > 1
      ? `/webtoon/series/${encodeURIComponent(series.slug)}`
      : `/webtoon/${encodeURIComponent(series.episodes[0].id)}`;
  return (
    <Link
      href={href}
      prefetch={false}
      className="wt-card"
      aria-label={`${series.title} ${series.latestEpisodeNumber}화`}
      style={{ display: 'flex', flexDirection: 'column' }}
    >
      <SeriesPoster series={series} size="md" sizes={sizes} priority={eager} />
      {/*
        좌우 패딩을 없앴다(2026-08-21, "왼쪽 정렬로 위 사진과 텍스트 맞춰
        달라" 요청) — 카드를 감싸던 흰 박스를 뺀 뒤에도(직전 변경) 이 12px
        패딩이 남아 있어서 제목·메타 텍스트가 포스터 왼쪽 끝보다 안쪽에서
        시작했다. 위아래 여백(간격 용도)만 유지하고 좌우는 0으로 — 텍스트가
        포스터와 같은 세로선에서 시작해야 참고 이미지처럼 보인다.
      */}
      <div style={{ padding: '12px 0 0', flex: 1 }}>
        <SeriesMeta series={series} showCategory={showCategory} />
        <h3
          className="wt-t"
          style={{
            fontSize: 16,
            fontWeight: 700,
            letterSpacing: '-0.015em',
            lineHeight: 1.4,
            color: INK,
            wordBreak: 'keep-all',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {series.title}
        </h3>
      </div>
    </Link>
  );
}

/** 카테고리 칩 바 — 데이터에 있는 카테고리만 그린다(§4 준비되지 않은 기능). */
export function CategoryChipsNav({
  categories,
  categoryCounts,
  activeCategory,
  totalCount,
  buildHref,
}: {
  categories: string[];
  categoryCounts: Map<string, number>;
  activeCategory: string | null;
  totalCount: number;
  buildHref: (cat: string | null) => string;
}) {
  if (categories.length === 0) return null;
  return (
    <nav aria-label="웹툰 카테고리" style={{ marginBottom: 32 }}>
      <ul className="wt-chips">
        <li>
          <Link href={buildHref(null)} className="wt-chip" aria-current={!activeCategory ? 'page' : undefined}>
            전체
            <span className="wt-chip-n">{totalCount}</span>
          </Link>
        </li>
        {categories.map((label) => (
          <li key={label}>
            <Link
              href={buildHref(label)}
              className="wt-chip"
              aria-current={activeCategory === label ? 'page' : undefined}
            >
              {label}
              <span className="wt-chip-n">{categoryCounts.get(label)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** 페이지 버튼 — 44x44 터치 타겟. */
export function PageLink({
  href,
  label,
  children,
  active,
  disabled,
}: {
  href: string;
  label: string;
  children: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
}) {
  const base: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 44,
    height: 44,
    borderRadius: 8,
    border: `1px solid ${active ? INK : '#e5e7eb'}`,
    background: active ? INK : '#fff',
    fontSize: 14,
    fontWeight: 700,
    color: active ? '#fff' : disabled ? '#9ca3af' : BODY,
    textDecoration: 'none',
    fontVariantNumeric: 'tabular-nums',
  };
  if (disabled) {
    return <span aria-hidden style={{ ...base, border: 'none', visibility: 'hidden' }} />;
  }
  return (
    <Link
      href={href}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      className={active ? undefined : 'wt-page'}
      style={{ ...base, pointerEvents: active ? 'none' : undefined }}
    >
      {children}
    </Link>
  );
}
