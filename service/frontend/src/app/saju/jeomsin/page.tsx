'use client';

import { IchingDraw } from '@saju/features/iching';
import { PageShell } from '@saju/shared/ui/PageShell';
import { PageHeader } from '@saju/shared/ui/PageHeader';
import { BottomNav } from '@saju/shared/ui/BottomNav';
import { useLang } from '@saju/shared/lib/LangContext';
import { ClaimPopup, useDailyFortunePoints } from '@saju/features/points';

export default function JeomsinPage() {
  const { t } = useLang();
  const { result, dismiss } = useDailyFortunePoints();

  return (
    <PageShell hanjaRight="卦" hanjaLeft="易">
      <PageHeader
        title={t('주역점', 'I Ching')}
        titleAccent={t('점', 'Ching')}
        sub={t('팔괘 중 하나를 뽑아 지금의 흐름을 읽어요', 'Draw one of the 8 trigrams to read where things stand')}
      />

      <div className="relative z-10 px-3 mt-3">
        <IchingDraw />
      </div>

      {result && <ClaimPopup dayCount={result.dayCount} amount={result.amount} onClose={dismiss} />}

      <BottomNav active="saju" />
    </PageShell>
  );
}
