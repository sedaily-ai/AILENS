'use client';

import { ChatTab } from '@saju/features/chatbot';
import { PageHeader } from '@saju/shared/ui/PageHeader';
import { BottomNav } from '@saju/shared/ui/BottomNav';
import { SAJU } from '@saju/shared/ui/sajuTokens';
import { useLang } from '@saju/shared/lib/LangContext';

export default function ChatPage() {
  const { t } = useLang();

  return (
    <>
      {/* 채팅 화면 전체를 뷰포트에 고정 — 페이지 스크롤/여백 없이 메시지 영역만 내부 스크롤.
          top-14 는 TopNav(h-14, 모든 화면폭에서 항상 렌더) 높이만큼 띄워 겹침 방지 */}
      <div className="fixed inset-x-0 bottom-0 top-14 z-30" style={{ background: SAJU.paper, colorScheme: 'light' }}>
        <div className="mx-auto h-full max-w-[540px] flex flex-col">
          <div className="shrink-0">
            <PageHeader
              title={t('사주 챗봇', 'Saju Chat')}
              titleAccent={t('챗봇', 'Chat')}
              sub={t('당신의 사주에 지금 시대를 얹어 읽어드려요', 'Your saju, read against the currents of today')}
              showSearch={false}
            />
          </div>

          <div className="flex-1 min-h-0 px-3 mt-3 flex flex-col">
            <ChatTab />
          </div>

          {/* BottomNav(고정)가 덮는 높이만큼 자리 확보 → 입력창이 가려지지 않음 */}
          <div aria-hidden className="shrink-0" style={{ height: 'calc(62px + env(safe-area-inset-bottom, 0px))' }} />
        </div>
      </div>

      <BottomNav active="chat" />
    </>
  );
}
