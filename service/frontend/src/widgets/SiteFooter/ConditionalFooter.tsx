'use client';

import { usePathname } from 'next/navigation';
import { SiteFooter } from './SiteFooter';

// 분위기 전환을 위해 푸터를 숨길 경로. /games(오락실 톤)는 헤더를 자체 EXIT
// 필로 대체한 완전 몰입형 공간이라 — 그 아래 밝은 SiteFooter가 스크롤 끝에서
// 튀어나오면 분위기가 깨진다. games는 이 문제를 지금까지 놓치고 있었다.
// (/timemachine은 2026-08-17 라우트 자체가 삭제되며 이 목록에서도 제거.)
// /timeline(2026-08-17 추가) — 같은 이유. TimelineResultView·TimelineBigkindsView가
// 크림톤(#faf8f3) 풀블리드 배경을 쓰는데, SiteFooter는 미묘하게 다른
// 회백색(#fafbfc)이라 경계선이 또렷하게 보였다("여기 경계가 있는데
// 디자인이 깔끔하지 않다" 피드백). games와 같은 "완전 몰입형 공간" 논리.
//
// /webtoon 제거(2026-08-21) — 웹툰은 이제 몰입형 공간이 아니다. 자체 EXIT 필과
// 어두운 톤을 걷어내고 공용 Header + 밝은 톤으로 되돌렸고(WebtoonListClient.tsx
// (A)(B) 참조), 웹툰은 도구가 아니라 읽고 나면 다른 콘텐츠로 이어가는 읽을
// 거리다 — 푸터가 없으면 다 본 독자가 사이트에서 고립된다.
const HIDE_FOOTER_PREFIXES = ['/games', '/timeline'];

export function ConditionalFooter() {
  const pathname = usePathname() ?? '';
  if (HIDE_FOOTER_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return null;
  }
  // ConditionalTodayNewsPlayer.tsx가 메인 피드('/')에서만 플레이어를 띄우므로
  // (2026-08-19), 그 여백도 같은 조건으로만 예약한다.
  return <SiteFooter reservePlayerSpace={pathname === '/'} />;
}
