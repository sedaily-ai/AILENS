/**
 * 공통 헤더 탭 정의 — 모든 페이지에서 같은 순서·라벨·URL 보장.
 * 새 탭 추가/순서 변경 시 이 파일 한 곳만 수정.
 */

export type HeaderTabKey =
  | 'feed'
  | 'trend'
  | 'column'
  | 'lens'
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
    // 홈(오늘의 피드)이 아니라 전체 레터 모음(/letters)으로 간다 — 2026-08-06
    // 이전엔 '/'였는데, 사용자가 "레터 탭 = 레터들이 모인 곳"으로 기대해서 바꿨다.
    // 홈으로 돌아가는 길은 로고 클릭.
    //
    // 라벨 워딩 개편(2026-08-12) — "레터/트렌드/칼럼"이 서로 다른 축(형식 vs
    // 장르)으로 이름 붙어 있어 나란히 두면 뭐가 다른지 헷갈린다는 지적.
    // "브리핑/딥다이브/인사이트"로 통일 — 셋 다 "이 글이 어떤 성격인지"를
    // 말하는 축(빠른 요약/깊은 분석/개인 관점)으로 맞췄고, 폴인·어피티 같은
    // 경제 콘텐츠 플랫폼에서 이미 통용되는 단어라 가볍지 않으면서 트렌디함도
    // 챙긴다. URL(key/href)은 그대로 — SEO(캐노니컬·sitemap)에 영향 없음,
    // 화면에 보이는 한글 라벨만 바뀐다.
    { key: 'feed', label: '브리핑', href: '/letters', active: active === 'feed' },
    { key: 'trend', label: '딥다이브', href: '/trend', active: active === 'trend', tier: 'extra' },
    { key: 'column', label: '인사이트', href: '/column', active: active === 'column', tier: 'extra' },
    // 2026-08-13 추가 — "4가지 시선"이 홈 티저 링크로만 도달 가능해서 SEO상
    // 사이트 전역 내비게이션에서 발견이 안 되는 문제(사용자 확인 후 추가).
    { key: 'lens', label: '시선', href: '/lens', active: active === 'lens', tier: 'extra' },
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
    { key: 'webtoon', label: '웹툰', href: '/webtoon', active: active === 'webtoon', tier: 'extra' },
  ];
}
