'use client';

import { HUB_JSON_LD } from './hubJsonLd';
import { NewsTimeMachine, HubCards, ExitPill, SURFACE, GLOBAL_CSS } from '@/features/timeline';

// 공용 Header 대신 좌상단 EXIT 필을 둔다. /timeline/[date](TimelineDayClient.tsx)와 같은 "완전 몰입형 공간" 톤이며, ConditionalFooter.tsx가 이 경로의 공용 푸터를 숨긴다.
// 입력 화면과 도착 화면의 톤이 갈리면 같은 기능으로 읽히지 않으므로 도착 페이지와 톤을 맞춘다. EXIT 필은 ExitPill로 공유한다.
// 서버 렌더를 막던 ready 게이트(마운트 전 빈 화면)는 제거했다 — 첫 HTML이 비어 크롤러·AI 봇에 h1·연대/시대 카드 링크가 보이지 않았다(2026-11-18).
// 날짜 의존 값(today·viewMonth)은 달력을 열거나 되감기를 시작한 뒤에만 렌더되므로 하이드레이션 불일치가 없다.
export default function TimelinePage() {
  return (
    <div className="min-h-screen" style={{ background: SURFACE }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(HUB_JSON_LD) }} />
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
