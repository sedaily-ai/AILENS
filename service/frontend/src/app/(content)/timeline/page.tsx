'use client';

import { useState, useEffect } from 'react';
import { NewsTimeMachine, HubCards, ExitPill, SURFACE, GLOBAL_CSS } from '@/features/timeline';

// 공용 Header 대신 좌상단 EXIT 필을 둔다. /timeline/[date](TimelineDayClient.tsx)와 같은 "완전 몰입형 공간" 톤이며, ConditionalFooter.tsx가 이 경로의 공용 푸터를 숨긴다.
// 입력 화면과 도착 화면의 톤이 갈리면 같은 기능으로 읽히지 않으므로 도착 페이지와 톤을 맞춘다. EXIT 필은 ExitPill로 공유한다.
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
        <NewsTimeMachine>
          <HubCards />
        </NewsTimeMachine>
      </main>
    </div>
  );
}
