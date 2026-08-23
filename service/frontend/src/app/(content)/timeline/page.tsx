'use client';

import { useState, useEffect } from 'react';
import { NewsTimeMachine, ExitPill, SURFACE, GLOBAL_CSS } from '@/features/timeline';

// 공용 Header 대신 좌상단 EXIT 필 — /timeline/[date](TimelineDayClient.tsx)와
// 같은 이유·같은 톤(2026-08-17, "완전 몰입형 공간" 취급을 /timeline 전체로
// 확장). ConditionalFooter.tsx가 이미 이 경로의 공용 푸터를 숨기고 있다.
//
// 2026-08-19: 크림 배경(#faf8f3)을 걷고 도착 페이지와 같은 톤으로 맞췄다.
// 입력 화면과 도착 화면이 톤이 갈리면 같은 기능으로 안 읽힌다.
// EXIT 필은 복제돼 있던 것을 ExitPill 로 합쳤다.
export default function TimelinePage() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 시 1회 ready 플래그
    setReady(true);
  }, []);

  if (!ready) {
    return <div className="min-h-screen" style={{ background: SURFACE }} />;
  }

  return (
    <div className="min-h-screen" style={{ background: SURFACE }}>
      <style>{GLOBAL_CSS}</style>
      <ExitPill />
      <main>
        <NewsTimeMachine />
      </main>
    </div>
  );
}
