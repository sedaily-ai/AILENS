/**
 * 공통 헤더 탭 정의 — 모든 페이지에서 같은 순서·라벨·URL 보장.
 * 새 탭 추가/순서 변경 시 이 파일 한 곳만 수정.
 */

import { ECON_CATEGORIES } from '@/shared/constants/econCategories';

export type HeaderTabKey =
  | 'markets'
  | 'property'
  | 'economy'
  | 'finance'
  | 'industry'
  | 'politics'
  | 'national'
  | 'international'
  | 'investing'
  | 'culture'
  | 'video'
  | 'listen'
  | 'timeline'
  | 'games'
  | 'webtoon'
  | 'archive';

export interface HeaderTab {
  key: HeaderTabKey;
  label: string;
  href: string;
  active?: boolean;
  // 'more': 콘텐츠 브라우징이 아닌 부가 기능(타임라인/게임). Header.tsx가 이 값을 가진 탭만 "더보기" 드롭다운으로 묶는다.
  tier?: 'core' | 'extra' | 'more';
  /** true면 next/link 소프트 내비게이션 대신 일반 <a> 하드 내비게이션을 쓴다. 이 탭이 별도 Next.js 앱(다른 zone)으로 rewrite되는 경로라, 클라이언트 라우터가 자기 앱의 RSC 포맷으로 읽으려다 화면이 안 바뀌는 문제를 막는다. */
  hardNav?: boolean;
}

/**
 * '타임라인' 탭이 가리키는 경로. 단일 출처.
 *
 * FeedPage는 in-page 탭 전환(onClick) 때문에 `buildHeaderTabs()`를 쓰지 못하고 탭 배열을 하드코딩하므로,
 * 경로 값만이라도 여기서 한 번만 정의해 페이지마다 같은 라벨이 다른 곳으로 가는 일을 막는다.
 */
const TIMELINE_HREF = '/timeline';

/**
 * 표준 헤더 탭. 어느 페이지에서든 buildTabs('xxx') 호출 → active 만 다름.
 *
 * FeedPage 처럼 in-page tab switch (커뮤니티/내 서랍 클릭이 router 가 아니라
 * 같은 페이지의 sub-tab 전환) 인 경우는 이 헬퍼 안 쓰고 자체 onClick 패턴 유지.
 */
export function buildHeaderTabs(active?: HeaderTabKey): HeaderTab[] {
  return [
    // 상단 탭은 주제 기준 9개 카테고리(tier 'core')다. 정의는 shared/constants/econCategories.ts 한 곳이며,
    // admin/frontend의 ECON_CATEGORIES와 같은 목록이지만 별도 Next.js 앱이라 의도적으로 중복한다.
    // "시선" 탭은 상단 nav에 두지 않는다(/lens 페이지와 홈 "오늘의 이슈, 4가지 시선" 섹션은 유지).
    // /letters, /column 아카이브 목록은 /lens로 영구 리다이렉트된다(next.config.ts). /letters/[id]·/letters/view 상세 라우트는 유지된다.
    ...ECON_CATEGORIES.map((c) => ({
      key: c.slug as HeaderTabKey,
      label: c.label,
      href: `/${c.slug}`,
      active: active === c.slug,
      tier: 'core' as const,
    })),
    // 부가 기능 탭(tier 'more')은 Header.tsx의 "더보기" 드롭다운으로 묶인다.
    // '내 서랍' 탭은 노출하지 않는다. 페이지(/?tab=archive)와 저장 기능은 유지되며, 다시 노출하려면 여기에 한 줄만 추가한다.
    // 타임라인은 `/timeline`을 가리킨다. 옛 `/timemachine`(유명인·투자 시뮬레이션)은 직접 URL로만 남긴다.
    { key: 'timeline', label: '타임라인', href: TIMELINE_HREF, active: active === 'timeline', tier: 'more' },
    { key: 'games', label: '게임', href: '/games', active: active === 'games', tier: 'more' },
  ];
}
