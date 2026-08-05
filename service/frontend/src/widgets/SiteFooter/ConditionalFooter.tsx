'use client';

import { usePathname } from 'next/navigation';
import { SiteFooter } from './SiteFooter';

// 분위기 전환을 위해 푸터를 숨길 경로. 타임머신은 결과 화면이 풀스크린 편집물처럼 동작.
const HIDE_FOOTER_PREFIXES = ['/timemachine'];

export function ConditionalFooter() {
  const pathname = usePathname() ?? '';
  if (HIDE_FOOTER_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return null;
  }
  return <SiteFooter />;
}
