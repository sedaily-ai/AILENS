'use client';

import { useEffect, useState } from 'react';
import { Gift } from 'lucide-react';
import { useLang } from '@saju/shared/lib/LangContext';
import { SAJU } from '@saju/shared/ui/sajuTokens';
import { getTotalPoints } from '../lib/points';

export function PointsBadge() {
  const { t } = useLang();
  const [total, setTotal] = useState<number | null>(null);

  useEffect(() => {
    setTotal(getTotalPoints());
  }, []);

  if (total === null) return null;

  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11.5px] font-bold"
      style={{ background: SAJU.warmSoft, color: SAJU.warmDeep }}
    >
      <Gift size={12} strokeWidth={2.4} />
      {t(`${total}P`, `${total}P`)}
    </span>
  );
}
