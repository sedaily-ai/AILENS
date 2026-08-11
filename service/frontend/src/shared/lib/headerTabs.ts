/**
 * 공통 헤더 탭 정의 — 모든 페이지에서 같은 순서·라벨·URL 보장.
 * 새 탭 추가/순서 변경 시 이 파일 한 곳만 수정.
 */

export type HeaderTabKey =
  | 'feed'
  | 'fortune'
  | 'timeline'
  | 'games'
  | 'webtoon'
  | 'archive';

export interface HeaderTab {
  key: HeaderTabKey;
  label: string;
  href: string;
  active?: boolean;
  tier?: 'core' | 'extra';
}

/**
 * '타임라인' 탭이 가리키는 경로 — **단일 출처**.
 *
 * FeedPage 는 in-page 탭 전환(onClick) 때문에 `buildHeaderTabs()`
 * 를 쓰지 못하고 탭 배열을 하드코딩한다. 그 사본이 예전 경로
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
    // 홈(오늘의 피드)이 아니라 전체 레터 모음(/letters)으로 간다 — 2026-08-06
    // 이전엔 '/'였는데, 사용자가 "레터 탭 = 레터들이 모인 곳"으로 기대해서 바꿨다.
    // 홈으로 돌아가는 길은 로고 클릭.
    { key: 'feed', label: '레터', href: '/letters', active: active === 'feed' },
    // '내 서랍' 탭도 네비게이션에서 제거(2026-08-06) — 커뮤니티 대체로
    // "오늘의 한 문장 + 다른 사람들이 담은 문장 + 내 문장" 3단 구조까지
    // 만들었지만, 워딩(서랍→스크랩) 논의 끝에 상시 탭으로 노출하기보다
    // 일단 빼기로 결정. 페이지(/?tab=archive)·저장 기능 자체는 그대로
    // 살아있다 — 다시 노출할 땐 여기 한 줄만 추가하면 된다.
    // 탭 8개가 전부 같은 무게로 나열돼 "많아 보인다"는 피드백(2026-08-06) —
    // 뉴닉 참고: 드롭다운으로 숨기면 클릭이 한 번 더 필요해 덜 효율적이니,
    // 개수는 그대로 두고 tier:'extra'로 굵기·크기·색만 낮춰 "덤"으로 구분한다
    // (Header.tsx가 core→extra 전환 지점에 구분선을 자동으로 그려준다).
    //
    // '에디터' 탭 제거(2026-08-06) — extra 티어 강등을 거쳐 최종적으로 뺐다.
    // 이후 MBTI 페르소나 컨셉 전면 삭제 결정으로 /editors 페이지 자체도
    // 제거됨 — TodayLensClient 등의 잔여 링크도 함께 정리했다.
    // 2026-08-09 — 자체 미니 사주 위젯을 걷어내고 진짜 사주 서비스(AI-saju
    // 별도 레포, saju.sedaily.ai)를 CloudFront 경로 라우팅(/saju*)으로 마운트.
    // en.sedaily.com이 /atlas*를 별도 레포로 라우팅하는 것과 같은 패턴 —
    // 이 경로는 AILENS Next.js 라우터를 거치지 않고 CDN 단에서 바로 다른
    // origin으로 넘어간다(app/fortune 페이지 자체는 더 이상 없음).
    { key: 'fortune', label: '사주', href: '/saju', active: active === 'fortune', tier: 'extra' },
    // 2026-08-05 까지 `/timemachine` 을 가리키고 있었다 — `/timeline` 에 들어왔다가
    // 다른 탭에 다녀온 뒤 이 탭을 누르면 구 페이지로 빠지는 문제의 원인.
    // `/timemachine`(유명인·투자 시뮬레이션 4탭) 은 직접 URL 로 남겨둔다.
    { key: 'timeline', label: '타임라인', href: TIMELINE_HREF, active: active === 'timeline', tier: 'extra' },
    { key: 'games', label: '게임', href: '/games', active: active === 'games', tier: 'extra' },
    { key: 'webtoon', label: '웹툰', href: '/webtoon', active: active === 'webtoon', tier: 'extra' },
  ];
}
