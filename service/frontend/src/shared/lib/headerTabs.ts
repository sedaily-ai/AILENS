/**
 * 공통 헤더 탭 정의 — 모든 페이지에서 같은 순서·라벨·URL 보장.
 * 새 탭 추가/순서 변경 시 이 파일 한 곳만 수정.
 */

export type HeaderTabKey =
  | 'feed'
  | 'editors'
  | 'fortune'
  | 'timeline'
  | 'games'
  | 'community'
  | 'archive';

export interface HeaderTab {
  key: HeaderTabKey;
  label: string;
  href: string;
  active?: boolean;
}

/**
 * 표준 헤더 탭. 어느 페이지에서든 buildTabs('xxx') 호출 → active 만 다름.
 *
 * FeedPage 처럼 in-page tab switch (커뮤니티/내 서랍 클릭이 router 가 아니라
 * 같은 페이지의 sub-tab 전환) 인 경우는 이 헬퍼 안 쓰고 자체 onClick 패턴 유지.
 */
export function buildHeaderTabs(active?: HeaderTabKey): HeaderTab[] {
  return [
    { key: 'feed', label: '레터', href: '/', active: active === 'feed' },
    { key: 'editors', label: '에디터', href: '/editors', active: active === 'editors' },
    { key: 'fortune', label: '사주', href: '/fortune', active: active === 'fortune' },
    { key: 'timeline', label: '타임라인', href: '/timemachine', active: active === 'timeline' },
    { key: 'games', label: '게임', href: '/games', active: active === 'games' },
    { key: 'community', label: '커뮤니티', href: '/?tab=community', active: active === 'community' },
    { key: 'archive', label: '내 서랍', href: '/?tab=archive', active: active === 'archive' },
  ];
}
