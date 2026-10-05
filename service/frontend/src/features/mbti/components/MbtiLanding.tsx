'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { MbtiGroupId } from '@/shared/data/mbtiGroups';
import { trackEvent } from '@/shared/lib/tracking/trackEvent';
import { LENS_CARD_BORDER, READING_ACCENT } from '@/shared/constants/lensPerspectives';
import { groupOfType, resultPath, savedShortcutLabel, type MbtiType, type SavedMbti } from '../lib/mbtiCorner';
import { readSavedMbti, saveMbti } from '../lib/mbtiStorage';
import { TypePicker } from './TypePicker';
import { QuickCheck } from './QuickCheck';
import { MbtiNotice } from './MbtiNotice';

export function MbtiLanding() {
  const router = useRouter();
  const [mode, setMode] = useState<'pick' | 'check'>('pick');
  const [saved, setSaved] = useState<SavedMbti | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 시 localStorage 1회 읽기(LensPreviewSection과 같은 관례).
    setSaved(readSavedMbti());
  }, []);

  const pickType = (type: MbtiType) => {
    const group = groupOfType(type);
    trackEvent('mbti_type_select', { type, group });
    saveMbti(type);
    router.push(resultPath(group, type));
  };

  const finishCheck = (group: MbtiGroupId) => {
    trackEvent('mbti_check_complete', { group });
    saveMbti(group);
    router.push(resultPath(group));
  };

  if (mode === 'check') {
    return (
      <div>
        <QuickCheck onComplete={finishCheck} onCancel={() => setMode('pick')} />
        <MbtiNotice />
      </div>
    );
  }

  return (
    <div>
      <p style={{ margin: '0 0 20px', fontSize: 15, lineHeight: 1.7, color: '#475569' }}>
        내 MBTI를 고르면, 같은 기사를 내 인지유형(NT·NF·ST·SF)에 맞는 형식으로 골라 드려요.
      </p>
      {saved && (
        <Link href={resultPath(saved.group, saved.type)} style={{ display: 'inline-block', marginBottom: 20, fontSize: 14, fontWeight: 700, color: READING_ACCENT, textDecoration: 'none' }}>
          {savedShortcutLabel(saved)} →
        </Link>
      )}
      <h2 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 700, color: '#0f172a' }}>내 MBTI 고르기</h2>
      <TypePicker selected={saved?.type ?? null} onSelect={pickType} />
      <button
        type="button"
        onClick={() => setMode('check')}
        style={{ marginTop: 20, width: '100%', padding: '14px 16px', borderRadius: 14, border: LENS_CARD_BORDER, background: '#f8fafc', fontSize: 14, fontWeight: 700, color: '#334155', cursor: 'pointer' }}
      >
        MBTI를 잘 모르겠어요 → 간단 성향 체크
      </button>
      <MbtiNotice />
    </div>
  );
}
