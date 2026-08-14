'use client';

import { useState } from 'react';
import { FortuneTab } from '@saju/features/fortune/components/FortuneTab';
import { PageShell } from '@saju/shared/ui/PageShell';
import { PageHeader } from '@saju/shared/ui/PageHeader';
import { BottomNav } from '@saju/shared/ui/BottomNav';
import { useLang } from '@saju/shared/lib/LangContext';

type MbtiGroup = 'NT' | 'NF' | 'ST' | 'SF';

export default function YearlyPage() {
  const [mbtiGroup, setMbtiGroup] = useState<MbtiGroup>('NF');
  const { t } = useLang();

  return (
    <PageShell hanjaRight="年" hanjaLeft="運">
      <PageHeader
        title={t('올해 운세', "This Year")}
        titleAccent={t('세', 'year')}
        sub={t(
          '올해 세운과 내 사주의 상호작용 · 한 해의 큰 흐름',
          "This year's energy × your chart · annual outlook",
        )}
      />

      <div className="relative z-10 px-3 mt-3">
        <FortuneTab
          selectedGroup={mbtiGroup}
          onMbtiChange={setMbtiGroup}
          mode="yearly"
          hideOwnHeader
        />
      </div>

      <BottomNav active="saju" />
    </PageShell>
  );
}
