// buildArchiveItems를 'use client' 파일(LettersArchiveClient.tsx)에 같이 두면
// 서버 컴포넌트(page.tsx)에서 못 부른다 — "client function from the server"
// 에러. 순수 함수·타입만 이 파일로 분리해서 서버·클라이언트 양쪽에서 같이
// import 한다(2026-08-07, 목록 페이지 SSG 전환 중 발견).
import { letterHref } from '@/shared/lib/letterHref';
import { withDisplayMeta, toTodayLetterCard } from '@/shared/lib/api/todayLettersApi';
import type { CmsLetter, CmsTrendCard, CmsVideo, CmsLens } from '@/shared/lib/api/cmsPostsApi';
import { LENS_ACCENT } from '@/shared/constants/lensPerspectives';
import { lensPath } from '@/shared/lib/lensUrl';

export const PAGE_SIZE = 100;

export type Kind = 'letter' | 'trend' | 'column' | 'video' | 'issue_talk' | 'lens';

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
  /** 경제 버티컬 카테고리(증시/부동산/산업/금융·정책/국제, 2026-08-17
   *  신설) — letter 항목만 값이 있다. 상단 탭이 형식(브리핑/인사이트)에서
   *  주제 기반으로 바뀌면서, 카테고리 아카이브 페이지가 kind와 무관하게
   *  이 값으로 필터링한다(shared/constants/econCategories.ts 참조). */
  category?: string | null;
  /** 하위 카테고리(2026-10-01 신설) — econSubcategories.ts 참조. lens 항목만
   *  값이 있고, 증시·산업만 당장 백필돼 있다. */
  subcategory?: string | null;
  /** 발행 완료 시각(ISO, UTC) — 2026-08-23 lens부터 시작해서 같은 날 letter/
   *  video까지 백엔드가 노출하도록 넓혔다("이 서비스에 있는 건 날짜만
   *  말고 시간/분도 있어야 함" — 사용자 요청). trend/column(cardItems,
   *  옛 trend_card 채널 변환분)만 아직 없다 — ArticleCard가 없으면
   *  날짜만(date) 표시로 자연스럽게 폴백한다(shared/lib/date.ts
   *  kstDateTimeLabel). */
  publishedAt?: string | null;
  /** "오늘의 지면" 특별 코너 값(전체/증권/산업/시그널, lens.paper_section
   *  그대로) — lens 항목만 값이 있다(2026-10-01 신설). category(주제
   *  카테고리)와 별개 축 — 홈 LensPreviewSection.tsx가 이 값으로 4지면
   *  티저 탭을 뽑는다. "시그널"만 본지(sedaily.com) 실제 GNB의 "Market
   *  Signal"에 대응하는 진짜 카테고리라 econCategories.ts에 filterBy:
   *  'paperSection' 카테고리(/signal)로도 승격했다(2026-10-01, 메뉴구조.html
   *  확인 후 — "증시"처럼 category로 거르는 게 아니라 이 필드로 거른다). */
  paperSection?: string | null;
}

export const TREND_ACCENT = '#dc2626';
export const COLUMN_ACCENT = '#059669';
export const VIDEO_ACCENT = '#7c3aed';
export const ISSUE_TALK_ACCENT = '#0891b2';

// 서버(빌드타임)와 클라이언트(재검증 fetch) 양쪽에서 같은 원본 데이터를 같은
// 규칙으로 합치기 위한 순수 함수 — SSG 초기 렌더와 이후 client refresh가
// 서로 다른 결과를 만들지 않게 한다(2026-08-07, 목록 페이지 SSG 감사).
//
// badgeLabel(작가 역할/카테고리 킥커) 필드는 2026-08-09에 없앴다 — letters
// 항목은 항상 고정 문구("팀이 함께 정리했어요")만 떴고, trend/column 항목은
// admin이 카테고리를 안 채우면 "경제 이슈"/"칼럼" 같은 의미 없는 기본값만
// 떴다. "모든 카테고리가 같은 조건으로 제목만 표출" 결정에 따라 전부 걷어냈다.
export function buildArchiveItems(
  letters: CmsLetter[],
  cards: CmsTrendCard[],
  videos: CmsVideo[],
  // 2026-08-20 추가 — lens("4가지 시선") 글을 카테고리 페이지(/markets 등)에
  // letters와 함께 노출하기 위함. 기존 호출부(archive 허브, 홈)는 인자를
  // 안 넘기면 그대로 빈 배열이라 동작이 안 바뀐다.
  lens: CmsLens[] = [],
): ArchiveItem[] {
  // v1.32 — channel=letters 조회는 admin_channel='letters'뿐 아니라 letter
  // 포맷 rendition이 있는 모든 글(=거의 모든 lens 글)을 같이 돌려준다
  // (cms_posts_repo.py의 channel=video/webtoon과 같은 설계, v1.30 조사
  // 참조). letters·lens 두 인자를 같이 넘기는 호출부(카테고리 페이지 등)
  // 에서는 같은 글이 두 번 카드로 뜬다(사용자 신고: "부동산"에 같은 글
  // 두 번) — id(=post slug) 기준으로 겹치면 lens 버전만 남긴다(4포맷
  // 전체를 담고 있어 더 완전하다).
  const lensIds = new Set(lens.map((l) => l.id));
  const dedupedLetters = letters.filter((letter) => !lensIds.has(letter.id));

  const letterItems: ArchiveItem[] = dedupedLetters.map((letter) => {
    const meta = withDisplayMeta(letter);
    const date = letter.publish_date ?? '';
    const id = letter.id;
    // "오늘의 이슈"(분류 없음)를 이슈 톡톡 전용 아카이빙으로 재정의(2026-08-12,
    // 사용자 요청 — "브리핑에서는 빠지고 이슈 톡톡 전용으로"). 딥다이브·인사이트로
    // 명시 분류된 글만 그 아카이브로, 나머지는 전부 이슈 톡톡('letter' kind는
    // 이제 아무 글도 안 나오지만 ArchiveList 등에서 참조할 수 있어 타입은 유지).
    const kind: Kind =
      letter.section === 'trend' || letter.section === 'column'
        ? letter.section
        : 'issue_talk';
    // 2026-08-09 — 썸네일·발췌 둘 다 카드용으로 이미 계산해주는 toTodayLetterCard
    // (FollowingFeed 등이 쓰는 것과 같은 로직: subtitle 없으면 본문 첫 줄로
    // 폴백, cover_image_url 없으면 썸네일 없음)를 그대로 재사용 — 로직 중복 방지.
    const card = toTodayLetterCard(letter, date);
    return {
      key: `letter-${letter.id}`,
      kind,
      title: letter.headline,
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
    title: l.headline,
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
