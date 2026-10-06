'use client';

import { usePathname } from 'next/navigation';
import { SiteFooter } from './SiteFooter';

// 푸터를 숨길 경로. 완전 몰입형 단일 목적 공간에서는 스크롤 끝에 밝은 SiteFooter가 나타나면 분위기가 깨지거나 높이가 어긋난다.
// - /games(오락실 톤): 헤더를 자체 EXIT 필로 대체한 몰입형 공간이다.
// - /timeline: TimelineResultView·TimelineBigkindsView가 크림톤(#faf8f3) 풀블리드 배경을 쓰는데 SiteFooter(#fafbfc)와 경계선이 또렷하게 보인다.
// - /start: 온보딩 각 단계가 minHeight:100dvh로 화면에 맞게 설계되어 있어 SiteFooter가 붙으면 스크롤이 생긴다.
// /webtoon은 읽고 나면 다른 콘텐츠로 이어가는 읽을거리라 푸터를 유지해 독자가 사이트에서 고립되지 않게 한다.
const HIDE_FOOTER_PREFIXES = ['/games', '/timeline', '/start'];

export function ConditionalFooter() {
  const pathname = usePathname() ?? '';
  if (HIDE_FOOTER_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return null;
  }
  // ConditionalTodayNewsPlayer.tsx가 메인 피드('/')에서만 플레이어를 띄우므로, 그 여백도 같은 조건으로만 예약한다.
  return <SiteFooter reservePlayerSpace={pathname === '/'} />;
}
