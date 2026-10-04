'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';

// 검색·AI 대화 오버레이 지연 로딩 래퍼(2026-10-04 경량화).
//
// 실제 구현(SmartSearchOverlayImpl.tsx, 900줄)은 마크다운 렌더러(react-markdown·remark-gfm ≈175KB 압축 전)와 대화 소켓까지 끌고 와서,
// 거의 모든 페이지(헤더가 쓴다)의 첫 번들에 실렸다. 검색을 여는 사람만 쓰는 UI라서, 처음 열릴 때 비로소 불러온다.
// 기존 import 경로와 props(open·onClose)는 그대로라 호출부 12곳은 손대지 않았다.
// 한 번 열린 뒤에는 닫아도 계속 마운트해 둔다 — 대화 내용·입력이 닫았다 열어도 유지되던 기존 동작(open=false에서도 컴포넌트가 살아 있음)을 보존한다.
const Impl = dynamic(() => import('./SmartSearchOverlayImpl').then((m) => m.SmartSearchOverlay), { ssr: false });

type Props = { open: boolean; onClose: () => void };

// 첫 화면이 다 뜬 뒤 한가할 때 한 번만 미리 받아 둔다 — 사용자가 검색을 처음 열 때 기다리지 않게(첫 화면 번들에는 들어가지 않는다).
// 데이터 절약 모드·2G에서는 미리 받지 않고, 처음 열 때 불러온다.
let warmed = false;
function warmOverlay() {
  if (warmed) return;
  warmed = true;
  void import('./SmartSearchOverlayImpl');
}

export function SmartSearchOverlay({ open, onClose }: Props) {
  useEffect(() => {
    const conn = (navigator as unknown as { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    if (conn?.saveData || conn?.effectiveType === 'slow-2g' || conn?.effectiveType === '2g') return;
    const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    const id = ric ? ric(warmOverlay, { timeout: 8000 }) : window.setTimeout(warmOverlay, 4000);
    return () => {
      if (!ric) window.clearTimeout(id);
    };
  }, []);
  const [everOpened, setEverOpened] = useState(open);
  if (open && !everOpened) setEverOpened(true); // 렌더 중 상태 보정(열리는 첫 렌더에서 바로 마운트)
  if (!everOpened) return null;
  return <Impl open={open} onClose={onClose} />;
}
