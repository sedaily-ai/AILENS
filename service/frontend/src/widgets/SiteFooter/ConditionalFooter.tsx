'use client';

import { usePathname } from 'next/navigation';
import { SiteFooter } from './SiteFooter';

// 분위기 전환을 위해 푸터를 숨길 경로. 타임머신은 결과 화면이 풀스크린 편집물처럼 동작.
// /games(오락실 톤)·/webtoon(만화방 톤, 2026-08-11 전면 재설계)도 헤더를 자체
// EXIT 필로 대체한 완전 몰입형 공간이라 — 그 아래 밝은 SiteFooter가 스크롤
// 끝에서 튀어나오면 분위기가 깨진다. games는 이 문제를 지금까지 놓치고 있었다.
const HIDE_FOOTER_PREFIXES = ['/timemachine', '/games', '/webtoon'];

export function ConditionalFooter() {
  const pathname = usePathname() ?? '';
  if (HIDE_FOOTER_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return null;
  }
  return <SiteFooter />;
}
