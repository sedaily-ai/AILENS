/**
 * 공통 헤더 탭 정의 — 모든 페이지에서 같은 순서·라벨·URL 보장.
 * 새 탭 추가/순서 변경 시 이 파일 한 곳만 수정.
 */

import { ECON_CATEGORIES } from '@/shared/constants/econCategories';

export type HeaderTabKey =
  | 'markets'
  | 'signal'
  | 'property'
  | 'industry'
  | 'finance'
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
  // 'more' — 콘텐츠 브라우징이 아닌 부가 기능(웹툰/영상/사주/타임라인/게임).
  // 카테고리 6개가 추가되며 1차 줄이 12개로 늘어 잘리는 문제가 생겨(2026-08-17,
  // 사용자 확인), Header.tsx가 이 값을 가진 탭만 "더보기" 드롭다운으로 묶는다.
  tier?: 'core' | 'extra' | 'more';
  /** true면 next/link 소프트 내비게이션 대신 일반 <a> 하드 내비게이션을 쓴다 —
   *  이 탭이 별도 Next.js 앱(다른 zone)으로 rewrite되는 경로라, 클라이언트
   *  라우터가 자기 앱의 RSC 포맷으로 잘못 읽으려다 화면이 안 바뀌는 문제 방지. */
  hardNav?: boolean;
}

/**
 * '타임라인' 탭이 가리키는 경로 — **단일 출처**.
 *
 * FeedPage 는 in-page 탭 전환(onClick) 때문에 `buildHeaderTabs()`
 * 를 쓰지 못하고 탭 배열을 하드코딩한다. 그 사본이 예전 경로
 * (`/timemachine`) 를 들고 있어서 페이지마다 같은 라벨이 다른 곳으로 가는
 * 문제가 있었다. **경로 값만이라도 여기서 한 번만 정의**해 재발을 막는다.
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
    // "시선"(4가지 시선) 탭은 2026-08-17에 상단 nav에서 제거했다 — 2026-08-16엔
    // "서비스 핵심 차별화 포인트"라는 판단으로 유일한 core 탭까지 승격시켰는데,
    // 바로 다음 라운드에서 "카테고리로서 애매하다"는 사용자 피드백으로 뒤집혔다.
    // /lens 페이지·홈 화면 "오늘의 이슈, 4가지 시선" 섹션은 그대로 유지 —
    // nav 진입점만 없앤 것("브리핑"/"인사이트"를 letters/column 페이지는
    // 남기고 nav에서만 뺀 것과 같은 처리).
    //
    // 상단 탭 구조 개편(2026-08-17) — "브리핑"/"인사이트"(형식 기준: 빠른
    // 요약/개인 관점)를 걷어내고 주제 기준 6개로 교체했다. "독자가 형식
    // 차이를 구분하기 어렵다"는 판단 + 서울경제 영문사이트(Markets/Property/
    // Business/Finance/International) 구조를 참고 — 같은 발행사 브랜드 체계와
    // 맞춘다. "재테크"만 본지엔 없는 섹션인데 AI LENS 자체 차별점(개인 관점
    // 리라이팅)이라 남겼다. 카테고리 정의는 shared/constants/econCategories.ts
    // 한 곳 — admin/frontend의 ECON_CATEGORIES(lib/types.ts)와 같은 목록이지만
    // 별도 Next.js 앱이라 의도적으로 중복.
    //
    // /letters, /column 아카이브 목록 페이지는 2026-08-18에 완전히 정리했다
    // — 처음엔 "색인된 URL 보존" 목적으로 nav에서만 빼고 페이지는 남겨뒀지만,
    // 카테고리 6개 체계로 완전히 넘어가기로 확정되며 두 페이지 다 사이트 안
    // 어디서도 도달 불가능한 상태였다("전체 모아보기" 역할은 /archive가 이미
    // 이어받음). 지금은 "딥다이브"/trend와 동일하게 /archive로 영구
    // 리다이렉트(next.config.ts) — /letters/[id]·/letters/view 같은 개별
    // 상세 라우트는 그대로 살아있다.
    //
    // tier:'core' — 시선이 빠지면서 유일한 core 탭이 없어졌는데, 카테고리
    // 6개가 이제 사실상 1차 콘텐츠 내비게이션이라 core로 승격했다(사용자가
    // 명시로 요청한 건 아니지만, core 탭이 하나도 없는 상태보다 자연스럽다
    // — 시선처럼 다시 이상하면 되돌리기 쉬운 판단).
    ...ECON_CATEGORIES.map((c) => ({
      key: c.slug as HeaderTabKey,
      label: c.label,
      href: `/${c.slug}`,
      active: active === c.slug,
      tier: 'core' as const,
    })),
    // 2026-08-16 — 오락성 탭(웹툰/영상/게임) 중 웹툰이 맨 뒤로 밀려 있던 걸
    // 앞으로 당김(사용자 확인) — "오락성들보다도 뒤에 있으면 안 된다".
    // 2026-08-17 — tier를 'extra'에서 'more'로: 카테고리 6개가 추가되며
    // 1차 줄이 12개까지 늘어 "더보기" 드롭다운으로 옮겼다(Header.tsx 참조).
    // 2026-10-04 — 웹툰·영상·오디오 탭 제거(목록 페이지 폐기, 홈은 미리보기만).
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
    // 2026-08-05 까지 `/timemachine` 을 가리키고 있었다 — `/timeline` 에 들어왔다가
    // 다른 탭에 다녀온 뒤 이 탭을 누르면 구 페이지로 빠지는 문제의 원인.
    // `/timemachine`(유명인·투자 시뮬레이션 4탭) 은 직접 URL 로 남겨둔다.
    { key: 'timeline', label: '타임라인', href: TIMELINE_HREF, active: active === 'timeline', tier: 'more' },
    { key: 'games', label: '게임', href: '/games', active: active === 'games', tier: 'more' },
  ];
}
