// buildArchiveItems를 'use client' 파일(LettersArchiveClient.tsx)에 같이 두면
// 서버 컴포넌트(page.tsx)에서 못 부른다 — "client function from the server"
// 에러. 순수 함수·타입만 이 파일로 분리해서 서버·클라이언트 양쪽에서 같이
// import 한다(2026-08-07, 목록 페이지 SSG 전환 중 발견).
import { letterHref } from '@/shared/lib/letterHref';
import { withDisplayMeta } from '@/shared/lib/todayLettersApi';
import type { CmsLetter, CmsTrendCard, CmsVideo } from '@/shared/lib/cmsPostsApi';

export const PAGE_SIZE = 100;

export type Kind = 'letter' | 'trend' | 'column' | 'video';

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
  badgeLabel: string;
}

export const TREND_ACCENT = '#dc2626';
export const COLUMN_ACCENT = '#059669';
export const VIDEO_ACCENT = '#7c3aed';

// 서버(빌드타임)와 클라이언트(재검증 fetch) 양쪽에서 같은 원본 데이터를 같은
// 규칙으로 합치기 위한 순수 함수 — SSG 초기 렌더와 이후 client refresh가
// 서로 다른 결과를 만들지 않게 한다(2026-08-07, 목록 페이지 SSG 감사).
export function buildArchiveItems(
  letters: CmsLetter[],
  cards: CmsTrendCard[],
  videos: CmsVideo[],
): ArchiveItem[] {
  const letterItems: ArchiveItem[] = letters.map((letter) => {
    const meta = withDisplayMeta(letter);
    const date = letter.publish_date ?? '';
    const id = letter.id;
    const kind: Kind = letter.section === 'trend' || letter.section === 'column' ? letter.section : 'letter';
    return {
      key: `letter-${letter.id}`,
      kind,
      title: letter.headline,
      excerpt: letter.subtitle ?? '',
      date,
      accent: meta.accent,
      href: letterHref(id),
      avatarUrl: null,
      badgeLabel: meta.editorRole,
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
    badgeLabel: c.category || (c.section === 'trend' ? '경제 이슈' : '칼럼'),
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
    avatarUrl: null,
    badgeLabel: '영상',
  }));

  return [...letterItems, ...cardItems, ...videoItems].sort((a, b) => b.date.localeCompare(a.date));
}
