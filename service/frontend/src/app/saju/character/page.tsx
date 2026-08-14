'use client';

import { CharacterGrid } from '@saju/features/characters';
import { PageShell } from '@saju/shared/ui/PageShell';
import { PageHeader } from '@saju/shared/ui/PageHeader';
import { BottomNav } from '@saju/shared/ui/BottomNav';
import { useLang } from '@saju/shared/lib/LangContext';

export default function CharacterPage() {
  const { t } = useLang();

  return (
    <PageShell hanjaRight="像" hanjaLeft="干">
      <PageHeader
        title={t('사주 캐릭터', 'Saju Characters')}
        titleAccent={t('캐릭터', 'Characters')}
        sub={t('60갑자로 보는 나의 캐릭터', 'Your character, from the 60 Gapja')}
      />

      <div
        className="relative z-10 mx-3 mt-3 rounded-[28px] px-3 pt-4 pb-5"
        style={{ background: '#ECFDF5' }}
      >
        <CharacterGrid />
      </div>

      <BottomNav active="character" />
    </PageShell>
  );
}
