// buildArchiveItems를 'use client' 파일에 두면 서버 컴포넌트(page.tsx)에서 호출할 수 없다("client function from the server" 에러).
// 순수 함수·타입만 이 파일로 분리해 서버·클라이언트 양쪽에서 import한다.
import { letterHref } from '@/shared/lib/content/letterHref';
import { displayHeadline } from '@/shared/lib/content/displayHeadline';
import { withDisplayMeta, toTodayLetterCard } from '@/shared/lib/api/todayLettersApi';
import type { CmsLetter, CmsTrendCard, CmsVideo, CmsLens } from '@/shared/lib/api/cmsPostsApi';
import { LENS_ACCENT } from '@/shared/constants/lensPerspectives';
import { lensPath } from '@/shared/lib/content/lensUrl';

export const PAGE_SIZE = 100;

type Kind = 'letter' | 'trend' | 'column' | 'video' | 'issue_talk' | 'lens';

export interface ArchiveItem {
  key: string;
  kind: Kind;
  title: string;
  excerpt: string;
  date: string;
  accent: string;
  href: string | null;
  /** true면 외부 링크(target=_blank) — 지금은 video만 해당(원본 유튜브 URL). */
  external?: boolean;
  avatarUrl: string | null;
  /** 경제 버티컬 카테고리(증시/부동산/산업/금융·정책/국제). letter 항목만 값이 있으며 카테고리 아카이브 페이지가 kind와 무관하게 이 값으로 필터링한다(shared/constants/econCategories.ts 참조). */
  category?: string | null;
  /** 하위 카테고리(econSubcategories.ts 참조). lens 항목만 값이 있고 증시·산업만 백필돼 있다. */
  subcategory?: string | null;
  /** 발행 완료 시각(ISO, UTC). lens·letter·video는 백엔드가 노출하며 trend/column(cardItems)에는 없다. 없으면 ArticleCard가 날짜(date)만 표시한다(shared/lib/date.ts kstDateTimeLabel). */
  publishedAt?: string | null;
  /** "오늘의 지면" 특별 코너 값(전체/증권/산업/시그널, lens.paper_section 그대로). lens 항목만 값이 있으며 category(주제)와 별개 축이다.
   *  홈 LensPreviewSection.tsx가 이 값으로 4지면 티저 탭을 뽑는다. "시그널"은 본지 GNB의 "Market Signal"에 대응하는 카테고리라
   *  econCategories.ts에 filterBy: 'paperSection' 카테고리(/signal)로도 등록되어 있으며, category가 아니라 이 필드로 거른다. */
  paperSection?: string | null;
}

const TREND_ACCENT = '#dc2626';
const COLUMN_ACCENT = '#059669';
const VIDEO_ACCENT = '#7c3aed';
// 서버(빌드타임)와 클라이언트(재검증 fetch) 양쪽에서 같은 원본 데이터를 같은 규칙으로 합치는 순수 함수.
// SSG 초기 렌더와 이후 client refresh가 서로 다른 결과를 만들지 않게 한다.
// 모든 카테고리가 같은 조건으로 제목만 표출하므로 badgeLabel 같은 킥커 필드는 두지 않는다.
export function buildArchiveItems(
  letters: CmsLetter[],
  cards: CmsTrendCard[],
  videos: CmsVideo[],
  // lens("4가지 시선") 글을 카테고리 페이지(/markets 등)에 letters와 함께 노출하기 위한 인자다.
  // 인자를 넘기지 않으면 빈 배열이라 기존 호출부(archive 허브, 홈) 동작은 바뀌지 않는다.
  lens: CmsLens[] = [],
): ArchiveItem[] {
  // channel=letters 조회는 admin_channel='letters'뿐 아니라 letter 포맷 rendition이 있는 모든 글(거의 모든 lens 글)을 같이 돌려준다
  // (cms_posts_repo.py의 channel=video/webtoon과 같은 설계). letters·lens를 함께 넘기는 호출부(카테고리 페이지 등)에서
  // 같은 글이 두 번 뜨지 않도록 id(=post slug)가 겹치면 4포맷 전체를 담은 lens 버전만 남긴다.
  const lensIds = new Set(lens.map((l) => l.id));
  const dedupedLetters = letters.filter((letter) => !lensIds.has(letter.id));

  const letterItems: ArchiveItem[] = dedupedLetters.map((letter) => {
    const meta = withDisplayMeta(letter);
    const date = letter.publish_date ?? '';
    const id = letter.id;
    // "오늘의 이슈"(분류 없음)는 이슈 톡톡 전용 아카이브다. 딥다이브·인사이트로 명시 분류된 글만 그 아카이브로 가고 나머지는 이슈 톡톡으로 간다
    // ('letter' kind는 현재 나오는 글이 없지만 ArchiveList 등에서 참조하므로 타입은 유지한다).
    const kind: Kind =
      letter.section === 'trend' || letter.section === 'column'
        ? letter.section
        : 'issue_talk';
    // 썸네일·발췌는 카드용으로 이미 계산해 주는 toTodayLetterCard(subtitle 없으면 본문 첫 줄, cover_image_url 없으면 썸네일 없음)를 재사용해 로직 중복을 막는다.
    const card = toTodayLetterCard(letter, date);
    return {
      key: `letter-${letter.id}`,
      kind,
      title: displayHeadline(letter.headline),
      excerpt: card.excerpt,
      date,
      accent: meta.accent,
      href: letterHref(id),
      avatarUrl: card.thumbnailUrl,
      category: letter.category ?? null,
      publishedAt: letter.published_at ?? null,
    };
  });

  const cardItems: ArchiveItem[] = cards.map((c) => ({
    key: `${c.section}-${c.id}`,
    kind: c.section === 'trend' ? 'trend' : 'column',
    title: c.title,
    excerpt: c.excerpt,
    date: c.date,
    accent: c.section === 'trend' ? TREND_ACCENT : COLUMN_ACCENT,
    href: null,
    avatarUrl: null,
  }));

  const videoItems: ArchiveItem[] = videos.map((v) => ({
    key: `video-${v.id}`,
    kind: 'video' as const,
    title: v.title,
    excerpt: v.excerpt,
    date: v.date,
    accent: VIDEO_ACCENT,
    href: v.video_url || null,
    external: true,
    avatarUrl: v.thumbnail_url || null,
    publishedAt: v.published_at ?? null,
  }));

  const lensItems: ArchiveItem[] = lens.map((l) => ({
    key: `lens-${l.id}`,
    kind: 'lens' as const,
    title: displayHeadline(l.headline),
    excerpt: l.context,
    date: l.date,
    accent: LENS_ACCENT,
    href: lensPath(l),
    avatarUrl: l.photo_image_url || l.cover_image_url || null,
    category: l.category ?? null,
    subcategory: l.subcategory ?? null,
    paperSection: l.paper_section ?? null,
    publishedAt: l.published_at ?? null,
  }));

  return [...letterItems, ...cardItems, ...videoItems, ...lensItems].sort((a, b) =>
    b.date.localeCompare(a.date),
  );
}
