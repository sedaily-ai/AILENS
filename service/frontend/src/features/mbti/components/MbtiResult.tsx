'use client';

import { useEffect, useState } from 'react';
import type { MbtiGroupId } from '@/shared/data/mbtiGroups';
import { displayTypeFor, type MbtiType } from '../lib/mbtiCorner';
import { ResultCard } from './ResultCard';
import { TodayIssues } from './TodayIssues';
import { GroupSwitcher } from './GroupSwitcher';
import { MbtiNotice } from './MbtiNotice';
import { MbtiShare } from './MbtiShare';

export function MbtiResult({ group }: { group: MbtiGroupId }) {
  const [type, setType] = useState<MbtiType | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 시 ?t 1회 읽기. 정적 페이지에서 useSearchParams는 Suspense 경계가 필요해 LensViewClient처럼 location을 직접 읽는다.
    setType(displayTypeFor(group, new URLSearchParams(window.location.search).get('t')));
  }, [group]);

  return (
    <div>
      <ResultCard group={group} type={type} />
      <MbtiShare group={group} />
      <TodayIssues group={group} />
      <GroupSwitcher current={group} />
      <MbtiNotice />
    </div>
  );
}
