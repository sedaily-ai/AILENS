'use client';

import { useState } from 'react';
import { FortuneTab } from '@saju/features/fortune/components/FortuneTab';
import { PageShell } from '@saju/shared/ui/PageShell';
import { PageHeader } from '@saju/shared/ui/PageHeader';
import { BottomNav } from '@saju/shared/ui/BottomNav';
import { useLang } from '@saju/shared/lib/LangContext';

type MbtiGroup = 'NT' | 'NF' | 'ST' | 'SF';

export default function SajuChartPage() {
  const [mbtiGroup, setMbtiGroup] = useState<MbtiGroup>('NF');
  const { t } = useLang();

  return (
    <PageShell hanjaRight="易" hanjaLeft="命">
      <PageHeader
        title={t('내 사주 원국', 'My Chart')}
        titleAccent={t('원국', 'Chart')}
        sub={t(
          '궁통보감·삼명통회·자평진전 3대 고전 · KASI 만세력',
          '3 classical texts · KASI ephemeris',
        )}
      />

      <div className="relative z-10 px-3 mt-3">
        <FortuneTab
          selectedGroup={mbtiGroup}
          onMbtiChange={setMbtiGroup}
          hideOwnHeader
        />
      </div>

      <BottomNav active="saju" />
    </PageShell>
  );
}
