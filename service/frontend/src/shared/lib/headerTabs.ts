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
 * '타임라인' 탭이 가리키는 경로 — **단일 출처**.
 *
 * FeedPage 와 캘린더 페이지는 in-page 탭 전환(onClick) 때문에 `buildHeaderTabs()`
 * 를 쓰지 못하고 탭 배열을 각자 하드코딩한다. 그 사본들이 예전 경로
 * (`/timemachine`) 를 들고 있어서 페이지마다 같은 라벨이 다른 곳으로 가는
 * 문제가 있었다. **경로 값만이라도 여기서 한 번만 정의**해 재발을 막는다.
 */
export const TIMELINE_HREF = '/timeline';

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
    // 2026-08-05 까지 `/timemachine` 을 가리키고 있었다 — `/timeline` 에 들어왔다가
    // 다른 탭에 다녀온 뒤 이 탭을 누르면 구 페이지로 빠지는 문제의 원인.
    // `/timemachine`(유명인·투자 시뮬레이션 4탭) 은 직접 URL 로 남겨둔다.
    { key: 'timeline', label: '타임라인', href: TIMELINE_HREF, active: active === 'timeline' },
    { key: 'games', label: '게임', href: '/games', active: active === 'games' },
    { key: 'community', label: '커뮤니티', href: '/?tab=community', active: active === 'community' },
    { key: 'archive', label: '내 서랍', href: '/?tab=archive', active: active === 'archive' },
  ];
}
