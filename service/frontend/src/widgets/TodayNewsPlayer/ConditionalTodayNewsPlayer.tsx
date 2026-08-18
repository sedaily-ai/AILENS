'use client';

import { usePathname } from 'next/navigation';
import { TodayNewsPlayer } from './TodayNewsPlayer';

// 메인 피드에서만 노출(2026-08-19, 사용자 요청) — 웹툰/게임/레터 상세/타임라인/
// 로그인 등 다른 페이지로 들어가면 하단에 떠 있는 오디오 플레이어가 그
// 페이지의 톤(만화방/오락실/몰입형 리딩)과 안 맞거나, 재생 상태가 페이지
// 전환마다 이어지는 게 오히려 혼란스럽다는 판단. ConditionalFooter.tsx가
// "숨길 경로"를 블록리스트로 관리하는 것과 반대로, 여기는 "메인에서만"이라는
// 요구사항 자체가 명확한 허용목록이라 pathname === '/' 하나만 확인한다 —
// 새 라우트가 추가돼도 기본값이 "숨김"이라 매번 블록리스트를 갱신할 필요가 없다.
export function ConditionalTodayNewsPlayer() {
  const pathname = usePathname() ?? '';
  if (pathname !== '/') return null;
  return <TodayNewsPlayer />;
}
