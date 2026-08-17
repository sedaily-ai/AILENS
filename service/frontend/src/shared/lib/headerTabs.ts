/**
 * 공통 헤더 탭 정의 — 모든 페이지에서 같은 순서·라벨·URL 보장.
 * 새 탭 추가/순서 변경 시 이 파일 한 곳만 수정.
 */

import { ECON_CATEGORIES } from '@/shared/constants/econCategories';

export type HeaderTabKey =
  | 'lens'
  | 'markets'
  | 'property'
  | 'industry'
  | 'finance'
  | 'international'
  | 'investing'
  | 'video'
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
export const TIMELINE_HREF = '/timeline';

/**
 * 표준 헤더 탭. 어느 페이지에서든 buildTabs('xxx') 호출 → active 만 다름.
 *
 * FeedPage 처럼 in-page tab switch (커뮤니티/내 서랍 클릭이 router 가 아니라
 * 같은 페이지의 sub-tab 전환) 인 경우는 이 헬퍼 안 쓰고 자체 onClick 패턴 유지.
 */
export function buildHeaderTabs(active?: HeaderTabKey): HeaderTab[] {
  return [
    // 2026-08-16 — "시선"(4가지 시선)이 서비스의 핵심 차별화 포인트라는 판단으로
    // 탭 최상단으로 이동(사용자 확인). 2026-08-13에는 SEO 발견성 문제로 전역
    // 내비게이션에 처음 추가됐었다. 2026-08-17 — 유일한 core 티어 탭으로 승격
    // (아래 참조) — 다른 모든 탭이 extra로 내려가면서 시선만 남는 게 아니라,
    // "형식(브리핑/인사이트)보다 이 기능 자체가 상단에서 도드라져야 한다"는
    // 판단(사용자 확인)에 따른 의도적 배치.
    { key: 'lens', label: '시선', href: '/lens', active: active === 'lens' },
    // 상단 탭 구조 개편(2026-08-17) — "브리핑"/"인사이트"(형식 기준: 빠른
    // 요약/개인 관점)를 걷어내고 주제 기준 6개로 교체했다. "독자가 형식
    // 차이를 구분하기 어렵다"는 판단 + 서울경제 영문사이트(Markets/Property/
    // Business/Finance/International) 구조를 참고 — 같은 발행사 브랜드 체계와
    // 맞춘다. "재테크"만 본지엔 없는 섹션인데 AI LENS 자체 차별점(개인 관점
    // 리라이팅)이라 남겼다. 카테고리 정의는 shared/constants/econCategories.ts
    // 한 곳 — admin/frontend의 ECON_CATEGORIES(lib/types.ts)와 같은 목록이지만
    // 별도 Next.js 앱이라 의도적으로 중복.
    //
    // 기존 /letters, /column 페이지 자체는 안 지웠다 — 색인된 URL 보존,
    // 다만 이 nav에서는 빠진다("딥다이브"/trend를 완전히 리다이렉트로
    // 없앤 것과는 다른 처리 — letters/column은 여전히 실제 콘텐츠 아카이브라
    // 링크가 죽을 이유가 없다).
    //
    // 전부 tier:'extra' — 시선 하나만 core로 남기고, 나머지 11개(카테고리
    // 6 + 웹툰/영상/사주/타임라인/게임)는 무게를 낮춘다(사용자 확인).
    ...ECON_CATEGORIES.map((c) => ({
      key: c.slug as HeaderTabKey,
      label: c.label,
      href: `/${c.slug}`,
      active: active === c.slug,
      tier: 'extra' as const,
    })),
    // 2026-08-16 — 오락성 탭(웹툰/영상/게임) 중 웹툰이 맨 뒤로 밀려 있던 걸
    // 앞으로 당김(사용자 확인) — "오락성들보다도 뒤에 있으면 안 된다".
    { key: 'webtoon', label: '웹툰', href: '/webtoon', active: active === 'webtoon', tier: 'extra' },
    { key: 'video', label: '영상', href: '/video', active: active === 'video', tier: 'extra' },
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
    // 프로덕션은 이 경로가 AILENS Next.js 라우터를 거치지 않고 CDN 단에서
    // 바로 다른 origin으로 넘어간다(app/fortune 페이지 자체는 더 이상 없음).
    // 로컬 dev(2026-08-15, saju 완전 분리 이후)에선 SAJU_ORIGIN rewrite로
    // 같은 걸 흉내내는데, 이건 완전히 다른 Next.js 앱(zone)이라 next/link
    // 소프트 내비게이션이 안 먹는다(RSC 포맷이 앱마다 달라서) — hardNav로
    // 일반 <a> 내비게이션을 쓰게 한다.
    { key: 'fortune', label: '사주', href: '/saju', active: active === 'fortune', tier: 'extra', hardNav: true },
    // 2026-08-05 까지 `/timemachine` 을 가리키고 있었다 — `/timeline` 에 들어왔다가
    // 다른 탭에 다녀온 뒤 이 탭을 누르면 구 페이지로 빠지는 문제의 원인.
    // `/timemachine`(유명인·투자 시뮬레이션 4탭) 은 직접 URL 로 남겨둔다.
    { key: 'timeline', label: '타임라인', href: TIMELINE_HREF, active: active === 'timeline', tier: 'extra' },
    { key: 'games', label: '게임', href: '/games', active: active === 'games', tier: 'extra' },
  ];
}
