'use client';

import { useState } from 'react';
import { Header } from "@/widgets/Header";
import Link from 'next/link';
import { SmartSearchOverlay } from '@/components/mbti/SmartSearchOverlay';
import { UserMenu } from '@/features/auth';
import { CalendarMonthView } from '@/features/calendar/components/CalendarMonthView';
import { useMbtiGroup } from '@/shared/hooks/useMbtiGroup';

export default function CalendarPage() {
  const [showSearch, setShowSearch] = useState(false);
  const [selectedGroupForSearch] = useMbtiGroup('SF');

  return (
    <div className="min-h-screen bg-white">
      {/* 글로벌 헤더 — 다른 페이지와 동일 */}
      <Header
        onSearch={() => setShowSearch(true)}
        tabs={[
          // 날짜별 레터 보기(캘린더)는 "레터"의 하위 화면이라 별도 탭을 두지 않고
          // 레터 탭을 계속 활성 표시 — 전역 탭 목록에도 없는 "캘린더"만의 탭이
          // 여기서만 불쑥 나타나는 게 어색해서 제거.
          { key: "feed", label: "레터", href: "/", active: true },
          { key: "editors", label: "에디터", href: "/editors" },
          { key: "fortune", label: "사주", href: "/fortune" },
          { key: "timeline", label: "타임라인", href: "/timemachine" },
          { key: "games", label: "게임", href: "/games" },
          { key: "community", label: "커뮤니티", href: "/?tab=community" },
          { key: "archive", label: "내 서랍", href: "/?tab=archive" },
        ]}
      />

      <SmartSearchOverlay open={showSearch} onClose={() => setShowSearch(false)} selectedGroup={selectedGroupForSearch} />

      <main>
        <CalendarMonthView />
      </main>

      <div className="h-24" />
    </div>
  );
}
