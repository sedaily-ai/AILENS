'use client';

import { useState } from 'react';
import { FortuneTab } from '@saju/features/fortune/components/FortuneTab';
import { PageShell } from '@saju/shared/ui/PageShell';
import { PageHeader } from '@saju/shared/ui/PageHeader';
import { BottomNav } from '@saju/shared/ui/BottomNav';
import { useLang } from '@saju/shared/lib/LangContext';
import { ClaimPopup, useDailyFortunePoints } from '@saju/features/points';

type MbtiGroup = 'NT' | 'NF' | 'ST' | 'SF';

export default function TodayPage() {
  const [mbtiGroup, setMbtiGroup] = useState<MbtiGroup>('NF');
  const { t } = useLang();
  const { result, dismiss } = useDailyFortunePoints();

  return (
    <PageShell hanjaRight="日" hanjaLeft="運">
      <PageHeader
        title={t('오늘 운세', "Today")}
        titleAccent={t('세', 'day')}
        sub={t(
          '오늘 일진과 내 사주의 상호작용 · 매일 새로',
          "Today's energy × your chart · refreshed daily",
        )}
      />

      <div className="relative z-10 px-3 mt-3">
        <FortuneTab
          selectedGroup={mbtiGroup}
          onMbtiChange={setMbtiGroup}
          mode="today"
          hideOwnHeader
        />
      </div>

      {result && <ClaimPopup dayCount={result.dayCount} amount={result.amount} onClose={dismiss} />}

      <BottomNav active="saju" />
    </PageShell>
  );
}
